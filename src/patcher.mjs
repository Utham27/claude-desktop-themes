// asar patcher: 备份 app.asar → 注入 bootstrap(main 进程轮询 daemon 并 insertCSS) → 重打包
//
// macOS 注意: Claude 启用了 Electron asar integrity fuse, Info.plist 里写死 asar header 的
// SHA256, 重打包后必须同步更新, 否则启动即 FATAL abort; 修改 bundle 还会使代码签名失效,
// 被 macOS SIGKILL, 必须 ad-hoc 重签名; 写 /Applications 需要 TCC「App 管理」授权。
// Windows 均无这些机制: 无 integrity 校验、无签名校验、安装目录在用户可写的
// %LOCALAPPDATA%, 因此直接用 fs 写入, 流程简单得多。
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { IS_MAC, claudeInstall, installDesc } from './platform.mjs';

const execFileP = promisify(execFile);

const req = createRequire(import.meta.url);
const asar = req('@electron/asar');

const install = claudeInstall();
export const RESOURCES = install.resources || path.join(install.root, 'resources');
export const ASAR = path.join(RESOURCES, 'app.asar');
export const BACKUP = path.join(RESOURCES, 'app.asar.orig');

export const MAIN = path.join('.vite', 'build', 'index.pre.js');
// 文件版注入端的标记；旧版（轮询本机 HTTP）标记见 LEGACY_MARK，带旧标记的 asar 需先 unpatch 再重新 patch。
export const MARK = '/*__CDT_BOOTSTRAP_FILE__*/';
const LEGACY_MARK = '/*__CDT_BOOTSTRAP__*/';
const PLIST = path.join(install.root, 'Contents', 'Info.plist');
const PLIST_HASH_KEY = ':ElectronAsarIntegrity:Resources/app.asar:hash';

// Info.plist 里记录的 asar header hash(空串 = 未启用 integrity 校验) — 仅 macOS
function plistHash() {
  if (!IS_MAC) return '';
  try {
    return execFileSync('/usr/libexec/PlistBuddy',
      ['-c', `Print ${PLIST_HASH_KEY}`, PLIST], { encoding: 'utf8' }).trim();
  } catch { return ''; }
}

function asarHeaderHash(p) {
  try {
    return crypto.createHash('sha256').update(asar.getRawHeader(p).headerString).digest('hex');
  } catch { return ''; }
}

// 提权更新 Info.plist 里的 integrity hash(与其它 bundle 写操作合并执行, 只弹一次授权)
function setPlistHashCmd(hash) {
  return `/usr/libexec/PlistBuddy -c 'Set ${PLIST_HASH_KEY} ${hash}' ${JSON.stringify(PLIST)}`;
}

// 修改 app bundle 内任何文件(app.asar/Info.plist)都会使代码签名失效,
// macOS 会在下次启动时直接 SIGKILL(表现为「Claude 无法打开」/launchd spawn failed)。
// 因此每次 bundle 写操作后必须 ad-hoc 重签名。
const RESIGN_CMD = `codesign --force --deep --sign - ${JSON.stringify(install.root)}`;

export async function verifySignature() {
  if (!IS_MAC) return true;
  try {
    await execFileP('codesign', ['--verify', install.root]);
    return true;
  } catch { return false; }
}

// 单独重签名入口: 已 patch 但签名失效时调用(如签名校验在退出后才触发)
export async function resignApp() {
  if (!IS_MAC) return { ok: true };
  try {
    await shellInBundle(RESIGN_CMD);
    return (await verifySignature())
      ? { ok: true }
      : { ok: false, error: '重签名后校验仍失败' };
  } catch (e) {
    return { ok: false, error: `重签名失败: ${e.message}` };
  }
}

// 注入到 main 进程的 bootstrap: 轮询 %APPDATA%\claude-desktop-themes\active.css, 对所有 webContents insertCSS。
// 只读本地文件、写一个心跳文件，不发起任何网络请求（Cage 保护下本机端口不可达）。
const BOOTSTRAP = `${MARK}
(function(){try{
var fs=require('fs'),path=require('path'),os=require('os');
// 与 platform.mjs 的 appDataDir() 一致：macOS 用 ~/Library/Application Support，Windows 用 %APPDATA%（缺失时回退到 ~/AppData/Roaming）。
var BASE=process.platform==='darwin'?path.join(os.homedir(),'Library','Application Support'):(process.env.APPDATA||path.join(os.homedir(),'AppData','Roaming'));
var DIR=path.join(BASE,'claude-desktop-themes');
var FILE=path.join(DIR,'active.css'),ALIVE=path.join(DIR,'injector-alive');
var CSS='',SIG='',KEYS=new WeakMap();
var electron=require('electron');
var app=electron.app,allWc=electron.webContents;
function apply(wc){if(!wc||wc.isDestroyed())return Promise.resolve();
 try{wc.insertCSS(CSS||'/*cdt*/',{cssOrigin:'user'}).then(function(k){
  var o=KEYS.get(wc);if(o){try{wc.removeInsertedCSS(o)}catch(e){}}
  KEYS.set(wc,k)}).catch(function(){});}catch(e){}}
function applyAll(){allWc.getAllWebContents().forEach(apply)}
function tick(){
 try{var st=fs.statSync(FILE),sig=st.mtimeMs+':'+st.size;
  if(sig!==SIG){var c=fs.readFileSync(FILE,'utf8');SIG=sig;if(c!==CSS){CSS=c;applyAll()}}
 }catch(e){if(e&&e.code==='ENOENT'&&CSS){CSS='';SIG='';applyAll()}}
 try{fs.writeFileSync(ALIVE,String(Date.now()))}catch(e){}
}
app.on('web-contents-created',function(_,wc){
 wc.on('did-finish-load',function(){if(CSS)apply(wc)});
});
app.whenReady().then(function(){tick();setInterval(tick,2000)});
}catch(e){}})();
`;

// 与原版一致的 unpack 规则(*.node 原生模块 / resources 内置 mcp / node-pty prebuilds)
// unpack 规则对齐现网 app.asar.unpacked(恰好 10 个外部文件: *.node/*.dylib + pty prebuilds + 两个 mcp 目录)
const PACK_OPTS = {
  unpack: '*.{node,dylib}',
  unpackDir: '{node_modules/node-pty/prebuilds,resources/github-mcp,resources/office365-mcp}',
};

export function detect() {
  try {
    const mainSrc = asar.extractFile(ASAR, MAIN).toString('utf8');
    const patched = mainSrc.includes(MARK);
    const want = plistHash();
    let signatureOk = true;
    if (IS_MAC) {
      try { execFileSync('codesign', ['--verify', install.root], { stdio: 'ignore' }); } catch { signatureOk = false; }
    }
    return {
      asarExists: true, patched, backup: fs.existsSync(BACKUP),
      // plist 无 integrity 配置(未启用校验 / 非 macOS)视为恒匹配
      integrityOk: !want || want === asarHeaderHash(ASAR),
      signatureOk,
    };
  } catch {
    return { asarExists: fs.existsSync(ASAR), patched: false, backup: fs.existsSync(BACKUP), integrityOk: true, signatureOk: true };
  }
}

function rmrf(p) { fs.rmSync(p, { recursive: true, force: true }); }

// macOS App Management(TCC) 会拦截对 /Applications 内 app bundle 的写入。
// 先试直接写, EPERM 再试管理员提权; 仍被拒说明是 TCC 拦截, 需用户授权前台进程。
async function shellInBundle(cmd) {
  try {
    await execFileP('sh', ['-c', cmd]);
    return true;
  } catch (e) {
    const denied = e.code === 'EPERM' || /Operation not permitted/i.test(String(e.stderr || '') + String(e.message));
    if (!denied) throw e;
    try {
      const escaped = cmd.replace(/"/g, '\\"');
      await execFileP('osascript', ['-e', `do shell script "${escaped}" with administrator privileges with prompt "claude-theme 需要修改 Claude.app 以注入主题支持"`], { timeout: 120000 });
      return true;
    } catch (e2) {
      if (/Operation not permitted/i.test(e2.message)) {
        throw new Error('macOS「App 管理」权限拦截了对 Claude.app 的写入。\n方案: 在终端前台运行 `claude-theme launch`, 弹出「终端想要修改 Claude」时点「允许」。\n若已拒绝过: 系统设置→隐私与安全性→App 管理 里为终端开启, 或先执行 `tccutil reset SystemPolicyAppBundles` 再重试。');
      }
      throw e2;
    }
  }
}

function listUnpacked(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  const walk = p => {
    for (const e of fs.readdirSync(p, { withFileTypes: true })) {
      const f = path.join(p, e.name);
      if (e.isDirectory()) walk(f); else out.push(path.relative(dir, f));
    }
  };
  walk(dir);
  return out;
}

// 把重打包好的 asar 换进安装目录(mac: shell+TCC授权+hash同步+重签名; win: 直接 fs 写)
async function swapInAsar(tmpAsar, tmpUnpacked, liveUnpacked) {
  const q = p => `"${p}"`;
  if (IS_MAC) {
    const newHash = asarHeaderHash(tmpAsar);
    const plistSync = plistHash() ? ` && ${setPlistHashCmd(newHash)}` : '';
    // 备份恒刷新: 防止 app 自动更新后残留旧版本备份, unpatch 时造成降级
    await shellInBundle(
      `cp -p ${q(ASAR)} ${q(BACKUP)} && ` +
      `mv ${q(tmpAsar)} ${q(ASAR)} && ` +
      `rm -rf ${q(liveUnpacked)} && ` +
      `mv ${q(tmpUnpacked)} ${q(liveUnpacked)}` +
      plistSync +
      ` && ${RESIGN_CMD}`
    );
    return;
  }
  fs.copyFileSync(ASAR, BACKUP);
  fs.renameSync(tmpAsar, ASAR);
  rmrf(liveUnpacked);
  fs.renameSync(tmpUnpacked, liveUnpacked);
}

export async function patchAsar() {
  const d = detect();
  if (!d.asarExists) return { ok: false, error: `未找到 ${ASAR} (安装位置: ${installDesc()})` };
  // 幂等: 已 patch 且 integrity hash 一致 → 直接返回
  if (d.patched && d.integrityOk) return { ok: true, alreadyPatched: true };
  // 已 patch 但 plist hash 未同步(如上次安装中断/手动替换过 asar): 仅补写 hash, 无需重打包
  if (d.patched && !d.integrityOk) {
    try {
      await shellInBundle(`${setPlistHashCmd(asarHeaderHash(ASAR))} && ${RESIGN_CMD}`);
      return { ok: true, alreadyPatched: true, fixedIntegrity: true };
    } catch (e) {
      return { ok: false, error: `Info.plist integrity hash 同步失败: ${e.message}` };
    }
  }
  // 源恒为当前 ASAR: 未 patch 时它就是干净原件(且 .unpacked 兄弟目录存在;
  // 从 BACKUP 提取会因缺少 .orig.unpacked 而 ENOENT)
  const liveUnpacked = path.join(RESOURCES, 'app.asar.unpacked');
  const expected = listUnpacked(liveUnpacked);
  const tmpExtract = fs.mkdtempSync(path.join(os.tmpdir(), 'cdt-extract-'));
  const tmpAsar = path.join(os.tmpdir(), `cdt-pack-${process.pid}.asar`);
  const tmpUnpacked = tmpAsar + '.unpacked';
  const q = p => `"${p}"`;
  const restore = async () => {
    if (!IS_MAC) return; // win 的 swapInAsar 是纯 fs 原子序列, 失败点之前不会有半装状态
    try {
      const backupHash = asarHeaderHash(BACKUP);
      await shellInBundle(
        `cp -p ${q(BACKUP)} ${q(ASAR)}; ` +
        `[ -d ${q(liveUnpacked)} ] || mv ${q(tmpUnpacked)} ${q(liveUnpacked)} || true; ` +
        (backupHash ? `${setPlistHashCmd(backupHash)} || true; ` : '') +
        `${RESIGN_CMD} || true`
      );
    } catch { /* 尽力而为 */ }
  };
  try {
    asar.extractAll(ASAR, tmpExtract);
    const mainPath = path.join(tmpExtract, MAIN);
    const original = fs.readFileSync(mainPath, 'utf8');
    // 不在旧版注入端上叠加第二份（两份会同时改样式）。
    if (original.includes(LEGACY_MARK)) {
      return { ok: false, error: 'app.asar 含旧版注入端，请先执行 claude-theme unpatch，或用 sync-store-copy.mjs --force 重建副本后再 patch' };
    }
    fs.writeFileSync(mainPath, BOOTSTRAP + '\n' + original);
    rmrf(tmpAsar); rmrf(tmpUnpacked);
    await asar.createPackageWithOptions(tmpExtract, tmpAsar, PACK_OPTS);
    // 安装前校验: 重打包的 unpacked 集合必须与现网一致(原生模块/exec 文件缺一即损坏)
    const got = new Set(listUnpacked(tmpUnpacked));
    const missing = expected.filter(f => !got.has(f));
    if (missing.length) {
      return { ok: false, error: `重打包校验失败: ${missing.length} 个外部文件缺失 (如 ${missing[0]}), 已中止安装` };
    }
    await swapInAsar(tmpAsar, tmpUnpacked, liveUnpacked);
    // 安装后复查(含 integrity hash), 异常自动还原
    const after = detect();
    if (!after.patched || !after.integrityOk) {
      await restore();
      return { ok: false, error: '安装后校验失败, 已还原 app.asar 原件' };
    }
    return { ok: true, alreadyPatched: false };
  } catch (e) {
    await restore();
    return { ok: false, error: `patch 失败(已尝试还原): ${e.message}` };
  } finally {
    rmrf(tmpExtract);
    rmrf(tmpAsar); rmrf(tmpUnpacked);
  }
}

export async function unpatchAsar() {
  const d = detect();
  if (!d.backup) return { ok: false, error: '备份 app.asar.orig 不存在, 无法还原' };
  try {
    if (IS_MAC) {
      const backupHash = asarHeaderHash(BACKUP);
      await shellInBundle(
        `cp -p "${BACKUP}" "${ASAR}"` +
        (backupHash ? ` && ${setPlistHashCmd(backupHash)}` : '') +
        ` && ${RESIGN_CMD}`
      );
    } else {
      fs.copyFileSync(BACKUP, ASAR);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `还原失败: ${e.message}` };
  }
}



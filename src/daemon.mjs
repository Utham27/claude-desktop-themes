// 守护进程：本地 HTTP 服务（picker UI + 主题 API）
// 注入原理: patch app.asar 在 main 进程注入 bootstrap, bootstrap 轮询 /api/css 并 insertCSS
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile as _execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileP = promisify(_execFile);
import { isClaudeRunning, openClaudeApp, openExternal } from './claude.mjs';
import { buildCss, buildBackgroundCss, withAlpha } from './css-builder.mjs';
import { loadAll, readConfig, writeConfig, themeSummaries, APP_DIR, BG_DIR, backgroundPath } from './themes.mjs';
import { detect } from './patcher.mjs';
import { IS_MAC, installDesc } from './platform.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTTP_PORT = Number(process.env.CDT_HTTP_PORT || 9343);
const PID_FILE = path.join(APP_DIR, 'daemon.pid');

const log = (...a) => console.log('[claude-theme]', ...a);

function writeJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

async function readBody(req) {
  let data = '';
  for await (const chunk of req) data += chunk;
  try { return JSON.parse(data); } catch { return {}; }
}

function activeCss() {
  const cfg = readConfig();
  let css = '';
  if (cfg.activeTheme) {
    const entry = loadAll().flat[cfg.activeTheme];
    css = entry ? (buildCss(entry.theme) || '') : '';
  }
  if (cfg.background) {
    const p = backgroundPath(cfg.background);
    if (p) {
      // data URI 内嵌: 不受页面 CSP img-src 限制(外链 http 图片会被拦, 用户看到"没生效")
      const data = 'data:' + (MIME[path.extname(p).toLowerCase()] || 'image/jpeg') + ';base64,' + fs.readFileSync(p).toString('base64');
      // 用户可调透明度(picker 滑杆): 主区 bgAlpha / 侧栏面板 bgSideAlpha
      const mainA = clamp01(cfg.bgAlpha ?? 0.5);
      const sideA = clamp01(cfg.bgSideAlpha ?? 0.68);
      // 有主题: 给 token 追加透明度; 无主题: 提供带透明度的中性 fallback token
      css = css ? withAlpha(css, mainA, sideA) + buildBackgroundCss(data)
        : `:root,body.light,body.dark{--bg-100:0 0% 98% / ${mainA};--bg-200:0 0% 94% / ${sideA};--bg-300:0 0% 90% / ${sideA}}` + buildBackgroundCss(data);
    }
  }
  return css;
}

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };

const clamp01 = n => Math.min(1, Math.max(0, Number(n) || 0));

// 压缩(2560px/jpeg75, 控制 base64 体积)存入 BG_DIR, 返回保存的文件名
// macOS 用系统自带 sips; Windows 用 sharp(npm 依赖, 装不上则退化为原样拷贝)
let sharpLib = null;
if (!IS_MAC) {
  try { sharpLib = (await import('sharp')).default; } catch { /* sharp 不可用 */ }
}
async function processIntoBgDir(src) {
  fs.mkdirSync(BG_DIR, { recursive: true });
  const safe = 'bg-' + Date.now() + '.jpg';
  const out = path.join(BG_DIR, safe);
  if (IS_MAC) {
    try {
      await execFileP('sips', ['-Z', '2560', '-s', 'format', 'jpeg', '-s', 'formatOptions', '75', src, '--out', out]);
    } catch { fs.copyFileSync(src, out); } // sips 失败则用原图
  } else if (sharpLib) {
    await sharpLib(src).resize(2560, 2560, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 75 }).toFile(out);
  } else {
    fs.copyFileSync(src, out);
  }
  return safe;
}

// 设置背景: 压缩后存 BG_DIR 并写入 config.background
export async function setBackground(name, buf) {
  const ext = path.extname(name).toLowerCase();
  if (!MIME[ext]) return { ok: false, error: `不支持的图片格式 ${ext || '(无后缀)'} (支持 png/jpg/webp/gif)` };
  if (buf.length > 20 * 1024 * 1024) return { ok: false, error: '图片超过 20MB' };
  fs.mkdirSync(BG_DIR, { recursive: true });
  const src = path.join(BG_DIR, 'tmp-' + Date.now() + ext);
  fs.writeFileSync(src, buf);
  try {
    const safe = await processIntoBgDir(src);
    if (!safe) return { ok: false, error: '图片处理失败' };
    const cfg = readConfig();
    if (cfg.background) { try { fs.unlinkSync(path.join(BG_DIR, cfg.background)); } catch { /* 忽略 */ } }
    cfg.background = safe;
    cfg.bgMode = 'single'; // 手动上传指定图 = 退出轮播
    cfg.bgCurrentSrc = '';
    writeConfig(cfg);
    return { ok: true, background: safe };
  } finally {
    try { fs.unlinkSync(src); } catch { /* 忽略 */ }
  }
}

export function clearBackground() {
  const cfg = readConfig();
  if (cfg.background) { try { fs.unlinkSync(path.join(BG_DIR, cfg.background)); } catch { /* 忽略 */ } }
  cfg.background = '';
  cfg.bgMode = 'single'; // 清除背景同时停轮播, 否则定时器会再切一张回来
  cfg.bgCurrentSrc = '';
  writeConfig(cfg);
  return { ok: true };
}

// 轮播: 从 cfg.bgFolder 随机挑一张(避免与当前同张)压缩设为当前背景。
// cfg.background 变化 → activeCss() 输出变化 → bootstrap 轮询自动换图, 无需通知。
async function rotateBackground() {
  const cfg = readConfig();
  if (cfg.bgMode !== 'slideshow' || !cfg.bgFolder) return;
  let files = [];
  try {
    files = fs.readdirSync(cfg.bgFolder).filter(f => MIME[path.extname(f).toLowerCase()]);
  } catch { return; }
  if (!files.length) return;
  const pool = files.length > 1 ? files.filter(f => f !== cfg.bgCurrentSrc) : files;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  const safe = await processIntoBgDir(path.join(cfg.bgFolder, pick));
  if (!safe) return;
  if (cfg.background) { try { fs.unlinkSync(path.join(BG_DIR, cfg.background)); } catch { /* 忽略 */ } }
  cfg.background = safe;
  cfg.bgCurrentSrc = pick;
  cfg.bgLastRotate = Date.now();
  writeConfig(cfg);
  log(`轮播切换: ${pick}`);
}

// 轮播调度: 每 5s 检查一次, 到点即切。读即时配置, 改文件夹/间隔无需重启。
let rotating = false;
async function slideshowTick() {
  if (rotating) return;
  const cfg = readConfig();
  if (cfg.bgMode !== 'slideshow') return;
  if (Date.now() - (cfg.bgLastRotate || 0) < (cfg.bgIntervalMin || 10) * 60000) return;
  rotating = true;
  try { await rotateBackground(); } finally { rotating = false; }
}

// 开关轮播模式 {mode: 'slideshow', folder, intervalMin} / {mode: 'single'}
export async function setSlideshow(body) {
  const cfg = readConfig();
  if (body.mode === 'slideshow') {
    const dir = String(body.folder || '').trim();
    const mins = Math.min(1440, Math.max(1, Math.round(Number(body.intervalMin) || 10)));
    if (!dir) return { ok: false, error: '请填写背景图文件夹路径' };
    let st;
    try { st = fs.statSync(dir); } catch { return { ok: false, error: `文件夹不存在: ${dir}` }; }
    if (!st.isDirectory()) return { ok: false, error: `不是文件夹: ${dir}` };
    const n = fs.readdirSync(dir).filter(f => MIME[path.extname(f).toLowerCase()]).length;
    if (!n) return { ok: false, error: `文件夹里没有支持的图片 (png/jpg/webp/gif): ${dir}` };
    cfg.bgMode = 'slideshow';
    cfg.bgFolder = dir;
    cfg.bgIntervalMin = mins;
    writeConfig(cfg);
    await rotateBackground(); // 开启立即切一张
    return { ok: true, mode: 'slideshow', folder: dir, intervalMin: mins, count: n };
  }
  cfg.bgMode = 'single';
  writeConfig(cfg);
  return { ok: true, mode: 'single' };
}

// 应用主题: 只写配置, bootstrap 会自行轮询拉取新 CSS (2s 内生效)
export function applyTheme(id) {
  const entry = id ? loadAll().flat[id] : null;
  if (id && !entry) return { ok: false, error: `未知主题: ${id}` };
  if (id && buildCss(entry.theme) === null) return { ok: false, error: `主题 ${id} 缺少 light/dark 变量` };
  const cfg = readConfig();
  cfg.activeTheme = id || '';
  writeConfig(cfg);
  return { ok: true, activeTheme: cfg.activeTheme };
}

const state = { injectedAliveAt: 0 };

// 启动 Claude; 若未 patch 返回引导错误
// (macOS 的 patch 需在终端前台执行: 后台进程的 TCC 授权请求会被 macOS 静默拒绝)
export async function launchFlow() {
  const d = detect();
  if (!d.asarExists) return { ok: false, error: `未找到 app.asar (安装位置: ${installDesc()})` };
  if (!d.patched) return { ok: false, error: IS_MAC
    ? 'Claude 尚未 patch: 请在终端执行 claude-theme launch (首次需在弹窗中点「允许」)'
    : 'Claude 尚未 patch: 请在终端执行 claude-theme launch' };
  if (!d.integrityOk) return { ok: false, error: 'asar integrity hash 未同步(Claude 会启动崩溃): 请在终端执行 claude-theme launch 修复' };
  try { await openClaudeApp(); } catch (e) { return { ok: false, error: e.message }; }
  for (let i = 0; i < 30; i++) {
    if (await isClaudeRunning()) return { ok: true };
    await new Promise(r => setTimeout(r, 500));
  }
  return { ok: false, error: 'Claude 启动超时' };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  try {
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      const html = fs.readFileSync(path.join(ROOT, 'picker', 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html);
    }
    if (req.method === 'GET' && url.pathname === '/api/css') {
      if (req.headers['x-cdt']) state.injectedAliveAt = Date.now();
      res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(activeCss());
    }
    if (req.method === 'GET' && url.pathname === '/api/themes') {
      return writeJson(res, 200, { ...themeSummaries(), active: readConfig().activeTheme });
    }
    if (req.method === 'GET' && url.pathname === '/api/status') {
      const d = detect();
      const cfg = readConfig();
      return writeJson(res, 200, {
        claudeRunning: await isClaudeRunning(),
        injectedAlive: Date.now() - state.injectedAliveAt < 8000,
        patched: d.patched,
        integrityOk: d.integrityOk,
        activeTheme: cfg.activeTheme,
        background: cfg.background || '',
        bgAlpha: cfg.bgAlpha ?? 0.5,
        bgSideAlpha: cfg.bgSideAlpha ?? 0.68,
        bgMode: cfg.bgMode || 'single',
        bgFolder: cfg.bgFolder || '',
        bgIntervalMin: cfg.bgIntervalMin ?? 10,
        bgCurrentSrc: cfg.bgCurrentSrc || '',
      });
    }
    if (req.method === 'GET' && url.pathname === '/bg/current') {
      const p = backgroundPath(readConfig().background);
      if (!p) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(p).toLowerCase()], 'Cache-Control': 'no-store' });
      return res.end(fs.readFileSync(p));
    }
    if (req.method === 'POST' && url.pathname === '/api/background') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      return writeJson(res, 200, await setBackground(decodeURIComponent(req.headers['x-filename'] || 'bg.png'), Buffer.concat(chunks)));
    }
    if (req.method === 'POST' && url.pathname === '/api/background/clear') {
      return writeJson(res, 200, clearBackground());
    }
    // 轮播模式 {mode:'slideshow',folder,intervalMin} / {mode:'single'}
    if (req.method === 'POST' && url.pathname === '/api/background/slideshow') {
      return writeJson(res, 200, await setSlideshow(await readBody(req)));
    }
    // 弹出系统原生文件夹选择框(浏览器拿不到绝对路径, 由 daemon 代弹)。
    // 请求会挂起直到用户选择或取消(不设超时上限, 只防脚本挂死)。
    if (req.method === 'GET' && url.pathname === '/api/folder-picker') {
      try {
        if (IS_MAC) {
          const { stdout } = await execFileP('/usr/bin/osascript',
            ['-e', 'POSIX path of (choose folder with prompt "为 Claude 主题选择背景图文件夹")'],
            { timeout: 1800000 });
          return writeJson(res, 200, { ok: true, folder: stdout.trim().replace(/\/+$/, '') });
        }
        const ps = [
          'Add-Type -AssemblyName System.Windows.Forms',
          "$d = New-Object System.Windows.Forms.FolderBrowserDialog",
          "$d.Description = '为 Claude 主题选择背景图文件夹'",
          "if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $d.SelectedPath }",
        ].join('; ');
        const { stdout } = await execFileP('powershell.exe', ['-NoProfile', '-STA', '-Command', ps],
          { timeout: 1800000, windowsHide: true });
        const dir = stdout.trim();
        return writeJson(res, 200, dir ? { ok: true, folder: dir } : { ok: false, canceled: true });
      } catch (e) {
        const canceled = /User canceled|用户取消|操作已取消/i.test(String(e.message) + String(e.stderr || ''));
        if (canceled) return writeJson(res, 200, { ok: false, canceled: true });
        return writeJson(res, 500, { ok: false, error: '打开文件夹选择框失败: ' + e.message });
      }
    }
    // 调整背景透明度 {bgAlpha?: 0~1, bgSideAlpha?: 0~1} (值=表面不透明度, 越小图片越清晰)
    if (req.method === 'POST' && url.pathname === '/api/background/alpha') {
      const body = await readBody(req);
      const cfg = readConfig();
      if (body.bgAlpha !== undefined) cfg.bgAlpha = clamp01(body.bgAlpha);
      if (body.bgSideAlpha !== undefined) cfg.bgSideAlpha = clamp01(body.bgSideAlpha);
      writeConfig(cfg);
      return writeJson(res, 200, { ok: true, bgAlpha: cfg.bgAlpha, bgSideAlpha: cfg.bgSideAlpha });
    }
    if (req.method === 'POST' && url.pathname === '/api/apply') {
      const { id } = await readBody(req);
      return writeJson(res, 200, applyTheme(id));
    }
    if (req.method === 'POST' && url.pathname === '/api/revert') {
      return writeJson(res, 200, applyTheme(''));
    }
    if (req.method === 'POST' && url.pathname === '/api/launch') {
      return writeJson(res, 200, await launchFlow());
    }
    if (req.method === 'POST' && url.pathname === '/api/patch' || req.method === 'POST' && url.pathname === '/api/unpatch') {
      // 后台进程修改 app bundle 会被 macOS TCC(App 管理) 静默拒绝, 必须终端前台执行
      const isPatch = url.pathname === '/api/patch';
      return writeJson(res, 409, {
        ok: false,
        error: `${isPatch ? 'patch' : 'unpatch'} 需在终端前台执行: claude-theme ${isPatch ? 'patch' : 'unpatch'} (后台进程会被 macOS 权限静默拒绝)`,
      });
    }
    writeJson(res, 404, { error: 'not found' });
  } catch (e) {
    writeJson(res, 500, { error: e.message });
  }
});

export async function startDaemon() {
  fs.mkdirSync(APP_DIR, { recursive: true });
  try {
    const pid = Number(fs.readFileSync(PID_FILE, 'utf8'));
    if (pid && process.kill(pid, 0)) {
      log(`daemon 已在运行 (pid ${pid})`);
      return { alreadyRunning: true, pid };
    }
  } catch { /* 未运行 */ }

  await new Promise((resolve, reject) => server.listen(HTTP_PORT, '127.0.0.1', resolve).once('error', reject));
  fs.writeFileSync(PID_FILE, String(process.pid));
  log(`daemon 就绪: http://127.0.0.1:${HTTP_PORT} (pid ${process.pid})`);
  setInterval(slideshowTick, 5000);

  const shutdown = () => {
    try { fs.unlinkSync(PID_FILE); } catch { /* 忽略 */ }
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1500);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  return { alreadyRunning: false, pid: process.pid };
}

// 直接运行本文件时作为守护进程入口
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startDaemon().catch(e => {
    console.error('[claude-theme] daemon 启动失败:', e.message);
    process.exit(1);
  });
}

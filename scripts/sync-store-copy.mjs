#!/usr/bin/env node
// 从 官方正版 Claude（官方安装器装的 MSIX 包，不是商店版） 同步一份可换肤的独立副本到 %LOCALAPPDATA%\ClaudeSkinned\app-x.y.z
//
// 为什么要副本: 官方正版安装在 C:\Program Files\WindowsApps, 只读且受包签名保护, 不能直接改 app.asar;
// 5.x 起又拒绝 --remote-debugging-port 等调试参数, 所以只能在副本里 patch。
// 副本做的改动: 关闭 EnableEmbeddedAsarIntegrityValidation fuse(否则改过的 asar 启动即被拒)。
// 官方正版安装本身不做任何修改。
//
// 用法: node scripts/sync-store-copy.mjs [--force]
//   默认: 副本已存在则跳过复制, 只检查 fuse
//   --force: 删除同版本副本后重新复制
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const req = createRequire(import.meta.url);
const { flipFuses, getCurrentFuseWire, FuseVersion, FuseV1Options, FuseState } = req('@electron/fuses');

const force = process.argv.includes('--force');
const SKIN_ROOT = process.env.CDT_CLAUDE_ROOT || path.join(process.env.LOCALAPPDATA, 'ClaudeSkinned');

function storePackage() {
  const out = execFileSync('powershell.exe', ['-NoProfile', '-Command',
    "Get-AppxPackage -Name Claude | Select-Object Version,InstallLocation | ConvertTo-Json -Compress"],
  { encoding: 'utf8', windowsHide: true }).trim();
  if (!out) throw new Error('没有找到官方正版 Claude (Get-AppxPackage -Name Claude 为空)');
  const list = [].concat(JSON.parse(out));
  // 取版本号最大的那个
  list.sort((a, b) => b.Version.localeCompare(a.Version, undefined, { numeric: true }));
  return list[0];
}

const pkg = storePackage();
const src = path.join(pkg.InstallLocation, 'app');
// 5.11492.5.0 → app-5.11492.5 (platform.mjs 只认三段版本号)
const ver = pkg.Version.split('.').slice(0, 3).join('.');
const dest = path.join(SKIN_ROOT, `app-${ver}`);
console.log(`官方正版: ${pkg.Version}\n来源: ${src}\n副本: ${dest}`);

if (fs.existsSync(dest) && force) {
  console.log('--force: 删除旧的同版本副本…');
  fs.rmSync(dest, { recursive: true, force: true });
}
if (!fs.existsSync(dest)) {
  console.log('复制中(约 1 GB, 需要一点时间)…');
  fs.mkdirSync(SKIN_ROOT, { recursive: true });
  const tmp = dest + '.partial';
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.cpSync(src, tmp, { recursive: true, preserveTimestamps: true });
  fs.renameSync(tmp, dest); // 复制完整后再改名, 半截副本不会被 platform.mjs 选中
  console.log('复制完成');
} else {
  console.log('副本已存在, 跳过复制 (需要重来请加 --force)');
}

// 官方正版主程序叫 Claude.exe; Windows 文件名不区分大小写, platform.mjs 的 claude.exe 可直接命中
const exe = path.join(dest, 'claude.exe');
if (!fs.existsSync(exe)) throw new Error(`副本中没有 ${exe}`);

const wire = await getCurrentFuseWire(exe);
const integrity = wire[FuseV1Options.EnableEmbeddedAsarIntegrityValidation];
if (integrity === FuseState.DISABLE) {
  console.log('asar 完整性校验 fuse 已关闭');
} else {
  await flipFuses(exe, {
    version: FuseVersion.V1,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: false,
  });
  console.log('已关闭 asar 完整性校验 fuse');
}
console.log('\n下一步: node bin/claude-theme.mjs patch');

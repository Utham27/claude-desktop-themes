// Claude Desktop 进程管理 (macOS: pgrep/osascript/open; Windows: tasklist/taskkill/直接 spawn)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { IS_MAC, claudeInstall } from './platform.mjs';
import { readConfig } from './themes.mjs';

// Windows 装了 Cage（存在 %LOCALAPPDATA%\Cage\HostNative）时，换肤副本只经 Cage 打开：
// Cage 核对副本登记、只在保护就绪时用专用代理启动，并沿用官方登录资料。这里不再直接启动副本，
// 以免副本绕开保护直连，或用另一份资料目录要求重新登录。
// Cage.exe 位置：环境变量 CDT_CAGE_EXE，或 config.json 的 "cageExe"。
function cageInstalled() {
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return fs.existsSync(path.join(local, 'Cage', 'HostNative'));
}
function cageExe() {
  let configured = null;
  try { configured = readConfig().cageExe; } catch { /* 忽略 */ }
  for (const p of [process.env.CDT_CAGE_EXE, configured])
    if (typeof p === 'string' && /(^|[\\/])Cage\.exe$/i.test(p) && fs.existsSync(p)) return p;
  return null;
}

// Windows: 只认换肤副本安装目录下的 claude.exe。
// 官方正版 Claude 与 Claude Code CLI 的可执行文件同样叫 claude.exe, 按进程名处理会误伤它们。
function winSkinnedPids() {
  const root = claudeInstall().root;
  const ps = "$r=$env:CDT_SKIN_ROOT.TrimEnd('\')+'\';" +
    "@(Get-CimInstance Win32_Process -Filter \"name='claude.exe'\" | " +
    "Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($r,[StringComparison]::OrdinalIgnoreCase) } | " +
    "ForEach-Object { $_.ProcessId }) -join ','";
  return new Promise(resolve => {
    try {
      const p = spawn('powershell.exe', ['-NoProfile', '-Command', ps],
        { windowsHide: true, env: { ...process.env, CDT_SKIN_ROOT: root } });
      let out = '';
      p.stdout.on('data', d => out += d);
      p.on('exit', () => resolve(out.trim().split(',').filter(Boolean).map(Number)));
      p.on('error', () => resolve([]));
    } catch { resolve([]); }
  });
}

export async function quitClaude(timeoutMs = 5000) {
  if (IS_MAC) {
    const p = spawn('osascript', ['-e', 'tell application "Claude" to quit']);
    return new Promise(resolve => {
      const t = setTimeout(() => { try { p.kill(); } catch { /* 忽略 */ } resolve(false); }, timeoutMs);
      p.on('exit', () => { clearTimeout(t); resolve(true); });
      p.on('error', () => { clearTimeout(t); resolve(false); });
    });
  }
  // taskkill 不带 /F = 发 WM_CLOSE 优雅退出, 且只针对换肤副本的 PID
  const pids = await winSkinnedPids();
  if (!pids.length) return true;
  const args = pids.flatMap(id => ['/PID', String(id)]);
  const run = a => new Promise(resolve => {
    const p = spawn('taskkill', a, { windowsHide: true });
    const t = setTimeout(() => { try { p.kill(); } catch { /* 忽略 */ } resolve(); }, timeoutMs);
    p.on('exit', () => { clearTimeout(t); resolve(); });
    p.on('error', () => { clearTimeout(t); resolve(); });
  });
  await run(args);
  // 5.x 收到 WM_CLOSE 只会缩到托盘; 等一会儿仍在就强制结束这些副本 PID
  await new Promise(r => setTimeout(r, 1500));
  const left = await winSkinnedPids();
  if (left.length) await run(['/F', '/T', ...left.flatMap(id => ['/PID', String(id)])]);
  return (await winSkinnedPids()).length === 0;
}

export function isClaudeRunning() {
  if (IS_MAC) {
    return new Promise(resolve => {
      try {
        const p = spawn('pgrep', ['-x', 'Claude']);
        p.on('exit', code => resolve(code === 0));
        p.on('error', () => resolve(false));
      } catch { resolve(false); }
    });
  }
  return winSkinnedPids().then(pids => pids.length > 0);
}

// 启动 Claude 应用; 成功启动 resolve(), 找不到 exe reject
export function openClaudeApp() {
  return new Promise((resolve, reject) => {
    if (IS_MAC) {
      const p = spawn('open', ['-a', 'Claude'], { stdio: 'ignore' });
      p.on('exit', code => code === 0 ? resolve() : reject(new Error(`open -a Claude 退出码 ${code}`)));
      p.on('error', reject);
      return;
    }
    if (cageInstalled()) {
      const cage = cageExe();
      if (!cage) return reject(new Error('检测到 Cage：换肤版 Claude 只能经 Cage 打开。请设置环境变量 CDT_CAGE_EXE，或在 config.json 写 "cageExe" 指向 Cage.exe'));
      try {
        const p = spawn(cage, ['--host-open-desktop'], { detached: true, stdio: 'ignore', windowsHide: false });
        p.unref();
        return resolve();
      } catch (e) { return reject(e); }
    }
    const exe = claudeInstall().exe;
    if (!exe) return reject(new Error('未找到 claude.exe (AnthropicClaude 安装目录)'));
    try {
      // 仅在设置 CDT_DEBUG_PORT 时开启本机调试端口（排查 DOM 用，默认关闭）。
      // 注意: Claude 5.x 打包版检测到 --remote-debugging-port 会直接拒绝启动, 5.x 上不要设置它。
      const dbg = process.env.CDT_DEBUG_PORT ? ['--remote-debugging-port=' + process.env.CDT_DEBUG_PORT, '--remote-debugging-address=127.0.0.1'] : [];
      const p = spawn(exe, dbg, { detached: true, stdio: 'ignore', windowsHide: true });
      p.unref();
      resolve();
    } catch (e) { reject(e); }
  });
}

// 用系统默认方式打开 URL (picker 页面)
export function openExternal(url) {
  const cmd = IS_MAC ? ['open', [url]] : [['cmd'], ['/c', 'start', '', url]];
  try { spawn(cmd[0], cmd[1], { detached: true, stdio: 'ignore', windowsHide: true }).unref(); } catch { /* 忽略 */ }
}

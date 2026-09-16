// Claude Desktop 进程管理 (macOS: pgrep/osascript/open; Windows: tasklist/taskkill/直接 spawn)
import { spawn } from 'node:child_process';
import { IS_MAC, claudeInstall } from './platform.mjs';

export function quitClaude(timeoutMs = 5000) {
  // Windows: taskkill 不带 /F = 发 WM_CLOSE 优雅退出; macOS: AppleScript quit
  const p = IS_MAC
    ? spawn('osascript', ['-e', 'tell application "Claude" to quit'])
    : spawn('taskkill', ['/IM', 'claude.exe'], { windowsHide: true });
  return new Promise(resolve => {
    const t = setTimeout(() => { try { p.kill(); } catch { /* 忽略 */ } resolve(false); }, timeoutMs);
    p.on('exit', () => { clearTimeout(t); resolve(true); });
    p.on('error', () => { clearTimeout(t); resolve(false); });
  });
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
  // tasklist 即使无匹配也退出码 0, 必须解析输出
  return new Promise(resolve => {
    try {
      const p = spawn('tasklist', ['/NH', '/FI', 'IMAGENAME eq claude.exe'], { windowsHide: true });
      let out = '';
      p.stdout.on('data', d => out += d);
      p.on('exit', () => resolve(/claude\.exe/i.test(out)));
      p.on('error', () => resolve(false));
    } catch { resolve(false); }
  });
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
    const exe = claudeInstall().exe;
    if (!exe) return reject(new Error('未找到 claude.exe (AnthropicClaude 安装目录)'));
    try {
      const p = spawn(exe, [], { detached: true, stdio: 'ignore', windowsHide: true });
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

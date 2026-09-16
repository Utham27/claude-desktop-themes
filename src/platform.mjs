// 平台差异集中地: Claude Desktop 安装路径 / 用户数据目录
// macOS:   /Applications/Claude.app 固定路径 (CDT_CLAUDE_APP 可覆盖)
// Windows: Squirrel 安装到 %LOCALAPPDATA%\AnthropicClaude, 版本目录 app-x.y.z
//          随自动更新变化, 每次动态取最新 (CDT_CLAUDE_ROOT 可覆盖)
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

export const IS_MAC = process.platform === 'darwin';
export const IS_WIN = process.platform === 'win32';

const verCmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

export function claudeInstall() {
  if (IS_MAC) {
    const app = process.env.CDT_CLAUDE_APP || '/Applications/Claude.app';
    return { root: app, appDir: app, exe: null, resources: path.join(app, 'Contents', 'Resources') };
  }
  const root = process.env.CDT_CLAUDE_ROOT
    || path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'AnthropicClaude');
  let best = null, bestV = null;
  try {
    for (const d of fs.readdirSync(root)) {
      const m = d.match(/^app-(\d+)\.(\d+)\.(\d+)$/);
      if (!m) continue;
      const v = m.slice(1).map(Number);
      if (!bestV || verCmp(v, bestV) > 0) { bestV = v; best = d; }
    }
  } catch { /* 目录不存在 */ }
  const exe = path.join(root, 'claude.exe');
  return {
    root,
    appDir: best ? path.join(root, best) : null,
    exe: fs.existsSync(exe) ? exe : null,
    resources: best ? path.join(root, best, 'resources') : null,
  };
}

// 供报错展示的安装位置描述
export function installDesc() {
  const i = claudeInstall();
  return IS_MAC ? i.root : (i.root + ' 下的 app-x.y.z 版本目录');
}

// 用户数据目录(config/背景图/守护进程 pid)
// macOS: ~/Library/Application Support/claude-desktop-themes
// Windows: %APPDATA%\claude-desktop-themes
export function appDataDir() {
  if (IS_MAC) {
    return path.join(os.homedir(), 'Library', 'Application Support', 'claude-desktop-themes');
  }
  return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'claude-desktop-themes');
}

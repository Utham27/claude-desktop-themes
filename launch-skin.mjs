import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const installRoot = path.join(process.env.LOCALAPPDATA, 'ClaudeSkinned');
process.env.CDT_CLAUDE_ROOT = installRoot;
// 自动清理原版桌面 Claude；同名 Claude Code 和桌宠不属于清理目标。
try {
  const result = execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'stop-original-claude.ps1')], {
    encoding: 'utf8', windowsHide: true, timeout: 30000
  });
  fs.appendFileSync(path.join(root, 'launch.log'), `\n[original-claude] ${result.trim()}\n`);
} catch (error) {
  fs.appendFileSync(path.join(root, 'launch.log'), `\n[original-claude] cleanup failed: ${error.message}\n`);
  process.exit(1);
}
const log = fs.openSync(path.join(root, 'launch.log'), 'a');
spawn(process.execPath, [path.join(root, 'bin', 'claude-theme.mjs'), 'launch'], {
  cwd:root, env:process.env, detached:true, windowsHide:true, stdio:['ignore',log,log]
}).unref();


// 跟随 Claude 启动桌宠；Electron 的单实例锁负责避免重复显示。
// 桌宠与本项目同在 E:\MyProgram\Claude Code 下
const mascotRoot = path.resolve(root, '..', 'claude-mascot');
const mascotExe = path.join(mascotRoot, 'node_modules', 'electron', 'dist', 'electron.exe');
if (fs.existsSync(mascotExe) && fs.existsSync(path.join(mascotRoot, 'package.json'))) {
  const mascot = spawn(mascotExe, [mascotRoot], {
    cwd: mascotRoot, detached: true, windowsHide: true, stdio: 'ignore'
  });
  mascot.on('error', error => {
    fs.appendFileSync(path.join(root, 'launch.log'), `\n[mascot] ${error.message}\n`);
  });
  mascot.unref();
}

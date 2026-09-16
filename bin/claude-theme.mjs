#!/usr/bin/env node
// claude-theme CLI (macOS & Windows)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { themeSummaries, readConfig, writeConfig, APP_DIR } from '../src/themes.mjs';
import { IS_MAC } from '../src/platform.mjs';
import { openClaudeApp, openExternal } from '../src/claude.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DAEMON = path.join(ROOT, 'src', 'daemon.mjs');
const PID_FILE = path.join(APP_DIR, 'daemon.pid');
const HTTP_PORT = Number(process.env.CDT_HTTP_PORT || 9343);
const BASE = `http://127.0.0.1:${HTTP_PORT}`;
const DAEMON_LOG = path.join(os.tmpdir(), 'claude-theme-daemon.log');

const help = `claude-theme — Claude Desktop 主题切换器 (macOS & Windows)

原理: patch app.asar 注入 bootstrap(轮询本地 daemon 拉取主题 CSS 并 insertCSS), 切换即时生效。
      原件备份为 app.asar.orig, 随时 unpatch 还原。app 自动更新后需重新 launch。

用法:
  claude-theme launch          确保已 patch 并启动 Claude + 拉起守护进程
  claude-theme picker          打开主题选择器 UI (浏览器)
  claude-theme use <id>        立即切换主题 (守护进程未运行则自动拉起)
  claude-theme list [关键词]    列出全部主题
  claude-theme revert          恢复 Claude 原生外观(清除主题, 保留 patch)
  claude-theme patch           手动 patch app.asar (需 Claude 已退出)
  claude-theme unpatch         还原 app.asar 原件 (需 Claude 已退出)
  claude-theme status          诊断信息
  claude-theme stop            停止守护进程

环境变量:
  CDT_HTTP_PORT    守护进程 HTTP 端口 (默认 9343)
  CDT_CLAUDE_APP   macOS Claude.app 路径 (默认 /Applications/Claude.app)
  CDT_CLAUDE_ROOT  Windows AnthropicClaude 安装根目录 (默认 %LOCALAPPDATA%\\AnthropicClaude)`;

async function daemonReady() {
  try {
    const r = await fetch(`${BASE}/api/status`, { signal: AbortSignal.timeout(800) });
    return r.ok;
  } catch { return false; }
}

async function waitDaemon(timeoutMs = 8000) {
  for (let i = 0; i < timeoutMs / 200; i++) {
    if (await daemonReady()) return true;
    await new Promise(r => setTimeout(r, 200));
  }
  return false;
}

function startDaemonInBackground() {
  const out = fs.openSync(DAEMON_LOG, 'a');
  const child = spawn(process.execPath, [DAEMON], { detached: true, stdio: ['ignore', out, out] });
  child.unref();
}

async function api(pathname, init) {
  const r = await fetch(`${BASE}${pathname}`, { ...init, signal: AbortSignal.timeout(30000) });
  return r.json();
}

const [cmd, ...rest] = process.argv.slice(2);
const sleep = ms => new Promise(r => setTimeout(r, ms));

try {
  switch (cmd) {
    case 'launch': {
      // patch 必须在本前台进程执行: macOS 只对前台终端弹「App 管理」授权窗
      const { detect, patchAsar } = await import('../src/patcher.mjs');
      const { isClaudeRunning, quitClaude } = await import('../src/claude.mjs');
      const { installDesc } = await import('../src/platform.mjs');
      const d = detect();
      if (!d.asarExists) { console.error(`未找到 app.asar (安装位置: ${installDesc()})`); process.exit(1); }
      if (!d.patched || !d.integrityOk || !d.signatureOk) {
        if (await isClaudeRunning()) {
          console.log('退出正在运行的 Claude…');
          await quitClaude();
          await sleep(1200);
        }
        console.log(d.patched
          ? (IS_MAC ? '同步 integrity hash / 修复代码签名中… 若 macOS 弹出「终端想要修改"Claude"」请点「允许」' : '同步校验中…')
          : (IS_MAC ? 'patch app.asar 中… 若 macOS 弹出「终端想要修改"Claude"」请点「允许」' : 'patch app.asar 中…'));
        const r = await patchAsar();
        if (!r.ok) { console.error(r.error); process.exit(1); }
        // 已 patch 但签名失效(如上次 patch 后签名中断): 仅重签名
        const d2 = detect();
        if (d2.patched && d2.integrityOk && !d2.signatureOk) {
          const { resignApp } = await import('../src/patcher.mjs');
          const rr = await resignApp();
          if (!rr.ok) { console.error(rr.error); process.exit(1); }
          console.log('代码签名已修复');
        }
        console.log(r.fixedIntegrity ? 'Info.plist integrity hash 已同步'
          : r.alreadyPatched ? 'app.asar 已是 patch 状态'
          : 'app.asar 已 patch (原件备份: app.asar.orig)');
      } else {
        console.log('app.asar 已 patch');
      }
      if (!(await daemonReady())) {
        startDaemonInBackground();
        if (!(await waitDaemon())) throw new Error(`守护进程启动超时, 查看 ${DAEMON_LOG}`);
        console.log('守护进程已启动');
      }
      openClaudeApp().catch(e => console.error('启动 Claude 失败:', e.message));
      for (let i = 0; i < 20 && !(await isClaudeRunning()); i++) await sleep(500);
      console.log('等待主题注入端握手…');
      let st = null;
      for (let i = 0; i < 10; i++) {
        await sleep(1000);
        st = await api('/api/status');
        if (st.injectedAlive) break;
      }
      console.log(`Claude: ${st?.claudeRunning ? '运行中' : '未运行'} | 注入端: ${st?.injectedAlive ? '已连接 ✓' : '未连接 (稍候刷新 claude-theme status)'} | 主题: ${st?.activeTheme || '(原生)'}`);
      console.log(`选择器: ${BASE}`);
      break;
    }
    case 'patch':
    case 'unpatch': {
      const { isClaudeRunning } = await import('../src/claude.mjs');
      const { patchAsar, unpatchAsar } = await import('../src/patcher.mjs');
      if (await isClaudeRunning()) { console.error('Claude 正在运行, 请先退出 Claude'); process.exit(1); }
      if (IS_MAC) console.log('若 macOS 弹出「终端想要修改"Claude"」请点「允许」');
      const r = cmd === 'patch' ? await patchAsar() : await unpatchAsar();
      if (!r.ok) { console.error(r.error); process.exit(1); }
      console.log(cmd === 'patch' ? (r.alreadyPatched ? '已是 patch 状态' : 'app.asar 已 patch, 备份: app.asar.orig') : '已还原 app.asar 原件');
      if (!(await daemonReady())) startDaemonInBackground();
      break;
    }
    case 'picker': {
      if (!(await daemonReady())) {
        startDaemonInBackground();
        await waitDaemon();
      }
      openExternal(BASE);
      console.log(`主题选择器已打开: ${BASE}`);
      break;
    }
    case 'use': {
      const id = rest[0];
      if (!id) { console.error('用法: claude-theme use <id> (claude-theme list 查看)'); process.exit(1); }
      if (!(await daemonReady())) {
        startDaemonInBackground();
        if (!(await waitDaemon())) throw new Error('守护进程启动超时');
      }
      const r = await api('/api/apply', { method: 'POST', body: JSON.stringify({ id }) });
      if (!r.ok) { console.error(r.error); process.exit(1); }
      const st = await api('/api/status');
      console.log(`已切换: ${id}`);
      if (!st.injectedAlive) console.log('提示: 主题注入端未在运行, 请执行 claude-theme launch 后生效');
      break;
    }
    case 'list': {
      const kw = (rest[0] || '').toLowerCase();
      const { items } = themeSummaries();
      const hit = items.filter(t => !kw || t.id.includes(kw) || t.name.toLowerCase().includes(kw));
      const cats = { builtin: '内置', gaming: '游戏', community: '社区', custom: '自定义' };
      for (const [c, label] of Object.entries(cats)) {
        const group = hit.filter(t => t.category === c);
        if (!group.length) continue;
        console.log(`\n[${label}] (${group.length})`);
        for (const t of group) console.log(`  ${t.id.padEnd(28)} ${t.name}`);
      }
      console.log(`\n当前: ${readConfig().activeTheme || '(原生)'} | 共 ${hit.length} 套`);
      break;
    }
    case 'revert': {
      if (await daemonReady()) {
        await api('/api/revert', { method: 'POST' });
      } else {
        const cfg = readConfig(); cfg.activeTheme = ''; writeConfig(cfg);
      }
      console.log('已恢复 Claude 原生外观');
      break;
    }
    case 'status': {
      const cfg = readConfig();
      let pid = null;
      try { pid = Number(fs.readFileSync(PID_FILE, 'utf8')); } catch { /* 无 */ }
      let alive = false;
      if (pid) { try { process.kill(pid, 0); alive = true; } catch { /* 已退出 */ } }
      console.log(`daemon: ${alive ? `运行中 (pid ${pid})` : '未运行'} | HTTP: ${await daemonReady() ? BASE : '不可达'}`);
      console.log(`活跃主题: ${cfg.activeTheme || '(原生)'}`);
      if (await daemonReady()) {
        const st = await api('/api/status');
        console.log(`Claude: ${st.claudeRunning ? '运行中' : '未运行'} | patch: ${st.patched ? '已注入' : '未注入'} | 注入端: ${st.injectedAlive ? '已连接' : '未连接 (需 claude-theme launch)'}`);
      }
      break;
    }
    case 'stop': {
      let pid = null;
      try { pid = Number(fs.readFileSync(PID_FILE, 'utf8')); } catch { /* 无 */ }
      if (pid) {
        try { process.kill(pid, 'SIGTERM'); console.log(`daemon (pid ${pid}) 已停止`); }
        catch { console.log('daemon 未在运行'); }
      } else console.log('daemon 未在运行');
      break;
    }
    default:
      console.log(help);
      process.exit(cmd && cmd !== 'help' ? 1 : 0);
  }
} catch (e) {
  console.error('错误:', e.message);
  process.exit(1);
}

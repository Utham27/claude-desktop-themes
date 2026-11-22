// 主题样式文件：守护进程/CLI 把当前主题 CSS 写进 %APPDATA%\claude-desktop-themes\active.css，
// 换肤副本里的注入端直接读这个文件（不走本机 HTTP）。
// 原因：Cage 保护下，受保护程序访问本机任意端口会被 WFP 拦截；读文件不经过网络，也不需要为皮肤开放行。
import fs from 'node:fs';
import path from 'node:path';
import { buildCss, buildBackgroundCss, withAlpha } from './css-builder.mjs';
import { loadAll, readConfig, APP_DIR, CONFIG_PATH, USER_THEMES_DIR, backgroundPath } from './themes.mjs';

export const CSS_FILE = path.join(APP_DIR, 'active.css');
// 注入端每次轮询都会刷新它的修改时间，用来判断“注入端已连接”。
export const ALIVE_FILE = path.join(APP_DIR, 'injector-alive');

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };
const clamp01 = n => Math.min(1, Math.max(0, Number(n) || 0));

export function activeCss() {
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

// 内容变了才写；先写临时文件再改名，注入端不会读到半份。返回是否写入。
export function writeActiveCss() {
  const css = activeCss();
  let old = null;
  try { old = fs.readFileSync(CSS_FILE, 'utf8'); } catch { /* 首次 */ }
  if (old === css) return false;
  fs.mkdirSync(APP_DIR, { recursive: true });
  const tmp = `${CSS_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, css);
  try { fs.renameSync(tmp, CSS_FILE); }
  catch (e) { try { fs.unlinkSync(tmp); } catch { /* 忽略 */ } throw e; }
  return true;
}

// 守护进程每秒调用：只在配置、自定义主题、背景图或 active.css 本身变化时才重建 CSS（背景图 base64 可达数 MB）。
const stamp = p => { try { const s = fs.statSync(p); return `${s.mtimeMs}:${s.size}`; } catch { return '-'; } };
function inputsSignature() {
  const parts = [stamp(CONFIG_PATH), stamp(CSS_FILE), stamp(USER_THEMES_DIR)];
  try { for (const f of fs.readdirSync(USER_THEMES_DIR).sort()) parts.push(f + '=' + stamp(path.join(USER_THEMES_DIR, f))); } catch { /* 无自定义主题 */ }
  try { const bg = readConfig().background; const p = bg && backgroundPath(bg); if (p) parts.push(p + '=' + stamp(p)); } catch { /* 忽略 */ }
  return parts.join('|');
}
let lastSignature = null;
export function syncActiveCss() {
  const sig = inputsSignature();
  if (sig === lastSignature) return false;
  const wrote = writeActiveCss();
  // 写入后 active.css 的时间戳变了，按写入后的状态记下签名，下一秒不会再重建一次。
  lastSignature = wrote ? inputsSignature() : sig;
  return wrote;
}

export function injectorAlive(withinMs = 8000) {
  try { return Date.now() - fs.statSync(ALIVE_FILE).mtimeMs < withinMs; } catch { return false; }
}

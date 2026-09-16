// 主题注册表与配置持久化
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appDataDir } from './platform.mjs';

export const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
export const APP_DIR = appDataDir();
export const CONFIG_PATH = path.join(APP_DIR, 'config.json');
export const USER_THEMES_DIR = path.join(APP_DIR, 'themes');
export const BG_DIR = path.join(APP_DIR, 'backgrounds');

// 背景图文件名 -> 绝对路径（config.background 存文件名，空串 = 无背景）
export function backgroundPath(name) {
  if (!name || /\.\.|[/\\]/.test(name)) return null; // 防路径穿越
  const p = path.join(BG_DIR, name);
  return fs.existsSync(p) ? p : null;
}

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function loadUserThemes() {
  const out = {};
  try {
    for (const f of fs.readdirSync(USER_THEMES_DIR)) {
      if (!f.endsWith('.json')) continue;
      const slug = f.replace(/\.json$/, '');
      const t = readJson(path.join(USER_THEMES_DIR, f));
      if (t) out[slug] = t;
    }
  } catch { /* dir 不存在 */ }
  return out;
}

// 返回 {slug, name, category}[] 按类别分组
export function loadAll() {
  const builtin = readJson(path.join(DATA_DIR, 'builtin-themes.json')) || {};
  const gaming = readJson(path.join(DATA_DIR, 'gaming-themes.json')) || {};
  const community = readJson(path.join(DATA_DIR, 'community-themes.json')) || {};
  const user = loadUserThemes();
  const groups = { builtin, gaming, community, custom: user };
  const flat = {};
  const pretty = s => String(s).split(/[-_ ]+/).map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(' ');
  for (const [category, map] of Object.entries(groups)) {
    for (const [slug, t] of Object.entries(map)) {
      flat[slug] = { theme: t, category, name: t.name || pretty(slug) };
    }
  }
  return { groups, flat };
}

export function lookup(slug) {
  if (!slug) return null;
  return loadAll().flat[slug] || null;
}

export function readConfig() {
  return readJson(CONFIG_PATH) || { activeTheme: '' };
}

export function writeConfig(cfg) {
  fs.mkdirSync(APP_DIR, { recursive: true });
  const tmp = CONFIG_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2));
  fs.renameSync(tmp, CONFIG_PATH);
}

// 供 picker 用的摘要（避免把 400KB 主题全量发给页面）
export function themeSummaries() {
  const { groups, flat } = loadAll();
  const swatch = vars => ({
    bg: vars['--bg-000'] || '',
    bg2: vars['--bg-100'] || '',
    bg3: vars['--bg-200'] || '',
    text: vars['--text-000'] || '',
    accent: vars['--accent-brand'] || '',
  });
  const items = Object.entries(flat).map(([slug, e]) => ({
    id: slug,
    name: e.name,
    category: e.category,
    light: swatch(e.theme.light || e.theme),
    dark: swatch(e.theme.dark || e.theme),
  }));
  return { groups: Object.fromEntries(Object.entries(groups).map(([c, m]) => [c, Object.keys(m)])), items };
}

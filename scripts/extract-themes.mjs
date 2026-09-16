#!/usr/bin/env node
// 从 claude-desktop-extra 源项目提取主题数据（内置主题从 nim patch 的 JS 字面量中解析）
// 用法: node scripts/extract-themes.mjs <claude-desktop-extra 路径>
import fs from 'node:fs';
import path from 'node:path';

const srcRoot = process.argv[2];
if (!srcRoot) {
  console.error('usage: node scripts/extract-themes.mjs <claude-desktop-extra-path>');
  process.exit(1);
}

const nimPath = path.join(srcRoot, 'patches/core/add_feature_custom_themes.nim');
const nim = fs.readFileSync(nimPath, 'utf8');

// 定位 var __cdb_builtins={ ... }; 并做花括号配平（字符串感知）
function extractObjectLiteral(text, anchor) {
  const start = text.indexOf(anchor);
  if (start < 0) throw new Error('anchor not found: ' + anchor);
  let i = text.indexOf('{', start);
  let depth = 0, str = false, esc = false;
  for (; i < text.length; i++) {
    const c = text[i];
    if (str) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') str = false;
      continue;
    }
    if (c === '"') { str = true; continue; }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return text.slice(text.indexOf('{', start), i + 1);
    }
  }
  throw new Error('unbalanced braces');
}

const builtinsLiteral = extractObjectLiteral(nim, 'var __cdb_builtins=');
// eslint-disable-next-line no-eval
const builtins = (0, eval)('(' + builtinsLiteral + ')');

const outDir = new URL('../data/', import.meta.url).pathname;
fs.mkdirSync(outDir, { recursive: true });

// 内置主题：slug -> {name, light, dark, spinner?}
for (const [slug, t] of Object.entries(builtins)) {
  if (!t.name) t.name = slug.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
}
fs.writeFileSync(path.join(outDir, 'builtin-themes.json'), JSON.stringify(builtins, null, 1));

// 游戏 & 社区主题直接拷贝（统一为连字符命名）
for (const f of ['gaming_themes.json', 'community_themes.json']) {
  const dest = f.replace(/_/g, '-');
  fs.copyFileSync(path.join(srcRoot, 'js', f), path.join(outDir, dest));
}

const counts = {
  builtin: Object.keys(builtins).length,
  gaming: Object.keys(JSON.parse(fs.readFileSync(path.join(outDir, 'gaming-themes.json'), 'utf8'))).length,
  community: Object.keys(JSON.parse(fs.readFileSync(path.join(outDir, 'community-themes.json'), 'utf8'))).length,
};
console.log('extracted:', JSON.stringify(counts));

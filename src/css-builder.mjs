// CSS 生成器 —— 移植自 claude-desktop-extra 的 __cdb_block/__cdb_buildCss
// 主题 -> 完整样式表（双模式变量块 + 元素覆盖 + 内层作用域再断言）

function block(vars) {
  const out = [];
  for (const k of Object.keys(vars)) {
    if (k.startsWith('--')) out.push(`${k}:${vars[k]} !important`);
    // bg 阶梯镜像到 --cdb-bg-*，供内层作用域再断言引用（上游不会声明这些名字）
    if (k.startsWith('--bg-')) out.push(`--cdb-${k.slice(2)}:${vars[k]}`);
  }
  // 派生别名：stock 没有 main-*/secondary-*，但旧主题和元素覆盖会引用
  out.push('--accent-main-000:var(--accent-000)');
  out.push('--accent-main-100:var(--accent-brand)');
  out.push('--accent-main-200:var(--accent-200)');
  out.push('--accent-main-900:var(--accent-900)');
  out.push('--accent-secondary-000:var(--accent-pro-000)');
  out.push('--accent-secondary-100:var(--accent-pro-100)');
  out.push('--accent-secondary-200:var(--accent-pro-200)');
  out.push('--accent-secondary-900:var(--accent-pro-900)');
  out.push('--always-black:0 0% 0% !important');
  out.push('--always-white:0 0% 100% !important');
  return out.join(';');
}

function isVarMap(t) {
  if (!t || typeof t !== 'object' || Array.isArray(t)) return false;
  return Object.keys(t).some(k => k.startsWith('--'));
}

// 双变体 -> 各自使用；扁平变量表（旧 schema）-> 两边同表
function variants(t) {
  if (!t || typeof t !== 'object') return null;
  if (t.light || t.dark) return { light: t.light || t.dark, dark: t.dark || t.light };
  if (isVarMap(t)) return { light: t, dark: t };
  return null;
}

function toCss(v) {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.join('\n');
  return '';
}

export function buildCss(theme) {
  const v = variants(theme);
  if (!v) return null;
  // light 先、dark 后：特异性打平时 dark 胜（都是单 class/attr）
  let css = `:root,[data-mode=light]{${block(v.light)}}`;
  css += `.darkTheme,[data-mode=dark],.dark{${block(v.dark)}}`;

  // 元素覆盖（只输出一次；引用语义 token，保证模式正确）
  css += ''
    + 'html,body{color:var(--claude-foreground-color)!important}'
    + '#root,[id=root]{background:hsl(var(--bg-000))!important}'
    + '.dframe-sidebar{background-color:hsl(var(--bg-200))!important}'
    + '.dframe-content,.dframe-main,main.dframe-main{background-color:hsl(var(--bg-100))!important}'
    + '.dframe-root{--df-z1:var(--bg-100)!important;--df-z2:var(--bg-200)!important;--df-sidebar-bg:hsl(var(--bg-200))!important;--df-surface-primary:hsl(var(--bg-100))!important}'
    + '[data-darker] .dframe-sidebar{background-color:hsl(var(--bg-300))!important}'
    + ':root,.cds-root,.epitaxy-root,[data-mode=dark],[data-mode=light]{--cds-page-bg:hsl(var(--bg-200))!important;--cds-surface-0:hsl(var(--bg-200))!important;--cds-surface-1:hsl(var(--bg-100))!important;--cds-surface-2:hsl(var(--bg-100))!important;--cds-surface-3:hsl(var(--bg-000))!important;--cds-surface-panel:hsl(var(--bg-100))!important;--cds-surface-popover:hsl(var(--bg-000))!important;--surface-primary:hsl(var(--bg-100))!important;--surface-primary-elevated:hsl(var(--bg-000))!important;--surface-popover:hsl(var(--bg-000))!important;--surface-panel:hsl(var(--bg-100))!important;--surface-hud:hsl(var(--bg-200))!important;--cds-text-primary:hsl(var(--text-000))!important;--cds-text-secondary:hsl(var(--text-200))!important;--cds-text-muted:hsl(var(--text-400))!important;--cds-border:hsl(var(--border-200) / 0.18)!important;--cds-clay:hsl(var(--accent-brand))!important}'
    + '.epitaxy-top-scrim{background:linear-gradient(hsl(var(--bg-100)),transparent)!important}'
    + '.epitaxy-bottom-scrim{background:linear-gradient(transparent,hsl(var(--bg-100)))!important}'
    + '.bg-white{background-color:hsl(var(--bg-000))!important}'
    + '.text-black{color:hsl(var(--text-000))!important}'
    + '.container{background:linear-gradient(to bottom,hsl(var(--bg-100)),hsl(var(--bg-000)))!important}'
    + '.container:before{border-color:hsl(var(--border-300) / 0.3)!important}'
    + '.input-box textarea{color:var(--claude-foreground-color)!important}'
    + '.input-box textarea::placeholder{color:var(--claude-text-500)!important}'
    + '.secondary{color:var(--claude-secondary-color)!important}'
    + 'input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]),textarea,[contenteditable=true],.ProseMirror{background:transparent!important;color:hsl(var(--text-000))!important;border-color:transparent!important}'
    + '[type=text]:focus,[type=email]:focus,[type=url]:focus,[type=password]:focus,[type=number]:focus,[type=search]:focus,textarea:focus,select:focus,[multiple]:focus{--tw-ring-color:hsl(var(--accent-100))!important;border-color:hsl(var(--accent-100))!important}'
    + '::placeholder{color:hsl(var(--text-400))!important}'
    + '[role=dialog],[role=menu],[role=listbox],[role=tooltip]{background:hsl(var(--bg-100))!important;color:hsl(var(--text-000))!important;border-color:hsl(var(--border-200) / 0.18)!important}'
    + 'hr{border-color:hsl(var(--border-200) / 0.25)!important}'
    + '[type=checkbox]:checked{background-color:hsl(var(--accent-brand))!important;border-color:hsl(var(--accent-brand))!important}'
    + '::selection{background:hsl(var(--accent-brand) / 0.3)!important}'
    + '*{scrollbar-width:auto!important}'
    + '::-webkit-scrollbar{width:6px!important;height:6px!important}'
    + '::-webkit-scrollbar-thumb{background:hsl(var(--accent-brand) / 0.5)!important;border-radius:3px!important}'
    + '::-webkit-scrollbar-thumb:hover{background:hsl(var(--accent-brand) / 0.7)!important}'
    + '::-webkit-scrollbar-track{background:transparent!important}'
    + 'svg{color:inherit}'
    + '.nc-drag{color:hsl(var(--text-000))!important}'
    + 'a,button,[role=tab],[role=menuitem]{transition:background-color .15s ease,box-shadow .15s ease,border-color .15s ease!important}'
    + '.darkTheme [role=dialog],[data-mode=dark] [role=dialog]{box-shadow:0 0 0 1px hsl(var(--accent-brand) / 0.35),0 12px 40px rgba(0,0,0,0.5),0 0 30px hsl(var(--accent-brand) / 0.1)!important}'
    + '.darkTheme [role=menu],.darkTheme [role=listbox],[data-mode=dark] [role=menu],[data-mode=dark] [role=listbox]{box-shadow:0 0 0 1px hsl(var(--accent-brand) / 0.3),0 8px 24px rgba(0,0,0,0.4)!important}'
    + '.darkTheme button:not([disabled]):hover,[data-mode=dark] button:not([disabled]):hover{box-shadow:0 0 12px hsl(var(--accent-brand) / 0.3)!important}';

  // 内层作用域再断言：上游桌面框架会在聊天子树里重定义 --bg-100
  // （.dframe-content-inner{--bg-100:var(--df-bg-page-hsl)}，而 --df-bg-page-hsl 在
  // .dframe-root 上是写死的 stock 灰）。自定义属性按元素解析：元素上的声明永远
  // 赢过继承值（!important 也一样），所以上面 html 作用域的变量块到不了那个容器
  // 之内。这里从 --cdb-bg-* 镜像（无人重定义，不可能成环）把 bg 阶梯在该作用域
  // 重新断言，并把框架自己的 page-bg token 指到主题上。
  // 只再断言两个变体都有的 token：缺一侧的镜像在该模式下会在计算值时失效，会把
  // 表面涂成空白。
  const bgKeys = Object.keys(v.light).filter(k => k.startsWith('--bg-') && v.dark[k]);
  if (bgKeys.length) {
    const reassert = bgKeys.map(k => `${k}:var(--cdb-${k.slice(2)})!important`);
    css += `.dframe-content-inner{${reassert.join(';')}}`;
  }
  if (v.light['--bg-100'] && v.dark['--bg-100']) {
    css += '.dframe-root{--df-bg-page-hsl:var(--cdb-bg-100)!important;--df-bg-page:hsl(var(--cdb-bg-100))!important}';
  }

  // 聊天字体覆盖（可选）
  const font = theme?.chatFont || v.light?.chatFont;
  if (font) {
    css += `html .font-claude-response-body,html .font-claude-response-title,html .font-claude-response,[data-user-message-bubble],[data-user-message-bubble] *{font-family:${font}!important}`;
  }

  // customCss（可选）
  const themeExtra = toCss(theme?.customCss) || toCss(v.light?.customCss);
  if (themeExtra) css += '\n' + themeExtra;

  return css;
}

// 背景图激活时: 给主题 token 值追加透明度。
// 原理: 主题通过覆盖 --bg-* 设计 token 生效, 页面所有表面都消费这些 token
// (hsl(var(--bg-100))), 值本身追加 "/ a" 后所有表面自动半透明, 与具体类名无关。
// (claude.ai DOM 是远程页面且类名混淆, 逐元素覆盖不可行)
export function withAlpha(css, mainA = 0.5, sideA = 0.68) {
  return css.replace(/(--bg-[a-z0-9-]+\s*:\s*)([^;}]+)/g, (m, k, v) => {
    const imp = /\s*!important\s*$/.test(v); // 主题 token 值可能带 !important
    const val = v.replace(/\s*!important\s*$/, '');
    if (/\//.test(val)) return m; // 已含 alpha, 跳过
    const a = /-200|-300|-400/.test(k) ? sideA : mainA; // 侧栏/面板稍实
    return `${k}${val} / ${a}${imp ? ' !important' : ''}`;
  });
}

// 背景图层：追加在主题 CSS 之后。
export function buildBackgroundCss(url) {
  if (!url) return '';
  return ''
    + `html{background:url(${url}) center/cover fixed no-repeat!important}`
    + '#root,[id=root],body{background:transparent!important}'
    // 不加 backdrop-filter: blur 会把透出的图片糊掉; 靠透明度本身保证文字可读
    // 浮层(弹窗/菜单)必须不透明。不能用 hsl(var(--bg-100) / 0.9): withAlpha 已把
    // "/ a" 写进 token 值, 再叠 alpha → hsl(h s l / a / 0.9) 非法, 声明被丢弃, 浮层反而透明。
    // 用镜像 token --cdb-bg-100(block() 生成纯色, withAlpha 不改它); 无主题时回落纯白。
    + '[role=dialog],[role=menu],[role=listbox],[role=tooltip]{background-color:hsl(var(--cdb-bg-100, 0 0% 100%))!important}';
}

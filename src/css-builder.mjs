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
  // 3.x: .dframe-content 与 web 变体的 main 渐变都读 --df-bg-page。直接指向（可能带 alpha 的）
  // --bg-100：.dframe-content-inner 会把 --bg-100 重定义为 --df-bg-page-hsl，值即同一份，
  // 不会成环，且背景图开启时 withAlpha 的透明度能一路传到主区。
  if (v.light['--bg-100'] && v.dark['--bg-100']) {
    css += '.dframe-root{--df-bg-page-hsl:var(--bg-100)!important;--df-bg-page:hsl(var(--bg-100))!important}';
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
  // 文字回复卡片的底色在独立 fill 层，不在带 bg- 类的容器上。
  // 排除媒体卡片及浮层；用主题原色调制局部底色，保留卡片区分与点击行为。
  const replyCards = 'html:root body [data-cds=Card]:not(:has(img,video,canvas,iframe)):not(:is([role=dialog],[role=menu],[role=listbox],[role=tooltip],[data-cds=Popover]) *)';
  const cardColor = 'hsl(var(--accent-brand,25 48.8% 60.2%) / .22)';
  const cardHoverColor = 'hsl(var(--accent-brand,25 48.8% 60.2%) / .34)';
  return ''
    // 遮罩只作用于壁纸图层，整体压暗 25%，文字和控件不跟随变暗。
    + `html,html.cds-root,html.epitaxy-root{background:linear-gradient(rgb(0 0 0 / .25),rgb(0 0 0 / .25)) center/cover fixed no-repeat,url(${url}) center/cover fixed no-repeat!important}`
    + '#root,[id=root],body{background:transparent!important}'
    // 不加 backdrop-filter: blur 会把透出的图片糊掉; 靠透明度本身保证文字可读
    // 浮层(弹窗/菜单)必须不透明。不能用 hsl(var(--bg-100) / 0.9): withAlpha 已把
    // "/ a" 写进 token 值, 再叠 alpha → hsl(h s l / a / 0.9) 非法, 声明被丢弃, 浮层反而透明。
    // 用镜像 token --cdb-bg-100(block() 生成纯色, withAlpha 不改它); 无主题时回落纯白。
    + '[role=dialog],[role=menu],[role=listbox],[role=tooltip]{background-color:hsl(var(--cdb-bg-100, 0 0% 100%))!important}'
    // 右侧文件/预览等面板：根容器统一给半透明主题底，内部带 bg-/surface 类的块级容器去掉自带实心底，避免多层叠成不透明
    + '.dframe-pane,.dframe-pane-primary,.dframe-pane-extra,.epitaxy-pane-window{background-color:hsl(var(--bg-100))!important}'
    + ':is(.dframe-pane,.dframe-pane-primary,.dframe-pane-extra,.epitaxy-pane-window) :is(div,section,aside,header,main,nav)[class*=bg-],:is(.dframe-pane,.dframe-pane-primary,.dframe-pane-extra,.epitaxy-pane-window) :is(div,section,aside,header,main,nav)[class*=surface]{background-color:transparent!important;background-image:none!important}'
    // 输入区外层包裹容器（非圆角、含输入框的祖先）自带实心底/顶线/模糊，会形成硬边矩形，统一清掉
    + 'div:not([class*=rounded]):has(.epitaxy-prompt-input){background:transparent!important;background-image:none!important;box-shadow:none!important;border-color:transparent!important;-webkit-backdrop-filter:none!important;backdrop-filter:none!important}'
    + '.epitaxy-bottom-scrim,.epitaxy-top-scrim{background:none!important}'
    // 不给含输入框的圆角祖先套毛玻璃：它们可能是整个聊天面板。
    // 项目页等主区：去掉所有 backdrop-filter 模糊，让壁纸直接透出（包含输入框祖先，不再保留任何大面积模糊）
    + '*,*::before,*::after{-webkit-backdrop-filter:none!important;backdrop-filter:none!important}'
    + '[class*=blur],[class*=blur]::before,[class*=blur]::after{filter:none!important}'
    // 清除主区内重复叠加的底色，保留卡片边框，让壁纸直接透出。
    + ':is(.dframe-content,.dframe-main) :is(div,section,aside,header,main,nav,ul,li,a)[class*=bg-]:not(:has(.epitaxy-prompt-input)):not([class*=accent]):not([class*=danger]):not([class*=success]){background-color:transparent!important;background-image:none!important}'
    + ':is(.dframe-content,.dframe-main) :is(div,section,a,li)[class*=bg-][class*=border]:not(:has(.epitaxy-prompt-input)){border-color:hsl(0 0% 100% / .14)!important}'
    // 镜像 token 不含 alpha，避免与全局面板透明度重复拼接。
    + `${replyCards}{background:transparent!important}`
    + `${replyCards},${replyCards}>.cds-card-body{--cds-surface-1:${cardColor}!important;--cds-surface-2:${cardHoverColor}!important;--cds-border:hsl(var(--accent-brand,25 48.8% 60.2%) / .32)!important;--cds-scroll-fade-strip-color:${cardColor}!important}`
    // 直接给填充层指定主题暖色，避免被组件自己的 surface 变量重定义成黑色。
    + `${replyCards}>.cds-card-fill{background:${cardColor}!important}`
    + `${replyCards}:hover,${replyCards}:hover>.cds-card-body{--cds-surface-1:${cardHoverColor}!important;--cds-scroll-fade-strip-color:${cardHoverColor}!important;--cds-border:hsl(var(--accent-brand,25 48.8% 60.2%) / .45)!important}`
    + `${replyCards}:hover>.cds-card-fill{background:${cardHoverColor}!important}`
    // 标题提示框使用主题强调色与底色调成暖咖色，保持实底可读，避免纯黑悬浮框。
    + 'html:root body :is([role=tooltip],[data-cds=Tooltip]){background:color-mix(in srgb,hsl(var(--accent-brand,25 48.8% 60.2%)) 55%,hsl(var(--cdb-bg-100,15 5.9% 13.3%)))!important;--cds-tooltip-bg:color-mix(in srgb,hsl(var(--accent-brand,25 48.8% 60.2%)) 55%,hsl(var(--cdb-bg-100,15 5.9% 13.3%)))!important;--cds-tooltip-fg:hsl(var(--text-000,45 35% 84.3%))!important;color:var(--cds-tooltip-fg)!important;border-color:hsl(var(--accent-brand,25 48.8% 60.2%) / .45)!important}'
    // 运行中的旧注入层可能残留诊断 outline；回退到应用原生轮廓而非禁用焦点提示。
    + 'html:root :is(.epitaxy-link-chip,[data-session-spawn],[data-cds=Card],[data-card-panel],[data-cds-open-text],button[class~="group/replies"],[data-thread-rename-anchor]){outline:revert!important}';
}

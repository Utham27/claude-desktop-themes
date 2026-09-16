# claude-desktop-themes

Claude Desktop 主题切换器,支持 **macOS** 与 **Windows**。

不修改任何 Claude 功能逻辑,仅注入一段轮询本地 daemon 的 bootstrap,把主题 CSS `insertCSS` 进所有窗口 —— 切换主题**即时生效,无需重启应用**。原件备份为 `app.asar.orig`,随时 `unpatch` 完整还原。

内置 90+ 套主题(Catppuccin / Nord / Tokyo Night / 游戏联名等),支持背景图、透明度调节、文件夹随机轮播。

## 原理

```
claude-theme (CLI) ──HTTP──▶ daemon (127.0.0.1:9343)
                                ▲ 轮询 /api/css (2s)
              patch app.asar ──┘
              └─ bootstrap(main 进程): 拉取 CSS → insertCSS 所有 webContents
```

1. `patch`: 重打包 `app.asar`,在 main 进程入口注入 bootstrap,自动备份原件
2. `daemon`: 本地 HTTP 服务,负责主题/背景图配置与 CSS 生成
3. bootstrap 每 2 秒轮询 daemon,CSS 变化即重新注入 —— 主题、背景、透明度全部实时生效

## 安装

要求:Node.js ≥ 18,已安装并登录 Claude Desktop。

```bash
git clone https://github.com/1327483427/claude-desktop-themes.git
cd claude-desktop-themes
npm install
```

macOS 可选加速:无需 sharp,压缩用系统自带 sips;Windows 若 sharp 安装失败会自动退化为不压缩(仅影响背景图 CSS 体积)。

## 快速开始

```bash
node bin/claude-theme.mjs launch    # patch + 启动 Claude + 拉起守护进程
node bin/claude-theme.mjs picker    # 浏览器打开主题选择器
```

建议加个别名:`alias claude-theme='node <仓库路径>/bin/claude-theme.mjs'`

- **macOS 首次 patch**:终端会弹出「终端想要修改"Claude"」,点「允许」;若曾拒绝,去 系统设置 → 隐私与安全性 → App 管理 为终端开启
- **Windows**:安装目录在用户可写的 `%LOCALAPPDATA%`,无需管理员权限,无弹窗

## 命令

| 命令 | 作用 |
|---|---|
| `claude-theme launch` | 确保 patch 并启动 Claude + 守护进程 |
| `claude-theme picker` | 打开主题选择器(浏览器) |
| `claude-theme use <id>` | 切换主题,如 `use nord` |
| `claude-theme list [关键词]` | 列出全部主题 |
| `claude-theme revert` | 恢复原生外观(清除主题,保留 patch) |
| `claude-theme patch / unpatch` | 手动 patch / 还原 app.asar 原件 |
| `claude-theme status` | 诊断信息 |
| `claude-theme stop` | 停止守护进程 |

## 主题选择器功能

- 点击卡片即时切换,顶部搜索,97 套主题按 内置/游戏/社区/自定义 分组
- **背景图**:上传任意图片,主区/侧栏透明度独立滑杆调节
- **轮播模式**:点击「轮播背景」,选择本地壁纸文件夹(系统原生弹窗)与切换间隔,到点自动随机换图(不与上一张重复);手动上传或清除背景会自动退出轮播

## 平台差异

| | macOS | Windows |
|---|---|---|
| 安装位置 | `/Applications/Claude.app`(`CDT_CLAUDE_APP` 覆盖) | `%LOCALAPPDATA%\AnthropicClaude\app-x.y.z`(`CDT_CLAUDE_ROOT` 覆盖),自动定位最新版本目录 |
| integrity hash | 需同步 Info.plist | 无此机制 |
| 代码签名 | patch 后必须 ad-hoc 重签名 | 无此机制 |
| 写入授权 | TCC「App 管理」,首次弹窗 | 用户目录直接写,无需提权 |
| 图片压缩 | 系统 sips | sharp(可选依赖) |
| 文件夹弹窗 | osascript `choose folder` | PowerShell `FolderBrowserDialog` |

## 注意事项

- **Claude 自动更新后主题失效**:更新会替换 `app.asar`,重新执行 `claude-theme launch` 即可
- 卸载:先 `claude-theme unpatch` 还原 `app.asar` 原件,再 `claude-theme stop`
- 自定义主题:放入 `~/Library/Application Support/claude-desktop-themes/themes/`(Windows: `%APPDATA%\claude-desktop-themes\themes\`)下的 JSON,结构参考 `data/builtin-themes.json`

## 环境变量

| 变量 | 说明 |
|---|---|
| `CDT_HTTP_PORT` | daemon HTTP 端口(默认 9343) |
| `CDT_CLAUDE_APP` | macOS Claude.app 路径 |
| `CDT_CLAUDE_ROOT` | Windows AnthropicClaude 安装根目录 |

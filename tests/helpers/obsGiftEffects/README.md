# OBS 浏览器验收

使用实际 `src/obs/obsBrowserEntry.tsx`、Chrome headless、独立 loopback WebSocket 和真实 VAP 资源。脚本全部位于正式测试目录；`.superpowers` 仅作为默认资源与输出目录，不提供可执行测试代码。

## 准备

- 在 1442 启动本工作树的网页服务，安装 Chrome。
- 验收构建产物时，将 `OBS_FRONTEND_DIST` 设为包含 `obs.html` 的构建目录。fixture 从该目录提供 `/obs.html` 和 `/assets/`，其余请求（包括 `/src/` 测试数据）仍代理 1442。
- 准备可由 `require()` 加载的 Playwright。默认解析 `playwright`；若安装在项目外，设置 `PLAYWRIGHT_MODULE` 为其模块目录或入口文件。各组使用同一配置。
- 准备配套的真实 VAP `effect.mp4` 和 `effect.json`，设置 `OBS_EFFECT_ASSET_DIR` 为二者所在目录。默认目录是仓库根目录下 `.superpowers/sdd/2026-11-01-style-common-behavior`。JSON 必须是 VAP 播放配置，包含与视频匹配的 `info`，不是资源查询接口的外层响应。
- 图片引用测试使用仓库已有 `public/media/style-preview-avatar-1.jpg`，无需截图文件。
- idle 组通过 Windows PowerShell `Get-Process` 记录 Chrome 进程 CPU 和内存，需要 Windows。

## 运行

在仓库根目录执行：

```powershell
node tests/obsGiftEffects.browser.mjs --group=smoke
node tests/obsGiftEffects.browser.mjs --group=summary
node tests/obsGiftEffects.browser.mjs --group=websocket
node tests/obsGiftEffects.browser.mjs --group=idle
```

默认组为 smoke，验证基线、新通知、真实视频及 canvas 出帧。websocket 组验证双页面、重连基线和主题状态。idle 组稳定连接后观察 60 秒。

设置 `OBS_FRONTEND_DIST` 后运行 smoke，`OBS_THEME_MODE` 可指定 `native`、`blivechat`、`blivechat-open` 或 `laplace`。结果保存为 `obs-<mode>-dist-smoke-results.json`，包含实际提供的构建文件路径及字节数；截图为 `obs-dist-playing.png`。

summary 组在浏览器中导入真实 `createObsOutputState`，依次接收无特效字段的连击摘要和真实盲盒结果，将 `onEffect` 经独立 WebSocket 送入 BrowserOutput，验证只播放一次真实 VAP。结果保存为 `obs-summary-results.json`，截图为 `obs-summary-playing.png`。

Rust 资源代理集成测试在 `src-tauri` 目录执行，继承 `PLAYWRIGHT_MODULE` 和 `OBS_EFFECT_ASSET_DIR`：

```powershell
$env:OBS_BROWSER_CASE = 'smoke'
cargo test --lib obs_server::tests::chrome_browser_uses_real_gift_proxy -- --ignored --nocapture
```

将 `OBS_BROWSER_CASE` 设为 `transport`，Rust 测试会向正式入口传入 `--group=transport`，进一步验证 HEAD、Range/If-Range 和配置图片引用改写。transport 组需要该 Rust 测试提供 `OBS_RUST_PROXY_PORT`，不可将 Node 文件服务结果当作生产 Rust 代理通过。

结果 JSON 与截图写入仓库根目录下 `.superpowers/sdd/2026-11-01-style-common-behavior/evidence/obs-*`。原有证据保留。测试不启动桌面程序，不读取真实登录数据；独立 WebSocket 不代表 Tauri IPC 和宿主订阅已联调。

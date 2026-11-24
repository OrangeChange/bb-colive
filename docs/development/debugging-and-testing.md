# 调试与验收

## 原目录调试

日常调试使用当前仓库的 `npm run dev:detached`，不启动其他目录的 exe 代替。日志会记录源码根目录、版本与 Git 短提交号。源码更新后的 Vite 模块缓存和旧服务可能影响验证；重启须先确认是否可中断当前录档。

分离启动由 `scripts/start-dev-detached.vbs` 入口负责，隐藏控制台并脱离当前会话。不要直接运行内部 PowerShell 启动脚本。开发日志位于 `%LOCALAPPDATA%\BB CoLive\`，包含 dev、vite、vite-error、tauri 和 tauri-error 日志。

`npm run tauri dev` 仅用于需要前台观察输出的调试；直播采集中避免重复启动和源码 HMR。相同应用标识的不同构建可能共享用户数据，验证启动目录和版本不能仅靠设置看起来相同。 自定义主题位于各程序旁的 style 目录；切换运行目录前须核对原目录中的自定义主题，并连同私有素材携带。保留目标中已有主题及被快照引用的素材，不以干净发布包替换完整运行目录。

## 连接与请求约束

- `tauri-plugin-http` 保留 `unsafe-headers` feature，否则 `sec-fetch-*` 等请求头会被剥离，影响 B站连接。
- 请求头不主动发送 `accept-encoding`，避免当前请求链收到未解压的压缩内容。
- 连接由主程序管理；弹幕窗和收益窗消费统一事件，OBS 同房间共享连接，不同房间使用独立会话。
- Cookie、日志、签名私钥等敏感内容不进入仓库或源码分发包。

## 验证层次

- Node 测试：事件、协议、Repository、格式与组件契约，命令 `npm test`；运行前自动准备内置主题分发文件。
- TypeScript 与前端生产构建：`npm run build`。
- Rust 或原生功能：按受影响模块执行对应测试／构建；需要重链接时关闭原目录调试程序。
- 浏览器固定数据：验证真实组件交互，明确数据夹具与非原生边界。
- 原生桌面与真实直播：验证 WebView2、音频、双屏、切房与持续录档，不能由前四类代替。

运行检查前明确要检测的具体失败与处理方式。只改文档时检查链接、内容冲突及受影响的文档测试，不重编译 Rust 或重启软件。

删除、导入和 schema 验证用独立数据目录或固定 SQLite 副本，保留真实用户数据。按功能文档验收，不把历史测试数量写成当前重新通过。

## 右侧工作台

右侧功能工作台第一阶段已实现；收起为 64px 轨道，展开默认 400px。各主面板与正式队列始终挂载，切换不重置运行状态。宽度调整、原生几何补偿、共享底栏和视觉规则分别维护在 [DESIGN.md](../specifications/DESIGN.md)、[UX-CONTRACT.md](../specifications/UX-CONTRACT.md)，测试使用仓库内文档，不依赖旧研究目录。

## 公开源码中的检查

使用 Node.js 24，在仓库根目录执行 `npm ci` 和 `npm ci --prefix vendor/blivechat`。全量 Node 测试使用后者提供的 JSDOM，运行 `npm test` 时使用 `--experimental-transform-types`。

正式默认 CSS 以 `tests/fixtures/laplace-default-baseline.css` 为固定外观基线，不依赖本地旧提交。浏览器测试使用开发依赖中的 Playwright；脚本分别使用本机 Microsoft Edge 和 Google Chrome，运行对应脚本前需安装所用浏览器。可执行 `node tests/thirdPartyNotices.browser.mjs` 验证离线许可，或执行 `node tests/compatiblePublicFeatures.browser.mjs` 验证兼容渲染的公共交互。

旧程序、新旧截图和旧 Git 提交的对照工具属于本地历史验收，不进入公开源码。`.superpowers/` 是测试输出或本机验收资料目录，不是软件的运行资源。

测试数据位于tests/fixtures/compat，开发预览素材位于public/media。历史隔离对照、截图和旧版本测试数量保存在docs/local-history，不作为当前修改的验收结论。

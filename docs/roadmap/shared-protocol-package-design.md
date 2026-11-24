# B 站直播共享协议包设计

> 早期方案，保留原始版本和阶段状态。当前客户端恢复已接入 API v2、协议 0.1.3、恢复契约 0.3；现行行为见[云端记录恢复](../features/cloud-recovery.md)。本文的旧接口、未提交状态及工作树路径不作为当前操作说明。

> 日期：2026-10-05。
> 状态：提取边界已批准，待实施计划确认。
> 基线：客户端 0.3.5，提交 `145a8f0bc500b81a4d428e0f83877334ba630993`，档案 schema 8。

产品范围以 [BB EventFetcher 设计](event-fetcher-design.md)为准。本方案只定义客户端共享协议包提取，不实施云同步、档案结构升级或业务语义重构。

## 目标与边界

在客户端仓库 `packages/bilibili-live-protocol` 维护 `@bb/bilibili-live-protocol`，初始独立版本 `0.1.0`。桌面与 EventFetcher 使用同一协议产物。包不依赖 UI、Tauri、客户端状态或采集器私有代码。

继续使用 `@laplace.live/ws 8.0.4`，不复制或重写拆包、解压、join、心跳、超时与短时重连。当前锁文件中的传递依赖 `@laplace.live/internal` 为 `1.3.31`；产物接入时核对两端锁定结果，不夹带升级。

`DanmuConnection` 留在客户端，继续承担阶段编排、诊断、状态文案、直播证据、业务适配和头像补取。共享包不生成 `DanmakuEvent`，不决定金额、身份展示、连击、TTS、特效、场次质量或数据库身份。

## 文件范围

共享包包含：

- `src/index.ts`：公共导出。
- `src/http.ts`：传输接口、请求头规则、错误分类与现有有限重试。
- `src/api.ts`：连接及房间配置接口、原始响应类型。
- `src/wbi.ts`：现有 WBI 签名逻辑。
- `src/connection.ts`：KeepLiveWS 接入、地址选择、原始命令及连接事件。
- `src/commands.ts`：命令识别与解码结果。
- `src/proto.ts`：现有 protobuf descriptor 与 base64 转换。
- `src/indexes.ts`：原始字段直接证明的索引及其版本。
- `src/types.ts`：纯协议类型。
- 包元数据、独立 TypeScript 构建配置、README 和包级测试。

客户端新增 `src/protocol/httpTransport.ts` 绑定 Tauri HTTP。现有 `api.ts` 保留客户端调用入口及房间资料投影；`connection.ts` 接入共享连接能力，保留现有编排。`adapter.ts` 和 `laplaceCompatibility.ts` 使用共享 protobuf 定义；业务转换仍在原文件。

不整体迁移 `src/protocol/types.ts`。adapter 中现有 V2 解码辅助函数包含身份归属、默认值和展示转换，不能整体搬入纯解码层。二维码轮询、跨域 Cookie 收集与登录存储不在本次提取范围。

## 导出接口

公共接口包括 `createBilibiliApi(transport)`、`keyFromUrl(url)`、`encWbi(params, imgKey, subKey, ts)`、`openLiveConnection(params, callbacks)`、`decodeCommand(raw)` 和 `extractCommandIndexes(raw)`。同时导出现有 `InteractWordV2`、`SendGiftV2`、`GoldRankBroadcast`、`b64ToBytes` 与纯协议类型。

具体类型声明在实施计划中确定，遵循以下契约：

- HTTP 传输接受 URL、请求方法、请求头与可选 AbortSignal，返回状态码及 JSON 读取能力。桌面提供 Tauri 实现，服务器提供 Node 实现。
- 保留当前请求头规则，不主动发送 `accept-encoding`；Cookie 经请求上下文传入，不读取登录文件或写入日志。
- 保留网络、取消、业务错误区分和当前一次网络重试策略。
- 房间及礼物配置提供未经过产品投影的原始响应；客户端继续完成标题、封面、开播时间和大航海档位转换。
- 原始命令与解码结果分开。外层字段及 `data.pb` 原样保留，解码结果区分成功、未知和失败，失败不丢原文。
- 原始回调先于业务 adapter、Laplace 投影及异步资料请求。调用方在入口记录接收时间；采集器分配房间序号和数据库身份。
- 索引提取有独立版本；长整数、UID 和纳秒字段保留字符串。多结果礼物逐项返回 itemId。
- 不把 rnd、连击编号或互动组合一律视为全局唯一事件 ID，不增加内容哈希。
- 连接准备共享 API 原语与地址选择，不新增包办全部阶段的连接管理器，不改变客户端可选资料请求及预加载时序。

## 连接事件与原始记录

基线依赖默认协议版本为 3，入房成功立即心跳，收到心跳响应约 30 秒后发送下一次心跳，45 秒无心跳响应关闭，关闭后约 3 秒重连。

KeepLive 的底层错误实际另发 `e`，不是直接转发 `error`。共享接口按真实事件暴露；客户端接线与状态影响须通过受控测试确认，不默认为原有 error 监听已覆盖。

`msg` 是完成 JSON 解析和异步解压后的命令入口，不是网络字节入口。命令接收时间与序号按 msg 交付口径记录，不声称等于网络帧到达顺序。现有公开 `message` 事件可提供二进制观察入口，记录帧到达时间及必要失败证据；不新增拆包或解压实现。

## 构建与交付

采用 npm workspace 维护客户端共享源码，独立 TypeScript 编译为 ESM JavaScript 与类型声明，不新增 bundler。产物仅包含 dist、README、包元数据及必要许可文件。

依赖声明固定 `@laplace.live/ws: "8.0.4"`，其他直接依赖按实际锁定版本确定。保留浏览器条件解析，Node 使用依赖默认入口，不将 Node 解压模块打入浏览器。

使用 npm pack 准备未发布的固定版本 tgz；采集器经批准后从其仓库内固定产物安装并保存锁文件，不依赖相邻客户端目录。交付说明列包名、版本、完整来源提交、未提交变更状态、导出、构建命令及验证报告。采用 npm 原有完整性校验，不添加额外摘要机制。

本次不发布 registry、不创建 PR、不提交或推送，不变更仓库访问权限。凭证、实际直播数据、日志和本机 AGENTS.md 不进入产物。

## 实施顺序与验收

1. 提取 WBI、HTTP 原语和 protobuf 定义，保留连接编排。
2. 接入共享连接入口、原始信封和索引，保持业务 adapter 行为。
3. 构建产物，验证 Node 独立安装及客户端构建，准备交付报告。

实施计划须给出每阶段的确切文件、类型、测试步骤和失败后的处理，不以历史测试结果代替本次验证。

| 验证 | 具体失败 | 后续处理 |
| --- | --- | --- |
| 固定 HTTP/WBI 输入 | 请求头、签名、错误或重试变化 | 修正提取或传输接线 |
| 相同 JSON/protobuf 输入 | 字段丢失、长整数精度变化、缺失被补造 | 修正解码边界，保留业务断言 |
| 受控 WS 帧与时钟 | join、解压、心跳、超时、重连或停止变化 | 检查依赖入口和事件接线 |
| 未知命令、损坏 protobuf、头像延迟 | 原始记录丢失或被业务处理阻塞 | 修正原始回调位置 |
| Node 24 独立安装 | 打包遗漏、类型失败、Tauri 或浏览器耦合 | 修正产物与导出 |
| 客户端测试及生产构建 | 状态、金额、身份、连击、档案退化 | 修正客户端接线 |
| 本地原生连接 | WebView2 HTTP、切房、停止、重连异常 | 在本地修复受影响路径 |

相关既有测试覆盖 protocolApi、protocolAdapter、connectionState、connectionIntegration、connectionRuntime、connectionDiagnostics、laplaceCompatibility、guardAvatar、giftMerge、sendGiftV2BlindBox、autoDanmakuDisplay、phoneVerificationDisplay、lotteryWinners、redPocketAdapter。源码文本断言随职责位置更新，行为断言保留；模拟 KeepLiveWS 测试不能替代真实依赖受控测试。

## 已知限制

- JSON 或底层解压失败可能不产生 msg；现有接口不保证把每个失败精确关联到命令。
- 现有业务 adapter 的本地时间兜底保持原样；历史重放时间策略另属客户端同步接入，不在本次重构。
- 真实保存样本仅在获准测试环境使用，不上传 Git；合成样本不能证明全部线上字段覆盖。
- 真实双端直播对照须等待采集器具备登录和采集能力，在获准部署环境完成；本方案不代表采集完整性验收通过。

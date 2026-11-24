# 共享协议包实施计划

> 早期方案，保留原始版本和阶段状态。当前客户端恢复已接入 API v2、协议 0.1.3、恢复契约 0.3；现行行为见[云端记录恢复](../features/cloud-recovery.md)。本文的旧接口、未提交状态及工作树路径不作为当前操作说明。

> 日期：2026-10-06。状态：待批准，尚未实施。

**目标：** 提取 `@bb/bilibili-live-protocol 0.1.0`，使客户端与采集器复用纯协议能力而不改变客户端业务语义。

**架构：** npm workspace 内维护独立 ESM 包，以注入的 HTTP 传输调用接口，以 `@laplace.live/ws 8.0.4` 管理底层连接。客户端保留编排、业务 adapter、资料投影和诊断，采集器安装固定 tgz。

**技术栈：** TypeScript 5.8.3、Node 24、npm、protobufjs 8.7.2、js-md5 0.9.2、现有 Vite 测试环境。

**设计：** [共享协议包设计](shared-protocol-package-design.md)。按任务顺序在当前会话执行，每项先加测试、确认对应失败，再实现并验证。

## 全局约束

- 客户端参考基线为 0.3.5 / `145a8f0bc500b81a4d428e0f83877334ba630993` / schema 8；执行开始前检查 HEAD 和相关工作区变更，有重叠先协调。
- 不复制、重写或升级底层协议；锁定 `@laplace.live/ws 8.0.4`，核对 internal 1.3.31。客户端不依赖 EventFetcher 私有仓库。
- 无 UI、Tauri、客户端状态、存储依赖；不修改金额、身份、连击、事件时间兜底和历史重放语义。
- 不提交、推送、发布、创建 PR、发送产物或修改权限。实际直播数据、凭证、日志、本机 AGENTS.md 不进入包。
- 保留既有设计文档修改与发布产物；不删除文件或重启正在采集的客户端。

## 重点输入

- 一个 SEND_GIFT_V2 含多个结果：维持顺序，逐项提供真实 itemId。
- protobuf 缺失字段和超长整数：保留缺失与精度，不用默认值补造索引。
- 断开后异步 HTTP、头像结果到达：不复活旧连接或改变原始命令顺序。
- 未知命令和损坏 protobuf：仍交付原始命令，区别未知与解码失败。
- 重连、手动停止和底层 e 事件：使用依赖实际生命周期，不增加第二套重连定时器。

## 公共接口

以下类型属于包，不引用客户端类型。接收端在回调开始处记录时间与数据库序号。

```ts
export interface HttpResponse {
  status: number;
  json(): Promise<unknown>;
}
export interface HttpTransport {
  request(url: string, options: {
    method?: 'GET' | 'POST';
    headers: Record<string, string>;
    signal?: AbortSignal;
  }): Promise<HttpResponse>;
}
export interface RequestContext {
  cookie?: string;
  signal?: AbortSignal;
}
export interface RawCommandEnvelope {
  raw: unknown;
  command?: string;
}
export type CommandDecodeResult =
  | { status: 'decoded'; command: string; raw: unknown; decoded: unknown }
  | { status: 'unknown'; command?: string; raw: unknown }
  | { status: 'failed'; command?: string; raw: unknown; error: Error };
export interface CommandIndexes {
  version: 1;
  command?: string;
  uid?: string;
  eventId?: string;
  giftItems?: Array<{ index: number; itemId?: string }>;
}
export interface LiveConnectionParams {
  roomId: number;
  uid: number;
  key: string;
  address: string;
  buvid?: string;
  createWebSocket?: (address: string) => WebSocket;
}
export interface LiveConnectionCallbacks {
  onRawCommand(envelope: RawCommandEnvelope): void;
  onFrame?(bytes: Uint8Array): void;
  onLifecycle?(event: 'open' | 'live' | 'close' | 'e' | 'timeout'): void;
  onHeartbeat?(online: number): void;
}
```

`openLiveConnection` 返回依赖 KeepLiveWS 实例，避免为了客户端原生诊断再造连接包装层。它负责接线，不进行业务解析。`decodeCommand` 单独调用，不阻塞原始回调。JSON 已由依赖解析，已知 JSON 命令返回原对象；V2/V3 只解码现有 descriptor 覆盖的 pb，未知命令原样返回。保留完整 cmd，识别时按冒号分段，不用 includes。

`createBilibiliApi(transport)` 返回 `biliGet<T>(url, context?)`、`getNav(cookie)`、`getRealRoomId(input, context?)`、`getDanmuInfo(roomId, cookie, imgKey, subKey)`、`getFinger()`、`getRoomInfo(roomId, context?)`、`getMasterInfo(uid, context?)`、`getGiftConfig(roomId, context?)`、`getGiftEffectConfig(roomId, context?)`。返回类型从现有 api.ts 的原始接口类型提取，getRoomInfo 和 getMasterInfo 不附产品投影。

`keyFromUrl`、`encWbi`、错误类与分类/重试函数保持既有签名。索引 eventId 初始只覆盖 SC 的真实 id；礼物 itemId 逐项返回，不把天选/红包活动 ID、rnd 或连击 ID作为通用事件 ID。其余索引缺失，不妨碍原始采集。

## 任务一：纯 HTTP、WBI 与 protobuf

**新建：** packages/bilibili-live-protocol/package.json、tsconfig.json、src/index.ts、http.ts、api.ts、wbi.ts、proto.ts、types.ts；src/protocol/httpTransport.ts；包级 tests/http.test.mjs、wbi.test.mjs、proto.test.mjs。

**修改：** 根 package.json、package-lock.json、src/protocol/api.ts、proto.ts；tests/protocolApi.test.mjs、protocolAdapter.test.mjs 中与定义位置有关的源码断言。

**产出：** 公共 HTTP API、现有 protobuf 类型和 WBI；旧客户端 api/proto 入口继续可用，且不保留第二份实现。

- [ ] 将当前 encWbi 的固定输入输出写入 wbi.test.mjs，检查排序、过滤字符、编码和传入秒时间；输出由当前实现取得，不依赖网络。
- [ ] 编写注入传输测试：Cookie/请求头、无 accept-encoding、AbortSignal、业务失败不重试、网络仅重试一次；先执行测试，预期新包入口未建立而失败。
- [ ] 原样移动 WBI、错误/重试实现及 descriptor；将 biliGet 的 fetch 替换为传入 request，保留原有错误边界与文案。api.ts 的房间档位/标题/封面投影仍在客户端执行。
- [ ] Tauri 传输仅适配 request，登录二维码及跨域 fetch 继续在客户端。通过旧 api.ts 导出同一错误类，保证 instanceof 不分裂。
- [ ] 根设置 workspace；新包使用 tsc NodeNext、declaration、rootDir src、outDir dist，源码相对导入写 .js，客户端仅通过包入口消费。固定 ws/protobufjs/js-md5 版本，不新增 bundler。
- [ ] 构建包，再执行包测试及既有 protocolApi/protocolAdapter 测试。失败定位签名、请求投影、错误身份或 protobuf 字段，不削弱行为断言。

包测试示例：

```js
const calls = [];
const api = createBilibiliApi({ request: async (url, options) => {
  calls.push({ url, options });
  return { status: 200, json: async () => ({ code: 0, data: { isLogin: true } }) };
}});
await api.getNav('test-cookie');
assert.equal(calls[0].options.headers.Cookie, 'test-cookie');
assert.equal(calls[0].options.headers['accept-encoding'], undefined);
```

## 任务二：命令解码与证据索引

**新建：** 包 src/commands.ts、indexes.ts；tests/commands.test.mjs、indexes.test.mjs。

**修改：** 包 index.ts；客户端 adapter.ts、laplaceCompatibility.ts 仅在确需替换解码入口时调整调用，身份与字段投影保留原函数。

**消费：** 任务一的 descriptor。**产出：** decodeCommand(raw)、extractCommandIndexes(raw) 及索引版本 1。

- [ ] 测试未知命令、带冒号 DANMU_MSG、RECALL_DANMU_MSG、不含 pb、损坏 pb、三个现有 protobuf 类型、未知 JSON 字段、纳秒和长 UID。
- [ ] 从现有 adapter 和 Laplace 解析路径确定原始类型解码，不迁移 medalFromPayload、wireToModelGuard、金额/default/cache 等业务转换。
- [ ] 编写多礼物索引测试；缺失 itemId 保留缺失，SC 仅在真实 id 存在时返回 eventId；无标识返回空索引，不生成随机身份或内容哈希。
- [ ] 运行包测试，再跑礼物、身份、自动弹幕、手机号验证、中奖名单、红包及 Laplace 既有测试；业务输出应与基线相同。

```js
const raw = { cmd: 'FUTURE_COMMAND', data: { untouched: true } };
const result = decodeCommand(raw);
assert.equal(result.status, 'unknown');
assert.equal(result.raw, raw);
const failed = decodeCommand({ cmd: 'SEND_GIFT_V2', data: { pb: '////' } });
assert.equal(failed.status, 'failed');
assert.equal(failed.raw.data.pb, '////');
```

## 任务三：连接接线与客户端接入

**新建：** 包 src/connection.ts、tests/connection.test.mjs；客户端 tests/sharedProtocolConnection.test.mjs。

**修改：** 包 index.ts；src/protocol/connection.ts；tests/connectionIntegration.test.mjs、connectionDiagnostics.test.mjs、connectionRuntime.test.mjs 的接线夹具及职责位置断言。

**消费：** 任务一 API、LiveConnectionParams。**产出：** openLiveConnection(params, callbacks)、selectWebsocketAddress(hostList)。地址选择仍使用第一个 host 和现有默认地址，不增加主机轮询。

- [ ] 使用依赖公开 createWebSocket 注入 EventTarget 假 socket，记录 send，提供 open/message/close/error 事件。测试使用合成欢迎包、JSON 包、zlib/Brotli 包；帧构造只在测试中，不进入包源码。
- [ ] 基线测试直接运行 8.0.4，随后同样输入运行 openLiveConnection，比较发送字节、命令顺序和生命周期。受控 Node 时钟检查立即心跳、30 秒、45 秒、3 秒和 close 后不重连。
- [ ] openLiveConnection 只创建 KeepLiveWS 并监听 msg/message/open/live/close/e/timeout/heartbeat；不新增定时器，不做解码。frame 与 msg 顺序按实际触发记录，不声称跨异步解压保持网络顺序。
- [ ] 客户端将原 msg 回调原样接入 onRawCommand；保留诊断先于 adapter 的顺序、异步 GuardBuy 头像补取、代次保护、可选资料预加载、重连状态查询及证据修订保护。
- [ ] e 映射到现有连接错误处理路径，同时用测试固定 close/e 连续到达及迟到 room_init 不覆盖新 LIVE/PREPARING 的行为。显式停止依旧 close，不引入服务器长期监督器。
- [ ] 测试头像请求挂起时下一原始命令立即交付，资料失败不丢原文，断开后的头像结果不发布；再执行全部连接相关既有测试。

## 任务四：产物与双环境验证

**新建：** 包 README.md；docs/roadmap/shared-protocol-package-verification.md 记录实际结果。

**修改：** 根 package.json 的 build/test 前置包构建；docs/architecture.md 共享边界；.gitignore 仅增加包 dist 和本地 tgz 输出目录规则。

- [ ] README 写实际导出、HTTP 注入、接收时间口径、e 事件、安装/构建/打包命令及许可说明；不把未验证能力写成已支持。
- [ ] 执行 `npm run build --workspace @bb/bilibili-live-protocol`、`npm test --workspace @bb/bilibili-live-protocol`、`npm test`、`npm run build`。失败分别定位包类型、协议测试、客户端回归或浏览器条件解析。
- [ ] 执行 `npm pack --workspace @bb/bilibili-live-protocol --dry-run --json`，检查只含允许文件。它检测秘密/本机文件或源码缓存误入产物；出现时收窄 files 后重跑。
- [ ] 执行 npm pack 生成本地 tgz，不上传。在独立临时目录创建 Node 24 测试项目，从该 tgz 安装；临时项目无客户端源码，保留 npm 校验和 TLS。
- [ ] 独立导入全部公开接口；用注入假 HTTP/WS 跑包 smoke test，并用消费者 TypeScript 编译类型声明，固定 ws 与 internal 版本一致。不可用网络导致安装失败时记录限制，不关闭校验。
- [ ] 本地原生检查 HTTP、切房、短时重连、手动停止、现场与档案事件；先确认不会中断用户录档，不自动重启现有实例。无法执行则报告未验收。
- [ ] 报告包名/版本、基线与实际来源状态、产物路径、测试数量/结果、原生未执行项及采集器接入条件。不发送消息或发布产物；交付待用户确认。

## 执行与完成条件

建议在当前会话逐项实施，任务一完成后进入任务二，任务三通过再打包。保持同一份客户端业务逻辑，减少接口跨阶段偏差。

完成必须同时有客户端自动测试、生产构建、固定产物独立导入及类型验证证据。原生与真实直播结果独立报告。没有真实部署、登录和双端连接，不宣称完整采集验收通过。

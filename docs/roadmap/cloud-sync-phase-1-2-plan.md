# 云端同步第 1、2 阶段实施计划

> 早期方案，保留原始版本和阶段状态。当前客户端恢复已接入 API v2、协议 0.1.3、恢复契约 0.3；现行行为见[云端记录恢复](../features/cloud-recovery.md)。本文的旧接口与阶段范围不作为当前操作说明。

阶段范围与当前完成情况以现行功能文档和[项目状态](../project-status.md)为准。

**目标：**提供安全服务器绑定和可恢复的 SQLite 同步基础，不启动正式历史导入。

**架构：**共享协议沿用 0.1.3。云端请求及系统凭证由 Rust 管理；来源和进度与现有档案共用 SQLite。专用提交事务核对旧游标、协调序号并原子保存输出、上下文及新游标。

**技术：**TypeScript、Node 原生测试和 SQLite、Tauri 2、Rust、reqwest 0.12、sqlx 0.8.6、Windows Credential Manager。

**设计：**[cloud-sync-phase-1-2-design.md](cloud-sync-phase-1-2-design.md)。

## 全局约束

- 产品版本仍为 0.3.5，数据库迁移目标为 schema 9。
- 固定共享协议 0.1.3 / 维护核心 8.0.4-bb.2。
- API 主版本 1；已验证协议支持范围首版为 0.1.3。
- 不提交、推送、发布；不删除既有文件或覆盖其他修改。
- 不接入正式历史解析、同步调度或设置界面。
- 不读取真实凭证或直播原文。测试使用合成数据及临时数据库。
- 解析上下文与对应游标原子提交；区间读完后才推进事件进度；本地删除不自动恢复。

## 代码与文档

实现与共享协议在同一项目中维护，设计和计划见 `docs/roadmap`，当前构建与交付方式见[构建与发布](../development/build-and-release.md)。

## 验证关注点

| 场景 | 所属任务 | 要求 |
| --- | --- | --- |
| 新绑定凭证写入成功但配置保存失败 | 2 | 旧绑定仍有效，新凭证清理失败可见 |
| 同步返回的服务器身份改变 | 2、4 | 不写入原来源，不继承原游标 |
| 第一条载荷超过 8 MiB | 2 | 不按预算硬上限拒绝可用页面 |
| 提交成功而调用方未收到结果 | 4 | 以持久化进度和来源唯一键恢复 |
| 删除已有输出后重解析同一来源 | 5 | 不重新插入被删除事件 |

## 任务 1：共享协议基线

**文件：**工作区已有 `package.json`、`package-lock.json`、`packages/bilibili-live-protocol`、`vendor`、`src/protocol/api.ts`、`connection.ts`、`proto.ts`、`httpTransport.ts`；不重新实现共享协议。

**输入：**既有未提交 0.1.3 接入及 welcome 修复。

**输出：**可以供后续同步基础依赖的客户端协议基线，业务 adapter 不变。

- [ ] 保存工作区现有修改路径，核对依赖安装和包版本，不输出真实配置。
- [ ] 运行 `npm test --workspace @bb/bilibili-live-protocol`，预期全部通过。
- [ ] 运行 `node --experimental-transform-types --test tests/sharedProtocolConnection.test.mjs tests/connectionIntegration.test.mjs tests/protocolAdapter.test.mjs tests/liveArchiveRouting.test.mjs`，预期全部通过。失败时先定位既有基线问题，不把失败当成本轮引入。
- [ ] 运行 `npm run build`，预期退出码 0；记录现有构建提示。

## 任务 2：服务器绑定与原生请求

**文件：**新增设计指定的 `src/cloudSync/cloudSyncTypes.ts`、`cloudBinding.ts`、`cloudSyncApi.ts`、`src-tauri/src/cloud_sync.rs`、`cloud_credentials.rs`、`tests/cloudBinding.test.mjs`；修改 Cargo 特性和 lib 命令注册。

**接口：**

```typescript
type CloudBinding = {
  bindingId: string; baseUrl: string; serverId: string; credentialRef: string;
  serviceVersion: string; apiVersion: number; protocolVersion: string;
  retention: { days: number; confirmed: boolean }; verifiedAt: string;
};
type BindingStatus = 'unbound' | 'ready' | 'credential-required' | 'identity-changed';
// 原生命令：bind_cloud_server(baseUrl, token)、get_cloud_binding()、
// unbind_cloud_server()、request_cloud_api(request)。
// 请求类型仅允许 info、roomEvents、roomSyncState、roomChanges、resource。
// 后续请求不接收 token；令牌由 Rust 从系统凭证读取。
```

**实现边界：**绑定生命周期在 Rust 内完成，TypeScript 调用不长期持有令牌。非秘密配置先以专用配置文件保存，任务 3 将其迁入 cloud_binding；配置存储采用可替换接口，以真实文件及临时 SQLite 分别测试，不开放任意路径命令。

- [ ] 先写 Rust URL/协议验证及绑定生命周期测试，写 TS 请求输入测试。关键断言形状：

```typescript
assert.equal(normalizeCloudBaseUrl('https://example.test/'), 'https://example.test');
assert.throws(() => normalizeCloudBaseUrl('http://example.test'));
assert.equal(normalizeCloudBaseUrl('http://127.0.0.1:8080'), 'http://127.0.0.1:8080');
```

- [ ] 运行 `node --experimental-transform-types --test tests/cloudBinding.test.mjs` 和 `cargo test --manifest-path src-tauri/Cargo.toml cloud_sync`，观察功能缺失的失败。
- [ ] 实现地址规范化、API/协议校验、系统凭证、配置切换及身份核验。明确拒绝 URL 内凭证、查询和片段；保留部署路径前缀。reqwest 设置 redirect Policy::none，错误不包含令牌或响应原文。
- [ ] 用本机合成 HTTP 服务验证鉴权、401、503、重定向和大页面；测试服务绑定回环，不请求真实 B 站。
- [ ] 覆盖替换失败、读取失败、解除绑定删除失败、重启恢复。系统凭证测试使用独立合成条目；测试条目的创建和移除须用户确认后执行，其余测试使用凭证边界替身。
- [ ] 运行两项测试命令及 `npm test`、`npm run build`、`cargo test --manifest-path src-tauri/Cargo.toml`。任何未验证的原生行为记录为阶段边界。
- [ ] 报告第 1 阶段实现、测试结果及剩余边界。

## 任务 3：schema 9 与持久化模型

**文件：**修改 `src/archive/archiveSchema.ts`、`archiveTransfer.ts`；新增 `src/cloudSync/cloudSyncRepository.ts`、`cloudSyncCursor.ts`、`tests/cloudSyncMigration.test.mjs`、`tests/cloudSyncCursor.test.mjs`。Rust 绑定配置切换至 cloud_binding，沿用同一生命周期接口。

**接口：**

```typescript
type CloudRoomProgress = {
  serverId: string; roomId: string; eventCursor: string; metadataCursor: string;
  parserVersion: string | null; contextJson: string | null;
};
function compareCloudCursor(a: string, b: string): -1 | 0 | 1;
// cloudSyncRepository 读取绑定、房间进度、来源状态，不提供独立推进游标方法。
```

- [ ] 写真实 Node SQLite 测试，断言 schema 8 迁移保持原数据、新建来源模型、失败回滚、高版本拒绝及旧档案包支持。
- [ ] 游标测试先覆盖：

```typescript
assert.equal(compareCloudCursor('9007199254740992', '9007199254740993'), -1);
assert.equal(compareCloudCursor('10', '9'), 1);
assert.throws(() => compareCloudCursor('01', '1'));
```

- [ ] 运行两个新测试文件，观察迁移/比较缺失的失败。
- [ ] 实现规范十进制校验及六张表，精确上限为 9223372036854775807；房间号不接受 0。
- [ ] schema 8→9 在同一事务完成，新库直接创建 schema 9；旧库既有迁移到 8 后再执行新事务。高版本检查在任何写入前执行。
- [ ] cloud_source_output 的 event_key 可空，删除标记保留；本地事件外键采用 SET NULL，不级联删除来源收据。
- [ ] 显式保留档案包 schema 4—9 支持，导出不携带云端配置/游标。
- [ ] 重跑新测试和档案迁移、导入导出回归；预期全部通过。

## 任务 4：来源、输出、上下文及游标提交

**文件：**新增 `src/cloudSync/cloudSyncCommit.ts`、`src-tauri/src/cloud_sync_database.rs`；修改 `archive_database.rs`、`archiveWriter.ts`、`archiveRepository.ts`、`archiveRuntime.ts`、lib 注册；新增 `tests/cloudSyncCommit.test.mjs`。

**接口：**

```typescript
type CloudPageBoundary = {
  serverId: string; roomId: string; expectedCursor: string; nextCursor: string;
  metadataRevision: string; scanAfter: string; scanThrough: string;
  rangesComplete: boolean;
};
// commit_cloud_event_page：边界、来源记录、已解析输出、区间、解析版本和上下文。
// commit_cloud_metadata_page：来源身份、预期修订、新修订、元数据记录。
// 输出记录复用现有档案写入字段，不能传入任意 SQL；没有实际解析器或调度器。
```

- [ ] Rust 临时 SQLite 测试先断言零/多输出、重复提交、旧游标冲突、不同来源拒绝，以及输出与上下文和游标同事务回滚。
- [ ] TS 测试断言 rangesComplete=false 拒绝提交、scanAfter 与请求起点一致、元数据修订及扫描边界变化要求重新组批。
- [ ] 运行新测试和 `cargo test --manifest-path src-tauri/Cargo.toml cloud_sync_database`，观察提交能力缺失的失败。
- [ ] 实现窄提交命令，持有既有写连接锁，在事务内读取预期游标、分配序号并写入各表；不使用提交后 rowsAffected 判断旧游标冲突。
- [ ] 序号在写事务内分配，现场归档统一通过既有 writer 排他协调，现场待写批次先排空；网络和解析不占写锁。
- [ ] 事件/元数据分别提交，成功才通知档案刷新，不调用实时连接 store 或事件分发。
- [ ] 覆盖来源、输出、上下文、游标更新分别失败，退出后重开数据库、提交响应丢失后重复请求，以及大整数身份保存。
- [ ] 重跑新测试及既有 archiveWriter/archiveRepository 回归，预期全部通过。

## 任务 5：删除收据与兼容回归

**文件：**修改 `archiveRepository.ts` 既有删除事务；扩展 `tests/cloudSyncCommit.test.mjs`、`tests/archiveRepository.test.mjs`、`tests/archiveTransfer.test.mjs`。

**接口：**本地删除先标记 cloud_source_output.deleted_locally，再删除本地事件；来源收据及房间进度不变。提交命令看见删除标记后不重新插入该输出。

- [ ] 先写真实 SQLite 用例：提交来源输出，删除所属场次，再提交同一来源；事件数保持 0，来源和进度保留。
- [ ] 运行对应测试，观察删除标记能力缺失的失败。
- [ ] 将标记和现有删除放在同一事务，覆盖删除场次及其他实际存在的事件删除入口，不增加重置或恢复 UI。
- [ ] 验证解绑重绑同一 server_id 读取旧进度；新 server_id 独立进度为 0。
- [ ] 验证 schema 4—8 普通档案包仍可导入，但不创建云端绑定身份。
- [ ] 重跑删除、导入导出及同步提交测试，预期全部通过。

## 任务 6：第 2 阶段整体验收

**文件：**新增 `docs/roadmap/cloud-sync-phase-1-2-verification.md`；更新本计划任务完成状态。

- [ ] 运行 `npm test`，检测档案、适配器与实时分发回归；失败时修复本轮问题，既有问题按名称报告。
- [ ] 运行 `npm run build`，检测 TypeScript 和打包集成失败。
- [ ] 运行 `cargo test --manifest-path src-tauri/Cargo.toml`，检测原生请求、事务及既有 Rust 回归；失败不宣称原生验收通过。
- [ ] 检查本轮差异的实际调用链：没有注册正式同步调度、没有向实时 store 投递历史输出，导出与日志无凭证字段。
- [ ] 记录测试命令、通过/失败数量、未执行的系统凭证与桌面行为。不用既有验证报告代替本轮结果。
- [ ] 报告第 2 阶段结果、最终代码工作区及后续第 3—6 阶段边界，不提交、不发布、不归并主目录。

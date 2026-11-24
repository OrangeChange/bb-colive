# 直播弹幕协议：命令版本（V1/V2/V3）分发规律

> 本文是协议研究与历史样本记录。文中 `conn-*` 路径来自旧版抓包，仅用于证据定位；当前运行时的完整协议命令由 `source-*` 诊断流保存，当前实现边界以 `docs/current-state.md`（本地历史记录） 为准。

> 记录对各命令族 cmd 后缀版本的分发规则与 adapter 覆盖情况，避免漏事件。
> 数据来源：真机抓包（80397 阿梓、21696950 阿萨Aza、22886883 星瞳）+ 本地参考仓库
> （`danmu_tool/reference/jlivertool-repo`、`bili-live-hime` 等）+ 社区文档
> （sjh8130/bili_danmaku Testing.md、pskdje/bilibili-API-collect 备份快照）。
> 注意 bilibili-API-collect issue#1332 现已 410 Gone、原仓库已 deprecated 内容清空；
> 备份仓库 pskdje/bilibili-API-collect（master 分支为原仓库 2026-01-25 快照）恢复了
> `docs/live/message_stream.md`（92 条命令字段文档，已存 `danmu_tool/message_stream_backup.md`），
> 但 **issue 讨论内容（V2/V3 pb 字段逆向成果）不随 git 仓库备份**，V2/V3 缺口仍需自行逆向。
> 相关：`effect-gift-events-analysis.md`（特效礼物）、`gift-price-fields-analysis.md`（V2 礼物金额）、
> `guard-events-analysis.md`（大航海动作字段）、`danmu_tool/pk-events-analysis.md`（PK 族）。

## 一、先区分两个独立的「版本」维度

这是理解整个问题的关键，社区资料与本地代码都印证存在两个互不相关的层次：

| 维度 | 位置 | 取值 | 谁决定 |
|---|---|---|---|
| **传输层 protover** | WS 包头 `protocol_version` | 0=JSON / 1=心跳 / 2=zlib / 3=brotli | **客户端请求**的压缩格式（所有仓库认证发 3=brotli） |
| **命令层 cmd 后缀** | 解压后 JSON 里的 `cmd` 字符串 | `_V2` / `_V3` 后缀 | **服务端单方面下发**，客户端无法请求 |

本文讨论的「V1/V2/V3」一律指**命令层**。解压后的 JSON 里 `cmd` 字符串决定事件格式，
与 WS 包压缩格式无关。proto 文件里的 package 名（如 `bilibili.live.gift.v1`）都是 `.v1`，
cmd 后缀的 V2/V3 是**命令标识代际**，不代表 proto package 版本。

## 二、分发规律（区分「有证据」与「推测」）

### 有证据（多源印证：jlivertool-repo 代码 + sjh8130 Testing.md）

1. **客户端被动接收、无法协商**。没有任何参考仓库里存在「按房间/分区/灰度选 V1/V2」
   的逻辑——客户端只按 `cmd` 字符串分派（jlivertool-repo `main.rs` 1439-1455 行）。
   **同一房间同一事件只来一个版本**。

2. **SEND_GIFT_V2 在 sjh8130 Testing.md 标注「送礼物(LPL)」**——最初为 LPL/电竞场景引入的
   protobuf 礼物格式，后扩大灰度到更多房间（阿梓 80397 即下发 V2）。**无服务端分发规则的
   权威文档**：Testing.md 只记字段不记分发条件，issue#1332 已失效。

3. **「旧版」标注 ≠ 服务端已停发**。GUARD_BUY 在 Testing.md 标 ⏲⚠「大航海购买(旧)」，
   但真机实测它与 USER_TOAST_MSG、USER_TOAST_MSG_V2 **同源并发**（三房间均 1:1:1）。
   文档的「已移除/旧版」只反映设计意图，不反映服务端实际行为。

4. **LIKE_INFO 族仅有 V3**（CLICK/UPDATE/NOTICE 三子命令，均为 JSON 格式非 protobuf）。
   若只监听无后缀的 `LIKE_INFO` 会漏掉所有点赞事件。

### 推测（基于上述线索的合理推断，证据中等）

**为何只有 SEND_GIFT 按房间区分 V1/V2、其它族不区分**：Testing.md 命令表里
SEND_GIFT 与 SEND_GIFT_V2 **都标 ✅（活跃，非替代关系）**，是唯一一个 V1/V2 并行、
未完成全量切换的族；而 INTERACT_WORD（⏲⚠→V2 ✅）、GUARD_BUY（⏲⚠→USER_TOAST_MSG_V2 ✅）
都是全量替代，故在所有房间统一版本。推测 SEND_GIFT 采用了按房间/分区灰度部署，
但**具体灰度规则无文档**，无法预测某房间会收到哪个版本——只能两路都备。

## 三、各命令族 adapter 覆盖对照

下表「文档已知版本」来自 sjh8130 Testing.md 命令表，「我们 adapter」来自
`src/protocol/adapter.ts` 实际 case 分支。

| 命令族 | 文档已知版本 | 我们 adapter | 评估 |
|---|---|---|---|
| SEND_GIFT | V1(JSON) / V2(pb) | ✅ 都有（V2 schema 已确认 field 2=uname string、field 7 当前作总价候选；金额语义待验证，见 `gift-price-fields-analysis.md`） | 结构 OK；V2 金额字段仍待折扣/批量样本确认 |
| DANMU_MSG | V1 | ✅ V1（两房均 V1，未见 V2） | OK |
| INTERACT_WORD | V1 / V2(pb) | ✅ 都有 | OK，V2 真机 21696950 验证 |
| ONLINE_RANK | COUNT / V2 / V3(pb) | COUNT 进入现有统计；V3 由 `laplaceCompatibility.ts` 输出 Laplace 状态更新；V2 仍忽略 | V3 兼容输出已接入，仍不进入普通事件时间线 |
| LIKE_INFO | 仅 V3（CLICK/UPDATE/NOTICE） | ✅ CLICK/UPDATE；NOTICE 未处理 | **暂不加**，见下方待办 |
| USER_TOAST / GUARD | V1 + V2 同源并发 | ✅ 三命令同源处理（GUARD_BUY/USER_TOAST_MSG 返 null，V2 渲染） | OK |
| POPULARITY_RED_POCKET | V1 / V2 | ✅ 都有（START/WINNER 顶层 id 用 lot_id 去重 V1/V2 配对，2026-08-30 修） | OK，见下方配对规律 |
| ROOM_REAL_TIME_MESSAGE | V1 / V2 | ✅ 都有 | OK |
| WATCHED_CHANGE | V1 | ✅ V1 | OK |

### 荣耀等级与徽章

- `INTERACT_WORD_V2.uinfo.wealth` 的字段 1 是等级、字段 2 是 `dm_icon_key`；`DANMU_MSG.info[16][0]` 是弹幕携带的荣耀等级，`info[0][15].user.wealth` 若存在也按同一结构读取。弹幕 `extra.icon.prefix.resource` 可提供 `ChronosWealth_*.png` 资源键，但 `info[4][0]` 是另一种用户等级，不用来推断荣耀等级。2026-09-24 检查的四份本机原始源日志中，16,594/16,935 条弹幕带有正数 `info[16][0]`；其中 3,075 个同房间、同 UID 样本可与进场等级交叉核对，3,068 个等级相同。
- `ENTRY_EFFECT.wealthy_info` 提供等级/图标键，`wealth_style_info.url` 提供官方徽章图片地址。适配器仍过滤该进场特效事件，但在本连接内按 UID 缓存资料并补入后续事件；同等级的官方图片地址也用于已知等级的用户。缺少源等级时不臆造，早于首次捕获的事件也不会追溯补写。
- 事件 UI 默认不显示；开启“事件显示 → 显示荣耀等级”后，优先显示官方徽章图，图片地址不可用时显示数字。新档案事件的用户 payload 保存等级、资源键和图片 URL；旧记录缺少字段时不能从归一化数据恢复。

### DANMU_MSG 的结构化 @ 回复

- 发送者来自 `info[2][0]/[1]`，适配为 `event.user`；正文来自 `info[1]`。
- `info[0][15].extra` 是 JSON 字符串。带结构化 reply 时，里面可能包含
  `reply_mid`、`reply_uname`、`reply_uinfo.uid`、`reply_uinfo.base.name` 和
  `reply_uinfo.base.face`，这些字段用于识别被 @ 的用户。
- `reply_type_enum` 不能单独作为判断条件：真机样本中存在 `reply_type_enum=0` 但同时带有完整
  `reply_uinfo` 的消息。
- 普通正文里的 `@用户名` 可能没有 reply 元数据；例如日志中的
  `conn-22625027-20260912-115650.ndjson:39561` 只有文本
  `@然然等下过来刷下声骸`，不能据此生成目标用户。
- 适配器把有效目标用户暴露为 `DanmakuEvent.replyTo`。事件行仅在存在结构化目标且当前区域支持用户筛选时，
  将与目标用户名完全匹配的 `@用户名`显示为筛选链接；没有结构化目标的普通 `@`仍按文本显示。
- 证据样本：`conn-80397-20260913-065134.ndjson:262` 与 `:274` 均含
  `reply_uinfo`；前者的 `reply_type_enum=0`，后者的 `reply_type_enum=1`。

### 红包族 V1/V2 配对规律（22625027 真机 2026-08-29 实测，两场会话）

- **START**：V1 与 V2 **同 lot_id 异时到达**--V1 在红包发起时、V2 在快开奖时
  （实测间隔 200~550 秒）。两者 start_time 不同（V1=发起时刻，V2=送达时刻）。
  去重键用 lot_id（`pocket-start:{lot_id}`），渲染保留先到的 V1（发起视角）。
- **WINNER_LIST**：V1 与 V2 **同 lot_id 同秒到达**（真重复），去重键
  `pocket-win:{lot_id}`，46 个红包实测 100% 配对成功。
- **NEW（投喂）**：V1 与 V2 成对到达且整对被服务器重推（4 条报文 = 1 次投喂），
  去重键 `pocket:{lot_id}:{uid}:{current_time}`。
- **天选（ANCHOR_LOT 族）无 V1/V2 配对**：每个事件只发一次，无重复问题
  （勿与红包族混淆，勿加去重前缀）。

### 事件行渲染记录（2026-09-05）

- 天选中奖行在用户名与“获得”之间使用显式间距；单人和多人中奖都遵循同一排版，避免
  单人结果因 JSX 文本节点合并而贴在用户名后面。
- 该调整只影响现场事件行的可读性，不改变天选事件的原始字段、去重或中奖人数统计。

### 预言玩法命令（2026-09-05 真机捕获）

- `INTERACTIVE_USER`：预言玩法状态与倒计时心跳，样本包含 `count_down_time`、
  `prophet_status`、`prophet_user_status`、`dm_msg` 等字段；当前直播间约 39 条。
- `PANEL_INTERACTIVE_NOTIFY_CHANGE`：预言玩法面板状态更新，样本包含 `biz_id`、
  `end_time`、`last_time`、`level`、`text` 和图标，文本包括「主播开启预言」「预言状态变更」；
  当前直播间约 25 条。
- 两者都没有具体参与用户或独立业务结果，属于玩法面板的状态信令，不进入现场事件流，
  也不进入系统提醒；原始报文仍由 source 诊断流保留，未来实现预言玩法面板时再解析倒计时和状态。

## 四、待办（暂不实现，留待触发/需要时再处理）

### 1. LIKE_INFO_V3_NOTICE —— 仅知名、无字段、暂不加

- 三房间真机累计上万条 LIKE_INFO（80397=866、21696950=2349、22886883=2480）**零触发**
- 仅在 sjh8130 Testing.md 命令表里出现命令名，**无人记录字段/触发时机/用途**
- bilibili-API-collect 备份快照（2026-01-25）的 message_stream.md 里 LIKE_INFO 族
  **也只记录了 CLICK/UPDATE 两个子命令**--社区文档同样没收录 NOTICE，进一步佐证其极罕见或已废弃
- 本地仓库无任何 LIKE_INFO 处理代码
- **决策：暂不加**。在拿到真实样本看清字段前不照猜测写解析（避免重蹈 SEND_GIFT_V2
  field 8 字段臆测覆辙）。等日志捕获到 NOTICE 再按真实字段实现。
- 可能用途（纯推测，无证据）：点赞里程碑/点赞榜上榜/已废弃低频命令。

### 2. ONLINE_RANK_V2/V3 —— pb 榜单快照与 Laplace 兼容输出

- V3 的 `data.pb` 是 `bilibili.live.rankdb.v1.GoldRankBroadcast`，现由
  `src/protocol/laplaceCompatibility.ts` 解码。
- `rank_type=online_rank` 时使用 `online_list`，其他类型使用 `list`，输出
  `{ type: 'online-rank-update', message: '在线榜', list }`，字段保持 Laplace 的蛇形命名。
- COUNT 继续由现有 adapter 写入本地统计，同时兼容输出
  `{ type: 'online-update', online, onlineText, count, countText }`；缺少某字段时不拿另一字段兜底。
- 兼容输出通过 `ConnectionCallbacks.onLaplaceStateUpdate` 提供，默认没有消费者，因此不改变本软件的
  时间线、统计展示或筛选行为；V2 暂无可验证 schema，继续忽略。

### 3. 大航海红包／登船活动事件 —— 已知历史命令，等待真实样本后再匹配

这类事件暂时不能与普通红包或普通大航海购买事件合并。当前掌握的证据分为两层：

- 历史社区协议资料记录了 `GUARD_LOTTERY_START`，描述为“房间内登船活动开启消息”；
  另有旧命令 `LOTTERY_START`，当外层 `type=guard` 时也属于同一类登船活动。报文中可见
  `lottery.sender`、`privilege_type`、`keyword=guard`、`thank_text`、`time` 和 `time_wait`
  等字段，`thank_text` 示例为“恭喜某用户上任舰长”。这说明“恭喜某用户上任”是该类
  **活动开始通知**的历史协议文案，不是普通红包“某用户发送了金额的红包”的替代文案。
- B站产品层面存在“舰长红包领取后上舰”的流程，但目前没有拿到当前直播间对应的原始
  WebSocket 报文，无法确认它实际下发的命令、字段、开始/结果事件关系，以及是否最终
  通过 `USER_TOAST_MSG_V2`／`GuardBuy` 表示。

当前本地代码与真机记录尚未确认独立的大航海红包事件：

- `src/protocol/types.ts` 没有独立的 `GuardLottery` 事件类型；
- `src/protocol/adapter.ts` 没有 `GUARD_LOTTERY_START` 或 `LOTTERY_START(type=guard)` 的解析分支；
- `GuardBuy.guard.unit` 为“天”只能说明当前收到的是按天大航海购买/奖励形态，不能单凭该字段
  证明它来自大航海红包；
- 尚未确认大航海红包对应的独立开奖/结果事件。

**决策：暂不匹配、不渲染、不加入红包默认播报模板。** 在获得真实原始事件前：

1. 普通 `POPULARITY_RED_POCKET_*` 继续按普通红包处理；
2. `GuardBuy` 继续按大航海购买事件处理，不能仅因按天就改归红包；
3. 若再次捕获到疑似事件，必须同时保存完整原始报文、命令名、关键字段和前后事件顺序；
4. 只有确认来源与语义后，才新增独立子类型并决定是否归入红包分类，不能用历史
   `thank_text` 推断所有“大航海红包”都应播报“恭喜某用户上任”。

## 五、来源

**本地仓库（`danmu_tool/reference/`）：**
- `jlivertool-repo/crates/jlivertool/src/main.rs` 1439-1455（SEND_GIFT/V2 分派）、
  1510（ONLINE_RANK_COUNT|V2 合并）、1549-1557（未处理 gift 兜底日志）
- `jlivertool-repo/crates/jlivertool-core/src/messages.rs` 341-487（SEND_GIFT_V2 from_raw_v2，
  注释引用 sjh8130/bili_danmaku）
- `bili-live-hime/protos/InteractWordV2.proto`、`OnlineRankV3.proto`（注释引用 issue#1332 评论）
- `jlivertool-repo/crates/jlivertool-core/src/bilibili/ws.rs`、`bili-live-hime/src-tauri/src/connection.rs`
  （protover=3 认证、ProtocolVersion 枚举 0/1/2/3）

**网络来源：**
- [sjh8130/bili_danmaku Testing.md](https://github.com/sjh8130/bili_danmaku/blob/master/Testing.md)
  ——完整直播弹幕命令表，SEND_GIFT_V2 标注「送礼物(LPL)」，INTERACT_WORD/GUARD_BUY 标 ⏲⚠ 旧版

**真机抓包：**
- 80397 阿梓（2026-08-28）：SEND_GIFT_V2 / INTERACT_WORD_V2 / ONLINE_RANK_V3 / LIKE_INFO_V3
- 21696950 阿萨Aza（2026-08-25）：SEND_GIFT(V1) / INTERACT_WORD_V2 / ONLINE_RANK_V3 / LIKE_INFO_V3
- 22886883 星瞳（2026-08-25）：LIKE_INFO_V3

**已失效：**
- bilibili-API-collect issue#1332 评论（410 Gone）、原仓库 deprecated 分支内容清空。
  **部分恢复**：备份仓库 [pskdje/bilibili-API-collect](https://github.com/pskdje/bilibili-API-collect)
  （master 分支为原仓库 2026-01-25 快照）保有 `docs/live/message_stream.md` 等 V1 命令字段文档，
  已存 `danmu_tool/message_stream_backup.md`；但 issue 讨论串（V2/V3 pb 字段逆向）不在备份内
- WebSearch / GitHub 代码搜索在当前环境受限，未能补充 NOTICE 字段定义

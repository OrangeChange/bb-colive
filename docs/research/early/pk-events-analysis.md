# B 站直播 PK 事件族谱（实测整理）

> 早期调查证据，不作为当前功能规范。


> 数据来源：2026-08-25 02:48–02:55 房间 31999413（莜娜Yuna）对 31184516（丝丝酱ovo）
> 的一次完整视频 PK，全部字段来自真实报文抓取（conn-31999413-20260825-015753.ndjson）。
> 状态：**备选功能参考，未实现显示**。当前处理：PK 系事件在事件流中隐藏。
> `UNIVERSAL_EVENT_GIFT(_V2)` 已于 2026-09-06 重新归入“通用连麦会话快照”，
> 它可与 PK 同场出现，但不再视为 PK 专属命令。连麦专项见
> `connection-events-analysis.md`。

## 一、实测时间线（本次样本）

```
02:48:24  PK_BATTLE_PRE / _NEW      丝丝酱ovo 发起 PK（10 秒倒计时）
02:48:24  PK_INFO ×1                双方 0:0 快照
02:48:34  PK_BATTLE_START / _NEW    开战（定时器：冷冻 02:53:34 / 结束 02:53:44）
02:50:43  PK_BATTLE_PROCESS / _NEW  票数变化 1:0（×4 次，随打赏触发）
02:48–02:53 PK_INFO ×11             约 30s–1min 一次的票数快照
02:53:36  PK_BATTLE_END             终局 101:20，丝丝酱ovo 胜，MVP 虚拟轰炸姬
02:53:37  PK_BATTLE_VIDEO_PUNISH_BEGIN  视频惩罚开始（60 秒）
02:53:38  PK_WIDGET                 「PK每日首胜」任务面板
02:54:40  PK_BATTLE_PUNISH_END      惩罚结束
```

## 二、事件分类

### A. 生命周期事件（有事件价值，一条就是一条）

| 命令 | 时机 | 关键字段 | 备注 |
|---|---|---|---|
| `PK_BATTLE_PRE` / `PK_BATTLE_PRE_NEW` | 发起邀请，倒计时开始 | `uname`/`uid`/`room_id`（对手）、`pre_timer`（倒计时秒）、`battle_type`、`match_type` | 两者字段 100% 相同（V1/V2 重复推送） |
| `PK_BATTLE_START` / `PK_BATTLE_START_NEW` | 正式开战 | `pk_start_time`/`pk_frozen_time`/`pk_end_time`（unix 秒）、`init_info.room_id`（发起方房）、`match_info.room_id`（应战方房）、`pk_votes_name`（"PK值"） | 当前房可能在任一侧，需按房间号判断 |
| `PK_BATTLE_END` | 终局 | `init_info`/`match_info` 各含：`votes`（票数）、`winner_type`（2=胜 / -1=负）、`best_uname`（MVP）、`assist_info`（贡献榜前 N，完整 uinfo 含头像）；`dm_conf`（官方弹幕配色） | **信息量最大的一条** |
| `PK_BATTLE_SETTLE_NEW` | 终局结算 | `init_info`/`match_info` 的 `result_type`、`votes`、`settle_status` | 2026-09-07 在 `battle_type=6` 场次中代替 `PK_BATTLE_END` 出现；仍需更多样本确认适用范围 |
| `PK_BATTLE_VIDEO_PUNISH_BEGIN` | 惩罚开始 | 双方 `votes`/`winner_type`、`video_punish.duration`（秒） | 视频惩罚类 PK 特有 |
| `PK_BATTLE_PUNISH_END` | 惩罚结束 | 仅 `battle_type` 系列 | 几乎无信息 |

### B. 高频过程事件（快照/增量，不适合逐条显示）

| 命令 | 频率（本次实测） | 内容 |
|---|---|---|
| `PK_INFO` | 12 条 / 6 分钟（约 30s–1min 心跳 + 票变触发） | 双方完整状态快照：`members[].votes`/`votes_text`、段位图标、贡献榜；顶层 `pk_basic` 含会话 id、`init_id` |
| `PK_BATTLE_PROCESS` / `PK_BATTLE_PROCESS_NEW` | 票数变化时（本次 4 条） | 增量票数：`init_info.votes` vs `match_info.votes`（累计值非增量）、`trace_id` |

### C. 伴随数据（不作为 PK 独立事件逐条显示）

| 命令 | 内容 |
|---|---|
| `UNIVERSAL_EVENT_GIFT` / `_V2` | 通用多人连线会话状态同步（见下方专项说明）；本次 PK 捕获 4 条 |
| `PK_WIDGET` | PK 任务面板配置（「每日首胜：段位分翻倍」），1 条 |

#### UNIVERSAL_EVENT_GIFT 专项说明（不是普通送礼事件，也不是 PK 专属事件）

本次 PK 实测载荷没有 `gift` 礼物对象，实为**多人连线（multi-conn）会话状态同步**：

- `interact_template`：连线布局模板（本例 `multi_conn_grid`，左右分屏 `left1_right1`）
- `members`：连线成员（双方主播，含 uid/头像/座位 position/加入时间）
- `session_status`/`room_status`：会话与房间状态机
- `stream_control`/`biz_session_id`：流控制与会话 id（与 PK_INFO 的 `pk_basic.biz_session_id` 同源）

备份 API 文档中的另一份真实样例还包含 `business_label: "universal_multi_conn"`、最多 9 人的
`members`、连线布局、RTC 分辨率及 `multi_conn_info.scores`。其中 `scores.price` 是各主播的
累计贡献值，并不使整条命令变成一笔礼物事件；逐笔送礼仍走 `SEND_GIFT(_V2)`。

与 PK 的关系：本次视频 PK 依赖双人连线会话，两者共用 `biz_session_id`，触发时机也与 PK
票数快照对齐（02:50:43 / 02:51:45 / 02:52:23 / 02:53:16，V1/V2 成对间隔 1 秒）。
这只能证明“该 PK 建立在连麦会话上”，不能证明 `UNIVERSAL_EVENT_GIFT` 是 PK 命令。
后续应把它记录为连麦会话快照，再通过会话 id 和同时段 `PK_BATTLE_*` 判断该连麦是否承载 PK。

### 未观察到（无法确认是否存在，社区文档网络受限未能核对）

- `PK_BATTLE_SETTLE`（无后缀旧版赛季结算）仍未观察到；`PK_BATTLE_SETTLE_NEW` 已在 2026-09-07 的 `battle_type=6` 场次中捕获
- 团战 / 观众分队等其他 `battle_type` 的字段差异（本次 `battle_type=2` 视频惩罚 PK）
- `winner_type` 除 2/-1 外的取值（如平局）

## 三、固定约定（从数据反推）

- **init_info = 发起方，match_info = 应战方**；但当前房间可能处于任一侧，必须用双方
  `room_id` 逐场判断，不能固定把 `match_info` 当成本房。PRE 事件顶层的 `room_id`/`uname`
  通常是对手信息，从本房视角即“匹配到谁”。
- 当 `X` 与 `X_NEW` 同时出现时通常是同一阶段的重复推送，字段相同或等价；但今天的
  `battle_type=6` 只出现了 `_NEW`，而部分其他阶段只出现无后缀版，因此不能依赖“必然成对”
  或按命令条数计数。适配时应按 `pk_id + 阶段` 合并。
- `votes`/`votes_text` 是 PK 值累计分数，不是礼物金额；分数上涨常与 PK 期间的
  `SEND_GIFT(_V2)` 同步，但礼物事件和 PK 过程事件仍是两条独立数据链。
- PK 期间礼物照常走 SEND_GIFT，与 PK 事件流独立

## 四、显示粒度选项（供决策，未实现）

| 方案 | 显示内容 | 行数成本 |
|---|---|---|
| 最小 | 仅 `PK_BATTLE_END`（终局：比分+胜者+MVP） | 每次 PK 1 行 |
| 轻 | PRE（谁挑战谁）+ END（结果） | 每次 PK 2 行 |
| 中 | PRE + START（开战）+ END + PUNISH_BEGIN/END | 每次 PK 5 行 |
| 过程 | 中 + PROCESS 票变 | 视激烈程度，可能几十行 |

无论选哪档，B 类（PK_INFO / PROCESS）建议只取数不逐条显示；`PK_WIDGET` 只保留配置。
`UNIVERSAL_EVENT_GIFT(_V2)` 交由连麦会话模型处理，不计作 PK 展示行。

## 五、决策记录（2026-08-25）

- PK 事件作为**备选功能**保留参考，当前不在事件流显示
- 当前未识别的 `PK_*` 与 `UNIVERSAL_EVENT_GIFT(_V2)` 均不进入现场事件流；后者不能迁入
  永久噪音丢弃列表，未来应解析为连麦会话数据
- 原始报文日志不受影响（ConnectionLogger 在 adapter 之前记录全部报文，PK 数据仍完整留档）

## 六、采集状态更新（2026-09-05）

- 计划采集房间 `1940899824`：15:32:18 建立连接，15:44:57 收到 `PREPARING`，之后保持
  离线房间连接至 20:15:30；没有任何 `PK_*`、`*BATTLE*` 或
  `UNIVERSAL_EVENT_GIFT(_V2)`。
- 候选房间 `1861784707` 的后续连接同样没有 PK 命令。
- 该次采集没有形成新的 PK 实例，不能用于补充 PK 生命周期或字段含义；它暴露的是监测任务
  曾把“弹幕 WebSocket 可连接”误当成“主播仍在直播”。后续采集必须以直播状态或
  `PREPARING/LIVE` 房间事件控制切换，不能用连接成功代替开播状态。

## 七、2026-09-07 实测补充（房间 22674439）

数据来源：
`AppData/Roaming/cc.orange.danmu-app/logs/conn-22674439-20260907-120458.ndjson`。
本次连接覆盖约 12:04:58–13:41:32，共看到 9 个不同的 `pk_id`；其中第一个
`399847758` 在建立连接时已经进行中，所以没有捕获到它的 PRE/START，只能看到快照、过程、
终局和惩罚阶段。这说明“没有收到 PRE/START”可能只是连接边界造成的，并不代表该场次没有
经历准备和开战。

### 1. 本次捕获的终局类型

| 场次 | 现象 | 结论 |
|---|---|---|
| `399847758` | `PK_INFO(status=201)` → `PK_BATTLE_END(401)` → `VIDEO_PUNISH_BEGIN(601)` → `PUNISH_END(1001)` | 连接中途加入的正常 PK；终局比分 `6150:52`，`init_info` 一侧获胜 |
| `399848094` | PRE → START → PROCESS/INFO → END → 视频惩罚 | 正常 PK；当前房是 `init_info` 一侧，终局 `4901:1`，当前房获胜 |
| `399848720` | PRE → START → PROCESS/INFO → END → 视频惩罚 | 正常 PK；当前房是 `match_info` 一侧，终局 `0:2640`，当前房获胜 |
| `399848585`、`399848858`、`399848913` | START 后很快出现 `PK_BATTLE_ABNORMAL(304)`，随后 `END(404)`，比分 `0:0` | 异常中止，不应当当作正常 PK 结束；日志中没有视频惩罚开始 |
| `399848931` | `battle_type=6`，PRE → START_NEW → PROCESS_NEW → `PK_BATTLE_SETTLE_NEW(401)` | 特殊类型使用结算消息作为终局；比分 `0:21`，`match_info` 一侧获胜，没有普通 `PK_BATTLE_END` |
| `399849612` | PRE → START → PROCESS/INFO → END → 视频惩罚 | 正常 PK；当前房是 `match_info` 一侧，终局 `0:1923`，当前房获胜 |

本次样本中，`PK_BATTLE_END` 出现 8 次，`PK_BATTLE_SETTLE_NEW` 出现 1 次，异常中止出现
3 次。`PK_BATTLE_PUNISH_END` 是前一场 PK 的后续收尾，不是新的 PK 场次。

### 2. 状态码与阶段的对应关系（仅代表本批实测）

| 状态 | 本批对应阶段 |
|---:|---|
| `101` | 准备/匹配倒计时 |
| `201` | 正式进行中 |
| `304` | 异常状态通知 |
| `401` | 终局/结算 |
| `404` | 异常中止后的终局 |
| `601` | 视频惩罚开始 |
| `610` | 视频惩罚进行中快照 |
| `1001` | 惩罚结束 |
| `1401` | 异常场次后续收尾快照 |

`PK_INFO` 会在这些阶段持续提供完整快照，不能简单当作新的 PK 事件。倒计时应使用
`PK_BATTLE_START` 中的 `pk_start_time`、`pk_frozen_time`、`pk_end_time` 等服务器时间；日志
接收时间与这些时间相差约 1 秒，不能用本地接收时间替代。

### 3. 过程数据和去重规则

- `PK_BATTLE_PROCESS` 与 `PK_BATTLE_PROCESS_NEW` 在同时出现时表示同一个比分更新；其中的
  `votes` 是累计值，例如同一场出现 `50 → 150 → 6150`，不能逐条相加。
- `PK_INFO` 是周期性或比分变化触发的完整快照，适合更新同一个 PK 会话的当前状态。
- PRE/START/PROCESS 的旧版与 `_NEW` 版可能相隔约 0–1 秒；END 通常只出现无后缀版，
  `battle_type=6` 的终局本次只出现 `PK_BATTLE_SETTLE_NEW`。
- 未来数据层应以 `pk_id` 建立 PK 会话，以阶段合并重复命令；终局阶段在 END 与 SETTLE
  同时存在时只保留一个最终结果，避免现场重复显示。

### 4. 后续 PK 功能实现建议

数据层建议保存：双方房间和主播、当前所在侧、PK 值、准备/开战/冻结/结束时间、MVP、胜负、
异常状态、视频惩罚及结算状态。现场显示建议先采用“准备信息 + 终局结果”的轻量模式；PROCESS
和 PK_INFO 只更新 PK 面板或统计，不逐条进入现场信息流。原始报文日志继续完整保留，便于后续
补充团战、平局及其他 `battle_type` 的字段含义。

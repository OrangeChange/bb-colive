# 特效礼物与特效类推送事件分析

> 数据来源：2026-08-25/26 真机抓包（房间 22886883 星瞳、21696950 阿萨Aza、31999413）。
> 决策记录：**礼物特效第一版已实现**。当前礼物窗仍承载礼物类事件流，官方动画作为独立 VAP 覆盖层播放，不改变事件列表。
> 相关：`danmu_tool/pk-events-analysis.md`（PK 事件族）。

## 一、SEND_GIFT 报文内的特效元数据

全屏动画本体**不走弹幕协议推送**，客户端凭 `gift_info.effect_id`
向官方特效资源接口拉取独立资源后本地渲染。当前 Web 端实际使用的是带配套 JSON 的 VAP 透明 MP4，不能把普通礼物 GIF/WebP 当作该特效的替代品。协议里能拿到的全部元数据如下（真机实测分层）：

| 礼物 | 价格 | effect | effect_id | combo_stay_time | broadcast_id | has_imaged_gift | float_sc_resource_id |
|---|---|---|---|---|---|---|---|
| 万象天衣 | ¥3000 | 2 | 5762 | **20s** | **1893** | 1 | 5 |
| 梦幻邮轮 | ¥300 | 2 | 5559 | 12s | 0 | 1 | 3 |
| 心电共鸣 | ¥200 | 2 | 5360 | 12s | 0 | 1 | 2 |
| 常伴珠钗 / 极速超跑(流光飞电) | ¥100 | 2 | 6090/703 | 8s | 0 | 1 | 2 |
| 亲密之旅 / 甜蜜契约 等 | ¥35-50 | 2 | 各异 | 8s | 0 | 1 | 2 |
| ¥5-20 一批（星光点点/告白花束等） | | 2 | 各异 | 5s | 0 | 1 | 0 |
| 普通小礼物（比心/小花花等） | ≤¥1 | 0 | 0 | 5s | 0 | 0 | 0 |
| 粉丝团灯牌 | ¥0.1 | **3** | 0 | 5s | 0 | 0 | 0 |

字段含义：

- `effect`：特效等级。0=无；2=有特效动画礼物；3=灯牌类（进房弹横幅）
- `gift_info.effect_id`：动画资源索引，未来复刻特效就靠它
- `combo_stay_time`：连击横幅停留秒数，价格越高越长（5→20s）
- `broadcast_id`：非 0 表示跨房广播级特效（万象天衣 1893）；万象天衣还带 `is_first: true`（当晚房间首次）
- `gift_info.has_imaged_gift`：动画中是否出现送礼人头像（「成像礼物」）
- `float_sc_resource_id`：漂浮 SC 资源档位
- `dmscore`：事件权重（万象天衣 1512，普通 140-770），可作排序/降噪参考

## 二、特效类推送命令族（独立命令）

| 命令 | 实测量级 | 语义 |
|---|---|---|
| REVENUE_DISPLAY_EFFECT | 3/3h | **投喂特殊礼物的特效事件**（投喂「舰长一号/提督一号」）。带富文本弹幕模板（`display_text.template_key=live_interactive_gift_send_v1` + pieces 分段）、连击条（combo_bar：图标/文案/计数）、收礼人 uinfo。实测样本 `animation`/`open_h5` 均为 null（动画仍由客户端渲染） |
| DM_INTERACTION | ~5911/3h | 投喂互动卡（「xx 人在投喂」）。`gift_id`+`cnt`（人数）+`fade_duration:10000`（10s 淡出）+`suffix_text`。与 REVENUE_DISPLAY_EFFECT 同属投喂玩法 |
| GIFT_COMBO | 2/3h | **批量投喂预告**：先于 SEND_GIFT 约 0.5s 下发，num/total_coin 与随后的 SEND_GIFT 完全一致，纯冗余。独有字段：`combo_stay_time`、`unlock_benefit_url`（解锁权益横幅图）、`crit_prob`/`magnification`（暴击，实测均 0/1 未见触发）、`demarcation`（批次分界 1/2）。**决策：继续丢弃**；若未来暴击真触发，倍率信息只有这里有 |
| ENTRY_EFFECT | ~9481/3h | 舰队进场特效（`privilege_type=3` 舰长）。`copy_writing` 模板 + `web_basemap_url` 背景横幅 + priority/effective_time/静默期。已有 adapter 处理 |
| WIDGET_GIFT_STAR_PROCESS_V2 | 8/3h | 「礼物星球」房间小部件进度（`{name:礼物星球, cur_num:2, total_num:9}`），送礼攒星星 |
| WIDGET_BANNER | ~854/3h | 活动横幅列表（团战应援赛等），带跳转 url、stay_time、平台过滤 |
| COMMON_NOTICE_DANMAKU | ~186/3h | 系统通知弹幕（「恭喜 xx 荣耀等级升级至 N 级」），content_segments 富文本（亮色 highlight） |
| FLOW_REWARD_CARD | 12/3h | 跨房推荐卡（流量奖励位，「去围观」其他直播间，带 cover/route/expire_time:10s） |

以下两条来自 bilibili-API-collect 备份文档（pskdje/bilibili-API-collect，master 快照 2026-01-25，
见 `danmu_tool/message_stream_backup.md`）：

| 命令 | 语义 |
|---|---|
| SPECIAL_GIFT | 特殊礼物。data 是以数字为键的表，每项含 `action`（操作?）/`content`（内容）/`storm_gif`（GIF 动画 URL）/`time`（持续时间?）/`num`/`hadJoin`。文档标注来源 issue#360，疑为礼物雨/节奏风暴类玩法。**真机尚未捕获** |
| FULL_SCREEN_SPECIAL_EFFECT | 全屏特效信令。字段 `type`/`ids`（effect_id 列表）/`queue`/`platform_in`。**真机已捕获**（22625027，2026-08-29，4 条：`{type:2, ids:[5763], queue:2, platform_in:[1,2]}`，与文档记载结构一致）。已决策丢弃：动画由客户端自渲染，无用户行为价值（adapter 丢弃列表，2026-08-30） |

## 三、送礼事件流形态（合并显示的依据）

同一用户送 N 个礼物有两种事件形态，**显示应一致（一行 ×N）**：

| 形态 | 事件序列 | 实现 |
|---|---|---|
| 逐条连送（连点/长按） | N × SEND_GIFT（各 num=1，send_ts 逐条递增）+ COMBO_SEND（combo_num=N，combo_total_coin=N 件总价） | 优先按 `combo_id` 在 500 行缓冲内精确合并；无 ID 时以相邻两次送礼不超过 8 秒的滑动窗口兜底；COMBO_SEND 用累计值权威覆盖并封结该行 |
| 批量投喂（选数量一次送出） | GIFT_COMBO（预告，丢弃）+ 1 × SEND_GIFT（num=N） | 单行天然 ×N |

COMBO_SEND 字段备忘：`combo_id = gift:combo_id:{uid}:{ruid}:{gift_id}:{ts}` 标识一次连击（同连击进度更新共享），`combo_num` 递增，`combo_total_coin` 为累计总价。事件 id 取 `combo_id:combo_num`（保证每条进度唯一，见 adapter 注释）。

## 四、其他新捕获噪音命令（2026-08-26，均丢弃）

| 命令 | 量级 | 语义 |
|---|---|---|
| TRADING_SCORE | 28/3h | 带货交易分更新（uid + score_id + num） |
| GUARD_HONOR_THOUSAND | 4/3h | 千舰荣誉名单变更（add/del uid 列表） |
| GOTO_BUY_FLOW | 2/3h | 「xx正在去买」带货提示 |
| SHOPPING_CART_SHOW | 1/3h | 购物车状态（status:2） |
| VOICE_JOIN_ROOM_COUNT_INFO / VOICE_JOIN_LIST | 各 2/3h | 连麦申请列表状态（apply_count/red_point） |
| REVENUE_DISPLAY_EFFECT 之外：RANK_CHANGED(V1)、VOICE_* 等见原始日志 | | |

## 五、后续实现备忘（礼物特效能力）

1. 资源索引：`effect_id + gift_id` → 官方 `GetEffectConfListV2?platform=pc` 的 `web_mp4` + `web_mp4_json`；使用 `bind_gift_ids` 精确校验，不拼接 CDN 地址。
2. 透明合成：Web 端资源使用 VAP 格式，JSON 中的 `rgbFrame`/`aFrame` 指定 RGB 与 Alpha 区域，需要 VAP Web 播放器或等价 WebGL 合成实现。
3. 播放时机：在 SEND_GIFT 完成去重、礼物合并后触发；`combo_stay_time` 只作为礼物横幅停留参考，最终特效结束以播放器 `ended` 为准。
4. 跨房广播：`broadcast_id` 非 0 的礼物（如万象天衣）仍需保留元数据，但第一版特效归属以当前规范化礼物事件为准。
5. `REVENUE_DISPLAY_EFFECT`、`FULL_SCREEN_SPECIAL_EFFECT` 暂不接入礼物特效层，避免重复或无法确认礼物归属。
6. 暴击：`crit_prob`/`magnification`（GIFT_COMBO 独有，目前未见过触发）继续留档，不改变第一版特效播放。

## 六、第一版实现状态（2026-09-08）

1. 连接建立前按真实房间预加载官方 Web 特效索引，按 `effect=2`、`effect_id`、`bind_gift_ids`、Web 平台及 MP4/JSON 完整性匹配。
2. 礼物去重和连击合并后，只有真正新增礼物行才发出一次特效通知；连击更新、普通礼物 GIF/WebP 和 `COMBO_SEND` 不重复触发。
3. 现场礼物区域和礼物窗各有独立队列、播放器和开关；两个开关默认关闭，关闭时清空等待项但让当前动画完成。
4. 播放器固定为 `video-animation-player@1.0.5`，静音、非循环；VAP/WebGL 失败只跳过动画，不影响事件、日志、统计和滚动。
5. 已验证：全量测试 303 项通过，TypeScript 检查通过，生产构建通过；真实直播间的 VAP 视觉播放仍需在有 `effect=2` 礼物的场景中手工验收。

详细实现方案见：礼物特效设计方案（本地历史记录）。

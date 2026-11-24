# 原始样本

来源：本机 danmu_tool 早期采集文件。事件内容、用户资料、时间与资源字段保持原值，只规范 JSON 缩进；不包含登录凭据。这是协议研究附件，不是可恢复档案，也不是全量直播记录。

| 文件 | 内容与保留范围 |
| --- | --- |
| [blind_room_samples.json](blind_room_samples.json) | 102 条中保留 12 条，覆盖观察到的互动／礼物形态及首尾样本 |
| [danmu_samples_510.json](danmu_samples_510.json) | 原 2 条完整保留 |
| [emo_probe.json](emo_probe.json) | 原 18 条完整保留 |
| [emot_all_7777.json](emot_all_7777.json) | 原 13 条完整保留 |
| [emot_samples_7777.json](emot_samples_7777.json) | 原 3 条完整保留 |
| [gift_samples.json](gift_samples.json) | SEND_GIFT 1287 条中保留 12 条，GUARD_BUY 177 条中保留 8 条，COMBO_SEND 原 12 条全保留；SEND_GIFT_V2／USER_TOAST 原为空，不能用此文件证明其字段 |
| [v1_room_samples.json](v1_room_samples.json) | 原互动 V2 4 条与进场特效 3 条完整保留 |
| [v2_samples.json](v2_samples.json) | 原分组和样本完整保留，count 为原观测数量，不等于 samples 长度 |
| [v2_samples2.json](v2_samples2.json) | 互动 V2、弹幕、DM_INTERACTION、进场特效四组各保留 8 条，原分别 111／68／64／36 条 |
| [v2_samples3.json](v2_samples3.json) | 进场特效、互动 V2、弹幕、DM_INTERACTION 四组各保留 8 条，原分别 26／90／58／70 条；LIKE_INFO_V3_CLICK 原 8 条全保留 |

较大集合保留首尾及不同已观察字段组合；文件名的 V1／V2 不是文件内所有命令的版本声明。未保留部分仍在原研究目录，不能宣称这些附件覆盖了原集合全部字段变化。

后续采集仅补有新命令、字段或实际边界的样本，不把整场重复消息作为文档附件持续累积。引用样本时说明命令与字段，不把收到次数当成协议保证。

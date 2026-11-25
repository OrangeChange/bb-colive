# 协议与数据研究

研究文档保存调查日期、字段依据、真实样本与未确认语义，不替代[当前功能规则](../README.md#功能文档)。字段候选不自动成为可信金额，历史页面观察不等于当前接口承诺。

| 主题 | 资料 |
| --- | --- |
| 开发参考 | [重要参考项目与源码入口](reference-projects.md) |
| 命令代际 | [V1／V2／V3 调查](protocol-versions.md) |
| 金额 | [礼物金额字段](gift-price-fields-analysis.md) |
| 特效 | [特效礼物事件](effect-gift-events-analysis.md) |
| 大航海 | [动作与活动字段](guard-events-analysis.md) |
| 自动弹幕 | [发送标记与天选口令样本](automatic-danmaku.md) |
| 辅助命令 | [未识别与辅助事件](unrecognized-events-analysis.md) |
| 房间与榜单 | [概览和榜单来源](room-overview-and-rank-sources.md) |

## 保留的早期证据

- [连接事件](early/connection-events-analysis.md)、[接口错误码](early/error-codes.md)、[PK 命令](early/pk-events-analysis.md)。
- [biliup 弹幕](early/biliup-danmaku-analysis.md)、[biliup 登录](early/biliup-login-analysis.md)：参考实现，不替代本软件当前扫码流程。
- [消息流备份](early/message_stream_backup.md)：上游协议资料快照，令牌值已脱敏；不是最新版上游接口承诺。
- [LAPLACE 礼物字段依据](laplace-gift-field-evidence.md)、[原始样本](samples/README.md)。

研究总览、参考项目、早期需求／架构／UI、协议验证与 WebView 验证原件见历史研究（本地历史记录）。其中第三方代码路径标为原本机来源；这些代码树未随仓库保存，不能当作当前源码依赖。

历史 LAPLACE 兼容汇总保留当时的改动与验证范围，当前显示规则见[事件显示](../features/event-display.md)，当前状态回调见[直播间概览与榜单](../features/room-insights.md)。

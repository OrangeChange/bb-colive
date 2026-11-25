# 开发参考项目

记录持续关注的外部项目、可借鉴能力及已核对的源码入口。参考项目不是运行依赖，其实现不替代本项目的功能契约和实际验收。

## PiliPlus

- 仓库：https://github.com/bggRGjQaUbCoE/PiliPlus
- 纳入日期：2026-11-26。
- 定位：重要参考项目。后续涉及 B 站客户端交互、账号与直播能力时，优先检查其现行实现及维护记录。
- 技术栈：Flutter／Dart；许可：GPL-3.0。直接复用代码前核对许可及项目适用范围。

### 已核对的参考内容

| 内容 | 源码入口 | 对本项目的用途 |
| --- | --- | --- |
| 文字、回复与表情发送 | [live.dart](https://github.com/bggRGjQaUbCoE/PiliPlus/blob/main/lib/http/live.dart) 的 sendLiveMsg | 核对请求参数、WBI 签名、表单提交、CSRF、replyMid 与 replayDmid；适配现有登录和 HTTP 请求层 |
| 房间表情获取 | 同文件的 getLiveEmoticons | 按目标房间加载表情包 |
| 表情面板状态 | [controller.dart](https://github.com/bggRGjQaUbCoE/PiliPlus/blob/main/lib/pages/live_emote/controller.dart) | 房间关联、加载与重新加载 |
| 表情选择 | [view.dart](https://github.com/bggRGjQaUbCoE/PiliPlus/blob/main/lib/pages/live_emote/view.dart) | 分组切换、网格、图片预览；区分填入内容与独立表情发送 |
| 表情数据 | [live_emote](https://github.com/bggRGjQaUbCoE/PiliPlus/tree/main/lib/models_new/live/live_emote) | 表情包、图片尺寸及 emoticon_unique 的数据划分 |

直播表情发送于 [2025-04-13 加入](https://github.com/bggRGjQaUbCoE/PiliPlus/commit/671b6e1ef)，调查时仍保留完整调用流程。后续跟踪[版本发布](https://github.com/bggRGjQaUbCoE/PiliPlus/releases)及对应文件变更，不以项目规模代替功能稳定性判断。

### 本项目适配方向

首轮发送功能以其现行请求流程为主要参考，复用 BB CoLive 已有的登录、真实房间号、WBI 及 Tauri HTTP 能力。入口位于现场“弹幕／弹幕与互动”标题旁，打开悬浮输入框；现有事件菜单可添加“回复该用户”，联动同一输入框。

常用语作为手动输入辅助考虑；表情按平台实际能力适配。回复提醒独立规划，定时和事件触发归后续自动化。

待确认：文字与独立表情的权限和长度、表情与回复的组合支持、请求成功后的实际广播结果。本轮未进行真实发送；未找到针对直播表情发送的专门自动化测试，不能据此承诺稳定性。其他模块尚未逐项审阅。

## 历史资料

早期参考项目总表位于本地历史资料 docs/local-history/archive/legacy-research/reference-study.md，保留原调查背景；当前参考选择在本文维护。

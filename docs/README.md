# 软件开发文档

使用软件请阅读[使用指南](user-guide.md)。本目录中的功能文档面向开发与维护。

当前版本 **1.1.0**。工作区进度与发布包范围见[项目状态](project-status.md)。具体行为按功能维护；调查资料提供依据，历史记录只用于追溯。

## 项目与全局规则

- [项目状态](project-status.md)：版本、未完成事项、已知问题与待验范围。
- [当前架构](architecture.md)：模块职责、数据流及共享边界。
- [产品与界面规范](specifications/README.md)：产品目标、视觉与文案、跨功能交互。

主分支后续更新与已发布版本分别记录在[项目状态](project-status.md)。宿主控件用法见[shadcn/ui 组件](../src/components/shadcn/README.md)，翻译与用语确认见[界面语言适配](development/interface-localization.md)。

## 功能文档

| 功能 | 内容 |
| --- | --- |
| [连接与登录](features/connection-and-login.md) | 登录、连接、重连、切房与启动 |
| [现场事件流](features/live-feed.md) | 分类、筛选、滚动、上下文与标记 |
| [样式与可视化编辑](features/themes-and-editor.md) | 四类主题、图片与渐变编辑、预览、导入导出与软件配色 |
| [浏览器输出](features/browser-output.md) | OBS 配置、输出地址、主题与独立连接 |
| [事件显示](features/event-display.md) | 元信息、身份图标、礼物口径、显示设置与样例 |
| [弹幕窗与收益窗](features/auxiliary-windows.md) | 只读投影、收益分窗、固定展示、切房、恢复与布局 |
| [回看与档案](features/review-archive.md) | 导航、场次状态、时间线、写入、管理与封面 |
| [云端记录恢复](features/cloud-recovery.md) | EventFetcher 0.7.15 对接基线、选择性／增量恢复、场次修订、登录态与采集管理 |
| [收藏](features/favorites.md) | 备注、标签、检索与批量操作 |
| [数据导出](features/data-export.md) | 格式、范围、列、金额、汇总与命名 |
| [语音与个性播报](features/voice-and-broadcast.md) | 队列、引擎、提示音和输出设备 |
| [直播间概览与榜单](features/room-insights.md) | 榜单、人数口径、用户筛选与兼容回调 |
| [诊断与日志](features/diagnostics.md) | 记录、快照、导出、保管、退出与功能接入 |

## 研究与后续规划

[规划索引](roadmap/README.md)区分未来功能与已接入功能的早期设计。

- [协议与数据研究](research/README.md)：字段分析、协议证据与样本。
- [BB EventFetcher 设计](roadmap/event-fetcher-design.md)：早期独立采集服务设计快照；当前对接版本与职责见[云端恢复](features/cloud-recovery.md)，服务端设计和发布独立维护。
- [平台与更新规划](roadmap/platform-and-updates.md)：跨平台边界、双源分发及更新渠道。

## 开发与发布

[前端运行环境与兼容约定](development/frontend-runtime-compatibility.md)规定前端能力准入与验证边界。

[界面文案与翻译](development/interface-localization.md) · [翻译清单](translations/README.md)

[调试与验收](development/debugging-and-testing.md) · [构建与发布](development/build-and-release.md) · [文档维护](development/documentation-maintenance.md)

[原生事件 DOM 与样式契约](development/native-event-style-contract.md)维护公共区域、部件和样式参数；功能行为继续按所属功能文档维护。

[样式与可视化编辑](features/themes-and-editor.md)维护当前功能，来源与公共行为由兼容契约统一定义。


现行兼容能力见[兼容主题契约](development/compatible-theme-contract.md)，图片功能的部件边界见[图片样式契约](development/image-style-contract.md)。

## 历史记录

历史设计、实施过程及旧版验收资料保存在本地开发档案中。公开源码中的功能说明与契约维护当前行为。

## 目录与资源

[目录职责](development/repository-structure.md) · [文件与图片命名](development/asset-naming.md) · [应用身份与数据迁移](development/data-migration.md)

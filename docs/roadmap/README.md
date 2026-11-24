# 规划索引

规划文档保存目标和阶段决策，是否实现按当前源码与[项目状态](../project-status.md)判断。

| 文档 | 当前归属 |
| --- | --- |
| [平台与更新](platform-and-updates.md) | 自动更新、双源更新分发和其他桌面平台仍为后续规划 |
| [BB EventFetcher](event-fetcher-design.md) | 早期设计快照；当前客户端已对接恢复契约 0.3，服务端源码基线 0.7.15，现行说明见云端记录恢复 |
| [云端历史恢复](cloud-history-recovery.md) | 早期恢复方案；旧恢复契约和输入流程已由现行功能替代 |
| [云端同步阶段设计](cloud-sync-phase-1-2-design.md)、[计划](cloud-sync-phase-1-2-plan.md) | 旧 API 与工作树基线，保留追溯；不作为当前未完成清单 |
| [共享协议设计](shared-protocol-package-design.md)、[计划](shared-protocol-package-plan.md) | 协议提取阶段资料；客户端当前恢复协议版本与调用方式见功能文档 |

[云端记录恢复](../features/cloud-recovery.md)维护当前连接、选择范围、进度、档案写入和采集管理规则。未来跨源合并或其他服务接入需要独立需求，不从旧计划自动扩展。

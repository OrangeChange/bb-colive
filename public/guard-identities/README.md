# 大航海默认身份图标

来自本地留存的 B 站原始报文 `uinfo.medal.guard_icon`。数据返回的图片优先；缺图或加载失败时，按连接时读取的房间级 `anchor_guard_achieve_level` 选择普通或增强版本地素材。低于1000、字段缺失或字段异常使用普通版；1000至9999使用千舰增强版；10000及以上使用万舰增强版。千舰和万舰当前共享增强版素材，不按舰队人数或 URL 文件名猜测样式。

普通版（缺少样式依据时的默认兜底）：

| 文件 | 身份 | 来源 |
| --- | --- | --- |
| standard-captain.png | 舰长 | https://i0.hdslb.com/bfs/live/48360c8f3b7de8031e86ff1ef4a2dfc0ec2a61c2.png |
| standard-admiral.png | 提督 | https://i0.hdslb.com/bfs/live/62ac06fd72b05fe22be26426b9e1a8e1fc2c6b89.png |
| standard-governor.png | 总督 | https://i0.hdslb.com/bfs/live/bf4f5ea4b54ca7bb358dec4e6c4afcc300c12eb9.png |

增强版（千舰/万舰房间级档位的本地兜底）：

| 文件 | 身份 | 原始协议 guard_level | 来源 |
| --- | --- | --- | --- |
| captain.png | 舰长 | 3 | https://i0.hdslb.com/bfs/live/fd26e0053f3d24672ffdabcb1f6d2545e26b1e33.png |
| admiral.png | 提督 | 2 | https://i0.hdslb.com/bfs/live/7cb7dfb5a2e652eb939585ddfd269238868cc5de.png |
| governor.png | 总督 | 1 | https://i0.hdslb.com/bfs/live/ffcd832b5d7b84ea851cb8156ec0a71940439511.png |

应用模型的 1/2/3 是舰长/提督/总督，与协议方向相反；统一组件按身份名称选取兜底素材。

本目录用于用户身份徽章。购买事件使用[原生大航海事件素材](../../src/assets/events/guard/README.md)，成就使用 `src/assets/events/guard-honor/` 中的官方八档勋章；三类用途不互相替代。

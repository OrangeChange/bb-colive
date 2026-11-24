# 直播间概览与榜单

## 数据来源与口径

房间资料由连接初始化接口取得，概览和榜单使用各自接口与状态更新。贡献榜请求 `queryContributionRank`，大航海榜请求 `topListNew`，支持亲密度／陪伴天数及分页用户去重。

贡献榜条数、在线榜条数、在线人数、榜单计数、看过数和心跳热度不能互相替代。`ONLINE_RANK_COUNT.online_count` 与 `count` 分别保存 online／rankCount 及对应文本，缺失不互相兜底。

用户名可进入该用户筛选，动作必须接入实际查询，不只是可点击样式。榜单列表的身份复用[大航海组件](event-display.md#用户身份与元信息)；右上角前三小头像不带身份标记。

## LAPLACE 兼容输出

`ONLINE_RANK_V3` 按 GoldRankBroadcast 解码：online_rank 使用 online_list，其他类型使用 list，int64 保留字符串，uinfo 保留已确认蛇形字段；它是榜单快照，不进入普通事件时间线。

`adaptLaplaceStateMessage` 提供在线榜和在线计数的可选 `onLaplaceStateUpdate` 回调。主程序及 OBS 房间会话将状态转发给 Laplace 输出；它不替换软件自身概览统计，也不把榜单快照加入普通事件流。ONLINE_RANK_V2 未有可靠定义，当前不输出兼容状态。

该兼容能力使用 B 站数据，不以 LAPLACE 页面或登录令牌作为运行时数据源。字段与研究证据见[概览和榜单调查](../research/room-overview-and-rank-sources.md)。

## 实现与验收

主要入口：`src/protocol/roomInsightsApi.ts`、`roomInsights.ts`、`laplaceCompatibility.ts`、`src/components/RoomRankings.tsx`、`RoomInsightsView.tsx`。

验收贡献／大航海分页与切房、用户名筛选、身份图标设置、缺失计数不混用、V3 列表选择、兼容回调不阻断普通适配。用户消息中的“榜 N”是单独[事件字段](event-display.md)，不由列表位置回填。

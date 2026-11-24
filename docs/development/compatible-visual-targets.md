# 兼容样式可视化编辑目标

适用版本：0.4.13。导航复用公共树交互，部件、选择器和可编辑属性来自各模式真实能力定义。身份、事件和深浅范围在基础选择器上进一步限定；表中没有的节点不能按原生 DOM 补造。

BLC 两版礼物不再提供盲盒专属部件或免费／普通二级导航，长条表情归大表情。图片能力还需满足绘制盒、伪元素占用与定位条件，见图片部件清册（本地历史记录）及实机验收。

## 代码入口

- `src/themes/compatibleVisualNavigation.ts`：导航与选择范围。
- `src/themes/compatThemeCapabilities.ts`：可编辑属性、单位、继承及范围解析。
- `src/compat/blivechat/theme.ts`、`src/compat/openlive/theme.ts`、`src/compat/laplace/theme.ts`：各版节点和能力。

## 部件清单

### blivechat

| 导航 | 部件键 | 位置／事件 | 支持属性 |
| --- | --- | --- | --- |
| 显示区域 / 事件区 | `eventArea` | main / all | visible, background, paddingX (global), paddingY (global), marginX (global), marginY (global), gap (global), borderWidth (global), borderColor, borderRadius (global), fontFamily, fontSize (global-font), lineHeight (px), color, borderImage |
| 显示区域 / 事件 / 普通事件 | `event` | main / all | visible, background, paddingX (global), paddingY (global), marginX (global), marginY (global), gap (global), borderWidth (global), borderColor, borderRadius (global), fontFamily, fontSize (global-font), lineHeight (px), color, borderImage |
| 显示区域 / 事件 / 普通事件 / 内容区域 | `contentArea` | main / all | visible, background, paddingX (global), paddingY (global), marginX (global), marginY (global), gap (global), borderWidth (global), borderColor, borderRadius (global), borderImage |
| 显示区域 / 事件 / 普通事件 / 卡片结构 / 卡片 | `card` | main / all | visible, background, paddingX (global), paddingY (global), marginX (global), marginY (global), gap (global), borderWidth (global), borderColor, borderRadius (global), borderImage |
| 显示区域 / 事件 / 普通事件 / 卡片结构 / 卡片 / 头部 | `cardHeader` | main / all | visible, background, paddingX (global), paddingY (global), marginX (global), marginY (global), gap (global), borderWidth (global), borderColor, borderRadius (global), borderImage |
| 显示区域 / 事件 / 普通事件 / 卡片结构 / 卡片 / 头部 / 头部信息区 | `cardHeaderContent` | main / all | visible, background, paddingX (global), paddingY (global), marginX (global), marginY (global), gap (global), borderWidth (global), borderColor, borderRadius (global), borderImage |
| 显示区域 / 事件 / 普通事件 / 卡片结构 / 卡片 / 头部 / 头部信息区 / 主信息列 | `cardPrimaryColumn` | main / all | visible, background, paddingX (global), paddingY (global), marginX (global), marginY (global), gap (global), borderWidth (global), borderColor, borderRadius (global), borderImage |
| 显示区域 / 事件 / 普通事件 / 卡片结构 / 卡片 / 头部 / 头部信息区 / 主信息列 / 用户信息行 | `membershipInfoRow` | main / guard | visible, background, paddingX (global), paddingY (global), marginX (global), marginY (global), gap (global), borderWidth (global), borderColor, borderRadius (global), borderImage |
| 显示区域 / 事件 / 置顶事件 | `event` | sticky / all | visible, background, paddingX (global), paddingY (global), marginX (global), marginY (global), gap (global), borderWidth (global), borderColor, borderRadius (global), fontFamily, fontSize (global-font), lineHeight (px), color, borderImage |
| 显示区域 / 事件 / 置顶事件 / 单项背景 | `tickerItem` | sticky / all | visible, background, paddingX (global), paddingY (global), marginX (global), marginY (global), gap (global), borderWidth (global), borderColor, borderRadius (global), borderImage |
| 显示区域 / 事件 / 置顶事件 / 单项背景 / 单项内容 | `tickerItemContent` | sticky / all | visible, background, paddingX (global), paddingY (global), marginX (global), marginY (global), gap (global), borderWidth (global), borderColor, borderRadius (global), borderImage |
| 显示区域 / 事件 / 置顶事件 / 摘要文字 | `amount` | sticky / all | visible, color, fontFamily, fontSize (global-font), lineHeight (px), marginX (global), marginY (global), background, paddingX, paddingY, borderWidth, borderColor, borderRadius, borderImage |
| 显示区域 / 事件 / 置顶事件 / 用户信息 / 头像区域 | `avatarWrap` | sticky / all | visible, background, paddingX (global), paddingY (global), marginX (global), marginY (global), gap (global), borderWidth (global), borderColor, borderRadius (global), borderImage |
| 显示区域 / 事件 / 置顶事件 / 用户信息 / 头像区域 / 头像 | `avatar` | sticky / all | visible, width (global), height (global), marginX (global), marginY (global), borderRadius, paddingX, paddingY, borderWidth, borderColor, borderImage |
| 显示区域 / 事件列表 | `eventList` | main / all | visible, background, paddingX (global), paddingY (global), marginX (global), marginY (global), gap (global), borderWidth (global), borderColor, borderRadius (global), fontFamily, fontSize (global-font), lineHeight (px), color, borderImage |
| 显示区域 / 置顶栏 | `ticker` | sticky / all | visible, background, paddingX (global), paddingY (global), marginX (global), marginY (global), gap (global), borderWidth (global), borderColor, borderRadius (global), borderImage |
| 显示区域 / 置顶栏 / 横向项目列表 | `tickerList` | sticky / all | visible, background, paddingX (global), paddingY (global), marginX (global), marginY (global), gap (global), borderWidth (global), borderColor, borderRadius (global), borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 礼物 / 卡片结构 / 卡片 | `card` | detail / gift | visible, background, paddingX (global), paddingY (global), marginX (global), marginY (global), gap (global), borderWidth (global), borderColor, borderRadius (global), borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 礼物 / 卡片结构 / 卡片 / 头部 | `cardHeader` | detail / gift | visible, background, paddingX (global), paddingY (global), marginX (global), marginY (global), gap (global), borderWidth (global), borderColor, borderRadius (global), borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 礼物 / 卡片结构 / 卡片 / 头部 / 头部信息区 | `cardHeaderContent` | detail / gift | visible, background, paddingX (global), paddingY (global), marginX (global), marginY (global), gap (global), borderWidth (global), borderColor, borderRadius (global), borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 礼物 / 卡片结构 / 卡片 / 头部 / 头部信息区 / 主信息列 | `cardPrimaryColumn` | detail / gift | visible, background, paddingX (global), paddingY (global), marginX (global), marginY (global), gap (global), borderWidth (global), borderColor, borderRadius (global), borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 礼物 / 卡片结构 / 卡片 / 正文区域 | `contentArea` | detail / gift | visible, background, paddingX (global), paddingY (global), marginX (global), marginY (global), gap (global), borderWidth (global), borderColor, borderRadius (global), borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 礼物 / 用户信息 / 头像区域 | `avatarWrap` | detail / gift | visible, background, paddingX (global), paddingY (global), marginX (global), marginY (global), gap (global), borderWidth (global), borderColor, borderRadius (global), borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 礼物 / 用户信息 / 头像区域 / 头像 | `avatar` | detail / gift | visible, width (global), height (global), marginX (global), marginY (global), borderRadius, paddingX, paddingY, borderWidth, borderColor, borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 礼物 / 用户信息 / 用户名 | `username` | detail / gift | visible, color, fontFamily, fontSize (global-font), lineHeight (px), marginX (global), marginY (global), background, paddingX, paddingY, borderWidth, borderColor, borderRadius, borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 礼物 / 事件内容 / 时间 | `timestamp` | detail / gift | visible, color, fontFamily, fontSize (global-font), lineHeight (px), marginX (global), marginY (global), background, paddingX, paddingY, borderWidth, borderColor, borderRadius, borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 礼物 / 事件内容 / 正文 | `message` | detail / gift | visible, color, fontFamily, fontSize (global-font), lineHeight (global-font), marginX (global), marginY (global), background, paddingX, paddingY, borderWidth, borderColor, borderRadius, borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 礼物 / 事件内容 / 价格 | `amount` | detail / gift | visible, color, fontFamily, fontSize (global-font), lineHeight (px), marginX (global), marginY (global), background, paddingX, paddingY, borderWidth, borderColor, borderRadius, borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 醒目留言 / 卡片结构 / 卡片 | `card` | detail / superchat | visible, background, paddingX (global), paddingY (global), marginX (global), marginY (global), gap (global), borderWidth (global), borderColor, borderRadius (global), borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 醒目留言 / 卡片结构 / 卡片 / 头部 | `cardHeader` | detail / superchat | visible, background, paddingX (global), paddingY (global), marginX (global), marginY (global), gap (global), borderWidth (global), borderColor, borderRadius (global), borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 醒目留言 / 卡片结构 / 卡片 / 头部 / 头部信息区 | `cardHeaderContent` | detail / superchat | visible, background, paddingX (global), paddingY (global), marginX (global), marginY (global), gap (global), borderWidth (global), borderColor, borderRadius (global), borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 醒目留言 / 卡片结构 / 卡片 / 头部 / 头部信息区 / 主信息列 | `cardPrimaryColumn` | detail / superchat | visible, background, paddingX (global), paddingY (global), marginX (global), marginY (global), gap (global), borderWidth (global), borderColor, borderRadius (global), borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 醒目留言 / 卡片结构 / 卡片 / 正文区域 | `contentArea` | detail / superchat | visible, background, paddingX (global), paddingY (global), marginX (global), marginY (global), gap (global), borderWidth (global), borderColor, borderRadius (global), borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 醒目留言 / 用户信息 / 头像区域 | `avatarWrap` | detail / superchat | visible, background, paddingX (global), paddingY (global), marginX (global), marginY (global), gap (global), borderWidth (global), borderColor, borderRadius (global), borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 醒目留言 / 用户信息 / 头像区域 / 头像 | `avatar` | detail / superchat | visible, width (global), height (global), marginX (global), marginY (global), borderRadius, paddingX, paddingY, borderWidth, borderColor, borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 醒目留言 / 用户信息 / 用户名 | `username` | detail / superchat | visible, color, fontFamily, fontSize (global-font), lineHeight (px), marginX (global), marginY (global), background, paddingX, paddingY, borderWidth, borderColor, borderRadius, borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 醒目留言 / 事件内容 / 时间 | `timestamp` | detail / superchat | visible, color, fontFamily, fontSize (global-font), lineHeight (px), marginX (global), marginY (global), background, paddingX, paddingY, borderWidth, borderColor, borderRadius, borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 醒目留言 / 事件内容 / 正文 | `message` | detail / superchat | visible, color, fontFamily, fontSize (global-font), lineHeight (global-font), marginX (global), marginY (global), background, paddingX, paddingY, borderWidth, borderColor, borderRadius, borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 醒目留言 / 事件内容 / 价格 | `amount` | detail / superchat | visible, color, fontFamily, fontSize (global-font), lineHeight (px), marginX (global), marginY (global), background, paddingX, paddingY, borderWidth, borderColor, borderRadius, borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 大航海 / 卡片结构 / 卡片 | `card` | detail / guard | visible, background, paddingX (global), paddingY (global), marginX (global), marginY (global), gap (global), borderWidth (global), borderColor, borderRadius (global), borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 大航海 / 卡片结构 / 卡片 / 头部 | `cardHeader` | detail / guard | visible, background, paddingX (global), paddingY (global), marginX (global), marginY (global), gap (global), borderWidth (global), borderColor, borderRadius (global), borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 大航海 / 卡片结构 / 卡片 / 头部 / 头部信息区 | `cardHeaderContent` | detail / guard | visible, background, paddingX (global), paddingY (global), marginX (global), marginY (global), gap (global), borderWidth (global), borderColor, borderRadius (global), borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 大航海 / 卡片结构 / 卡片 / 头部 / 头部信息区 / 主信息列 | `cardPrimaryColumn` | detail / guard | visible, background, paddingX (global), paddingY (global), marginX (global), marginY (global), gap (global), borderWidth (global), borderColor, borderRadius (global), borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 大航海 / 卡片结构 / 卡片 / 头部 / 头部信息区 / 主信息列 / 用户信息行 | `membershipInfoRow` | detail / guard | visible, background, paddingX (global), paddingY (global), marginX (global), marginY (global), gap (global), borderWidth (global), borderColor, borderRadius (global), borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 大航海 / 用户信息 / 头像区域 | `avatarWrap` | detail / guard | visible, background, paddingX (global), paddingY (global), marginX (global), marginY (global), gap (global), borderWidth (global), borderColor, borderRadius (global), borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 大航海 / 用户信息 / 头像区域 / 头像 | `avatar` | detail / guard | visible, width (global), height (global), marginX (global), marginY (global), borderRadius, paddingX, paddingY, borderWidth, borderColor, borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 大航海 / 用户信息 / 用户名 | `username` | detail / guard | visible, color, fontFamily, fontSize (global-font), lineHeight (px), marginX (global), marginY (global), background, paddingX, paddingY, borderWidth, borderColor, borderRadius, borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 大航海 / 用户信息 / 用户信息块 | `userInfo` | detail / guard | visible, background, paddingX (global), paddingY (global), marginX (global), marginY (global), gap (global), borderWidth (global), borderColor, borderRadius (global), borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 大航海 / 用户信息 / 身份徽章 | `identity` | detail / guard | visible, width (global), height (global), marginX (global), marginY (global), paddingX, paddingY, borderWidth, borderColor, borderRadius, borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 大航海 / 用户信息 / 身份徽章 / 大航海徽章 | `guardBadge` | detail / guard | visible, width, height, marginX, marginY, paddingX, paddingY, borderWidth, borderColor, borderRadius, borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 大航海 / 事件内容 / 时间 | `timestamp` | detail / guard | visible, color, fontFamily, fontSize (global-font), lineHeight (px), marginX (global), marginY (global), background, paddingX, paddingY, borderWidth, borderColor, borderRadius, borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 大航海 / 事件内容 / 大航海说明 | `membershipSubtext` | detail / guard | visible, color, fontFamily, fontSize (global-font), lineHeight (px), marginX (global), marginY (global), background, paddingX, paddingY, borderWidth, borderColor, borderRadius, borderImage |
| 用户信息 / 头像区域 | `avatarWrap` | main / all | visible, background, paddingX (global), paddingY (global), marginX (global), marginY (global), gap (global), borderWidth (global), borderColor, borderRadius (global), borderImage |
| 用户信息 / 头像区域 / 头像框 | `avatarFrame` | main / all |  |
| 用户信息 / 头像区域 / 头像 | `avatar` | main / all | visible, width (global), height (global), marginX (global), marginY (global), borderRadius, paddingX, paddingY, borderWidth, borderColor, borderImage |
| 用户信息 / 用户名 | `username` | main / all | visible, color, fontFamily, fontSize (global-font), lineHeight (px), marginX (global), marginY (global), background, paddingX, paddingY, borderWidth, borderColor, borderRadius, borderImage |
| 用户信息 / 用户信息块 | `userInfo` | main / all | visible, background, paddingX (global), paddingY (global), marginX (global), marginY (global), gap (global), borderWidth (global), borderColor, borderRadius (global), borderImage |
| 用户信息 / 身份徽章 | `identity` | main / all | visible, width (global), height (global), marginX (global), marginY (global), paddingX, paddingY, borderWidth, borderColor, borderRadius, borderImage |
| 用户信息 / 身份徽章 / 房管徽章 | `modBadge` | main / danmaku | visible, width, height, marginX, marginY, paddingX, paddingY, borderWidth, borderColor, borderRadius, borderImage |
| 用户信息 / 身份徽章 / 大航海徽章 | `guardBadge` | main / all | visible, width, height, marginX, marginY, paddingX, paddingY, borderWidth, borderColor, borderRadius, borderImage |
| 事件内容 / 正文 | `message` | main / all | visible, color, fontFamily, fontSize (global-font), lineHeight (global-font), marginX (global), marginY (global), background, paddingX, paddingY, borderWidth, borderColor, borderRadius, borderImage |
| 事件内容 / 时间 | `timestamp` | main / all | visible, color, fontFamily, fontSize (global-font), lineHeight (px), marginX (global), marginY (global), background, paddingX, paddingY, borderWidth, borderColor, borderRadius, borderImage |
| 事件内容 / 价格 | `amount` | main / all | visible, color, fontFamily, fontSize (global-font), lineHeight (px), marginX (global), marginY (global), background, paddingX, paddingY, borderWidth, borderColor, borderRadius, borderImage |
| 表情 / 行内表情 | `smallEmote` | main / danmaku | visible, width (global-font), height (global-font), marginX (global), marginY (global), paddingX, paddingY, borderWidth, borderColor, borderRadius, borderImage |
| 表情 / 大表情 | `largeEmote` | main / danmaku | visible, width (global-font), height (global-font), marginX (global), marginY (global), paddingX, paddingY, borderWidth, borderColor, borderRadius, borderImage |
| 礼物 / 礼物描述 | `message` | main / gift | visible, color, fontFamily, fontSize (global-font), lineHeight (global-font), marginX (global), marginY (global), background, paddingX, paddingY, borderWidth, borderColor, borderRadius, borderImage |
| 礼物 / 礼物金额 | `amount` | main / gift | visible, color, fontFamily, fontSize (global-font), lineHeight (px), marginX (global), marginY (global), background, paddingX, paddingY, borderWidth, borderColor, borderRadius, borderImage |
| 醒目留言 / 正文 | `message` | main / superchat | visible, color, fontFamily, fontSize (global-font), lineHeight (global-font), marginX (global), marginY (global), background, paddingX, paddingY, borderWidth, borderColor, borderRadius, borderImage |
| 醒目留言 / 价格 | `amount` | main / superchat | visible, color, fontFamily, fontSize (global-font), lineHeight (px), marginX (global), marginY (global), background, paddingX, paddingY, borderWidth, borderColor, borderRadius, borderImage |
| 大航海 / 大航海说明 | `membershipSubtext` | main / guard | visible, color, fontFamily, fontSize (global-font), lineHeight (px), marginX (global), marginY (global), background, paddingX, paddingY, borderWidth, borderColor, borderRadius, borderImage |

基础选择器按部件维护；特定事件、置顶和详情的覆盖由同一能力定义解析。不要将主事件选择器直接复制到其他位置。

| 部件键 | 基础选择器 |
| --- | --- |
| `avatarFrame` | `#author-photo` |
| `modBadge` | `yt-live-chat-author-badge-renderer[type='moderator'] #image > yt-icon, yt-live-chat-author-badge-renderer[is-admin='true'] #image > yt-icon` |
| `guardBadge` | `yt-live-chat-author-badge-renderer[type='member'] #image > img` |
| `eventArea` | `yt-live-chat-renderer` |
| `eventList` | `yt-live-chat-item-list-renderer #items.yt-live-chat-item-list-renderer` |
| `event` | `yt-live-chat-text-message-renderer, yt-live-chat-paid-message-renderer, yt-live-chat-membership-item-renderer` |
| `username` | `#author-name` |
| `contentArea` | `#content` |
| `card` | `#card` |
| `cardHeader` | `#header` |
| `cardHeaderContent` | `#header-content` |
| `cardPrimaryColumn` | `#header-content-primary-column` |
| `membershipInfoRow` | `#header-content-inner-column` |
| `paidContent` | `#content` |
| `avatarWrap` | `#author-photo` |
| `userInfo` | `yt-live-chat-author-chip` |
| `message` | `#message` |
| `avatar` | `#author-photo img#img` |
| `smallEmote` | `#message .emoji:not(.blc-large-emoji)` |
| `largeEmote` | `#message .emoji.blc-large-emoji` |
| `amount` | `#purchase-amount` |
| `timestamp` | `#timestamp` |
| `identity` | `#chat-badges yt-live-chat-author-badge-renderer` |
| `paidCard` | `#card` |
| `membership` | `#card` |
| `membershipSubtext` | `#header-subtext` |
| `ticker` | `yt-live-chat-ticker-renderer` |
| `tickerItem` | `yt-live-chat-ticker-paid-message-item-renderer` |
| `tickerItemContent` | `#content` |
| `tickerList` | `yt-live-chat-ticker-renderer #items.yt-live-chat-ticker-renderer` |

### blivechat-open

| 导航 | 部件键 | 位置／事件 | 支持属性 |
| --- | --- | --- | --- |
| 显示区域 / 事件区 | `eventArea` | main / all | visible, background, paddingX, paddingY, marginX, marginY, gap, borderWidth, borderColor, borderRadius, fontFamily, fontSize, lineHeight (px), color, borderImage |
| 显示区域 / 事件 / 普通事件 | `event` | main / all | visible, background, paddingX, paddingY, marginX, marginY, gap, borderWidth, borderColor, borderRadius, fontFamily, fontSize, lineHeight (px), color, borderImage |
| 显示区域 / 事件 / 普通事件 / 卡片 | `card` | main / all | visible, background, paddingX, paddingY, marginX, marginY, gap, borderWidth, borderColor, borderRadius, borderImage |
| 显示区域 / 事件 / 普通事件 / 卡片 / 内容区域 | `contentArea` | main / all | visible, background, paddingX, paddingY, marginX, marginY, gap, borderWidth, borderColor, borderRadius, borderImage |
| 显示区域 / 事件 / 普通事件 / 卡片 / 内容区域 / 图文区域 | `imageAndMessage` | main / all | visible, background, paddingX, paddingY, marginX, marginY, gap, borderWidth, borderColor, borderRadius, borderImage |
| 显示区域 / 事件 / 普通事件 / 卡片 / 头部 | `cardHeader` | main / all | visible, background, paddingX, paddingY, marginX, marginY, gap, borderWidth, borderColor, borderRadius, borderImage |
| 显示区域 / 事件 / 普通事件 / 卡片 / 头部 / 头部信息区 | `cardHeaderContent` | main / all | visible, background, paddingX, paddingY, marginX, marginY, gap, borderWidth, borderColor, borderRadius, borderImage |
| 显示区域 / 事件 / 普通事件 / 卡片 / 头部 / 头部信息区 / 主信息列 | `cardPrimaryColumn` | main / all | visible, background, paddingX, paddingY, marginX, marginY, gap, borderWidth, borderColor, borderRadius, borderImage |
| 显示区域 / 事件 / 普通事件 / 卡片 / 头部 / 头部信息区 / 主信息列 / 用户信息行 | `membershipInfoRow` | main / guard | visible, background, paddingX, paddingY, marginX, marginY, gap, borderWidth, borderColor, borderRadius, borderImage |
| 显示区域 / 事件 / 置顶事件 | `event` | sticky / all | visible, background, paddingX, paddingY, marginX, marginY, gap, borderWidth, borderColor, borderRadius, fontFamily, fontSize, lineHeight (px), color, borderImage |
| 显示区域 / 事件 / 置顶事件 / 单项背景 | `tickerItem` | sticky / all | visible, background, paddingX, paddingY, marginX, marginY, gap, borderWidth, borderColor, borderRadius, borderImage |
| 显示区域 / 事件 / 置顶事件 / 单项背景 / 单项内容 | `tickerItemContent` | sticky / all | visible, background, paddingX, paddingY, marginX, marginY, gap, borderWidth, borderColor, borderRadius, borderImage |
| 显示区域 / 事件 / 置顶事件 / 摘要文字 | `amount` | sticky / all | visible, color, fontFamily, fontSize, lineHeight (px), marginX, marginY, background, paddingX, paddingY, borderWidth, borderColor, borderRadius, borderImage |
| 显示区域 / 事件 / 置顶事件 / 用户信息 / 头像区域 | `avatarWrap` | sticky / all | visible, background, paddingX, paddingY, marginX, marginY, gap, borderWidth, borderColor, borderRadius, borderImage |
| 显示区域 / 事件 / 置顶事件 / 用户信息 / 头像区域 / 头像 | `avatar` | sticky / all | visible, width, height, marginX, marginY, borderRadius, paddingX, paddingY, borderWidth, borderColor, borderImage |
| 显示区域 / 事件列表 | `eventList` | main / all | visible, background, paddingX, paddingY, marginX, marginY, gap, borderWidth, borderColor, borderRadius, fontFamily, fontSize, lineHeight (px), color, borderImage |
| 显示区域 / 置顶栏 | `ticker` | sticky / all | visible, background, paddingX, paddingY, marginX, marginY, gap, borderWidth, borderColor, borderRadius, borderImage |
| 显示区域 / 置顶栏 / 横向项目列表 | `tickerList` | sticky / all | visible, background, paddingX, paddingY, marginX, marginY, gap, borderWidth, borderColor, borderRadius, borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 礼物 / 卡片结构 / 卡片 | `card` | detail / gift | visible, background, paddingX, paddingY, marginX, marginY, gap, borderWidth, borderColor, borderRadius, borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 礼物 / 卡片结构 / 卡片 / 头部 | `cardHeader` | detail / gift | visible, background, paddingX, paddingY, marginX, marginY, gap, borderWidth, borderColor, borderRadius, borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 礼物 / 卡片结构 / 卡片 / 头部 / 头部信息区 | `cardHeaderContent` | detail / gift | visible, background, paddingX, paddingY, marginX, marginY, gap, borderWidth, borderColor, borderRadius, borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 礼物 / 卡片结构 / 卡片 / 头部 / 头部信息区 / 主信息列 | `cardPrimaryColumn` | detail / gift | visible, background, paddingX, paddingY, marginX, marginY, gap, borderWidth, borderColor, borderRadius, borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 礼物 / 卡片结构 / 卡片 / 正文区域 | `contentArea` | detail / gift | visible, background, paddingX, paddingY, marginX, marginY, gap, borderWidth, borderColor, borderRadius, borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 礼物 / 用户信息 / 头像区域 | `avatarWrap` | detail / gift | visible, background, paddingX, paddingY, marginX, marginY, gap, borderWidth, borderColor, borderRadius, borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 礼物 / 用户信息 / 头像区域 / 头像 | `avatar` | detail / gift | visible, width, height, marginX, marginY, borderRadius, paddingX, paddingY, borderWidth, borderColor, borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 礼物 / 用户信息 / 用户名 | `username` | detail / gift | visible, color, fontFamily, fontSize, lineHeight (px), marginX, marginY, background, paddingX, paddingY, borderWidth, borderColor, borderRadius, borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 礼物 / 事件内容 / 时间 | `timestamp` | detail / gift | visible, color, fontFamily, fontSize, lineHeight (px), marginX, marginY, background, paddingX, paddingY, borderWidth, borderColor, borderRadius, borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 礼物 / 事件内容 / 价格 | `amount` | detail / gift | visible, color, fontFamily, fontSize, lineHeight (px), marginX, marginY, background, paddingX, paddingY, borderWidth, borderColor, borderRadius, borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 醒目留言 / 卡片结构 / 卡片 | `card` | detail / superchat | visible, background, paddingX, paddingY, marginX, marginY, gap, borderWidth, borderColor, borderRadius, borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 醒目留言 / 卡片结构 / 卡片 / 头部 | `cardHeader` | detail / superchat | visible, background, paddingX, paddingY, marginX, marginY, gap, borderWidth, borderColor, borderRadius, borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 醒目留言 / 卡片结构 / 卡片 / 头部 / 头部信息区 | `cardHeaderContent` | detail / superchat | visible, background, paddingX, paddingY, marginX, marginY, gap, borderWidth, borderColor, borderRadius, borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 醒目留言 / 卡片结构 / 卡片 / 头部 / 头部信息区 / 主信息列 | `cardPrimaryColumn` | detail / superchat | visible, background, paddingX, paddingY, marginX, marginY, gap, borderWidth, borderColor, borderRadius, borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 醒目留言 / 卡片结构 / 卡片 / 正文区域 | `contentArea` | detail / superchat | visible, background, paddingX, paddingY, marginX, marginY, gap, borderWidth, borderColor, borderRadius, borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 醒目留言 / 用户信息 / 头像区域 | `avatarWrap` | detail / superchat | visible, background, paddingX, paddingY, marginX, marginY, gap, borderWidth, borderColor, borderRadius, borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 醒目留言 / 用户信息 / 头像区域 / 头像 | `avatar` | detail / superchat | visible, width, height, marginX, marginY, borderRadius, paddingX, paddingY, borderWidth, borderColor, borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 醒目留言 / 用户信息 / 用户名 | `username` | detail / superchat | visible, color, fontFamily, fontSize, lineHeight (px), marginX, marginY, background, paddingX, paddingY, borderWidth, borderColor, borderRadius, borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 醒目留言 / 事件内容 / 时间 | `timestamp` | detail / superchat | visible, color, fontFamily, fontSize, lineHeight (px), marginX, marginY, background, paddingX, paddingY, borderWidth, borderColor, borderRadius, borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 醒目留言 / 事件内容 / 正文 | `message` | detail / superchat | visible, color, fontFamily, fontSize, lineHeight (px), marginX, marginY, background, paddingX, paddingY, borderWidth, borderColor, borderRadius, borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 醒目留言 / 事件内容 / 价格 | `amount` | detail / superchat | visible, color, fontFamily, fontSize, lineHeight (px), marginX, marginY, background, paddingX, paddingY, borderWidth, borderColor, borderRadius, borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 大航海 / 卡片结构 / 卡片 | `card` | detail / guard | visible, background, paddingX, paddingY, marginX, marginY, gap, borderWidth, borderColor, borderRadius, borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 大航海 / 卡片结构 / 卡片 / 头部 | `cardHeader` | detail / guard | visible, background, paddingX, paddingY, marginX, marginY, gap, borderWidth, borderColor, borderRadius, borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 大航海 / 卡片结构 / 卡片 / 头部 / 头部信息区 | `cardHeaderContent` | detail / guard | visible, background, paddingX, paddingY, marginX, marginY, gap, borderWidth, borderColor, borderRadius, borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 大航海 / 卡片结构 / 卡片 / 头部 / 头部信息区 / 主信息列 | `cardPrimaryColumn` | detail / guard | visible, background, paddingX, paddingY, marginX, marginY, gap, borderWidth, borderColor, borderRadius, borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 大航海 / 卡片结构 / 卡片 / 头部 / 头部信息区 / 主信息列 / 用户信息行 | `membershipInfoRow` | detail / guard | visible, background, paddingX, paddingY, marginX, marginY, gap, borderWidth, borderColor, borderRadius, borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 大航海 / 用户信息 / 头像区域 | `avatarWrap` | detail / guard | visible, background, paddingX, paddingY, marginX, marginY, gap, borderWidth, borderColor, borderRadius, borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 大航海 / 用户信息 / 头像区域 / 头像 | `avatar` | detail / guard | visible, width, height, marginX, marginY, borderRadius, paddingX, paddingY, borderWidth, borderColor, borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 大航海 / 用户信息 / 用户名 | `username` | detail / guard | visible, color, fontFamily, fontSize, lineHeight (px), marginX, marginY, background, paddingX, paddingY, borderWidth, borderColor, borderRadius, borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 大航海 / 用户信息 / 用户信息块 | `userInfo` | detail / guard | visible, background, paddingX, paddingY, marginX, marginY, gap, borderWidth, borderColor, borderRadius, borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 大航海 / 用户信息 / 身份徽章 / 大航海徽章 | `guardBadge` | detail / guard | visible, width, height, marginX, marginY, paddingX, paddingY, borderWidth, borderColor, borderRadius, borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 大航海 / 事件内容 / 时间 | `timestamp` | detail / guard | visible, color, fontFamily, fontSize, lineHeight (px), marginX, marginY, background, paddingX, paddingY, borderWidth, borderColor, borderRadius, borderImage |
| 显示区域 / 置顶栏 / 展开详情 / 大航海 / 事件内容 / 大航海说明 | `membershipSubtext` | detail / guard | visible, color, fontFamily, fontSize, lineHeight (px), marginX, marginY, background, paddingX, paddingY, borderWidth, borderColor, borderRadius, borderImage |
| 用户信息 / 头像区域 | `avatarWrap` | main / all | visible, background, paddingX, paddingY, marginX, marginY, gap, borderWidth, borderColor, borderRadius, borderImage |
| 用户信息 / 头像区域 / 头像框 | `avatarFrame` | main / all |  |
| 用户信息 / 头像区域 / 头像 | `avatar` | main / all | visible, width, height, marginX, marginY, borderRadius, paddingX, paddingY, borderWidth, borderColor, borderImage |
| 用户信息 / 用户名 | `username` | main / all | visible, color, fontFamily, fontSize, lineHeight (px), marginX, marginY, background, paddingX, paddingY, borderWidth, borderColor, borderRadius, borderImage |
| 用户信息 / 用户信息块 | `userInfo` | main / all | visible, background, paddingX, paddingY, marginX, marginY, gap, borderWidth, borderColor, borderRadius, borderImage |
| 用户信息 / 粉丝牌区域 | `fanMedalWrap` | main / all | visible, background, paddingX, paddingY, marginX, marginY, gap, borderWidth, borderColor, borderRadius, borderImage |
| 用户信息 / 粉丝牌区域 / 粉丝牌 | `fanMedal` | main / all | visible, color, background, fontSize, borderWidth, borderColor, borderRadius, paddingX, paddingY, marginX, marginY, borderImage, fontFamily, lineHeight (px) |
| 用户信息 / 粉丝牌区域 / 粉丝牌 / 名称 | `fanMedalName` | main / all | visible, color, fontFamily, fontSize, lineHeight (px), marginX, marginY, background, paddingX, paddingY, borderWidth, borderColor, borderRadius, borderImage |
| 用户信息 / 粉丝牌区域 / 粉丝牌 / 等级 | `fanMedalLevel` | main / all | visible, color, fontFamily, fontSize, lineHeight (px), marginX, marginY, background, paddingX, paddingY, borderWidth, borderColor, borderRadius, borderImage |
| 用户信息 / 身份徽章 | `identity` | main / all | visible, width, height, marginX, marginY, paddingX, paddingY, borderWidth, borderColor, borderRadius, borderImage |
| 用户信息 / 身份徽章 / 房管徽章 | `modBadge` | main / danmaku | visible, width, height, marginX, marginY, paddingX, paddingY, borderWidth, borderColor, borderRadius, borderImage |
| 用户信息 / 身份徽章 / 大航海徽章 | `guardBadge` | main / all | visible, width, height, marginX, marginY, paddingX, paddingY, borderWidth, borderColor, borderRadius, borderImage |
| 事件内容 / 正文 | `message` | main / all | visible, color, fontFamily, fontSize, lineHeight (px), marginX, marginY, background, paddingX, paddingY, borderWidth, borderColor, borderRadius, borderImage |
| 事件内容 / 时间 | `timestamp` | main / all | visible, color, fontFamily, fontSize, lineHeight (px), marginX, marginY, background, paddingX, paddingY, borderWidth, borderColor, borderRadius, borderImage |
| 事件内容 / 价格 | `amount` | main / all | visible, color, fontFamily, fontSize, lineHeight (px), marginX, marginY, background, paddingX, paddingY, borderWidth, borderColor, borderRadius, borderImage |
| 表情 / 行内表情 | `smallEmote` | main / danmaku | visible, width, height, marginX, marginY, paddingX, paddingY, borderWidth, borderColor, borderRadius, borderImage |
| 表情 / 大表情 | `largeEmote` | main / danmaku | visible, width, height, marginX, marginY, paddingX, paddingY, borderWidth, borderColor, borderRadius, borderImage |
| 礼物 / 礼物描述 | `message` | main / gift | visible, color, fontFamily, fontSize, lineHeight (px), marginX, marginY, background, paddingX, paddingY, borderWidth, borderColor, borderRadius, borderImage |
| 礼物 / 礼物金额 | `amount` | main / gift | visible, color, fontFamily, fontSize, lineHeight (px), marginX, marginY, background, paddingX, paddingY, borderWidth, borderColor, borderRadius, borderImage |
| 醒目留言 / 正文 | `message` | main / superchat | visible, color, fontFamily, fontSize, lineHeight (px), marginX, marginY, background, paddingX, paddingY, borderWidth, borderColor, borderRadius, borderImage |
| 醒目留言 / 价格 | `amount` | main / superchat | visible, color, fontFamily, fontSize, lineHeight (px), marginX, marginY, background, paddingX, paddingY, borderWidth, borderColor, borderRadius, borderImage |
| 大航海 / 大航海说明 | `membershipSubtext` | main / guard | visible, color, fontFamily, fontSize, lineHeight (px), marginX, marginY, background, paddingX, paddingY, borderWidth, borderColor, borderRadius, borderImage |

基础选择器按部件维护；特定事件、置顶和详情的覆盖由同一能力定义解析。不要将主事件选择器直接复制到其他位置。

| 部件键 | 基础选择器 |
| --- | --- |
| `avatarFrame` | `#author-photo` |
| `modBadge` | `yt-live-chat-author-badge-renderer #image > yt-icon` |
| `guardBadge` | `yt-live-chat-author-badge-renderer #image > img` |
| `smallEmote` | `#message img.emoji:not(#emoticon):not(.blc-large-emoji):not(.openlive-large-emote), #image-and-message img.emoji:not(#emoticon):not(.blc-large-emoji):not(.openlive-large-emote)` |
| `imageAndMessage` | `#image-and-message` |
| `eventArea` | `yt-live-chat-renderer` |
| `eventList` | `yt-live-chat-item-list-renderer #items.yt-live-chat-item-list-renderer` |
| `event` | `yt-live-chat-text-message-renderer, yt-live-chat-paid-message-renderer, yt-live-chat-membership-item-renderer` |
| `username` | `#author-name` |
| `contentArea` | `#content` |
| `card` | `#card` |
| `cardHeader` | `#header` |
| `cardHeaderContent` | `#header-content` |
| `cardPrimaryColumn` | `#header-content-primary-column` |
| `membershipInfoRow` | `#header-content-inner-column` |
| `paidContent` | `#content` |
| `avatarWrap` | `#author-photo` |
| `userInfo` | `yt-live-chat-author-chip` |
| `message` | `#message` |
| `avatar` | `#author-photo img#img` |
| `largeEmote` | `#image-and-message > img#emoticon, #message img.emoji.blc-large-emoji, #image-and-message img.emoji.blc-large-emoji, #message img.openlive-large-emote` |
| `fanMedal` | `yt-live-chat-author-medal-renderer` |
| `fanMedalWrap` | `#chat-medal` |
| `fanMedalName` | `#medal-name` |
| `fanMedalLevel` | `#medal-level` |
| `identity` | `yt-live-chat-author-badge-renderer` |
| `amount` | `#purchase-amount` |
| `membershipSubtext` | `#header-subtext` |
| `timestamp` | `#timestamp` |
| `paidCard` | `#card` |
| `membership` | `#card` |
| `ticker` | `yt-live-chat-ticker-renderer` |
| `tickerItem` | `yt-live-chat-ticker-paid-message-item-renderer` |
| `tickerItemContent` | `#content` |
| `tickerList` | `yt-live-chat-ticker-renderer #items.yt-live-chat-ticker-renderer` |

### laplace

| 导航 | 部件键 | 位置／事件 | 支持属性 |
| --- | --- | --- | --- |
| 显示区域 / 事件区 | `eventArea` | main / all | visible, background, paddingX (base-font), paddingY (base-font), marginX (base-font), marginY (base-font), gap (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), fontFamily, fontSize (base-font), lineHeight (number), color, borderImage |
| 显示区域 / 事件 / 所有事件 | `allEvents` | main / all | visible, background, paddingX (base-font), paddingY (base-font), marginX (base-font), marginY (base-font), gap (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), fontFamily, fontSize (base-font), lineHeight (number), color, borderImage |
| 显示区域 / 事件 / 普通事件 | `event` | main / all | visible, background, paddingX (base-font), paddingY (base-font), marginX (base-font), marginY (base-font), gap (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), fontFamily, fontSize (base-font), lineHeight (number), color, borderImage |
| 显示区域 / 事件 / 普通事件 / 内容区域 | `contentArea` | main / all | visible, background, paddingX (base-font), paddingY (base-font), marginX (base-font), marginY (base-font), gap (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 显示区域 / 事件 / 普通事件 / 内容区域 / 头部 | `header` | main / all | visible, background, paddingX (base-font), paddingY (base-font), marginX (base-font), marginY (base-font), gap (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 显示区域 / 事件 / 普通事件 / 内容区域 / 元信息区域 | `meta` | main / all | visible, background, paddingX (base-font), paddingY (base-font), marginX (base-font), marginY (base-font), gap (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 显示区域 / 事件 / 普通事件 / 内容区域 / 元信息区域 / 用户名区域 | `usernameWrap` | main / all | visible, background, paddingX (base-font), paddingY (base-font), marginX (base-font), marginY (base-font), gap (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 显示区域 / 事件 / 普通事件 / 内容区域 / 元信息区域 / 时间区域 | `timestampWrap` | main / superchat | visible, background, paddingX (base-font), paddingY (base-font), marginX (base-font), marginY (base-font), gap (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 显示区域 / 事件 / 置顶事件 | `event` | sticky / all | visible, background, paddingX (base-font), paddingY (base-font), marginX (base-font), marginY (base-font), gap (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), fontFamily, fontSize (base-font), lineHeight (number), color, borderImage |
| 显示区域 / 事件 / 置顶事件 / 内容区域 | `contentArea` | sticky / all | visible, background, paddingX (base-font), paddingY (base-font), marginX (base-font), marginY (base-font), gap (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 显示区域 / 事件 / 置顶事件 / 公共部件 / 头像区域 | `avatarWrap` | sticky / all | visible, background, paddingX (base-font), paddingY (base-font), marginX (base-font), marginY (base-font), gap (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 显示区域 / 事件 / 置顶事件 / 公共部件 / 头像区域 / 头像框 | `avatarFrame` | sticky / all | visible, width (base-font), height (base-font), marginX (base-font), marginY (base-font), paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 显示区域 / 事件 / 置顶事件 / 公共部件 / 头像区域 / 头像图片区域 | `avatarImageWrap` | sticky / all | visible, background, paddingX (base-font), paddingY (base-font), marginX (base-font), marginY (base-font), gap (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 显示区域 / 事件 / 置顶事件 / 公共部件 / 头像区域 / 头像图片区域 / 头像 | `avatar` | sticky / all | visible, width (base-font), height (base-font), marginX (base-font), marginY (base-font), borderRadius (base-font), paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderImage |
| 显示区域 / 事件 / 置顶事件 / 公共部件 / 事件图标 | `eventIcon` | sticky / all | visible, width (base-font), height (base-font), marginX (base-font), marginY (base-font), paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 显示区域 / 事件 / 置顶事件 / 公共部件 / 价格 | `amount` | sticky / all | visible, color, fontFamily, fontSize (base-font), lineHeight (number), marginX (base-font), marginY (base-font), background, paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 显示区域 / 事件 / 置顶事件 / 公共部件 / 价格 / 货币符号 | `priceCurrency` | sticky / all | visible, color, fontFamily, fontSize (base-font), lineHeight (number), marginX (base-font), marginY (base-font), background, paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 显示区域 / 事件 / 置顶事件 / 公共部件 / 价格 / 金额数值 | `priceFigure` | sticky / all | visible, color, fontFamily, fontSize (base-font), lineHeight (number), marginX (base-font), marginY (base-font), background, paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 显示区域 / 事件 / 置顶事件 / 公共部件 / 礼物图片区域 | `giftImageWrap` | sticky / gift | visible, background, paddingX (base-font), paddingY (base-font), marginX (base-font), marginY (base-font), gap (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 显示区域 / 事件 / 置顶事件 / 公共部件 / 礼物图片区域 / 礼物图片 | `giftImage` | sticky / gift | visible, width (base-font), height (base-font), marginX (base-font), marginY (base-font), paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 显示区域 / 事件 / 置顶事件 / 公共部件 / 大航海内容 | `guardContent` | sticky / guard | visible, background, paddingX (base-font), paddingY (base-font), marginX (base-font), marginY (base-font), gap (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 显示区域 / 事件列表 | `eventList` | main / all | visible, background, paddingX (base-font), paddingY (base-font), marginX (base-font), marginY (base-font), gap (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), fontFamily, fontSize (base-font), lineHeight (number), color, borderImage |
| 显示区域 / 置顶栏 | `ticker` | sticky / all | visible, background, paddingX (base-font), paddingY (base-font), marginX (base-font), marginY (base-font), gap (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 用户信息 / 头像区域 | `avatarWrap` | main / all | visible, background, paddingX (base-font), paddingY (base-font), marginX (base-font), marginY (base-font), gap (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 用户信息 / 头像区域 / 头像框 | `avatarFrame` | main / all | visible, width (base-font), height (base-font), marginX (base-font), marginY (base-font), paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 用户信息 / 头像区域 / 头像图片区域 | `avatarImageWrap` | main / all | visible, background, paddingX (base-font), paddingY (base-font), marginX (base-font), marginY (base-font), gap (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 用户信息 / 头像区域 / 头像图片区域 / 头像 | `avatar` | main / all | visible, width (base-font), height (base-font), marginX (base-font), marginY (base-font), borderRadius (base-font), paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderImage |
| 用户信息 / 用户名 | `username` | main / all | visible, color, fontFamily, fontSize (base-font), lineHeight (number), marginX (base-font), marginY (base-font), background, paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 用户信息 / 粉丝牌 | `fanMedal` | main / all | visible, fontSize (base-font), color, background, marginX (base-font), marginY (base-font), fontFamily, lineHeight (number), paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font) |
| 用户信息 / 粉丝牌 / 名称内容区 | `fanMedalContent` | main / all | visible, color, fontFamily, fontSize (base-font), lineHeight (number), marginX (base-font), marginY (base-font), background, paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 用户信息 / 粉丝牌 / 名称内容区 / 牌内大航海徽章 | `fanMedalGuard` | main / all | visible, width (base-font), height (base-font), marginX (base-font), marginY (base-font), paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 用户信息 / 粉丝牌 / 等级 | `fanMedalLevel` | main / all | visible, color, fontFamily, fontSize (base-font), lineHeight (number), marginX (base-font), marginY (base-font), background, paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 用户信息 / 身份徽章 / 大航海徽章 | `guardBadge` | main / all | visible, width (base-font), height (base-font), marginX (base-font), marginY (base-font), paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 用户信息 / 身份徽章 / 主播徽章区域 | `streamerBadge` | main / all | visible, background, paddingX (base-font), paddingY (base-font), marginX (base-font), marginY (base-font), gap (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 用户信息 / 身份徽章 / 主播徽章区域 / 主播徽章 | `streamerBadgeIcon` | main / all | visible, width (base-font), height (base-font), marginX (base-font), marginY (base-font), borderRadius (base-font), paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderImage |
| 用户信息 / 身份徽章 / 房管徽章区域 | `modBadge` | main / all | visible, background, paddingX (base-font), paddingY (base-font), marginX (base-font), marginY (base-font), gap (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 用户信息 / 身份徽章 / 房管徽章区域 / 房管徽章 | `modBadgeIcon` | main / all | visible, width (base-font), height (base-font), marginX (base-font), marginY (base-font), borderRadius (base-font), paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderImage |
| 用户信息 / 荣耀勋章 | `wealthMedal` | main / all | visible, background, paddingX (base-font), paddingY (base-font), marginX (base-font), marginY (base-font), gap (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 用户信息 / 荣耀勋章 / 等级文字 | `wealthText` | main / all | visible, color, fontFamily, fontSize (base-font), lineHeight (number), marginX (base-font), marginY (base-font), background, paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 用户信息 / 荣耀勋章 / 图像 | `wealthImage` | main / all | visible, width (base-font), height (base-font), marginX (base-font), marginY (base-font), borderRadius (base-font), paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderImage |
| 用户信息 / 当前排行 | `currentRank` | main / all | visible, color, fontFamily, fontSize (base-font), lineHeight (number), marginX (base-font), marginY (base-font), background, paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 事件内容 / 正文 | `message` | main / all | visible, color, fontFamily, fontSize (base-font), lineHeight (number), marginX (base-font), marginY (base-font), background, paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 事件内容 / 动作文字 | `action` | main / all | visible, color, fontFamily, fontSize (base-font), lineHeight (number), marginX (base-font), marginY (base-font), background, paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 事件内容 / 时间 | `timestamp` | main / all | visible, color, fontFamily, fontSize (base-font), lineHeight (number), marginX (base-font), marginY (base-font), background, paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 事件内容 / 事件图标 | `eventIcon` | main / all | visible, width (base-font), height (base-font), marginX (base-font), marginY (base-font), paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 事件内容 / 价格 | `amount` | main / all | visible, color, fontFamily, fontSize (base-font), lineHeight (number), marginX (base-font), marginY (base-font), background, paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 事件内容 / 价格 / 货币符号 | `priceCurrency` | main / all | visible, color, fontFamily, fontSize (base-font), lineHeight (number), marginX (base-font), marginY (base-font), background, paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 事件内容 / 价格 / 金额数值 | `priceFigure` | main / all | visible, color, fontFamily, fontSize (base-font), lineHeight (number), marginX (base-font), marginY (base-font), background, paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 事件内容 / 平台译文 | `translation` | main / superchat | visible, color, fontFamily, fontSize (base-font), lineHeight (number), marginX (base-font), marginY (base-font), background, paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 表情 / 行内表情区域 | `smallEmoteWrap` | main / danmaku | visible, background, paddingX (base-font), paddingY (base-font), marginX (base-font), marginY (base-font), gap (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 表情 / 行内表情区域 / 行内表情 | `smallEmote` | main / danmaku | visible, width (base-font), height (base-font), marginX (base-font), marginY (base-font), paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 表情 / 大表情区域 | `largeEmoteWrap` | main / danmaku | visible, background, paddingX (base-font), paddingY (base-font), marginX (base-font), marginY (base-font), gap (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 表情 / 大表情区域 / 大表情 | `largeEmote` | main / danmaku | visible, width (base-font), height (base-font), marginX (base-font), marginY (base-font), paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 弹幕 / 回复信息 | `reply` | main / danmaku | visible, background, paddingX (base-font), paddingY (base-font), marginX (base-font), marginY (base-font), gap (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 弹幕 / 回复信息 / 回复头像 | `replyAvatar` | main / danmaku | visible, width (base-font), height (base-font), marginX (base-font), marginY (base-font), borderRadius (base-font), paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderImage |
| 弹幕 / 回复信息 / 回复用户名 | `replyUsername` | main / danmaku | visible, color, fontFamily, fontSize (base-font), lineHeight (number), marginX (base-font), marginY (base-font), background, paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 弹幕 / 剧透片段 | `spoiler` | main / danmaku | visible, color, fontFamily, fontSize (base-font), lineHeight (number), marginX (base-font), marginY (base-font), background, paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 礼物 / 礼物图片区域 | `giftImageWrap` | main / gift | visible, background, paddingX (base-font), paddingY (base-font), marginX (base-font), marginY (base-font), gap (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 礼物 / 礼物图片区域 / 礼物图片 | `giftImage` | main / gift | visible, width (base-font), height (base-font), marginX (base-font), marginY (base-font), paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 礼物 / 礼物名称 | `giftName` | main / gift | visible, color, fontFamily, fontSize (base-font), lineHeight (number), marginX (base-font), marginY (base-font), background, paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 礼物 / 礼物详情 | `giftDetails` | main / gift | visible, color, fontFamily, fontSize (base-font), lineHeight (number), marginX (base-font), marginY (base-font), background, paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 礼物 / 礼物详情 / 乘号 | `giftSymbol` | main / gift | visible, color, fontFamily, fontSize (base-font), lineHeight (number), marginX (base-font), marginY (base-font), background, paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 礼物 / 礼物详情 / 数量 | `giftCount` | main / gift | visible, color, fontFamily, fontSize (base-font), lineHeight (number), marginX (base-font), marginY (base-font), background, paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 礼物 / 礼物详情 / 描述内金额 | `giftDetailPrice` | main / gift | visible, color, fontFamily, fontSize (base-font), lineHeight (number), marginX (base-font), marginY (base-font), background, paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 礼物 / 盲盒信息 | `giftBlind` | main / gift | visible, color, fontFamily, fontSize (base-font), lineHeight (number), marginX (base-font), marginY (base-font), background, paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 礼物 / 盲盒信息 / 盲盒名称 | `giftBlindName` | main / gift | visible, color, fontFamily, fontSize (base-font), lineHeight (number), marginX (base-font), marginY (base-font), background, paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 礼物 / 盲盒信息 / 动作文字 | `giftBlindAction` | main / gift | visible, color, fontFamily, fontSize (base-font), lineHeight (number), marginX (base-font), marginY (base-font), background, paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 礼物 / 盲盒金额 / 支付金额 | `giftPaidPrice` | main / gift | visible, color, fontFamily, fontSize (base-font), lineHeight (number), marginX (base-font), marginY (base-font), background, paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 礼物 / 盲盒金额 / 开出价值 | `giftResultPrice` | main / gift | visible, color, fontFamily, fontSize (base-font), lineHeight (number), marginX (base-font), marginY (base-font), background, paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 礼物 / 盲盒金额 / 涨跌图标 | `giftTrend` | main / gift | visible, width (base-font), height (base-font), marginX (base-font), marginY (base-font), paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 礼物 / 收礼对象 | `giftReceiver` | main / gift | visible, background, paddingX (base-font), paddingY (base-font), marginX (base-font), marginY (base-font), gap (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 礼物 / 收礼对象 / 动作文字 | `giftReceiverAction` | main / gift | visible, color, fontFamily, fontSize (base-font), lineHeight (number), marginX (base-font), marginY (base-font), background, paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 礼物 / 收礼对象 / 收礼者头像 | `giftReceiverAvatar` | main / gift | visible, width (base-font), height (base-font), marginX (base-font), marginY (base-font), borderRadius (base-font), paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderImage |
| 礼物 / 收礼对象 / 收礼者用户名 | `giftReceiverUsername` | main / gift | visible, color, fontFamily, fontSize (base-font), lineHeight (number), marginX (base-font), marginY (base-font), background, paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 醒目留言 / 正文容器 | `body` | main / superchat | visible, background, paddingX (base-font), paddingY (base-font), marginX (base-font), marginY (base-font), gap (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 醒目留言 / 正文 | `message` | main / superchat | visible, color, fontFamily, fontSize (base-font), lineHeight (number), marginX (base-font), marginY (base-font), background, paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 醒目留言 / 价格 | `amount` | main / superchat | visible, color, fontFamily, fontSize (base-font), lineHeight (number), marginX (base-font), marginY (base-font), background, paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 醒目留言 / 价格 / 货币符号 | `priceCurrency` | main / superchat | visible, color, fontFamily, fontSize (base-font), lineHeight (number), marginX (base-font), marginY (base-font), background, paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 醒目留言 / 价格 / 金额数值 | `priceFigure` | main / superchat | visible, color, fontFamily, fontSize (base-font), lineHeight (number), marginX (base-font), marginY (base-font), background, paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 醒目留言 / 剧透片段 | `spoiler` | main / superchat | visible, color, fontFamily, fontSize (base-font), lineHeight (number), marginX (base-font), marginY (base-font), background, paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 醒目留言 / 删除状态 | `deleted` | main / superchat | visible, width (base-font), height (base-font), paddingX (base-font), paddingY (base-font), marginX (base-font), marginY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 醒目留言 / 平台译文 | `translation` | main / superchat | visible, color, fontFamily, fontSize (base-font), lineHeight (number), marginX (base-font), marginY (base-font), background, paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 大航海 / 大航海内容 | `guardContent` | main / guard | visible, background, paddingX (base-font), paddingY (base-font), marginX (base-font), marginY (base-font), gap (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 大航海 / 大航海内容 / 动作文字 | `action` | main / guard | visible, color, fontFamily, fontSize (base-font), lineHeight (number), marginX (base-font), marginY (base-font), background, paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 大航海 / 大航海内容 / 大航海类型 | `guardType` | main / guard | visible, color, fontFamily, fontSize (base-font), lineHeight (number), marginX (base-font), marginY (base-font), background, paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 大航海 / 大航海内容 / 时长 / 乘号 | `guardSymbol` | main / guard | visible, color, fontFamily, fontSize (base-font), lineHeight (number), marginX (base-font), marginY (base-font), background, paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 大航海 / 大航海内容 / 时长 / 数量 | `guardFigure` | main / guard | visible, color, fontFamily, fontSize (base-font), lineHeight (number), marginX (base-font), marginY (base-font), background, paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 大航海 / 大航海内容 / 时长 / 单位 | `guardUnit` | main / guard | visible, color, fontFamily, fontSize (base-font), lineHeight (number), marginX (base-font), marginY (base-font), background, paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 大航海 / 大航海内容 / 陪伴天数 / 前缀 | `guardDaysBefore` | main / guard | visible, color, fontFamily, fontSize (base-font), lineHeight (number), marginX (base-font), marginY (base-font), background, paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 大航海 / 大航海内容 / 陪伴天数 / 天数 | `guardDays` | main / guard | visible, color, fontFamily, fontSize (base-font), lineHeight (number), marginX (base-font), marginY (base-font), background, paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 大航海 / 大航海内容 / 陪伴天数 / 后缀 | `guardDaysAfter` | main / guard | visible, color, fontFamily, fontSize (base-font), lineHeight (number), marginX (base-font), marginY (base-font), background, paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 红包与天选 / 红包 / 动作文字 | `action` | main / redStart | visible, color, fontFamily, fontSize (base-font), lineHeight (number), marginX (base-font), marginY (base-font), background, paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 红包与天选 / 红包 / 活动标题 | `redTitle` | main / redStart | visible, color, fontFamily, fontSize (base-font), lineHeight (number), marginX (base-font), marginY (base-font), background, paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 红包与天选 / 红包 / 奖励列表 | `rewardList` | main / redStart | visible, background, paddingX (base-font), paddingY (base-font), marginX (base-font), marginY (base-font), gap (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 红包与天选 / 红包 / 奖励列表 / 奖励项 | `rewardItem` | main / redStart | visible, background, paddingX (base-font), paddingY (base-font), marginX (base-font), marginY (base-font), gap (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 红包与天选 / 红包 / 奖励列表 / 奖励项 / 数量 | `rewardCount` | main / redStart | visible, color, fontFamily, fontSize (base-font), lineHeight (number), marginX (base-font), marginY (base-font), background, paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 红包与天选 / 红包 / 奖励列表 / 奖励项 / 图片区域 | `rewardPicture` | main / redStart | visible, background, paddingX (base-font), paddingY (base-font), marginX (base-font), marginY (base-font), gap (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 红包与天选 / 红包 / 奖励列表 / 奖励项 / 图片区域 / 图片 | `rewardImage` | main / redStart | visible, width (base-font), height (base-font), marginX (base-font), marginY (base-font), borderRadius (base-font), paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderImage |
| 红包与天选 / 红包 / 红包图标 | `eventIcon` | main / redStart | visible, width (base-font), height (base-font), marginX (base-font), marginY (base-font), paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 红包与天选 / 红包 / 价格 | `amount` | main / redStart | visible, color, fontFamily, fontSize (base-font), lineHeight (number), marginX (base-font), marginY (base-font), background, paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 红包与天选 / 天选 / 标题与奖品 | `lotteryMessage` | main / lotteryStart | visible, color, fontFamily, fontSize (base-font), lineHeight (number), marginX (base-font), marginY (base-font), background, paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 红包与天选 / 天选 / 标题与奖品 / 奖品 | `lotteryPrize` | main / lotteryStart | visible, color, fontFamily, fontSize (base-font), lineHeight (number), marginX (base-font), marginY (base-font), background, paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 红包与天选 / 天选 / 参与条件 | `lotteryRequirements` | main / lotteryStart | visible, color, fontFamily, fontSize (base-font), lineHeight (number), marginX (base-font), marginY (base-font), background, paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 红包与天选 / 天选 / 参与条件 / 条件值 | `lotteryGiftName` | main / lotteryStart | visible, color, fontFamily, fontSize (base-font), lineHeight (number), marginX (base-font), marginY (base-font), background, paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 红包与天选 / 天选 / 参与礼物 / 价格 | `lotteryGiftPrice` | main / lotteryStart | visible, color, fontFamily, fontSize (base-font), lineHeight (number), marginX (base-font), marginY (base-font), background, paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 红包与天选 / 天选 / 天选图标 | `eventIcon` | main / lotteryStart | visible, width (base-font), height (base-font), marginX (base-font), marginY (base-font), paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 红包与天选 / 中奖 / 全部中奖 / 中奖内容 | `winnerContent` | main / winners | visible, background, paddingX (base-font), paddingY (base-font), marginX (base-font), marginY (base-font), gap (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 红包与天选 / 中奖 / 全部中奖 / 中奖内容 / 名单标题（含人数） | `winnerTitle` | main / winners | visible, color, fontFamily, fontSize (base-font), lineHeight (number), marginX (base-font), marginY (base-font), background, paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 红包与天选 / 中奖 / 全部中奖 / 中奖内容 / 展开按钮 | `winnerToggle` | main / winners | visible, color, fontFamily, fontSize (base-font), lineHeight (number), marginX (base-font), marginY (base-font), background, paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 红包与天选 / 中奖 / 全部中奖 / 中奖内容 / 名单遮罩 | `winnerMask` | main / winners | visible, background, paddingX (base-font), paddingY (base-font), marginX (base-font), marginY (base-font), gap (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 红包与天选 / 中奖 / 全部中奖 / 中奖内容 / 名单遮罩 / 中奖列表 | `winnerList` | main / winners | visible, background, paddingX (base-font), paddingY (base-font), marginX (base-font), marginY (base-font), gap (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 红包与天选 / 中奖 / 全部中奖 / 中奖内容 / 名单遮罩 / 中奖列表 / 中奖项 | `winnerItem` | main / winners | visible, background, paddingX (base-font), paddingY (base-font), marginX (base-font), marginY (base-font), gap (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 红包与天选 / 中奖 / 全部中奖 / 中奖内容 / 名单遮罩 / 中奖列表 / 中奖项 / 中奖头像 | `winnerAvatar` | main / winners | visible, width (base-font), height (base-font), marginX (base-font), marginY (base-font), borderRadius (base-font), paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderImage |
| 红包与天选 / 中奖 / 红包中奖 / 中奖内容 | `winnerContent` | main / redResult | visible, background, paddingX (base-font), paddingY (base-font), marginX (base-font), marginY (base-font), gap (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 红包与天选 / 中奖 / 红包中奖 / 中奖内容 / 名单标题（含人数） | `winnerTitle` | main / redResult | visible, color, fontFamily, fontSize (base-font), lineHeight (number), marginX (base-font), marginY (base-font), background, paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 红包与天选 / 中奖 / 红包中奖 / 中奖内容 / 展开按钮 | `winnerToggle` | main / redResult | visible, color, fontFamily, fontSize (base-font), lineHeight (number), marginX (base-font), marginY (base-font), background, paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 红包与天选 / 中奖 / 红包中奖 / 中奖内容 / 名单遮罩 | `winnerMask` | main / redResult | visible, background, paddingX (base-font), paddingY (base-font), marginX (base-font), marginY (base-font), gap (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 红包与天选 / 中奖 / 红包中奖 / 中奖内容 / 名单遮罩 / 中奖列表 | `winnerList` | main / redResult | visible, background, paddingX (base-font), paddingY (base-font), marginX (base-font), marginY (base-font), gap (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 红包与天选 / 中奖 / 红包中奖 / 中奖内容 / 名单遮罩 / 中奖列表 / 中奖项 | `winnerItem` | main / redResult | visible, background, paddingX (base-font), paddingY (base-font), marginX (base-font), marginY (base-font), gap (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 红包与天选 / 中奖 / 红包中奖 / 中奖内容 / 名单遮罩 / 中奖列表 / 中奖项 / 中奖头像 | `winnerAvatar` | main / redResult | visible, width (base-font), height (base-font), marginX (base-font), marginY (base-font), borderRadius (base-font), paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderImage |
| 红包与天选 / 中奖 / 天选中奖 / 中奖内容 | `winnerContent` | main / lotteryResult | visible, background, paddingX (base-font), paddingY (base-font), marginX (base-font), marginY (base-font), gap (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 红包与天选 / 中奖 / 天选中奖 / 中奖内容 / 名单标题（含人数） | `winnerTitle` | main / lotteryResult | visible, color, fontFamily, fontSize (base-font), lineHeight (number), marginX (base-font), marginY (base-font), background, paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 红包与天选 / 中奖 / 天选中奖 / 中奖内容 / 展开按钮 | `winnerToggle` | main / lotteryResult | visible, color, fontFamily, fontSize (base-font), lineHeight (number), marginX (base-font), marginY (base-font), background, paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 红包与天选 / 中奖 / 天选中奖 / 中奖内容 / 名单遮罩 | `winnerMask` | main / lotteryResult | visible, background, paddingX (base-font), paddingY (base-font), marginX (base-font), marginY (base-font), gap (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 红包与天选 / 中奖 / 天选中奖 / 中奖内容 / 名单遮罩 / 中奖列表 | `winnerList` | main / lotteryResult | visible, background, paddingX (base-font), paddingY (base-font), marginX (base-font), marginY (base-font), gap (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 红包与天选 / 中奖 / 天选中奖 / 中奖内容 / 名单遮罩 / 中奖列表 / 中奖项 | `winnerItem` | main / lotteryResult | visible, background, paddingX (base-font), paddingY (base-font), marginX (base-font), marginY (base-font), gap (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 红包与天选 / 中奖 / 天选中奖 / 中奖内容 / 名单遮罩 / 中奖列表 / 中奖项 / 中奖头像 | `winnerAvatar` | main / lotteryResult | visible, width (base-font), height (base-font), marginX (base-font), marginY (base-font), borderRadius (base-font), paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderImage |
| 系统 / 禁言操作者 | `muteOperator` | main / system | visible, color, fontFamily, fontSize (base-font), lineHeight (number), marginX (base-font), marginY (base-font), background, paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |
| 系统 / 禁言时长 | `muteDuration` | main / system | visible, color, fontFamily, fontSize (base-font), lineHeight (number), marginX (base-font), marginY (base-font), background, paddingX (base-font), paddingY (base-font), borderWidth (base-font), borderColor, borderRadius (base-font), borderImage |

基础选择器按部件维护；特定事件、置顶和详情的覆盖由同一能力定义解析。不要将主事件选择器直接复制到其他位置。

| 部件键 | 基础选择器 |
| --- | --- |
| `guardType` | `.toast-details-type` |
| `guardSymbol` | `.toast-details-symbol` |
| `guardFigure` | `.toast-details-figure` |
| `guardUnit` | `.toast-details-unit` |
| `guardDaysBefore` | `.toast-details-total-days-text-before` |
| `guardDays` | `.toast-details-total-days` |
| `guardDaysAfter` | `.toast-details-total-days-text-after` |
| `winnerTitle` | `.details-name` |
| `winnerToggle` | `.toggle-button` |
| `redTitle` | `.red-envelope-start-details-name` |
| `rewardCount` | `.rewards-item-count` |
| `lotteryMessage` | `.lottery-start-details-message` |
| `lotteryPrize` | `.lottery-start-details-message b` |
| `lotteryRequirements` | `.lottery-start-details-requirements` |
| `lotteryGiftName` | `.lottery-start-details-requirements b` |
| `lotteryGiftPrice` | `.lottery-start-details-requirements .price` |
| `muteOperator` | `.block-operator` |
| `muteDuration` | `.block-duration` |
| `wealthText` | `.wealth-medal-text` |
| `header` | `.top` |
| `meta` | `.meta` |
| `usernameWrap` | `.username-wrap` |
| `timestampWrap` | `.timestamp-wrap` |
| `body` | `.message` |
| `winnerContent` | `.event--red-envelope-result > .content, .event--lottery-result > .content` |
| `winnerMask` | `.rewards-items-mask` |
| `winnerList` | `.rewards-items-wrap` |
| `winnerItem` | `.list-item-wrap` |
| `rewardList` | `.red-envelope-start-rewards` |
| `rewardItem` | `.rewards-item-wrap` |
| `rewardPicture` | `.rewards-item-picture-wrap` |
| `deleted` | `.deleted-badge` |
| `winnerAvatar` | `.list-item-wrap img.avatar` |
| `rewardImage` | `.rewards-item-picture-wrap img` |
| `streamerBadgeIcon` | `.streamer-badge-wrap svg` |
| `modBadgeIcon` | `.mod-badge-wrap svg` |
| `wealthImage` | `.wealth-medal img` |
| `allEvents` | `.event-list .event, .gift-sticky-bar .event` |
| `ticker` | `.gift-sticky-bar` |
| `eventArea` | `.events-list-wrap` |
| `eventList` | `.event-list` |
| `event` | `.event` |
| `username` | `.username` |
| `contentArea` | `.event > .content` |
| `avatarWrap` | `.avatar-wrap:not(.reply .avatar-wrap):not(.gift-receiver .avatar-wrap):not(.list-item-wrap .avatar-wrap)` |
| `avatarFrame` | `.avatar-frame:not(.reply *):not(.gift-receiver *):not(.list-item-wrap *)` |
| `avatarImageWrap` | `.avatar-img-wrap:not(.reply *):not(.gift-receiver *):not(.list-item-wrap *)` |
| `action` | `.toast-details-action, .red-envelope-start-details-action` |
| `eventIcon` | `.gift-icon-wrap:not(.gift-image-wrap), .toast-icon-wrap, .red-envelope-start-icon-wrap, .lottery-start-icon-wrap` |
| `message` | `.message-text, .message:not(:has(.message-text))` |
| `translation` | `.message-translation` |
| `reply` | `.reply` |
| `replyAvatar` | `.reply .avatar-wrap` |
| `replyUsername` | `.reply-username` |
| `spoiler` | `.spoiler` |
| `giftImageWrap` | `.gift-image-wrap` |
| `giftImage` | `.gift-image-wrap img` |
| `giftName` | `.gift-details-name` |
| `giftDetails` | `.gift-details` |
| `giftSymbol` | `.gift-details-symbol` |
| `giftCount` | `.gift-details-figure` |
| `giftDetailPrice` | `.gift-details-price` |
| `giftBlind` | `.gift-blind` |
| `giftBlindName` | `.gift-blind-name` |
| `giftBlindAction` | `.gift-blind-action` |
| `giftPaidPrice` | `.price-actual` |
| `giftResultPrice` | `.price > .price-currency, .price > .price-figure` |
| `giftTrend` | `.price-blind-result svg` |
| `giftReceiver` | `.gift-receiver` |
| `giftReceiverAction` | `.gift-receiver-action` |
| `giftReceiverAvatar` | `.gift-receiver .avatar-wrap` |
| `giftReceiverUsername` | `.gift-receiver-username` |
| `priceCurrency` | `.price-currency` |
| `priceFigure` | `.price-figure` |
| `smallEmoteWrap` | `.bmote-wrap, .emote-wrap:not(.emote-wrap--large)` |
| `largeEmoteWrap` | `.emote-wrap--large` |
| `guardContent` | `.event--toast > .content` |
| `avatar` | `.avatar-wrap:not(.reply .avatar-wrap):not(.gift-receiver .avatar-wrap):not(.list-item-wrap .avatar-wrap) img.avatar` |
| `fanMedal` | `.fans-medal` |
| `fanMedalContent` | `.fans-medal-content` |
| `fanMedalGuard` | `.guard-badge-in-fans-medal` |
| `fanMedalLevel` | `.fans-medal-level` |
| `guardBadge` | `.guard-badge-in-meta` |
| `streamerBadge` | `.streamer-badge-wrap` |
| `modBadge` | `.mod-badge-wrap` |
| `wealthMedal` | `.wealth-medal` |
| `currentRank` | `.current-rank` |
| `badge` | `.guard-badge, .mod-badge-wrap, .streamer-badge-wrap, .wealth-medal, .current-rank` |
| `smallEmote` | `.bmote, .emote:not(.emote--large)` |
| `largeEmote` | `.emote--large` |
| `amount` | `.price` |
| `activity` | `.red-envelope-start-details, .red-envelope-start-details-action, .lottery-start-details-message, .lottery-start-details-requirements, .details-name, .rewards-items-wrap` |
| `timestamp` | `.timestamp` |

# 原生事件 DOM 与样式契约

原生主题系统以本契约中的公开语义节点为样式边界。内置主题和自定义主题使用同一套选择器、预览组件与运行时消费链；主题来源不改变事件 DOM。

样式版本 **1**。现场、回看、弹幕窗、收益窗及事件预览共用事件行和身份部件；公共选择器、部件关系与参数在本篇维护。显示开关、资源策略和金额口径见[事件显示](../features/event-display.md)，交互约定见 [UX-CONTRACT.md](../specifications/UX-CONTRACT.md)。

## 区域与列表

主题的事件类型开关只控制 OBS；分类细项控制副窗口与 OBS。现场完全使用现场筛选，不读取主题事件开关。副窗口的大分类跟随现场，并保留副窗口自身的弹幕、互动总开关；副窗口不读取现场分类细项、搜索或用户筛选。OBS 不读取现场和副窗口的事件类型筛选。样式编辑预览展示完整支持案例，独立事件筛选用于检查单类或多类；主题部件的显示／隐藏属性继续即时生效。主题大类关闭后，细项仍可编辑。

| 区域 | 公共选择器 |
| --- | --- |
| 现场 | `.event-area.live` |
| 回看时间线、事件检索、收藏 | `.event-area.review` |
| 弹幕窗 | `.event-area.window.window-chat` |
| 收益窗 | `.event-area.window.window-pay` |
| OBS | `.event-area.obs` |

回看事件使用 `.event.event-surface-archive` 的独立基础样式，时间线、跨场次检索、收藏及上下文统一按回看布局渲染。回看不消费现场主题、主题可视化或公共事件外观参数。其字号、头像、头像框、身份标记、粉丝牌、等级与排名、图标及统一文字颜色由独立的“样式设置”保存；基准字号仅提供数值输入，身份标记形式以一个“图标／文字”选项统一控制大航海、主播、房管及荣耀勋章，不改动现场主题。回看字重、深浅配色、事件背景及徽章外观沿用原生默认基线，保留独立紧凑布局；时间始终使用实际事件时间。独立的“按价格梯度配色”默认关闭，开启后普通礼物、盲盒和醒目留言复用原生默认的七档金额及明暗配色；大航海等事件保留固定配色。统一文字颜色启用时仍优先覆盖文字，梯度背景保留。事件筛选与采集、归档规则不变。

回看内容连续行内排列，不强制分开元信息、正文、盲盒来源和系统说明。公共内容外层使用块级盒，内部部件继续行内排列；各事件类型及子分类共用此规则，不使用逐类型纵向偏移。开奖名单横向排列，每项头像和姓名垂直居中，宽度不足自动换行。元素以自然间距相接，宽度不足才折行；撤回标记带边框、透明底，跟随正文。头像和时间对整条事件垂直居中，事件图标与文字在所在行居中，系统消息图标使用正文同号尺寸。回看菜单在14px基准字号下使用24px按钮与16px图标，随基准字号同比缩放。菜单悬停、键盘聚焦、展开和收藏常驻的高光与现场共用软件表面色和强调色，随软件配色与明暗更新；回看不因此读取现场主题，收藏与标记仍使用各自的状态色。回看保留同一套公共语义部件和素材，购买图标直接复用 `GuardPurchaseIcon` 的身份与基础、千舰素材选择，成就复用内置荣誉勋章。

回看的 `.review-uniform-text` 表示启用了统一文字颜色。浅色的姓名、正文、辅助文字依次为 `rgb(7, 16, 29)`、`rgb(25, 39, 59)`、`rgb(75, 85, 99)`；深色依次为 `rgb(222, 225, 229)`、`rgb(205, 212, 221)`、`rgb(170, 180, 193)`。文字不再使用身份、金额、盈亏或成就特征色；背景、身份徽章、粉丝牌和图片本身配色保持不变。

区域带 `data-style-api="1"`，内部列表为 `.event-list`，普通事件使用 `.event-list .event`，置顶事件为 `.event.event-sticky`；`.event` 表达两者共用样式。预览使用所选区域的相同契约与排版。副窗公共区域只覆盖事件日志，窗口拖拽、缩放、表面与特效层在区域之外；内部窗口标识为 `display`、`gift`（组合）、`gift-only`、`superchat`、`guard`。三个收益子窗沿用 `.event-area.window.window-pay`，普通行和固定卡片按各自类别显示，复用原有公共部件和参数。

公开区域与事件节点为 `.event-area`、`.sticky-area`、`.event-list` 和 `.event`，置顶事件增加 `.event-sticky`，稳定包含关系使用 `.event-area .sticky-area`、`.event-area .event-list`、`.sticky-area .event.event-sticky` 与 `.event-list .event`。公共契约不承诺这些节点在字面 DOM 中互为直接子节点；虚拟列表槽位、测量容器、场次分组和布局包装可以位于中间，主题选择器不得依赖包装层数。

预览区域额外带 `.preview`，同时保留所模拟的 `.live`、`.review`、`.window` 或 `.obs`；真实 OBS 不带 live。`theme-target-*` 保留为软件加载样式的目标标记，主题按公开区域类区分用途。

回看时间线的列表为 `.event-list.timeline`，场次边界使用 `.session-marker`。这些类落在已有列表和边界节点上。阅读、折叠和动画状态只在有对应事实与用途时公开，不为候选项生成空状态。

## DOM 查阅边界

三套原生主题共用普通事件树，回看使用独立分支，置顶使用 StickyEventCard；主题排版由实际语义盒子承载，不使用 display:contents。普通列表的排列与上下对齐由 event-list 承担；现场保留虚拟总高度画布，回看列表自身承担总高度。行槽位默认一层，带独立缩放配置的列表固定分开外层测量定位与内层缩放内容，包含100%缩放；间距、容器查询和整行菜单继续由内容槽位承担。置顶区域统一为单层 sticky-area，滚动与排列使用同一盒子，动画宿主单独保留。以下路径用于描述当前结构，不承诺私有包装永远保持相同层级。

- 普通弹幕与互动：event 直接组合可选 avatar-wrap、user、content 和 time。user 内为 rank-badge、username、badges；badges 内保持各徽章。user、badges 使用 inline-flex 并允许换行，组内使用 gap，整体与外部正文按行内盒参与排版。正文不强制另起一行。有头像时，user 最大宽度扣除头像宽度及头像、user 各自的右间距，保证用户信息在头像旁内部换行；关闭头像时不保留这部分宽度。
- 礼物与大航海：event 直接组合头像、用户信息、正文与时间。content 内动作、主图、名称组合、主金额同级；盲盒来源图标位于已有 blind-gift 内，与名称、条件数量、来源价格、动作及差额同级。content 与 blind-gift 均使用 inline-flex / wrap / gap；来源组以 flex-basis:100% 独立成行，图标左对齐。主礼物部件、来源组及来源组内部各自可用 order 调序，不增加节点。回看保留独立结构和行内排版。
- 醒目留言：event 直接包含 info、content 和可选 time。原生默认仅在交界两侧添加 padding：info 底部0.25B、content 顶部0.25B；info 顶部、content 底部及左右均不额外填充。两部分之间不叠加 margin，事件外层内边距沿用原值。卡片、轻量气泡及置顶沿用各自原有填充。info 内 avatar-wrap、user、price、event-icon 同级；content 内 message、bili-translation、status.deleted 按条件生成。info 使用 flex 并允许换行，价格与图标保持独立部件。
- 成就：event 直接组合头像、真实成就图片与 content；原生默认上下内边距0.5B、左右0.75B，显式 event-padding 优先；图标尺寸和双边框位置保持独立。正文保留 honor-message、honor-heading、honor-summary 和高亮片段。不生成空 user。
- 活动：event 直接组合现有头像、标题或用户、图标、content、activity-status 与时间。开奖不生成头像和首位中奖用户摘要；winner-list 与 content 同属 event，名单与倒计时保持对应位置，展开项保留真实列表语义。`winner-list.is-expanded` 跟随原生 details 展开状态；`event-row-slot-content.event-spacing-enabled` 表示槽位包含事件间距。
- 系统：content 同时带 system-message，包含可选 event-icon.system-message-icon 和 system-message-copy；文字组内为 system-message-title 与可选 message.system-message-detail。标题含 message，涉及用户时另有头像、user；开播／下播时间在标题内。封禁期限使用 time.system-message-expiry，与标题和详情同属 system-message-copy，不受事件时间开关控制。
- 回看：event 内头像、event-body、右侧 time 并列；event-body 直接组合原有用户、正文与名单，正文主体使用块级盒。
- 置顶：event.event-sticky 内依次为可选头像、content、可选末尾图标；动画宿主保留在事件外。

普通事件根承担表面与布局；回看的 event-body 保留左右排版职责。系统文字组合、图片播放按钮、头像框、徽章、数量、价格、时长和 details/summary/ul/li 均保留实际职责。info 为醒目留言信息组的公开类。

用户信息和徽章组内默认 column-gap 为0.25B、row-gap 为0.125B；16px基准时为左右4px、上下2px，24px时为左右6px、上下3px。单行不增加上下空白；不在内部子项叠加右 margin。弹幕头像和用户信息组与外部内容使用右 margin，不做负间距补偿。弹幕正文 message 不加右 margin，repeat-count 保留左 margin。隐藏或未挂载的组内部件不留 gap；各组内 align-items:center，行内整体 vertical-align:middle，字体、行高和尺寸从基准参数消费。系统标题使用 block 承载行内排版，用户信息与标题文字共用文本基线，文字按字符自然接续换行。头像容器占用一个标题行高，内部图片保持原尺寸并居中，外侧图标对齐首行；头像右间距和开播／下播标题末尾间距为0.25B，时间换行不保留左侧缩进；系统图标对齐标题第一行，成就使用明确的二维区域。

`data-style-api="1"` 是区域版本，`data-rank` 是排名值。粉丝牌 fan-medal、荣耀徽章 wealth-medal 和大航海徽章 guard-badge 的 data-level 为对应部件的真实等级；缺失等级不生成该属性，大航海沿用公开编号1总督、2提督、3舰长。事件根的 data-event-role / data-event-style-type / data-event-layout / data-event-surface / data-event-emote、活动 data-activity-*、粉丝牌 data-event-medal-palette、区域 scope 及定位 ID 用于当前实现，不作为主题属性选择器接口。原始 DOM 可以展示它们，主题应使用公开类。置顶 aria-description 提供剩余秒数；time 的 dateTime 提供完整时间，回看右侧 time 当前只输出格式化文本。

## 事件类型

| 模型事件 | 根类型 | 子类 |
| --- | --- | --- |
| Danmu | `type-chat` | 自动发送为 `chat-auto`；用户明确未验证手机号为 `chat-phone-unverified`；两者可共存 |
| Gift | `type-gift` | `gift-blind`、`gift-free`、`gift-normal`；按盲盒、免费、普通的优先级选一个 |
| SuperChat | `type-superchat` | — |
| GuardBuy | `type-guard` | — |
| GuardHonor | `type-guard-honor` | — |
| Interact | `type-interaction` | 已解析种类为 `interact-entry`、`interact-follow`、`interact-share`、`interact-special-follow`、`interact-mutual-follow`、`interact-like`；未解析种类不补子类 |
| 历史 EntryEffect | `type-interaction` | `interact-entry-effect` |
| AnchorLotStart / AnchorLotAward | `type-lottery` | `lottery-start` / `lottery-result` |
| RedPocketStart / RedPocketWinner | `type-redpocket` | `redpocket-start` / `redpocket-result` |
| RedPocketGift | 不生成可见行 | 已停用的历史事件 |
| Recall | 不生成可见行 | 更新原消息的撤回状态 |
| RoomBlock | `type-system` | `system-user-block` |
| RoomSilent | `type-system` | `system-room-silent` |
| AdminChange | `type-system` | `system-admin-change` |
| RoomChange | `type-system` | `system-room-change` |
| CoverAudit | 不生成可见行 | 保留原始协议和归档 |
| LiveStart / LiveEnd / Warning / CutOff / RoomLock | `type-live-status` | `live-start` / `live-end` / `live-warning` / `live-cutoff` / `live-locked` |
| Unknown | `type-unknown` | — |

WatchedChange、OnlineRank、LikeUpdate、FansUpdate 更新统计；ScDeleted 更新原醒目留言，不新增显示行。根类型来自标准事件投影，协议枚举、内部身份等级与数据库结构保持原口径。

自动弹幕由原始 `DANMU_MSG.info[0][9]` 的数值非零标记识别，`.event.type-chat.chat-auto` 仅描述自动发送属性，不新增图标或徽章。未携带标记的旧记录不补子类。全局“显示自动弹幕”默认开启，关闭后各显示宿主在列表投影时过滤；不影响采集、归档或导出。弹幕窗先过滤、后按原内容和时间范围合并，自动与普通消息可合并；合并行的公共类型沿用代表事件，计数包括实际参与的消息。设置切换从未合并缓冲重新投影，保持普通消息与计数正确。

手机号验证状态从 `DANMU_MSG.info[2][6]` 读取：1为已验证、0为未验证，缺失或未识别取值保持未知；没有可靠数组值时沿用已有用户资料中的显式状态。`.event.type-chat.chat-phone-unverified` 仅在事件用户 `phoneVerified=false` 时生成，不新增可见徽章，不扩展到其他事件类型。全局“显示未验证手机号用户弹幕”默认关闭，各显示宿主复用同一判断；未知状态保持显示。它与自动弹幕开关独立，弹幕窗在合并前同时应用两项过滤，计数只含保留下来的消息。采集、保存及导出不变；合并代表事件的子类规则沿用自动弹幕约定。

## 置顶栏

副窗口置顶栏为 `.sticky-area`，与普通事件日志并列，沿用所属窗口的 `.event-area.window.window-chat` 或 `.event-area.window.window-pay`、`data-style-api="1"` 和同一份区域配置。关闭功能时不生成置顶栏；开启但无候选时为空，不占高度或外边距。卡片根为 `.event.event-sticky`，沿用原事件类型及子类，不添加第二个业务事件。置顶栏保持单行并可横向滚动，滚动条不可见；普通事件日志继续独立纵向滚动。

卡片可见内容依次为头像、金额或“天选”、末尾图标。头像、头像框及礼物图片直接复用 `Avatar` 和 `GiftIcon`，服从已有显示偏好与资源回退。普通礼物和盲盒的实际开出图均使用 `.gift-icon`；不显示盲盒本体图。礼物价值使用 `.price.gift-price`；盲盒非零且已知的开出价值与实际支付之差，在 `.content` 内的 `.blind-gift` 中使用 `.blind-profit`，正负样式沿用普通行。开出价值为零时显示 `¥0`。醒目留言、大航海及红包沿用 `.price`，天选使用 `.lottery` 显示“天选”，末尾非礼物图标沿用 `.event-icon`。

卡片没有姓名、正文、展开、重试按钮或特效按钮，不输出可见倒计时。根的 `aria-description` 提供实际剩余秒数；付费事件按首次进入本地置顶候选的时间计时，天选与红包按原始发生时间计时。置顶栏不参与普通列表的过期和渲染统计。资格、支付与价值口径及重开行为见[副窗口置顶栏](../features/auxiliary-windows.md#置顶栏)。

固定区为单行横排，卡片及其内容不换行、不压缩，超出窗口宽度的部分由固定区裁切。默认卡片使用无描边紧凑胶囊和事件语义底色，仍消费已有背景、内边距、间隔及媒体参数。大航海购买的末尾 `event-icon` 使用对应身份图片。

置顶复用公共价格、行高、头像和媒体参数，内容垂直居中，不换行、不压缩。共享底座价格和天选为0.875B、行高1.25B；原生默认主题价格和天选覆盖为1B，卡片与轻量气泡按各自 CSS 定义。高度由文字、媒体和内边距决定，不承诺三套主题同高。事件图片位于基准字号大小的居中盒中，礼物图片还可由 --gift-icon-size 覆盖。

卡片进入和退出使用200ms滑动及淡入淡出：固定栏位于顶部或底部时，均从左侧0.75B滑入、向左侧滑出。到期、撤回、开奖或显示上限替换时，卡片滑出完成后移除，最后一张同样执行退出；不续期、不改变排序。切房及关闭功能立即清空，不保留旧房退场画面。系统减少动态效果时立即切换。动画保持私有，不新增公共选择器、参数或设置。

共享底座固定区头像默认1.5B，卡片主题的默认头像上限为1.5B，显式 --avatar-size 可覆盖。默认16px时头像24px，胶囊高度32px、左侧与上下留白4px，使头像与左端圆弧同心。共享底座置顶内边距上下及左侧0.25B，右侧0.375B；显式 --event-padding 可覆盖。内部间隔默认0.25B，固定栏内相邻事件间隔为0.25B。固定栏默认四边0.25B外边距、无内边距，空栏不占外边距；各主题可覆盖。盲盒盈亏使用is-gain/is-loss表达实际盈利和亏损，主题独立决定颜色。

## 用户与身份

有用户时生成 `.user`，按顺序包含可见的 `.rank-badge`、`.username` 和非空 `.badges`。排名位于用户名之前、徽章组之外；现场及原生窗口的普通弹幕、互动使用可断行的行内 span，连续的英文和数字昵称也可从头像后开始并按字符换行。提供用户筛选时，它具有 role="button"、tabindex="0"，点击、Enter 或空格均可筛选，空格不会滚动页面。其他事件及回看有回调时保留原生 button；无回调的预览和只读行使用普通 span。无用户时不生成空用户组。

主题开启“隐藏用户名”时，所有 `.username` 视觉上统一显示三个半角星号 `***`；原始用户名保留在事件数据与筛选回调中；可访问名称和提示使用当前显示名称。该选项不使用模糊效果，也不改变其他身份部件。

徽章组按大航海、主播、房管、荣耀等级、粉丝牌排列；实际身份可共存，开关关闭或资料缺失的部件省略。事件根的完整用户身份状态使用 `guard-level-1/2/3`、`streamer`、`mod`；`streamer-badge`、`mod-badge` 只表示徽章部件。多身份保留各自状态；既有身份颜色优先顺序由 `rolePriority` 决定，不将优先身份替代完整身份集合。`event-role-normal/anchor/admin/captain/admiral/viceroy` 表示按该优先顺序解析出的配色身份，回看使用同一组类。

| 部件 | 属性与内容 |
| --- | --- |
| `avatar-wrap` | 头像容器，包含 `avatar` 或 `avatar-placeholder`，可包含 `avatar-frame`；无用户或关闭头像时省略 |
| `avatar-frame` | 大航海头像框，位于 avatar-wrap 内；data-level 为公开等级1/2/3，节点没有 guard-level-* 类；服从独立头像框开关，失败只隐藏框 |
| `rank-badge` | `data-rank` 为实际正数名次 |
| `guard-badge` | 图片或文字大航海身份；data-level 为公开等级1/2/3，节点本身没有 guard-level-* 类；按身份区分时限定事件根 |
| `streamer-badge` / `mod-badge` | 主播 / 房管 |
| `wealth-medal` | 荣耀等级图片或文字 |
| `fan-medal` | 包含 `medal-name` 和 `medal-level` |

大航海样式属性与内部模型的对应关系：

| 身份 | 内部等级 | 公共等级类 |
| --- | --- | --- |
| 无大航海 | 0 | 不生成大航海等级类与徽章节点 |
| 舰长 | 1 | `guard-level-3` |
| 提督 | 2 | `guard-level-2` |
| 总督 | 3 | `guard-level-1` |

等级转换只用于样式投影。原始身份资料、图标套系、昵称与筛选数据仍按[用户身份与元信息](../features/event-display.md#用户身份与元信息)维护。

头像框按事件用户的 `guardMilestone` 与内部身份等级选择基础、千舰、万舰九张内置资源；未知或缺失里程碑使用基础框，不使用 `guardIconSet` 区分千舰和万舰。头像框与大航海徽章的显隐和图标／文字模式独立。头像及容器继续使用 `--avatar-size`，框绝对定位，宽高为容器的1.2倍，居中外伸10%；不增加容器占位、margin或padding，开关与框失败不改变头像和正文位置。

事件 `Avatar` 与观众榜、大航海榜 `RankAvatar` 共用 `UserAvatar` 的头像、框及回退：远程头像失败使用 `/media/noface.gif`，内置图失败显示“头像不可用”占位，新URL重新加载；占位使用居中的 Lucide 人像 SVG，保持头像盒尺寸，以图片角色提供可访问名称。框失败仅隐藏框，新框URL重新加载。榜单服从相同 `showAvatarFrame`，保留榜单头像尺寸；`RankUser.face` 提供头像，`guardLevel` 使用公开编号1总督、2提督、3舰长，经明确转换传入共享组件。列表及前三沿用房间 `guardMilestone`、`guardIconSet`；无身份不补框，缺失用户保留空槽，不伪造用户。榜单头像不依赖事件头像显隐开关。

样式统一使用公开编号：`.event.guard-level-1 .guard-badge` 为总督，`.event.guard-level-2 .guard-badge` 为提督，`.event.guard-level-3 .guard-badge` 为舰长。徽章自身记录 data-level，但主题选择器使用事件根的公开身份类。现场、回看时间线、事件检索、收藏、副窗口、预览及观众榜、大航海榜的身份标记均由共享徽章组件输出；图标与文字模式使用相同编号。无身份或关闭大航海显示时不生成徽章节点。普通用户的基础变量可写在 `.event`；需要单独限定普通用户时使用 `.event:not(.guard-level-1, .guard-level-2, .guard-level-3, .streamer, .mod)`，不以缺少徽章节点推断身份。榜单前三头像不额外添加身份标记。

事件内部等级仍用于既有模型和档案读取；榜单原始等级保持B站编号，在传入共享组件时转换为模型等级。对外样式不得以内部等级或内部颜色类名判断身份；公开编号统一不改变采集、筛选或历史档案口径。

大航海购买行的 `event-icon` 为对应购买身份的专属图片，复用 `GuardPurchaseIcon` 的内置基础、千舰素材与公共档位选择；用户徽章组不重复生成 `guard-badge`，同时省略粉丝牌；排名、主播、房管和荣耀等级仍按各自显示设置输出。事件图标不受身份徽章图文模式控制。其他事件与榜单的身份徽章规则不变；无用户身份资料的房间里程碑事件保留荣誉图标，不推断购买身份。

## 内容部件

`.content` 表示事件正文范围。普通用户元信息位于其外；系统事件涉及的用户位于 content 内的 system-message-title。普通原生的分行事件直接使用 user 或 info 与 content，回看与系统、成就保留各自结构，不能假定所有事件具有同一分区。

| 部件 | 包含关系与出现条件 |
| --- | --- |
| `message` | 弹幕、醒目留言及其他正文；纯文本可以直接作为内容，不强制再包 `text` |
| `reply` | 实际结构化回复目标；有筛选回调为 button，否则 span，普通 `@` 文本不自动变为回复 |
| `action` | “送出”“获得”等动作文字及互动动作，保留各布局位置 |
| `event-icon` | 事件原有图标，包括醒目留言和大航海图标 |
| `emote.inline-emote` / `emote.big-emote` / `emote.banner-emote` | 小表情、普通大表情、`official_` 横幅；同一图片只取一种变体 |
| `gift-icon`、`gift` | 普通行的 content 直接包含 action、gift-icon、gift、price.gift-price 和可选 blind-gift；gift 只包含 gift-name 与 gift-count。可播放特效时，gift-icon 是包住图片的按钮；普通图片或重试按钮占同一位置 |
| `blind-gift-icon`、`blind-gift` | 普通原生行的 blind-gift 是 content 的直接子项；blind-gift-icon 为 blind-gift 的首个子项，与名称、条件数量、来源价格、动作及差额同级。回看沿用图标与来源组同属 content 的独立结构 |
| `price.gift-price` | 普通原生行及回看中，主礼物金额与主图、礼物组同为 content 直接子节点；置顶使用紧凑 content |
| `price.blind-price` / `blind-profit` | 在 blind-gift 内，来源价有数据才显示，差额非零且可计算才显示；盈亏不是公共价格 |
| `price` | 醒目留言、大航海、红包等原有价格位置；价格整体包含实际货币符号 `price-unit` 和格式化金额 `price-value`，专属价格与公共 price 在同一节点 |
| `price-unit` / `price-value` | 只拆分实际金额的货币符号与数值；免费文案、盲盒盈亏正负号及布局空格保留自身含义 |
| `repeat-count` | 实际合并的弹幕数量大于1时显示 |
| `guard` | 包含 guard-name 和条件生成的 guard-duration；时长使用 prefix、number、unit，单月显示×1月，特殊 `*5天` 显示 `×5天`；count 缺失按1处理，仅单位“天”显示×1天 |
| `guard-companion-days` | 实际匹配陪伴天数时生成，包含 prefix、number、unit |
| `lottery` | 天选内容组；实际字段生成奖品、数量、口令和参与条件。普通原生活动状态位于 event 内、content 外，并带 lottery-wait；回看 lottery-wait 位于内容组内 |
| `lottery-command` / `lottery-required-gift` | 分别包含 prefix + text、prefix + gift-name，保留原括号和空格 |
| `redpocket` | 红包内容组；涵盖动作、存在的总额、逐项奖励及口令。普通原生活动状态位于 event 内、content 外，并带 redpocket-wait；回看倒计时位于内容组内 |
| `redpocket-command` | prefix + text；普通行和回看的 redpocket-awards 内含奖励 prefix 和逐项 redpocket-award，每项含 redpocket-name；现场显示 redpocket-count，回看仅在数量大于1时显示乘数 |
| `winner-count` | 已收到非空 winners 时生成，人数取已收到人数与 awardNum 的较大值；后接“获得”和奖品，不以首位中奖者领起。未收到名单时不补造人数 |
| `winner-list` | 天选／红包开奖已收到的非空名单；位于原摘要之后、行内正文列中，宿主允许展开时生成 details，默认收起 |
| `winner-list-toggle` | winner-list 中的 summary，含 winner-list-expand“名单”和 winner-list-collapse“收起”；aria-label 含已收到人数，使用原生键盘展开行为 |
| `winner-list-count` | 总人数大于已收到人数时，在 summary 后生成“已收到 N 人名单” |
| `winner-list-items` / `winner-list-item` | 名单 ul 及逐位 li，保持接收顺序，默认最大高度120px并内部滚动；每项包含头像和用户名，不补造身份 |
| `username`（名单内） | winner-list-item 内的实际用户名；缺名显示实际UID，两者缺失显示未知用户。有UID及筛选回调时为 button，否则 span |
| `lottery-requirement` | 天选开始有 requireText 时生成；普通行与回看均位于 lottery 内；普通原生包含 prefix“条件”和 text，回看保留直接文本。是否隐藏由主题或显示配置决定 |
| `honor-highlight` | 大航海荣誉消息中的已有高亮内容 |
| `bili-translation` | 醒目留言 message 后另起一行显示既有非空白字符串翻译；无译文不留空行 |
| `status.deleted` | 已撤回弹幕或醒目留言标记；对应事件根带 deleted 类，类型仍由 type-chat / type-superchat 区分。原生主题整体灰度、无删除线；回看正文另有0.65透明度 |
| `time` | 普通原生按主题时间开关生成，成就不生成；开播／下播在标题内保留时间。回看右侧始终显示实际事件时间 |

主图的可视化尺寸作用于 .gift-icon。礼物图和盲盒图默认使用各自的公共方形尺寸变量。可视化宽、高按轴覆盖，未指定的轴沿用下层样式。播放按钮内的资源填满按钮，并继承其圆角、object-fit 和 object-position。高级 CSS 若要只替换实际图像，可使用 `.event :is(img.gift-icon, .gift-icon > img)` 设置 content；这同时覆盖静态和可播放礼物，保留播放入口。

没有实际数据的徽章、奖励或条件分组不补空节点。资源失败可能使图片节点省略或成为重试/文字节点，具体规则见[个性化与资源](../features/event-display.md#个性化与资源)。

已收到非空名单时默认提供展开，各宿主可明确关闭；不以筛选回调判断是否允许展开，无回调时名单内用户名保持非交互。现场、回看、副窗、OBS及其样例预览遵循同一规则，各区域原有事件筛选保持不变。展开时普通行时间回到名单下方，不参与摘要同排避让。名单条目仅取已收到的 winners，不用 awardNum 补造用户；摘要人数与已收到名单人数分别表达，不声明采集名单完整。名单行高变化继续由真实槽位及 ResizeObserver 测量。

## 级联与配置

层顺序为 `theme, utilities, base, default, config, custom`。Tailwind 的变量与 Preflight 重置归入 theme，工具类位于 utilities；原生事件底座位于 base，所选主题位于 default，现有设置映射到 config，用户 CSS 位于 custom。每个区域实例生成一份有限配置，公开外观参数不逐行以内联样式覆盖。

原生底座完整包含共享布局、原生默认外观、头像与头像框规则，统一归入 base。原生默认无额外主题 CSS；其他主题在 default 层覆盖底座，普通主题选择器无需提高权重即可覆盖 base 内更具体的普通声明。base、default、config、custom 连续排列，不细分 foundation 或 appearance 子层。普通主题规则在输出时归入 default，普通可视化与受管规则归入 config，普通自定义规则归入 custom；保存的作者 CSS 源文本不包层。显式 `@layer` 保留，普通导入指定所属层并位于规则之前。important 遵循浏览器反向层序，层顺序不替代内联、继承及显式层语义。回看、检索、收藏的独立样式以及软件界面样式保持原归属。编辑预览、缩略图、运行投影与完整导出使用同一组合入口。预览隔离前缀使用零权重选择器，不额外提高作者规则的权重；显式 scope 中的嵌套选择器保留浏览器解析，根与配色作用域映射到当前预览边界。缩略图组合结果随文档与作用域缓存，不因无关父级重绘重新解析。

系统标题和图标在default层消费局部语义色，公开正文色和普通custom可以覆盖；房间禁言开启有独立图标色，关闭沿用通用系统色。已发布快照保持原应用内容，重新应用才生成新的分层产物；读取主题文件不静默替换已应用快照。

配置按区域实例隔离，身份与事件类型的颜色在事件共同祖先提供回退；用户名身份色与正文类型色分别解析。类型显式透明背景保留透明，默认开播/下播淡底保持各自语义。公开变量在部件处读取，没有子部件公开默认值截断祖先继承。

公共类和下表参数用于样式选择；区域 scope、`data-event-role`、`data-event-style-type`、`data-event-layout`、`data-event-emote` 及私有 resolved/local 变量是当前配置实现，不作为公共接口。选择器不依赖 UID 或原始载荷。

## 样式参数

长度使用带单位的 CSS 值；行高、缩放、字重使用无单位数值，颜色使用 CSS 颜色值，字体使用 CSS 字体链。表中默认指没有公共覆盖时的现有设置或局部回退。

原生主题只保存一个“基准字号”。可视化控件创建的字号、头像、图标、徽章、表情和需要等比变化的间距，以相对基准值保存并直接引用根基准；部件在实际消费处按局部 --event-font-size 派生，不在祖先提前算成固定长度；部件之间不使用嵌套 em 继续累乘。高级 CSS 中明确写入的固定像素值保持固定，不因主题基准字号改变而重算。旧主题读取时以已有 `eventFontSize` 为基准，缺失时再读取 `windowEventFontSize`，保存后的编辑入口统一为基准字号。

现场、副窗口和每个 OBS 配置的“显示缩放”属于目标绑定，默认100%，不属于主题。更换或重新发布主题时保留目标当前缩放；主题导入导出不携带该值。运行目标只缩放事件内容容器，不缩放软件控件、窗口几何或设置面板。编辑器预览和主题缩略图固定使用100%。

| 参数 | 消费位置 | 默认或回退 |
| --- | --- | --- |
| `--event-font-size` | 主题事件根、正文、用户名与比例部件 | 默认16px，为唯一公开主题字号基准；回看使用独立设置 |
| `--event-line-height` | 主题行根及消费该参数的文本 | 无单位倍率，优先于 --event-default-line-height；共享底座默认1.25，主题可覆盖 |
| `--avatar-size` | 头像容器宽高、占位字级 | 主题配置默认24px并按基准缩放；回看独立派生 |
| `--avatar-height` | 头像容器独立高度 | 未设置时沿用 `--avatar-size`；可视化宽高分别编辑，头像框按容器尺寸适配 |
| `--gift-icon-size` | 主礼物图宽高 | 共享底座默认1.5B；置顶默认1B，主题可覆盖 |
| `--blind-gift-icon-size` | 盲盒来源图宽高 | 配置默认1.25B，局部回退20px，独立于主礼物图片 |
| `--emote-size` | 内嵌小表情高度和行内对齐 | 默认20px；可视化宽度独立控制，不改变高度 |
| `--big-emote-size` | 普通大表情最大宽高 | 主题默认2.5B；横幅独立布局，回看使用独立行高 |
| `--guard-badge-size` | 图片大航海徽章高度及最大宽度 | 高16px、宽auto、最大宽为高度×2.25 |
| `--badge-font-size` | 文字徽章、粉丝牌基础字级 | 现场/副窗为字号×.75，16px时12px；其他布局10px |
| `--fan-medal-scale` | 粉丝牌高度、内边距、字级 | 默认1；高度1.125B，间隔不乘此倍率 |
| `--fan-medal-padding` | 粉丝牌左右内边距 | 配置默认0.25B，消费时乘 fan-medal-scale |
| `--fan-medal-gap` | 粉丝牌名称与等级间隔 | 配置默认0.25B，局部回退4px |
| `--wealth-medal-size` | 荣耀等级图片高度与宽度 | 高16px、宽为高度×2.25 |
| `--rank-badge-size` | 排名字级 | 根字号×.75；16px时12px。盒尺寸由各主题独立定义 |
| `--username-color` | 用户名 | 配置身份颜色或主题对应身份语义色 |
| `--reply-color` | 结构化回复的整段 @用户名 | 浅色 `#fb7299`，深色 `#ff9fba`；可视化 reply 颜色和自定义 CSS 共用此参数 |
| `--message-color` | 正文、子文本、事件图标和高亮 | 配置正文颜色或对应事件/文本状态语义色 |
| `--count-font-size` | quantity 和 guard-duration 数量组 | 共享底座继承组字号；主题可覆盖。repeat-count 可独立消费该参数，撤回标签不受数量字号控制 |
| `--price-font-size` | 主价格；来源价与盈亏按局部规则继承 | 共享底座0.875B；默认主题主价格1B，卡片主价格1.25B，其他主题按自身规则 |
| `--price-color` | 价格、盲盒来源价和差额 | 正文/事件语义色；盲盒来源价次级文本色、差额保留原正负语义色 |
| `--event-background` | 事件表面 | 显式参数优先于配置背景；默认弹幕、互动透明，付费与活动事件30%语义色、警告及切断50%，其他主题使用自身表面 |
| `--event-padding` | 事件表面或行根内边距，依布局消费 | 默认卡片上下8px、左右0.75B；默认弹幕与互动上下0.25B。置顶采用自身紧凑比例 |
| `--event-gap` | 卡片、用户／徽章组、系统图文与置顶的间隔 | 默认值依消费节点与主题而异；不控制所有私有包装的间距 |
| `--event-spacing` | 事件槽位间隔高度 | 原生默认0.25B（16px基准时4px）；背景外且参与测量 |
| `--event-font-family` | 行根字体链 | 配置使用MiSans及其回退字体；共享底座局部回退为MiSans、MiSans TC、MiSans L3 |
| `--event-font-weight` | 行根字重 | 500；强调部件700，身份组件保留自身字重 |
| `--blind-profit-gain-color` / `--blind-profit-loss-color` | 盲盒盈亏 | 默认红色盈利、绿色亏损，随明暗配色切换 |
| `--event-stroke-width` | 行根文字描边宽度 | 默认关闭时0px；已保存宽度默认1px，启用后投影，设置范围0.5–2px |
| `--event-stroke-color` | 行根文字描边颜色 | 配置身份描边色；默认黑色alpha .72，宽度关闭时不可见 |
| `--badge-color` | 文字身份、荣耀文字、粉丝牌及等级文字、排名 | 默认沿用各自身份／等级语义色，图片素材不重着色 |
| `--badge-background` | 文字身份、荣耀文字、排名、粉丝牌 | 文字身份浅色底，粉丝牌渐变、排名金/银/铜色 |

现场与副窗基准字号范围8–72px、步进0.5px、默认16px；回看独立设置默认14px、范围14–24px。普通大表情默认主题基准字号×2.5，现场、副窗和 OBS 共用主题值。回看大表情按其行高缩放，14px基准下20px，不提供单独尺寸设置。头像设置默认24px。下表为主题公共参数；回看不使用该表作为主题覆盖接口。各内置主题可覆盖共享底座的默认值，具体字号以主题段落和实际计算值为准。

头像、头像框、大航海、房管、主播、粉丝牌、礼物图片默认开启；荣耀等级、排名默认关闭；身份默认图标模式。默认动画淡入淡出200ms。参考样式和验收样本的尺寸不改变已保存设置。

## 私有布局与实现

零价普通礼物的公共类型沿用业务分类：盲盒优先，其次为 `isFree=true` 或 `priceRmb=0` 的免费礼物，其余为普通礼物。

正文和译文在各自节点读取字号与行高参数；现场与副窗跟随字号的礼物图片、文字徽章和粉丝牌在消费部件处计算比例。回看使用独立字号与紧凑比例。天选及红包开奖标题与正文共用正文颜色参数，用户名颜色独立。粉丝牌名称和等级默认使用同一色阶文字色，`--badge-color` 同时覆盖两者。

可用宽度不超过20B时改用窄版；显示缩放后的行内容宽度决定切换，无槽位预览按画布宽度切换。极窄时收紧水平留白，头像、状态和正文按行排列；金额、周期、粉丝牌、连击和撤回标记优先整组换行，组宽超过一行时允许内部断行。窄版活动正文占满头像下方整行，前缀与说明按可用宽度换行，开播与下播时间限制在系统文字列内。用户名保留完整文本，UsernameText 仅输出内部 username-text 包装，不执行字符测量或截断。实际换行与视觉省略由当前主题 CSS 决定；完整昵称保留在提示及用户筛选名称中。徽章按可用空间换行。内部包装不作为额外公共接口。

EventRowSlot 承载背景外间隔并参与测量；末行由宿主决定是否挂载间隔。虚拟坐标、测量缓存、动画持续时间与包装、诊断别名、场次包装、菜单定位及原生窗口几何保持私有。改变公共尺寸仍经真实槽位与 ResizeObserver 进入现场和回看各自的测量机制。

源码归属：`src/events/publicEventStyle.ts` 管理类型和等级投影；`src/components/EventRow.tsx`、`UserAvatar.tsx`、`GuardIdentityBadge.tsx`、`FanMedalBadge.tsx` 管理共享部件；`src/eventStyle.css` 消费参数；`src/eventAreaStyleConfig.ts` 和 `src/components/EventAreaStyle.tsx` 管理配置映射；`StylePreviewArea.tsx` 和 `stylePreviewContext.ts` 管理实际上下文预览。

## 后续开发与扩展

新增或修改事件显示时，本篇作为当前公共语义的依据。先核对现有类型、部件、配置与共享组件，再实施已批准的修改；不从旧源码快照恢复结构，不另建一套等价组件或规范。

### 原生主题编辑语义

原生主题编辑器直接消费本篇公共事件类，并通过 `nativeSemanticSelectors.ts` 维护可选择部件。可视化规则按事件范围、用户身份和语义部件组合；组合选择器的每个分支都保留完整范围，不允许逗号分支脱离事件或身份约束。

整体和事件列表分别落到正式宿主的 `.event-area`、`.event-list`，不能使用仅预览页存在的标记。事件行的字体、字号、行高、间距及媒体尺寸优先写入本篇公共参数；具体文本、容器和媒体部件使用其公共类。这样同一份结构化设置可作用于现场、副窗口和 OBS，也允许后置自定义 CSS 覆盖；回看使用独立样式，不消费主题可视化设置。

当前事件范围包括全部事件、弹幕、互动及其子类、礼物及其子类、醒目留言、大航海和系统事件。用户身份包括普通用户、舰长、提督、总督、主播和房管。可视化部件只映射真实 DOM 中已经存在的公共节点；没有真实数据或节点的内容不因编辑器选项而补造。

主题层顺序固定为基础 CSS、可视化 CSS、结构化设置生成 CSS、自定义 CSS。预览时四层仅作用于预览容器；正式应用时使用同一投影结果。自定义 CSS 保留未知规则与注释，并保持最高主题层优先级。

编辑器以 `NATIVE_PART_SELECTORS` 与 `NATIVE_PART_CAPABILITIES` 为统一部件对照，`NATIVE_SEMANTIC_PARTS` 将名称、导航分组、选择器与能力关联。显示、文字、表面、间距、边框、布局与媒体分组仅使用既有属性；按部件形态开放，不向所有容器提供固定宽高。粉丝牌为文字徽章；主播、房管支持文字与图标两种形态；大航海徽章、荣耀等级和事件图标区分图片与文字形态。图片形态不提供文字颜色或字号，文字形态不提供媒体宽高。可视化 CSS 与自定义 CSS 均可编辑，可识别的语义与属性参与同步；无法识别的内容保留在 CSS 中。

可视化 CSS 的输入草稿与最近一次有效结果分别保存。语法暂时无效时，编辑器保留草稿和错误位置，预览继续使用最近有效结果；修复后再同步视觉模型。同一字段出现重复声明时按最后一条声明处理；最后一条无法转换为控件值时，原声明保留，属性面板显示“由 CSS 控制”。控件修改通过语法树只更新目标声明；恢复继承删除该声明，其他规则、声明、注释、顺序和单位保持不变。

受管理可视化规则使用 `/* visual:配色|事件|身份|部件 */` 标记，例如 `/* visual:dark|superchat|ordinary|message */`。配色固定为 `common`、`light`、`dark`；旧编码标记不再识别。

预览悬停与点选共用命中规则，优先最近节点上的具体部件；同一节点优先匹配限定更具体的公共选择器。用户信息、置顶单事件等集合可通过自身留白或2px内缘选中，内部文字与图片仍单独命中；热区不超出实际盒边界。点选模式允许已有事件部件接收指针，不改变正式显示的交互规则。兼容样式只命中当前显示区域实际支持的部件，悬停提示在移出或滚动时清除。

### 部件能力对照

事件类型和用户身份使用公开类名；徽章等级与排名可使用已声明的 data-level、data-rank，不使用内部定位与配色属性。`NATIVE_EVENT_SCOPE_SELECTORS` 维护事件类型范围，`NATIVE_ROLE_SELECTORS` 维护身份状态范围；短部件类限定在对应事件内，`prefix`、`number`、`unit`、`text` 进一步限定在所属内容组内。

能力分组：display 为显示；typography 为字体、字号、字重与行高；surface 为文字颜色与背景；spacing 为内外间距；border 为边框宽度、颜色、圆角与图片边框；layout 为内部间隔；media 为宽高。根基准字号的控件归属在主题基础设置，部件能力不新增第二个根基准入口。switchable 的 groups 为两种形态的能力并集，实际面板使用 variants 中当前形态的能力。

真实事件根同时输出公开范围和已有内部类：普通事件使用 `.event-list .event`，置顶事件为 `.event.event-sticky`，置顶容器为 `.sticky-area`。事件根依据归一化用户身份同时输出全部适用的 `guard-level-1/2/3`、`streamer`、`mod` 状态类；多身份不会因颜色优先级只保留一个状态。`rolePriority` 只决定有效颜色，等级公开含义固定为 1 总督、2 提督、3 舰长，不改写归档或协议值。

真实货币金额的 `.price` 内含 `.price-unit` 与 `.price-value`。免费文本使用 `.price.gift-price.gift-free-label`，与主价格共享编辑，不添加货币符号；盲盒盈亏使用 `.blind-profit` 自身的正负号语义。

`guardBadge`、`honor` 与 `eventIcon` 的可编辑属性按当前实际形态解析。大航海身份和荣耀勋章读取当前显示设置；醒目留言、礼物大类中的活动图标、天选和红包范围按图片形态编辑；系统等其余单一范围按文字形态编辑。全部事件与大航海范围可能同时含图片和矢量图标，保留两类属性，生成与反向同步不丢弃颜色或尺寸。主播、房管图标模式以及成就水印仍允许颜色与字号能力，与普通图片形态不同。非当前形态的已保存值继续保留，但不进入当前面板、生成结果或反向同步结果。

视觉模型分为 `common`、`light`、`dark` 三层。`common` 是基础层，浅色和深色只保存相对基础层的稀疏覆盖；恢复继承即删除当前层声明。预览配色不写入视觉模型，编辑配色与预览配色由调用方分别保存。旧版平面模型读取时归入 `common`，不复制出冗余的浅色或深色值。

结构化长度可明确保存为固定像素或相对主题基准的比例。固定值生成 `px`，相对值直接由根基准变量计算，不使用嵌套 `em` 作为尺寸来源；旧版数值仍按固定像素读取。

已有保存键 `canvas`、`identity`、`giftValue` 不作为独立导航项或点选结果，分别指向 `whole`、`user`、`giftPrice` 的公共部件，不新增公开类名。编辑器模拟背景独立于事件区域样式。

| 部件键 | 显示名称 | DOM 位置与选择器 | 形态 | 能力分组 |
| --- | --- | --- | --- | --- |
| quantityPrefix | 数量符号 | .event .quantity-prefix | text | display, typography, surface, spacing, border |
| quantityNumber | 数量数值 | .event .quantity-number | text | display, typography, surface, spacing, border |
| quantityUnit | 数量单位 | .event .quantity-unit | text | display, typography, surface, spacing, border |
| winnerAvatar | 中奖头像 | .event .winner-avatar | image | display, spacing, media, border |
| honorHeading | 成就标题 | .event .honor-heading > :not(.honor-highlight) | text | display, typography, surface, spacing, border |
| honorSummary | 成就说明 | .event .honor-summary > :not(.honor-highlight) | text | display, typography, surface, spacing, border |
| honorMilestone | 成就里程碑 | .event .honor-milestone | text | display, typography, surface, spacing, border |
| systemTitle | 系统标题 | .event .system-message-title | text | display, typography, surface, spacing, border |
| systemDetail | 系统详情 | .event .system-message-detail | text | display, typography, surface, spacing, border |
| systemExpiry | 解禁时间 | .event .system-message-expiry | text | display, typography, surface, spacing, border |
| card | 事件卡片 | .event:not(.event-sticky) | container | display, surface, spacing, border, typography, layout |
| header | 信息组 | .event > .info, .event > .user, .event > .activity-title, .event > .result-title | container | display, surface, spacing, border, typography, layout |
| activityStatus | 活动状态 | .event .activity-status | text | display, typography, surface, spacing, border |
| whole | 事件区 | .event-area | container | display, surface, spacing, border, typography, layout |
| list | 事件列表 | .event-list | container | display, surface, spacing, border, typography, layout |
| event | 事件 | .event | container | display, surface, spacing, border, typography, layout |
| row | 普通事件 | .event-list .event:not(.event-sticky) | container | display, surface, spacing, border, typography, layout |
| sticky | 置顶栏 | .sticky-area | container | display, surface, spacing, border, layout |
| stickyEvent | 置顶事件 | .sticky-area .event.event-sticky | container | display, surface, spacing, border, typography, layout |
| user | 用户信息 | .event .user | container | display, surface, spacing, border, layout |
| avatarWrap | 头像区域 | .event .avatar-wrap | container | display, surface, spacing, border |
| avatarPlaceholder | 头像占位 | .event .avatar-placeholder | container | display, surface, spacing, border |
| avatarFrame | 头像框 | .avatar-frame | image | display, spacing, media, border |
| avatar | 头像 | .event .avatar | image | display, spacing, media, border |
| username | 用户名 | .event .username | text | display, typography, surface, spacing, border |
| medal | 粉丝牌 | .event .fan-medal | text-badge | display, typography, surface, spacing, border |
| medalName | 粉丝牌名称 | .event .medal-name | text | display, typography, surface, spacing, border |
| medalLevel | 粉丝牌等级 | .event .medal-level | text | display, typography, surface, spacing, border |
| guardBadge | 大航海身份 | .event .guard-badge | switchable | display, typography, surface, spacing, border, media |
| anchorBadge | 主播身份 | .event .streamer-badge | switchable | display, typography, surface, spacing, border, media |
| adminBadge | 房管身份 | .event .mod-badge | switchable | display, typography, surface, spacing, border, media |
| honor | 荣耀勋章 | .event .wealth-medal | switchable | display, typography, surface, spacing, border, media |
| rank | 当前排行 | .event .rank-badge | text-badge | display, typography, surface, spacing, border |
| badges | 身份徽章 | .event .badges | container | display, surface, spacing, border, layout |
| price | 价格整体 | .event .price | text | display, typography, surface, spacing, border |
| priceUnit | 货币符号 | .event .price .price-unit | text | display, typography, surface, spacing, border |
| priceValue | 金额数值 | .event .price .price-value | text | display, typography, surface, spacing, border |
| repeatCount | 合并数量 | .event .repeat-count | text-badge | display, typography, surface, spacing, border |
| blindGiftCount | 盲盒数量 | .event .blind-gift-count | text | display, typography, surface, spacing, border |
| reply | 回复对象 | .event .reply | text | display, typography, surface, spacing, border |
| translation | 平台译文 | .bili-translation | text | display, typography, surface, spacing, border |
| message | 正文 | .event .message | text | display, typography, surface, spacing, border |
| action | 动作文字 | .event .action | text | display, typography, surface, spacing, border |
| content | 内容区域 | .event .content | container | display, surface, spacing, border, layout |
| timestamp | 时间 | .event .time | text | display, typography, surface, spacing, border |
| deletedStatus | 删除状态 | .event .status.deleted | text | display, typography, surface, spacing, border |
| eventIcon | 事件图标 | .event .event-icon | switchable | display, typography, surface, spacing, border, media |
| honorWatermark | 成就水印 | .event .honor-icon | switchable | display, typography, surface, spacing, border, media |
| blindGiftName | 盲盒名称 | .event .blind-gift-name | text | display, typography, surface, spacing, border |
| giftProfitPositive | 盲盒盈利 | .event .blind-profit.is-gain | text | display, typography, surface, spacing, border |
| giftProfitNegative | 盲盒亏损 | .event .blind-profit.is-loss | text | display, typography, surface, spacing, border |
| blindGiftImage | 盲盒图片 | .event .blind-gift-icon | image | display, spacing, media, border |
| giftImage | 礼物图片 | .event .gift-icon | image | display, spacing, media, border |
| giftCount | 礼物数量 | .event .gift-count | text | display, typography, surface, spacing, border |
| giftName | 礼物名称 | .event .gift-name | text | display, typography, surface, spacing, border |
| giftPrice | 礼物金额 | .event .price.gift-price | text | display, typography, surface, spacing, border |
| giftProfit | 盲盒盈亏 | .event .blind-profit | text | display, typography, surface, spacing, border |
| giftSourcePrice | 盲盒原价 | .event .price.blind-price | text | display, typography, surface, spacing, border |
| blindGiftGroup | 盲盒信息 | .event .blind-gift | container | display, surface, spacing, border |
| giftGroup | 礼物信息 | .event .gift | container | display, surface, spacing, border |
| inlineEmote | 行内表情 | .event .inline-emote | image | display, spacing, media, border |
| bigEmote | 大表情 | .event .big-emote | image | display, spacing, media, border |
| bannerEmote | 横幅表情 | .event .banner-emote | image | display, spacing, media, border |
| guardDurationPrefix | 时长前缀 | .event .guard-duration .prefix | text | display, typography, surface, spacing, border |
| guardDurationNumber | 时长数值 | .event .guard-duration .number | text | display, typography, surface, spacing, border |
| guardDurationUnit | 时长单位 | .event .guard-duration .unit | text | display, typography, surface, spacing, border |
| guardDaysPrefix | 陪伴前缀 | .event .guard-companion-days .prefix | text | display, typography, surface, spacing, border |
| guardDaysNumber | 陪伴数值 | .event .guard-companion-days .number | text | display, typography, surface, spacing, border |
| guardDaysUnit | 陪伴单位 | .event .guard-companion-days .unit | text | display, typography, surface, spacing, border |
| guardDuration | 大航海时长 | .event .guard-duration | text | display, typography, surface, spacing, border |
| guardDays | 陪伴天数 | .event .guard-companion-days | text | display, typography, surface, spacing, border |
| guardName | 大航海名称 | .event .guard-name | text | display, typography, surface, spacing, border |
| guardContent | 大航海内容 | .event .guard | container | display, surface, spacing, border |
| guardHighlight | 大航海高亮 | .event .honor-highlight:not(.honor-milestone) | text | display, typography, surface, spacing, border |
| lotteryRequirementPrefix | 条件前缀 | .event .lottery-requirement .prefix | text | display, typography, surface, spacing, border |
| lotteryRequirementText | 条件正文 | .event .lottery-requirement .text | text | display, typography, surface, spacing, border |
| redpocketAwardsPrefix | 奖励前缀 | .event .redpocket-awards > .prefix | text | display, typography, surface, spacing, border |
| redpocketCount | 红包奖励数量 | .event .redpocket-count | text | display, typography, surface, spacing, border |
| resultDescription | 开奖摘要 | .event .result-description | text | display, typography, surface, spacing, border |
| winnerListCount | 名单接收提示 | .event .winner-list-count | text | display, typography, surface, spacing, border |
| lotteryCommandPrefix | 口令前缀 | .event .lottery-command .prefix | text | display, typography, surface, spacing, border |
| lotteryCommandText | 口令正文 | .event .lottery-command .text | text | display, typography, surface, spacing, border |
| lotteryGiftPrefix | 礼物前缀 | .event .lottery-required-gift .prefix | text | display, typography, surface, spacing, border |
| lotteryGiftName | 参与礼物名称 | .event .lottery-required-gift .gift-name | text | display, typography, surface, spacing, border |
| lotteryPrize | 天选奖品 | .event .lottery-name | text | display, typography, surface, spacing, border |
| lotteryCount | 天选名额 | .event .lottery-count | text | display, typography, surface, spacing, border |
| lotteryCommand | 天选口令 | .event .lottery-command | text | display, typography, surface, spacing, border |
| lotteryGift | 参与礼物 | .event .lottery-required-gift | text | display, typography, surface, spacing, border |
| lotteryWait | 开奖时间 | .event .lottery-wait | text | display, typography, surface, spacing, border |
| lotteryRequirement | 参与条件 | .event .lottery-requirement | text | display, typography, surface, spacing, border |
| lotteryGroup | 天选内容 | .event .lottery | container | display, surface, spacing, border |
| redpocketCommandPrefix | 口令前缀 | .event .redpocket-command .prefix | text | display, typography, surface, spacing, border |
| redpocketCommandText | 口令正文 | .event .redpocket-command .text | text | display, typography, surface, spacing, border |
| redpocketAwards | 红包奖励 | .event .redpocket-awards | text | display, typography, surface, spacing, border |
| redpocketCommand | 红包口令 | .event .redpocket-command | text | display, typography, surface, spacing, border |
| redpocketWait | 开奖时间 | .event .redpocket-wait | text | display, typography, surface, spacing, border |
| redpocketName | 红包名称 | .event .redpocket-name | text | display, typography, surface, spacing, border |
| redpocketGroup | 红包内容 | .event .redpocket | container | display, surface, spacing, border |
| winnerCount | 中奖人数 | .event .winner-count | text | display, typography, surface, spacing, border |
| winnerUser | 中奖用户 | .event .winner-list-item .username | text | display, typography, surface, spacing, border |
| winnerItem | 中奖项 | .event .winner-list-item | container | display, surface, spacing, border |
| winnerItems | 中奖内容 | .event .winner-list-items | container | display, surface, spacing, border |
| winnerToggle | 名单展开 | .event .winner-list-toggle | text | display, typography, surface, spacing, border |
| winnerList | 中奖名单 | .event .winner-list | container | display, surface, spacing, border |

### 语义与复用

- 语义描述内容是什么，外观由样式与参数决定。公共类名使用稳定的业务含义，不以颜色、尺寸、位置或当前布局命名。
- 已有部件优先复用。新内容确无对应部件时才新增，并记录名称、含义、所属范围、出现条件及适用宿主；新增属性和参数同样明确真实取值与消费位置。
- 区域、类型、用户身份、正文和媒体遵循现有关系。显示开关、图标／文字切换、缺失字段与资源失败不得使同一部件在不同宿主中改变含义。
- 不为凑齐结构补造数据或空节点。采集不到的字段保持缺失；未确认字段不作为已确认身份或类型输出。
- 共用规则在共享组件中维护。现场、回看时间线、事件检索、收藏、弹幕窗、收益窗及样例预览逐一核对，保留有业务依据的布局与交互差异，不强制所有事件展示全部部件。
- 布局包装、测量缓存、诊断辅助属性等保持私有；只有明确纳入本篇的选择器、属性和参数才属于公共契约。预留能力不意味着接口已实现。

### 变更与验收

公共名称、属性、包含关系、取值含义、参数或出现条件改变时，在同一变更中更新本篇和对应测试。移除或改名须核对现有消费方及影响，不自行添加兼容层；只有实际改变契约版本含义时才调整样式版本。

验收覆盖实际组件渲染、各宿主与预览、设置显隐及图标／文字模式、缺失数据、资源失败和窄窗口。影响行高或媒体尺寸时，检查现场阅读锚点与回看定位；未受影响的行为不扩大修改范围。自动测试、浏览器与原生桌面结果分别说明，未执行的范围不得标为通过。

### 交付与用户审核

在已批准范围内完成实现和验收后，再统一提交语义化报告供用户审核，不逐项等待确认。需求冲突、公共含义无法确定或修改超出批准范围时，先说明差异并询问。

每次涉及事件显示的交付说明包含：

- **复用／新增／调整**：涉及的公共部件、属性、参数及变化；没有新增时明确说明。
- **影响范围与差异**：实际受影响的宿主、预览及有依据的差异。
- **验收**：已执行的检查与结果、尚未验证的范围。
- **需审核**：新命名、新结构、公共含义或关系变更的具体内容；仅按已有契约复用且未改变公共结构时说明无需审核新命名或结构。

报告使用实际变更，不重复整篇契约，也不将内部包装变动当作新增公共能力。

## 已知问题与查阅限制

- 文档描述当前源码和公共样式边界，不保证旧发布物或已保存主题快照已经采用相同实现。动态资源失败、真实直播与原生桌面状态需按具体运行版本核验。

## 原生默认基础

默认成就参照 `design/native-foundation-20261121/before/src/` 的两行文字、头像与官方勋章。现场、副窗、OBS和原生预览采用新默认外观；回看、检索和收藏保留原有紧凑排版，共用语义文案与基础部件，宿主分别保留时间、菜单、筛选和名单操作能力。

`.event` 承担事件表面，`.info` 是 SC 独立信息组，其他事件的用户与标题直接属于事件。正文、媒体、活动状态和名单保持可分别选取的真实部件。弹幕使用用户信息行内组合与正文衔接；完整用户名由 CSS 自然换行，默认不测量截断，主题可以自行选择省略策略。礼物与大航海价格和图片保留正文内的独立位置。

### 排版与配色

正文与主要用户名1B，默认主题主价格1B；数量、周期、活动状态、互动文字和辅助信息0.875B，身份标签及次要操作0.75B。默认行高1.25B；16px基准对应16/14/12px，24px对应24/21/18px。默认头像1.5B、礼物及大航海事件图1.5B，身份图1B。普通事件左右外边距为0。相邻事件间距0.25B，由已有event-row-slot-content的底部padding承载，最后一条不留间距，不生成空白间隔节点。卡片上下内留白0.5B、左右0.75B；默认弹幕与互动上下内留白0.25B。单独调整表头字号只作用于表头；正文、名称与金额或数量的单个文字部件放大时，默认行高按实际字号增长。金额和数量组向单位与数值传递无单位行高，单个部件的显式行高优先。配置尺寸随基准等比变化。系统图标与首行居中；表头用独立居中布局，连续正文统一基线。大表情和横幅随文字自然换行；横幅保持原始比例，最大宽15B、高1.25B。小表情两侧各留0.125B。盲盒来源、陪伴和独立时间行使用父布局的0.25B行距。

正文与普通动作500；用户名、礼物名、舰种、价格整组、数量整组、活动标题、警示标题与成就高亮700。身份标识与粉丝牌保留原组件外观。用户元信息依次为排名、用户名、大航海身份、主播、房管、荣耀等级和粉丝牌。

默认弹幕与互动使用透明表面；付费事件与活动在明暗模式采用30%事件语义色，警告及切断为50%。置顶与对应普通事件共享语义色与染色浓度，置顶只压缩尺寸。系统提醒为中性框，直播开始绿色、结束灰紫色，警告及切断使用警示色。默认不使用左侧装饰竖线。

### 价格、数量和撤回

免费文本直接放在 `.price.gift-price.gift-free-label`，与数值主价格共享颜色、字号和字重编辑。免费和未知金额标签不生成 price-unit / price-value；未知金额不带 gift-free-label。付费零值为¥0，未知金额为“金额未知”，不能冒充免费。主金额按事件已有口径，盲盒来源成本与盈亏独立；来源不输出字面括号。

`.quantity-prefix`、`.quantity-number`、`.quantity-unit` 分别为数量符号、数值与单位；礼物、活动名额及奖励数量沿用原专属父节点，大航海同时保留`.guard-duration .prefix/.number/.unit`。一月购买也显示×1月。撤回保留正文与“已撤回”标签，整体灰度、透明度1、无删除线。

### 活动、人物与名单

`.activity-status` 使用 `.activity-scheduled/.activity-running/.activity-awaiting-result/.activity-drawn/.activity-unknown` 表示状态，倒计时沿用共享时钟。归零等待结果，不自行改为已开奖。运行中剩余不超过10秒时另有 `.activity-urgent`；`.activity-clock` 为状态时钟图标；修改字号和明暗不改变活动截止事实。

红包头像属于发送用户；天选头像属于同房间主播，存放于独立 `broadcaster` 展示资料，不写入`event.user`。使用事件当时已保存的资料；没有可靠资料时显示默认头像，不借用参与者或其他房间人物。三类红包均使用原生目录内的 WebP 素材。

开奖标题为“天选开奖/红包开奖”，摘要在已有名单且总人数可靠时使用总人数，展开时标注已收到人数；其余以实际收到人数和奖品表述；不以第一位中奖人领起，不用奖品名额补造名单人数。宿主允许时在标题右侧提供“名单/收起”，极窄时按自然顺序分行；展开内容保持在摘要下方，名单每项头像+用户名，姓名可在剩余宽度内折行，极窄时按自然顺序分行；名单流式换行并限制120px高度。`.winner-avatar` 为中奖头像区域，内部`.avatar`为图片，缺失使用既有默认头像。有UID且宿主提供筛选回调时用户名可筛选，其余为普通文字；不支持交互的输出不显示无效控件。

### 成就、系统和资源

大航海专用事件素材位于`src/assets/events/guard/`：模型1舰长→captain（来源编号3），2提督→admiral（2），3总督→governor（1）。普通及未知阶段用animate，千舰/万舰用1k；两类素材分别共用，不声称每阶段有独立画面。原生资源不依赖兼容模式路径。

成就为金色铭牌，沿用`.honor-heading`与`.honor-summary`，可靠数字为`.honor-milestone`，不从无关文字推断。系统事件语义图标在有用户时也显示；封面审核退出可见消息、提醒及预览，不删除协议或历史数据。

### 编辑部件与共享头像

完整选择器与能力见前述部件能力对照。成就标题与说明的编辑选择器排除高亮子节点；里程碑及普通高亮分别编辑。

文字部件支持字重属性`fontWeight`，生成及反向解析`font-weight`，作为数值保存，不转换成长度。原生底座位于base层，主题CSS位于default层，可视化和设置位于config层，高级CSS位于custom层。公共语义选择器不依赖内部包装层数；新增选择器同步能力表、导航、点选与契约。

共享头像的尺寸、圆形裁切与头像框定位由 `UserAvatar.css` 提供，不依赖 `.event` 祖先；榜单与事件共用该组件，显式 `size` 和事件主题变量分别决定使用尺寸。

### 回看展示边界

回看、事件检索与收藏的事件根使用 `.event-surface-archive`，默认14px正文、20px行高、500字重，上下6px、左右8px内留白、零行间隔和右侧时间。字号可在14–24px调整，行高、媒体及间距按14px基准缩放；不生成主题卡片、表头或全宽活动区。`archiveEventStyle.css` 独立维护该外观；主题挂载入口只作用于主题区域。

文案沿用新默认规则：盲盒来源不加字面括号，开奖使用完整获奖摘要，免费与零金额保持真实口径，红包名称和开奖状态一致。生命周期时间在回看仍位于右侧。回看外观不接受原生主题的卡片布局变化。

付费事件、活动及对应置顶背景均为30%填充，警告、切断背景为50%。普通事件左右外边距0，卡片内部留白与0.25B事件间距独立。辅助文字采用浅色深灰、深色浅灰；普通用户名、主播、房管及大航海用户名沿用原身份色，独立于辅助文字配色。开奖奖品名和成就强调色以语义色与正文色调和。警告、切断的背景色和文字色独立，保留棕黄、玫红语义；不通过整个事件的opacity改变文字和图标。


## 卡片主题

`native-card` 在原生默认事件树上提供独立 CSS，不改变身份原色、徽章、过滤或回放布局。样式源为 `src/themes/nativeCardTheme.css`，内置准备时同步生成 CSS 字符串。三个内置原生主题为原生默认、浅映卡片和轻语气泡。卡片沿用软件的MiSans字体管理，不内嵌演示字库，不改变回放共用字体设置。

购买动作、图标、名称与数量、价格在同一正文区排列，金额可向右对齐。窄幅正文可在头像下方通栏换行。价格值与货币符号随基准字号缩放；免费与置顶使用原有价格部件和语义表面。

置顶沿用既有到期移除规则，无需开奖状态。事件区域与置顶栏的画布透明，不包含外层底色、边框或阴影；各事件自身的卡片表面保留。成就沿用无可靠主播头像时的图标回退。

卡片主题的文字按基准字号B统一为0.75B、0.875B、B、1.25B、2B五档；身份与粉丝牌继续沿用公共部件规范。SC info 包含同级头像、用户、价格和事件图标，头像对齐首行，各部件按实际可用宽度换行，表头底色延伸覆盖上下内边距。名单独立占满内容宽度；“名单”位于标题右侧，与活动倒计时处于对应位置，展开内容位于摘要下方；展开后切换为“收起”。大航海时长与正文行高一致，名称与购买周期紧邻。

购买动作、礼物名称、数量与大航海周期统一使用文字基线对齐。SC事件图标为1.5B，与开奖图标同尺寸。明暗成就均以对应实底卡片表面混合8%金色；红包和天选口令使用连续行内文本换行，续行从口令区域起点排列。

### 大航海购买等级

事件根的 `.guard-purchase-level-1`、`.guard-purchase-level-2`、`.guard-purchase-level-3` 分别表示本次购买总督、提督、舰长。普通事件和置顶使用同一含义；无可靠购买等级时不输出。这些类独立于用户身份 `guard-level-1/2/3`，不替代身份集合。

设计尺寸以16px基准定义，文字与缩放部件直接从共同基准派生；常用间距为2/4/6/8/10/12/16/20/24/32px。用户字号及显示缩放产生的小数允许保留。

### 主题基础参数

`--event-text-color`、`--event-secondary-color`、`--event-muted-color`、`--event-border-color` 分别定义主题正文、次级文字、辅助文字和边线默认色；身份色继续独立。`--event-default-line-height` 为主题默认行高比例，显式 `--event-line-height` 优先。基础实现内部的 `--native-*` 不属于主题接口。

`--event-config-background` 为软件按事件和身份设置解析出的背景默认值；主题消费顺序为显式 `--event-background`、`--event-background-color`、`--event-config-background`、主题表面。该接口同时用于紧凑回看，名称变化不改变其颜色或排版。

软件将普通事件内留白保存为私有比例，在部件消费时按局部字号计算，显式 --event-padding 优先。置顶采用主题紧凑默认值，显式内边距可单独覆盖，不把普通事件配置强制套到置顶。

软件将头像配置保存为私有比例，在头像消费时按局部字号计算，显式 --avatar-size 优先。卡片互动头像默认采用不大于1.5B的紧凑尺寸；显式设置不受该默认上限限制。

### 公开状态类

系统状态使用 `.system-admin-appointed`、`.system-admin-revoked`、`.system-admin-list-updated` 区分房管任命、撤销与名单更新；协议适配保留 `adminAction`，不通过显示文案推断。房间禁言使用 `.system-room-silent-on`、`.system-room-silent-off`，沿用 `roomSilent.action`。原有通用类型类继续保留，缺少状态的历史事件仅使用通用类。

公开主题使用类选择器；软件内部的回看身份配色读取已解析身份，不向作者增加身份类别。`.event-surface-archive` 标记紧凑回看布局。主题作者直接使用公共选择器，作用范围由软件统一限定。身份使用 `.guard-level-1/2/3`、`.streamer`、`.mod`，同一用户的完整身份类同时保留。同一条件范围、同等权重且仅包含一个身份条件的根规则（例如 .guard-level-3 { --bg: green; }），在生成运行样式时按优先级由低到高排列，高优先身份最后输出；保留选择器、原文、注释归属和全部真实身份类，不附加有效身份匹配条件。冲突属性由高优先身份覆盖，未声明属性保留低优先身份的值。后代规则和显式身份交集不参与编排，更具体的选择器及 important 仍遵循正常CSS规则。有效身份记录在内部属性，不作为主题作者接口。`.event-emote-big`、`.event-emote-banner` 分别表示回看中的大表情和横幅。排名沿用 `.event-current-rank--1/2/3`。

活动状态使用 `.activity-scheduled`、`.activity-running`、`.activity-awaiting-result`、`.activity-drawn`、`.activity-unknown`，临近截止为 `.activity-urgent`。开奖名单展开时由组件同步 `.winner-list.is-expanded`，原生样式直接消费 `.winner-list[open]`，保留details展开和键盘行为。内部诊断、时间计算和配置实例标识仍可保存data属性，但不作为公开主题选择器。

## 原生默认配色

原生默认的配色与排版统一位于 `src/eventStyle.css`，默认主题额外 baseCss 为空。三个主题的定稿外观均由基础样式提供，自定义CSS默认为空。价格档位的明暗默认值集中在`nativePriceGradient.ts`，可视化修改和高级代码使用同一份配色模型。

共享底座提供8个主题颜色入口，包括3种文字颜色和5种身份颜色：`--text-name`（普通用户名）、`--text-body`（正文）、`--text-secondary`（辅助信息）、`--name-anchor`（主播）、`--name-admin`（房管）、`--name-captain`（舰长）、`--name-admiral`（提督）、`--name-governor`（总督）。文本按用途复用，身份标记沿用对应身份色；背景、语义图标、盈亏和成就数字等局部配色使用具体值。

默认配色处于基础层，可视化与自定义层保留覆盖能力，公开正文、用户名与事件背景参数继续有效。配色不增加DOM或类型类，不应用于独立回看。

内部正文与辅助色入口回退到 `--text-body` 和 `--text-secondary`，明暗模式不另行固定用户名色。置顶天选文字、译文及临近截止倒计时的混色基底沿用对应公开文字色；译文保留显式局部正文色优先级。身份、回复、盈亏和事件语义色独立维护。

默认主题的字号档位使用 `--size-main`、`--size-secondary`、`--size-small`，值分别为基准字号倍率1、0.875、0.75；16px基准对应16、14、12px。倍率作用于当前部件的字号基准，不使用嵌套em累乘，现有局部字号参数继续有效。字重使用 `--weight-normal`（基础设置字重，默认500）与 `--weight-bold`（700）。

主要价格、活动奖励与开奖说明使用主要字号；货币符号、金额及数量前缀、数值、单位整组加粗。口令、条件、译文、陪伴说明及紧凑系统提示使用次要字号；辅助说明统一常规字重。开播下播时间继承标题字号和字重。粉丝牌与官方身份素材保留内部样式；盲盒来源说明保留次要字号，盈亏金额与盲盒原价字号、字重一致。可视化编辑在缺少对应预览部件时按主题基础CSS的字号档位给出继承值，不改变卡片和轻量气泡的继承方案。


## 轻量气泡主题

`native-bubble` 的显示名称为“轻语气泡”，样式源为 `src/themes/nativeBubbleTheme.css`。它复用原生公共 DOM、可视化编辑和目标投影，不增加事件节点或公开类。源码依次组织配色、尺寸、购买、醒目留言、活动与开奖、成就、互动与系统、置顶及窄幅规则。

常规宽度下气泡随内容收缩，礼物与大航海的用户信息、购买文字、价格紧凑相接，来源和陪伴信息另行。容器不超过20B时，购买、SC和活动正文使用头像下方的整行。SC及活动使用较小圆角，开奖沿用天选紫色或红包红色表面；摘要保留公共人数和奖品文案，名单展开占满内容宽度，按钮位置跟随实际内边距。成就采用公共网格布局，头像在左侧对齐首行，文字使用中间列，右列保留荣誉图标，数字紧跟说明；默认上下8px、左右12px内边距。16px基准使用20px正文行高、14px辅助字和12px细节字；成就正文14px、数字沿用说明字号并使用正体，头像沿用普通大航海尺寸。头像与文字之间保留24px高的细竖线，右侧显示官方勋章。警告和切断分别使用金黄、红色表面及加粗文字，明暗模式独立配色。

普通弹幕、互动、购买及SC的头像均对齐用户信息首行，正文或用户名换行不把头像移至整块内容中部。大表情、横幅表情与合并数量按正文顺序行内排布，剩余宽度不足时自然换行。横幅表情保持原始比例，宽度上限15B、高度上限1.25B，同时受正文可用宽度约束。小表情继续随文字排列。公开行高、头像、媒体及内边距参数仍参与相应尺寸计算；置顶保持整行居中，不采用普通事件的首行头像规则。

主题的正文、价格、数量、周期、倒计时、时间和成就数字统一沿用软件MiSans，不单独使用IBM Plex Mono或Georgia；身份原色和徽章保持现有规则，区域画布透明。`--bubble-*` 是主题内部配色与尺寸，不是公共接口；用户通过现有部件、公共参数、可视化或自定义CSS覆盖外观。主题只作用于现场、副窗口、OBS和相应预览，回看继续独立。

## 主题与回看的统一边界

现场、副窗口、OBS和对应预览的主题区域使用通用 `.theme-surface`，原生及兼容模式共用此边界；回看、事件检索和收藏不生成该类，使用独立样式和设置。标记添加到现有节点，不包含副窗拖拽、缩放及软件工作台。

主题源码直接使用 `.event`、`.event-area`、`.username` 等公共选择器，无需出现review或archive排除条件。同一主题的公共规则在各已绑定场景共同生效，现有场景类仍可限定差异。

原生基础、可视化覆盖和高级CSS统一限定到主题区域；区域根、后代、明暗、根变量、媒体查询及显式scope均由共同入口处理，边界不增加作者规则的选择器权重。默认基础CSS由主题准备步骤生成挂载产物，作者源文件为 `eventStyle.css`。预览、实际运行与OBS采用相同作用域工具。

原生应用前展开CSS导入及其layer/supports/media条件；未能读取的CSS导入使本次应用失败，保留当前主题。普通保存仍可保留远程引用。兼容主题保持独立渲染文档、原DOM与CSS语法，主题编辑不进入回看路径。

## 原生主题公共排版

- 默认字体使用 MiSans 系列；用户指定字体仍通过原有编辑参数覆盖。
- 弹幕头像对齐用户信息首行。表情与正文参与自然换行。
- 排行榜标记与身份标记保持一致的视觉间距；身份颜色沿用已有定义。
- 礼物名称与数量、大航海月数与单位默认同字号；数量字号仍支持独立编辑。
- 开奖摘要使用加粗文字，展开按钮使用图形箭头；摘要内容保持现有文案。
- 默认大航海成就使用左头像、两行完整文字、右侧官方勋章。窄幅可将头像与勋章排在同一行，完整两行文字使用下方宽度。里程碑数字保留在原始说明句中；普通文字500、强调文字700。头像和勋章分别服从各自显示及尺寸设置。
- 名单展开按钮在展开和收起时保持相同位置。卡片弹幕元信息与徽章换行间距为4px；窄幅大航海头像只占用户信息行。
- 大航海荣誉使用事件 broadcaster 中的主播头像。无主播资料或关闭头像时保留图标；回看保持独立布局。
- `event-inline-layout` 用于系统与成就的私有排版。主题可通过 `content`、`message`、`honor-heading`、`honor-summary` 定位内容。
- 尺寸可按用途使用固定像素或相对缩放；保留公共编辑参数。

卡片成就头像与普通大航海事件使用同一尺寸参数。轻量气泡系统消息左侧内边距沿用原规则，右侧默认20px，显式内边距配置优先。

浅映卡片的普通头像为2B，用户信息行高为自身字号的1.5倍，弹幕正文、SC正文、翻译及系统文字为自身字号的1.4倍。大表情与横条表情随正文行内排列，连击和撤回标记紧随正文，可用宽度不足时换行。主金额为1.25B，事件外间隔为0.25B。

卡片成就保留金色表面、里程碑强调，以及以头像中心绘制的40/70/100/130px同心圆。轻语气泡成就正文为0.875B，数字随说明排列；头像与同主题大航海一致，头像和文字之间保留细竖线。

轻语气泡的头像为1.5B，事件外间隔为0.25B。宽幅成就的列间距为0.5B，文字列左侧留0.25B并显示1.5B高的分隔线，上下内边距为0.75B、左右为1B。容器不超过20B时，正文通栏并收起分隔线，上下内边距为0.5B、左右为0.75B。公开间距与内边距参数优先。

主播和房管身份沿用 `.streamer-badge`、`.mod-badge`，图标形式增加 `.identity-icon`，文字与图标形式由主题基础设置分别控制。成就水印沿用 `.honor-icon`，独立编辑颜色和尺寸；成就说明编辑定位到 `.honor-summary` 内非里程碑的文字节点。图片身份和荣耀勋章以单一尺寸控制高度并保留比例。

默认主题的颜色、字号和字重以语义父级为入口。价格符号与数值、数量各部分及陪伴说明从整组继承；子节点已有共享底座声明时，仅用 inherit 解除该声明。深浅模式共用同一套文字规则，只对实际不同的变量、背景和图标颜色分别定义。身份色、盲盒盈亏和成就数字保留独立语义。

卡片与轻量气泡只覆盖与共享底座不同的外观与布局。价格数值继承整体设置；卡片货币符号同样继承整组字重。数量中有意区分的字重、警告图标的高优先级覆盖、成就头像对齐与局部字号所需行高保留。可视化和自定义层仍可单独覆盖子部件。

原生默认主题的普通弹幕与互动上下内边距为一个基础间距（16px基准4px），左右内边距为0.75B，事件间距为0.25B。显式内边距参数和可视化覆盖优先；卡片与轻语气泡沿用0.25B的事件间距，并分别设置卡面和气泡的内边距。

原生静态与点选预览打开或切换样例时从完整首条开始。动态预览沿用真实消息流的滚动方向并跟随最新；预览阅读定位独立于现场、副窗口和OBS的滚动逻辑。

原生及兼容样式点选预览的悬停框与选中框统一为2px，颜色取软件当前配色对应预览明暗模式的强调色，向元素内侧绘制，避免首条、末条及贴边部件的辅助边框被滚动区域裁切；辅助边框不参与事件盒模型，不改变正式输出。

现场交互高亮按整行槽位的完整宽高绘制，并排除事件间隔；主题卡片与文字位于高亮底色之上。悬停或聚焦时，右侧菜单渐变覆盖完整事件高度，快捷按钮相对事件整体居中。常驻标记在未悬停时使用紧凑渐变。高亮不参与布局，不接收鼠标事件。

卡片置顶栏容器上下不额外留白、左右内边距4px，与内部共享4px外边距合计为左侧8px、上下各4px。置顶条自身尺寸保持原值，空栏不占纵向空间；默认与轻量气泡不受此规则影响。

轻量气泡置顶条统一使用700字重，价格符号、价格数值、天选标题与盲盒盈亏继承置顶条父级设置。主事件的字重层级保持独立，可视化和自定义CSS仍可覆盖具体部件。

卡片与轻量气泡的数量和月份在父组定义强调字重，前缀、数字与单位继承。轻量气泡SC价格沿用普通价格的500字重，不单设600；卡片价格保持700。普通用户名使用独立文字层级，天选、红包的说明和奖励按整行定义颜色。系统消息标题、说明与时间继承同一组颜色，图标保留语义色。通用字号变量名不作为默认主题的唯一识别条件，可视化继承值保留主题自身的尺寸与字重。

系统图标的默认语义颜色由共享底座统一持有，主题不重复声明，局部可视化和自定义覆盖继续有效。卡片与轻量气泡的直播开始、结束在系统消息父级设置700字重，标题与时间继承。红包与天选开始事件的头像对齐首行，正文使用文字列，隐藏头像后不保留空列；浅映卡片的头像对齐首行，容器宽度不超过20B时，活动正文移到头像下方通栏。轻量气泡的活动说明独立成行，16px基准下行高20px、行间距4px。卡片天选标题与奖品行同色同字重，开奖标题继承正文的16px、700字重与颜色。撤回标记前的间隔由可折叠文本空格承担，不使用左外边距。


## 价格梯度与事件时间

原生主题基础设置的“按价格梯度配色”统一控制梯度，新建原生主题默认开启，用户仍可关闭。普通礼物、盲盒礼物和SC各自选择固定配色或梯度；大航海及其他类型不参加价格分档。档位、分类开关和颜色属于可视化设置，恢复基础设置不清除档位方案。

已有事件根增加`.price-tier-<档位ID>`；启用且分类参与时同时具有`.price-gradient-active`。普通礼物按总价值、盲盒按开出总价值、SC按留言金额选档，区间下含上不含。免费礼物及未知价值不生成有效梯度。事件流和置顶复用相同档位，不新增排版节点，不修改归档金额或回看显示。

档位类 `.price-tier-band-*` 表示可调整阈值的档位编号，不代表固定金额。主题分档规则同时使用 `.price-gradient-active`，关闭梯度时不按档位着色。分档代码使用`--price-tier-background-color`和`--price-color`，仅控制事件表面及主价格。身份色、正文色、盲盒本体价格和盈亏语义色保持独立。可视化复用事件范围、部件和通用／浅色／深色配色；共用档位可被分类颜色覆盖，恢复继承后回到共用值。高级编辑里的档位颜色与可视化双向同步，未识别的额外CSS声明保留。

内置金额起点为0、30、50、100、500、1000、2000元。30元以上档位参考B站`av/v1/SuperChat/config`原始色板；0元基础档和适合三个主题的明暗配色由软件提供，不作为官方深色配色。档位可新增、删除和修改起点，基础档固定从0元开始。颜色绑定稳定档位标识，修改门槛和排序不改变标识或现有配色；新增自定义标识递增，删除及管理面板恢复预设后不复用旧自定义标识。自定义CSS使用`--tier-band-1`、`--tier-bg-band-1`等变量及`.price-tier-band-1`类，不以金额命名；金额只表示起始门槛。

事件时间复用`.time`，位于`.event`内，与用户信息和`.content`同级，使用MiSans、辅助字号及500字重。默认主题的弹幕和三个主题的互动时间均行内接续，保留文字间隔。默认主题及卡片的卡片事件按正文末行剩余空间放置时间：放得下则同行靠右，放不下独立换行，时间本身不拆开；布局状态类`.time-inline`及测量位置变量仅供内部排版使用。轻语气泡的其他事件只显示时分，宽幅时位于气泡右下方，间隔为0.25B。气泡按时间的实际文字宽度留位；容器不超过12B，或预留时间后剩余宽度不足10B时，时间移入气泡。大航海成就不生成时间。现场、副窗口、OBS及预览消费同一主题开关；直播开始和结束保留已有文案时间，其余系统事件不显示时间。秒字段使用`.time-seconds`，轻量气泡隐藏该字段，完整时间由`time`日期属性提供。回看保持原有结构及显示。

可点击礼物图的`.event-gift-effect-trigger`沿用礼物图片的行内垂直对齐，不增加内外边距；可播放状态不改变图片尺寸、行高或相邻文字位置。

价格梯度保留主题表面：默认主题的内置档位背景在明暗模式均为30%不透明度；卡片使用不透明底面，叠加浅色7%、深色6%的主题色及原有高光；轻量气泡的付费事件使用不透明底面。背景透明度不作用于整条事件，不改变头像、文字或身份颜色。

置顶与普通事件共用`.blind-profit`的正负语义颜色。16px基准下，置顶价格与盈亏之间间隔4px，随基准字号等比变化；轻量气泡盈亏与对应价格共用字号及700字重。

卡片礼物及大航海图标跟随购买正文，时间位于独立区域。开奖时间按卡片内边距对齐。公共身份色、身份文字边框与盈亏语义色由共享底座维护。


原生基础设置的互动大类默认关闭，六项互动细项保留开启；头像框默认开启。礼物图标与事件图标独立控制。事件图标包含醒目留言、天选和红包开始及开奖、大航海购买及成就、系统消息图标，事件区与置顶栏使用同一开关；普通原生互动当前只输出用户与动作文本，不生成点赞图标；不包含礼物图片、弹幕表情、用户身份标记、头像框、时间及操作图标。关闭事件图标不删除事件正文或改变身份标记。

关闭事件图标后不生成空媒体容器。系统消息正文占满可用宽度；默认与轻量气泡的成就取消勋章专用列，卡片成就保留数字列。卡片开奖取消图标专用列，价格只在对应图标存在时预留其宽度。

现场与回看快捷菜单的按钮热区为24px、图标为16px，按钮间隔2px；尺寸随各场景字号同比缩放。收藏和标记的常驻状态使用贴合SVG轮廓的发光，不填充按钮背景；光晕不参与点击判定。键盘焦点保留独立轮廓。

### 可视化背景填充

背景填充复用现有背景字符串，支持纯色、线性和径向渐变。渐变可增删色点、拖动位置及编辑角度、形状与中心；多层背景按层编辑，其他图层和底色保留。价格档位面板提供核心颜色，事件背景面板编辑完整填充；显式 `--event-background` 优先于价格档位的主题表面。浅映卡片保留柔光叠层与底色混合，价格档位颜色不接收渐变图像。文字、边框保持颜色控件。回看不消费这些设置。

### 可视化图片

图片背景独立于背景填充入口，同一背景保存图片、渐变和底色。图片层支持显隐、替换、移除引用和排序；尺寸默认锁定原图比例。对齐位置使用九宫格，移动可用 px 或百分比，图片锚点独立控制自身参考点。移动百分比相对定位区域，锚点百分比相对图片。原生和 Laplace 的 px 尺寸按基准字号输出，BLC 原版按整体比例输出。

装饰图使用目标已有的 `::before`、`::after`，不增加事件节点。随文排列占据原有行内位置，自由定位沿用实际定位参照；改为跟随当前部件必须由用户明确选择。已有文字、动画或变换占用的伪元素不覆盖。图片层不拦截点击，同一伪元素内的多张图片共用内容前后关系，层内顺序决定相互遮挡。

头像框在头像区域提供独立入口，支持沿用主题、自定义和不显示；自定义时隐藏原框，尺寸跟随头像容器。图片边框提供四边切片、拖线、厚度、重复、填充与外扩，保留已有复杂边框值。移除图片仅移除样式引用，不删除素材文件。背景和边框需要可绘制的盒子，装饰需要可用的伪元素；实际祖先裁切仍然生效。以上配置均保持回看隔离。

## 查阅依据

| 内容 | 当前实现 |
| --- | --- |
| 事件类型与完整身份类 | [publicEventStyle.ts](../../src/events/publicEventStyle.ts) |
| 普通事件、回看、数量、活动与系统结构 | [EventRow.tsx](../../src/components/EventRow.tsx) |
| 置顶与名单 | [StickyEventCard.tsx](../../src/components/StickyEventCard.tsx)、[LotteryWinnerList.tsx](../../src/components/LotteryWinnerList.tsx) |
| 编辑选择器与能力 | [nativeSemanticSelectors.ts](../../src/themes/nativeSemanticSelectors.ts)、[nativeThemeCapabilities.ts](../../src/themes/nativeThemeCapabilities.ts) |
| 参数投影与公共底座 | [eventAreaStyleConfig.ts](../../src/eventAreaStyleConfig.ts)、[eventStyle.css](../../src/eventStyle.css) |
| 回看独立设置与样式 | [reviewStyleSettings.ts](../../src/reviewStyleSettings.ts)、[archiveEventStyle.css](../../src/archiveEventStyle.css) |
| 默认、卡片、轻量气泡 | [nativeDefaultTheme.css](../../src/themes/nativeDefaultTheme.css)、[nativeCardTheme.css](../../src/themes/nativeCardTheme.css)、[nativeBubbleTheme.css](../../src/themes/nativeBubbleTheme.css) |


## 礼物正文换序

默认购买正文依次显示动作、主图、名称与数量、主金额。盲盒来源和大航海陪伴信息保留在各自正文中。浅映卡片在购买正文右侧排列主金额和购买图标，轻语气泡的金额紧接购买信息。数量与单位使用“礼物名×1”“舰长×1月”，乘号前不插入空格或元素间距。

```css
.event.type-gift .content { display: flex; flex-wrap: wrap; align-items: center; }
.event.type-gift .content > .action { order: 0; }
.event.type-gift .content > .gift-price { order: 1; }
.event.type-gift .content > .gift { order: 2; }
.event.type-gift .content > .gift-icon { order: 3; }
.event.type-gift .content > .blind-gift { order: 4; flex-basis: 100%; }

.event.type-gift .blind-gift > .blind-gift-icon { order: 0; }
.event.type-gift .blind-gift > .blind-gift-name { order: 1; }
.event.type-gift .blind-gift > .blind-gift-count { order: 2; }
.event.type-gift .blind-gift > .blind-price { order: 3; }
.event.type-gift .blind-gift > .action { order: 4; }
.event.type-gift .blind-gift > .blind-profit { order: 5; }
```

交换 gift-price 与 gift 的 order 即可交换主价格和礼物信息的位置；gift-icon 可单独调整。blind-gift 作为整组参与主行调序，盲盒图标及名称等部件在组内调序；图标不与主礼物部件交叉排列。可播放、静态图和重试状态使用同一部件类。

## 部件间距与盈亏状态

合并数量repeat-count与正文保留0.25B间距；盲盒原价前后保留0.25B间距，开出动作与盈亏按自然文字排列。大航海名称与×周期、奖品与×数量继续紧贴。红包动作与金额共基线，图片在文字行内排列；口令沿用所在主题的公共文字行高。名单按钮在普通开奖标题右侧，展开内容通栏；回看继续行内布局。

盲盒差额为正时输出blind-profit.is-gain，为负时输出blind-profit.is-loss，为零或未知不输出盈亏标记。公开颜色变量分别为--blind-profit-gain-color和--blind-profit-loss-color。可视化“盲盒盈利”“盲盒亏损”消费对应状态与变量，内部已保存的部件键保持不变。总督与其他大航海事件采用相同价格条件，有实际priceRmb时显示，未知不按身份推算。


## 事件摘要中的交互

事件检索摘要的空白与普通文字可打开上下文。名单 summary、用户按钮、链接及其他内部控件执行自身动作，不触发外层打开；键盘仅在摘要自身获得焦点时由 Enter 或空格打开上下文。


## 比例尺寸与身份文字

三套原生主题的默认视觉长度按16px基准定义，回看事件按独立14px基准定义。字号、头像、徽章、表情、内外间距、边框、圆角、阴影、渐变长度、装饰定位、焦点轮廓、名单高度上限及动画位移随各自基准同比变化。零值、百分比、素材原始坐标、颜色、字重及动画时长不参与长度换算。自定义CSS明确写入的固定尺寸保持固定，不修改作者原文；软件设置面板及独立管理弹窗遵循软件UI字号。

大航海、主播、房管及荣耀文字共用 badge-font-size，默认0.75B、行高1.5，默认高度1.125B，左右内边距0.25B，使用各自语义色18%的浅底和40%的细轮廓；轮廓宽度为B/16并向内绘制，不改变占位尺寸。荣耀等级文字使用统一蓝紫色，浅色为rgb(105,89,166)、深色为rgb(190,178,238)，底色和轮廓随文字色派生；badge-color 可覆盖。文字标记字重保持400。原生文案、真实等级、身份顺序和显示开关不变。用户信息与徽章组继续分别使用 inline-flex / wrap / align-items:center，各自按宽度换行。

软件配置保存头像、留白、间隔及描边的无单位私有比例，在部件处读取公开字号计算长度。--native-base-size 只为可视化根字号的倍数值提供原始输入，防止 --event-font-size 自引用；它不是第二个公开字号，也不作为部件尺寸的计算基准。可视化CSS继续反向同步，相对值保留比例，明确固定值保留固定含义。

浏览器可能按设备像素量化小数边框，样式本身保留比例与小数，不主动取整。

## 内置主题覆盖

浅映卡片与轻语气泡的主题 CSS 位于 default 层，直接使用 --event-font-size 计算长度，不另设主题字号别名。公共文字色、表面材质及复用状态保留变量，单个事件的独有配色写在对应规则中。可视化默认值与价格梯度通过主题已有的 --card-surface、--bubble-surface 识别配色，时间布局同样识别轻语的表面变量。

轻语的礼物与大航海首行使用自然行流，头像浮动在左侧，用户名保留头像和两处间隔的宽度；盲盒来源及陪伴说明另起一行并对齐头像后的文字列。窄幅购买信息使用 flex / wrap，第二行通栏，头像与用户名仍从同一行开始。关闭头像后不保留文字列缩进。主题内自然行流的 content 需要 CSS 调序时可改为 inline-flex / wrap；默认底座及 DOM 部件关系不变。两套主题的置顶事件使用 flex / nowrap，避免普通付费事件与活动事件的排版覆盖单行胶囊。

### 直播间封禁

`ROOM_LOCK` 对应 `RoomLock=28`，`Unknown=27` 及已有事件编号不变；与 `CUT_OFF` 分别记录。`roomLock.endsAt` 为明确解禁时间的 Unix 毫秒，`source` 为 `expire` 或 `room-info`。原始日期按北京时间解释；缺少有效期限时仅查询一次房间信息，只有 `is_locked=true` 且 `lock_till` 有效才补齐，不将零值或非法日期解释为永久封禁。

原生消息复用 SystemMessage 和 LockKeyhole 图标，沿用切断的危险色和主题质感。有原因时展示原文，有期限时展示北京时间完整日期；未提供则说明解禁时间未提供。现场顶部封禁状态优先于切断，显示完整期限和精简剩余时长；年、天、小时、分钟、秒省略零值，精简格式最多两个非零单位，年按365天换算。到期后等待平台状态确认，不自行宣布解禁。重新开播结束此前的紧急提示；小铃铛和历史记录保留，不显示动态倒计时。封禁共用警告、切断的显示及播报分组。兼容输出没有封禁组件时使用通用系统消息。


### 粉丝牌所属主播资料

现场和回看的粉丝牌通过共享资料浮层展示所属主播。原有粉丝牌节点及样式保持不变，宿主事件提供点击和键盘入口；OBS、展示输出和样式预览不增加交互。兼容现场通过既有事件键定位粉丝牌，资料浮层由宿主绘制，不改主题结构。

所属UID来自事件明确提供的粉丝牌字段，旧数组同时保留主播名与房间号；不按牌名推断。资料查询复用getMasterInfo，返回当前名字、头像、粉丝数和直播间号。同一主播按UID缓存，打开后按需更新；缓存不写入原始日志，也不将当前粉丝数作为历史事件字段。

资料卡复用共享浮层：24px头像、主播名和粉丝数两行、右侧个人主页及直播间图标整体垂直居中，间距8px。头像复用事件菜单预览。缺少归属时显示暂无主播信息，未知粉丝数不显示为零；加载失败提供重试，未获得直播间号时不可跳转直播间。文案跟随四种界面语言。


### 事件浮层边界

主播资料卡和事件菜单共用当前内容区边界。现场以整个事件展示区为界，不包含连接栏、筛选栏、底部概览及右侧工作台；双区、多区允许跨列。回看以时间线或事件检索结果的可视区域为界，不覆盖上方导航和筛选。内容区与窗口、上层滚动裁切范围取交集，四周保留8px。

浮层贴近触发位置，空间不足时向上或向左避让；菜单高度受区域限制，超出部分在菜单内部滚动。窗口尺寸、工作台布局和事件位置变化时同步重新定位；触发事件完全滚出可视范围时关闭。兼容样式使用原始事件或粉丝牌的实时位置，不保留脱离事件的静态坐标。回看检索摘要中的粉丝牌打开资料卡，不触发摘要跳转。

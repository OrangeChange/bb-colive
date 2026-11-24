# 兼容主题契约

本文维护 BLC 原版、BLC 开放版与 LAPLACE 的来源、运行入口、事件能力、DOM 语义、单位和设置归属。来源没有真实节点或真实事件消费者时，不增加可视化控件，也不以相似的原生节点补造。

## 适用范围

- 三种兼容主题均可用于现场、副窗口和 OBS 配置预览／已保存快照；回看不接入兼容主题。
- 现场继续使用软件现有阅读、锚点、未读、筛选、菜单和完整历史语义，不继承副窗口的 N 上限、定时移除或置顶栏行为。
- 副窗口与 OBS 使用软件统一的准入、严格 N、到期、置顶、删除和活动结束语义，再投影到各版真实 renderer。
- 主题只保存元素显示、外观、模式单位和模式专属视觉选项。目标显示缩放属于现场、副窗口或单个 OBS 配置，默认 100%，不进入主题包。

## 固定来源

当前源码由各模式的固定来源、宿主适配和运行资源组成。开发与构建只依赖本仓库中的正式目录。

| 模式 | 上游与固定版本 | 源码入口 | 运行入口 | 生成／资源关系 | 许可证与发布边界 |
| --- | --- | --- | --- | --- | --- |
| BLC 原版 | blivechat 1.10.4，upstream `848409df78d2cca65d3cc8ffe938eb6b6f261b76` | `src/compat/blivechat/RendererHost.tsx`、`projection.ts`、`runtime/core.mjs`；真实组件在 `vendor/blivechat/upstream/frontend/src/components/ChatRenderer/` | `public/blivechat/renderer.html` → `renderer.js`，宿主经 `bb-blivechat` postMessage 发送 config/css/event | `scripts/build-blivechat.cjs` 从 vendor 上游组件、host 文件和 compat runtime 生成 `public/blivechat/*`；`build-info.json` 记录输入与产物哈希 | `vendor/blivechat/LICENSE`；第三方声明在 `public/blivechat/THIRD_PARTY_NOTICES.txt` 与 `renderer.js.LICENSE.txt`，发布时一并保留 |
| BLC 开放版 | DoodleBears/blivechat，MIT 提交 `0da8c94d40a8791bb212985f6ac0ae55765c3a03` | `vendor/openlive/frontend/src/components/ChatRenderer/`、`vendor/openlive/host/`；软件桥接在 `src/compat/openlive/runtime/` | `public/openlive/renderer.html` → `renderer.js`、`entry.mjs` | `scripts/build-openlive.cjs` 使用固定 Vue 2／Element UI 依赖构建；不加载部署版模块包；来源见 `provenance.json` | MIT 许可证和依赖声明随产物保留；既有第三方主题 CSS、官方图片与字体维持各自来源 |
| LAPLACE | Stable238 外观与主题契约 | `src/compat/laplace/renderer/independent/`，宿主桥接在 `RendererHost.tsx` 与 `renderer/frame.tsx` | `public/laplace/product/index.html` → `renderer.js` | `scripts/build-laplace-product.mjs` 构建独立组件；正式资源映射位于 `renderer/asset-locations.json`，不读取旧捕获源码 | React、Radix、Tabler 等依赖保留原许可；主题 CSS、字体及图片保留各自来源，见根目录 `THIRD_PARTY_NOTICES.md` |

## 主题来源与外部 HTML

- 样式工作台列出 LAPLACE 的 18 个内置目录条目（含精选来源）；两类来源在预览阶段都保持 `builtin` 身份，只有用户执行“另存主题”后才生成自定义主题。远程网址来源在成功加载并预览后保存为自定义主题。
- 显式更新网址主题只替换远程 `baseCss` 与来源元数据，保留自定义主题 ID、settings、visualCss、customCss 和 assets。精选来源更新同样另存自定义副本，不覆盖内置来源。
- LAPLACE 网址加载与 BLC 外部 HTML 预览使用代次门禁；输入变化、取消、关闭或重新打开后，旧请求的迟到结果不能写回当前对话框。
- BLC 外部 HTML 仅接受无凭据绝对 HTTP(S) URL，并且必须在样式工作台的可见 iframe 中完成 SDK 1.0.1 握手、`blcInit`、样例快照和 CSS 注入后，才能另存为自定义主题。下载或仅能载入页面不等于通过 SDK 预览。
- 固定 SDK 1.0.1 只提供连接、初始化、消息增删改和 CSS 注入，没有点击、菜单、定位、阅读状态或配置更新回传。因此外部 HTML 禁止应用到现场；BLC 原版正常主题继续支持现场。外部 HTML 只可应用到副窗口与 OBS。
- 副窗口和每个 OBS `targetId` 稳态各有一个目标级 iframe，消费该目标现有消费者产生的完整可见事件快照与稳定 ID 增删改，不拥有第二套筛选、合并、计时、队列或绑定状态。prepare 期间允许同时存在“当前输出 + 隐藏候选”两个 iframe。
- 正式应用采用双 surface prepare/commit：当前输出 A 持续可见；候选 B 以独立 request revision 隐藏握手。同 URL 再应用也创建新候选。B 就绪后才保存、绑定并发布，并以同一候选实例原子替换 A；失败销毁 B，保留 A 与原 binding。OBS 尚无兼容快照或当前为原生主题时，也必须挂载隐藏候选完成 prepare。
- 固定 SDK 的 `blcInjectCss` 只会追加 style，不能撤销旧声明，因此正式 CSS 或配置变化不在已连接 iframe 上热更新，而是创建隐藏候选、重新 init/replay 后 swap。fixture 使用稳定 style ID 替换内容验证最终 CSS；真实页面 reload 无论 connect 发生在 load 前后，都按新 document generation 重新 init/replay。

### 构建与生成物

BLC 原版与开放版分别由对应构建脚本生成，源码、固定依赖和授权声明随仓库维护。LAPLACE 使用自行实现的组件构建，不加载旧提取模块。入口和资源关系见[项目目录与资源职责](repository-structure.md)。

## 共用事件能力矩阵

“支持”表示该版有真实投影和真实 renderer 节点；“软件接管”表示来源事实保留，但准入、删除、N、到期或置顶由共用底座决定；“不支持”表示不得显示控件或伪造节点。

| 事件 | BLC 原版 | BLC 开放版 | LAPLACE |
| --- | --- | --- | --- |
| 普通弹幕／大表情弹幕 | 支持 `onAddText`；平台小表情与单图大表情进入真实 `TextMessage` | 支持真实 text renderer；普通与大表情分别按实际节点 | 支持 `event--message`，保留 bmote／大表情解析与剧透解析 |
| 进房、关注、分享、特别关注、互相关注 | 不支持 | 不支持 | 支持六互动中的对应 `event--interaction` 子型 |
| 点赞 | 不支持 | 仅真实 `Like` 且 `count` 为非负安全整数时支持；缺失、负数、非整数、超出安全整数范围均不显示 | 支持 `event--like-click`，保留真实计数 |
| 免费礼物 | 支持 `PaidMessage` 的免费礼物路径 | 支持 | 支持 `event--gift` |
| 普通付费礼物 | 支持 `PaidMessage` | 支持 | 支持 `event--gift`，按真实金额档位 |
| 盲盒 | 按开出礼物的普通礼物名与数量展示，不提供盲盒专属分类、盒名、支付价或盈亏部件 | 同左 | 支持真实盲盒事实；支付与价值口径分开 |
| 红包投喂 | 不支持独立类型 | 不支持独立类型 | 仅有真实投喂事实时作为礼物子型；不得冒充红包开始／结果 |
| 红包开始／结果 | 不支持 | 不支持 | 支持 `event--red-envelope-start`／`event--red-envelope-result`，真实结束由软件接管 |
| 天选开始／结果 | 不支持 | 不支持 | 支持 `event--lottery-start`／`event--lottery-result`，真实结束由软件接管 |
| 醒目留言 | 支持 `onAddSuperChat`／`PaidMessage` | 支持真实 paid-message | 支持 `event--superchat` |
| 醒目留言删除 | 支持 `onDelSuperChat`，软件接管删除与重放去重 | 支持并取消尚未显示的已删 SC | 支持宿主删除输入，软件接管 tombstone 与重放 |
| 正常大航海购买／续费 | 支持 `onAddMember`／`MembershipItem`；`memberSource=2` 的 GuardHonor 排除 | 支持正常 membership 卡 | 支持 `event--toast` |
| 独立大航海贺报／GuardHonor／MVP | 不接 GuardHonor；不支持 MVP | 独立贺报不接；MVP 不支持 | MVP 不接入、不预览；正常 toast 不受影响 |
| 系统事件 | 不新增独立系统列表 | 不新增独立系统列表 | 实际分派：`live-start`／`live-end` → `live`，`user-block` → `userMute`，`room-mute-on`／`room-mute-off` → `roomMute`，`room-name-update` → `roomChange`，`live-warning`／`live-cutoff` → `warning`；另保留来源 `system`。`Notice`、`CoverAudit`、`preparing`、敏感诊断不进入统一观众输出 |

一级事件总闸为弹幕、互动、礼物、醒目留言、大航海、系统；父闸只控制准入，不改子项选择。开放版互动只支持点赞，明确排除的是进房、关注、分享、特别关注、互相关注五项，不得用“其余互动不支持”误伤点赞。礼物总闸不得吞并 SC 或大航海。事件分类决定整条是否进入，不提供“隐藏正文”能力。

系统事件按用途分流：现场保持软件原提醒区，不把兼容 renderer 变成第二套系统消息流；副窗口不新增系统事件入列；OBS 只按该 OBS 配置绑定的房间投影上述 LAPLACE 系统子类，不能跟随软件当前房间。连接状态文字属于各输出的宿主状态，不与平台开播／下播合并。

## 身份与信息元素矩阵

| 元素／身份 | BLC 原版 | BLC 开放版 | LAPLACE |
| --- | --- | --- | --- |
| 头像 | 真实 `#author-photo`；主区 text 为 24，paid/member 为 40，ticker 为 24 的来源默认 | 同族真实节点，具体 px 保留开放版来源默认 | `[data-slot="avatar"].avatar-wrap`，图片为 `.avatar-img-wrap > img.avatar`；`showAvatar` 默认 `true`，是全局产品呈现开关 |
| 用户名 | `yt-live-chat-author-chip #author-name`；paid 为 `#author-name` | 同族节点 | `.username`／`.username-text`，回复为 `.reply-username`、礼物接收者为 `.gift-receiver-username`；`showUsername` 默认 `true`，是全局产品呈现开关 |
| 主播 | text 的 `author-type="owner"`，没有独立新增徽标 | 真实 owner 状态；不补原生式主播徽标 | `user-type--streamer` 与已有 streamer badge |
| 房管 | `author-type="moderator"` 与 author badge | 真实 admin／moderator badge | 真实房管状态／徽标；与主播、大航海可并存 |
| 大航海 | `blc-guard-level` 与 `author-badge[type="member"]` | 真实 privilege badge | `guard-level--1/2/3` 与 guard badge；默认身份优先级高于主播、房管 |
| 粉丝牌 | 默认组件不存在，不支持，不补造 | 支持 `yt-live-chat-author-medal-renderer`；只过滤明确未点亮，当前房间按输出房间事实 | 支持 `.fans-medal`；当前房间按输出房间事实，未知保留 |
| 头像框 | 不支持 | 不支持 | `.avatar-frame-wrap > img.avatar-frame` 或空 `.avatar-frame`；来源字段 `avatarFrame`，状态类含 `avatar-frame-rank--*`；`showAvatarFrame` 控制，失败类 `.avatar-frame-fallback`。不得套用原生九张头像框契约 |
| 荣耀等级 | 不支持 | 不支持 | 来源字段 `wealthMedalLevel`，开关 `showWealthMedal`；容器 `.wealth-medal.wealth-medal-lvl--N`，等级文字 `.wealth-medal-text`，真实图片节点 `.wealth-medal > picture > img`，失败时容器增加 `.wealth-medal-image-failed`、图片增加 `.wealth-medal-image-fallback`；只有数值非零时生成，不以旧 `userLvl/UL` 代替 |
| 榜单排名 | 不支持 | 不支持 | 来源字段 `currentRank`；事件根 `current-rank--N`，可见节点 `.current-rank.current-rank--N`；产品默认 `showCurrentRank=false`，只显示正安全事实，不抓榜、不补值 |
| 时间戳 | 真实 `#timestamp`；公共开关仅在副窗口、OBS 生效 | 真实 `#timestamp`；同左 | `.timestamp.tabular-nums`，内部 `.time.hour/.minute/.second`、`.figure/.separator`；来源字段 `timestampNormalized`。`live-start/live-end` 强制显示来源时间，其余按真实节点与用途开关 |
| 用户名打码 | 仅副窗口／OBS 显示固定 `***`，不改原始身份；现场不扩展 | 同左 | 同左 |

### LAPLACE 头像和用户名控制范围

- `showAvatar=true` 与 `showUsername=true` 是两个独立的产品呈现开关，默认均为 `true`；关闭时分别移除 product renderer 中实际存在的 `[data-slot="avatar"]`，以及 `.username`、`.reply-username`、`.gift-receiver-username`，不删除正文、粉丝牌、价格、图标或内联来源事实。
- `classicElementScope=false` 是默认值，表示上述两个开关在 OBS 产品输出中覆盖 product manifest 已锚定的全部真实头像／用户名节点（清单记录 28 个头像锚点、11 个用户名锚点）。
- `classicElementScope=true` 不是第三个显隐值，也不把 `showAvatar/showUsername` 改回 `true`；它仅在 `mode === "obs"` 时绕过产品级全局包装，恢复来源 renderer 原有的限定控制范围。`mode !== "obs"` 的软件 dashboard／现场交互路径本来就绕过该包装，不能据此宣称全局开关已控制现场所有身份节点。

## 逐版 DOM 与区域映射

### BLC 原版

| 语义 | 来源选择器／节点 | 默认来源 | 支持属性与读写 |
| --- | --- | --- | --- |
| 整体／列表 | `yt-live-chat-renderer`；`yt-live-chat-item-list-renderer #item-scroller`、`#items` | 上游 CSS 与生成器变量 | 字体、字号、行高、列表背景；结构只读，CSS 双向仅处理可识别声明。方向不属于主题属性 |
| 弹幕行 | `yt-live-chat-text-message-renderer` | TextMessage.vue | 背景、横纵 padding／margin、边框、圆角；写 CSS，computed 读回 |
| 用户名／正文／时间 | `#author-name`、`#message`、`#timestamp` | stylegen `--username-*`、`--text-content-*`、`--time-*` | 颜色、字号、字重、字体、描边；分别读写，不用正文设置覆盖用户名 |
| 头像／身份 | `#author-photo`；`#chat-badges yt-live-chat-author-badge-renderer` | 组件默认 24px／40px 与 `--avatar-size` | 尺寸、显隐、间距；房管和大航海保留真实形态 |
| 小／大表情 | `#message .emoji`；`.emoji.blc-large-emoji` | `--emote-size`、`--large-emote-size` | 独立尺寸；大表情不是正文固定 px 的替代值 |
| 礼物／SC 主区 | `yt-live-chat-paid-message-renderer` 的 `#card`、`#header`、`#content`、`#message`、`#purchase-amount` | PaidMessage.vue 与价格档内联变量 | 头部／内容背景、用户名、金额、正文、头像、边框圆角及间距；内联价格色只能按真实层叠结果覆盖 |
| 大航海主区 | `yt-live-chat-membership-item-renderer` 的 `#card`、`#header`、`#header-content-inner-column`、`#header-subtext` | MembershipItem.vue | 背景、用户名、说明、头像、身份、间距 |
| 置顶收起 | `yt-live-chat-ticker-renderer #items` → `yt-live-chat-ticker-paid-message-item-renderer #container/#content/#author-photo/#text` | Ticker.vue | 头像、金额／类型文字、背景、间距；不制造用户名节点 |
| 置顶展开 | ticker 内真实 `PaidMessage` 或 `MembershipItem` | Ticker.vue `pinnedMessage` | 复用对应 paid/member 节点；展开状态不是另一事件 |

### BLC 开放版

| 语义 | 来源选择器／节点 | 默认来源 | 支持属性与读写 |
| --- | --- | --- | --- |
| 整体／列表 | `yt-live-chat-renderer`、`yt-live-chat-item-list-renderer`、`#item-scroller/#items` | frozen app/vendor CSS 与 `named-default.css` | 固定 px 为主；字体、字号、行高、背景和列表间距按真实声明读写。方向不属于主题属性 |
| 弹幕 | `yt-live-chat-text-message-renderer`；`#author-photo/#author-name/#message/#image-and-message` | `runtime/frozen/components.js` | 用户名、正文、头像、表情、粉丝牌、身份、容器间距分别映射 |
| 粉丝牌／身份 | `yt-live-chat-author-medal-renderer #medal-card/#medal-name/#medal-level`；`yt-live-chat-author-badge-renderer` | MIT 组件 | 颜色、背景、边框、字号、尺寸、显隐；不复制原版“无粉丝牌”结论 |
| 礼物／SC | `yt-live-chat-paid-message-renderer` 与 `#header/#content/#purchase-amount/#message` | MIT 组件 的价格档 CSS 变量 | 与真实内联变量共同层叠；修改一项只写目标声明 |
| 大航海 | `yt-live-chat-membership-item-renderer`；`#card/#header/#author-photo/#header-content/#header-content-inner-column/#author-name/#chat-badges/#header-subtext/#timestamp` | MIT 组件 | 真实头像、用户名、大航海徽标、说明、时间与容器属性；`showNewMember` 只管正常大航海卡，不接独立贺报 |
| 置顶收起 | `yt-live-chat-ticker-renderer #items` → `yt-live-chat-ticker-paid-message-item-renderer #container/#content/#author-photo/#text` | MIT 组件 | 头像、金额／类型文字、价格档背景和间距；`minTickerPrice` 与主区门槛独立 |
| 置顶展开 | ticker 选中项复用真实 `yt-live-chat-paid-message-renderer` 或 `yt-live-chat-membership-item-renderer` | MIT 组件 | 复用对应 paid/member 详情；展开不复制事件，也不受礼物描述开关误改 SC／大航海 |

### LAPLACE

| 语义 | 来源选择器／节点 | 默认来源 | 支持属性与读写 |
| --- | --- | --- | --- |
| 整体 | `.events-list-wrap.in-obs`，带 `scheme-*`、`scene-*`、`can-motion/reduced-motion` | source-extracted product renderer | 字体、基准字号、色彩方案、场景；结构只读，CSS 可覆盖 |
| 主区普通弹幕 | `.event-list > .event.event--message`；不带 `.event-show-as--normal` | product renderer | 弹幕真实结构、背景、边框、圆角、内外边距和 gap；主区选择器不得依赖 normal 类 |
| 主区卡片（具有 normal／sticky 变体） | `.event-list > .event.event-show-as--normal` | product renderer | 礼物、SC、大航海及具有该变体的红包／天选卡按各自真实结构映射；不能用该选择器代替普通弹幕 |
| 置顶收起 | `.gift-sticky-bar` 内 `.event.event-show-as--sticky` | product renderer | 支持真实存在的礼物、SC、大航海、红包／天选卡；横向区域与主列表分离 |
| 展开／详情 | 来源 renderer 对 normal 卡生成详情；sticky 卡通过 `event-show-as--sticky` 省略详情，不存在 BLC 式点击展开状态 | 各事件 renderer | 礼物：`.gift-details-*`、`.gift-icon-wrap`、`.price/.price-actual/.price-blind-result`；SC：`.top/.meta/.username-wrap/.price/.message/.message-text/.message-translation`；大航海：`.toast-details-*`、`.toast-icon-wrap`；红包开始：`.red-envelope-start-details-*`、`.red-envelope-start-rewards`；天选开始：`.lottery-start-details-*`；红包／天选结果：`.details-name`、`.rewards-items-mask/.rewards-items-wrap/.rewards-item-wrap`。结果名单的 `.toggle-button` 只在 dashboard 且超限时存在，OBS 为裁切／遮罩，不承诺交互展开 |
| 弹幕 | `.event--message`；`.username`、`.message`、`.emote/.emote--large`、`.avatar-wrap`、`.fans-medal` | 默认 CSS 与模板 CSS | 字号、行高、颜色、字体、媒体尺寸、横纵 padding／margin、gap、边框圆角 |
| 礼物／SC／大航海 | `.event--gift`、`.event--superchat`、`.event--toast` | product renderer 与价格／身份变量 | 保留金额档、`event-size--highlight`、`event-superchat-rank--*`、`guard-level--*` 结构 |
| 互动／系统活动 | `.event--interaction`、`.event--like-click`、`.event--red-envelope-*`、`.event--lottery-*`；系统为 `.event--system/.event--live-start/.event--live-end/.event--user-block/.event--room-mute-on/.event--room-mute-off/.event--room-name-update/.event--live-warning/.event--live-cutoff` | product renderer | 系统正文 `.message`；禁言另有 `.username/.block-operator/.block-duration`；开播下播含强制 `.timestamp`；房名更新输出两段 `.message`。没有真实节点的不生成控件 |

## 单位与缩放

| 模式 | 主题基准 | 相对规则 | 固定值与例外 |
| --- | --- | --- | --- |
| BLC 原版 | `G = globalScale`，生成 `--base-size: Gpx`；`F = fontScale`，生成 `--font-base-size: F × --base-size` | 头像等几何量跟 G；用户名、正文、时间、小／大表情及付费文本字号按各自倍率 × F × G。G=1、F=1 恢复来源默认；G=1.5/F=1 几何同比，F=1.5 只改变字体链及由字体链派生的表情 | 上游明确写死的 4px、10px、12px 等保持固定；不可把全部 px 强转为 G/F。大表情使用独立 `largeEmoticonSize`，不与小表情合并 |
| BLC 开放版 | DoodleBears/blivechat，MIT 提交 `0da8c94d40a8791bb212985f6ac0ae55765c3a03` | `vendor/openlive/frontend/src/components/ChatRenderer/`、`vendor/openlive/host/`；软件桥接在 `src/compat/openlive/runtime/` | `public/openlive/renderer.html` → `renderer.js`、`entry.mjs` | `scripts/build-openlive.cjs` 使用固定 Vue 2／Element UI 依赖构建；不加载部署版模块包；来源见 `provenance.json` | MIT 许可证和依赖声明随产物保留；既有第三方主题 CSS、官方图片与字体维持各自来源 |
| LAPLACE | Stable238 外观与主题契约 | `src/compat/laplace/renderer/independent/`，宿主桥接在 `RendererHost.tsx` 与 `renderer/frame.tsx` | `public/laplace/product/index.html` → `renderer.js` | `scripts/build-laplace-product.mjs` 构建独立组件；正式资源映射位于 `renderer/asset-locations.json`，不读取旧捕获源码 | React、Radix、Tabler 等依赖保留原许可；主题 CSS、字体及图片保留各自来源，见根目录 `THIRD_PARTY_NOTICES.md` |

LAPLACE 可视化控件直接显示并写入实际 CSS 值，不使用归一化显示值：B20 时礼物头像 40px、醒目留言／大航海头像 50px、金额 12px、弹幕 padding 2.5px／10px；B24 时分别为 48px、60px、14.4px、3px／12px。默认读取、编辑写入和保存重开必须保持同值，不进行隐式换算。

主题比例与目标显示缩放不得相乘后写回主题。运行时可以在渲染内容外层施加目标缩放，但可视化读回和主题保存仍以 100% 主题计算值为准；缩略图固定尺寸也不能因大字号扩张。

BLC 原版默认、经典、仿微信在 G=1/F=1 时保留各自来源尺寸：大表情分别为 24px、40px、60px，仿微信头像为 40px；小表情按高度缩放并保留素材宽高比。经典与仿微信复用已有 `--base-size`、`--font-base-size` 链，不能用原版默认的统一像素覆盖。原版默认付费正文保留来源 `normal` 行高；经典与仿微信保留模板自身行高。

## 可视化属性边界

只有真实消费者存在时，才允许为对应“事件范围 × 身份 × 部件”开放属性。通用候选为：显示、字体、颜色、字号、行高、字重、文字描边、宽高／媒体尺寸、横纵 padding、横纵 margin、真实 gap、背景、边框、圆角。阴影只保留主题 CSS，不新增统一阴影控件。`gap` 不得冒充 margin，spacer 不得冒充外边距。

读写方向：结构化控件写入受管 CSS 的单个目标声明；computed style 和唯一可识别声明可回填控件。多规则歧义、`calc()`、未知变量、注释、未知选择器、`@layer`、`!important`、内联与动态注入不猜测回填，原样保留并继续按浏览器层叠。隐藏部件仍能从部件列表定位，临时显露不保存。

## 编辑字段与目标消费者

“目标”只说明主题属性在哪些输出生效。现场支持普通兼容主题，但置顶及时间、用户名打码仍只属于副窗口和 OBS；外部 HTML 的现场限制见“主题来源与外部 HTML”。

| 模式／字段组 | 中文入口与存储键 | 目标 | 真实消费者／选择器 | 单位与默认来源 | 读写与冲突处理 |
| --- | --- | --- | --- | --- | --- |
| BLC 原版比例 | 整体比例 `globalScale`、字体比例 `fontScale` | 现场／副窗口／OBS | `composeBlivechatThemeCss` 生成 `--base-size`、`--font-base-size`，来源组件消费 | 无单位，默认均 1 | 基础控件写 settings；可视化读回100%主题值。固定px不乘比例，目标缩放不回写 |
| BLC 原版礼物描述 | 显示礼物名称与数量 `showGiftName` | 三目标主区 | 来源 `PaidMessage` 主区配置 | 布尔，默认关 | 只改主区，不作用SC、大航海、置顶或事件事实 |
| BLC 开放版皮肤 | 既有主题设置 `skin` | 三目标 | 既有来源的 `none/default` CSS | 枚举，默认 `none` | 保留旧值及效果；基础页不提供换肤开关，主题库提供独立主题 |
| BLC 开放版礼物描述 | 显示礼物名称与数量 `showGiftInfo` | 三目标主区 | 来源 paid-message 主区配置 | 布尔，默认开 | 只改主区，不作用SC、大航海或置顶 |
| LAPLACE主题基准 | 基准字号 `baseFontSize`、配色 `colorScheme`、场景 `sceneName` | 三目标 | `.events-list-wrap` 的CSS变量、`scheme-*`、`scene-*` | B默认20px；浅色；空场景 | 基准字号在基础页编辑，场景在高级编辑，保留既有值；输出明暗读取软件及既有OBS场景规则，预览明暗不写主题；B派生项随B，固定rem/px保持；目标缩放不回写 |
| LAPLACE专属呈现 | 剧透 `showSpoiler`、高亮金额 `showGiftHighlightAbove`、经典范围 `classicElementScope` | 剧透/高亮三目标；经典范围仅副窗口/OBS的来源限定 | product renderer与呈现策略 | 剧透默认开；高亮默认30且`>=`；经典范围默认关 | 不改变准入、收益或置顶门槛；经典范围不替代头像/用户名开关 |
| 事件显示 | `eventVisibility` 中逐版真实大类与子类 | 三目标，系统事件按用途分流 | `compatibleEventVisibility`、投影和逐版renderer | 布尔，默认见主题模式适配器 | 父闸不清子项；当前组全选/清空不越组；不支持事件不生成入口 |
| 常规信息元素 | `showAvatar`、`showUsername`及逐版真实标识开关 | 三目标 | 本文身份矩阵中的真实节点 | 布尔，默认见逐版settings | 只控制真实节点，不删除正文事实，不补造来源不存在的标识 |
| 目标信息元素 | `showTimestamp`、`maskUsername` | 仅副窗口／OBS | BLC `#timestamp/#author-name`；LAPLACE `.timestamp/.username`族 | 布尔，默认关；打码固定`***` | 现场不消费；不改原始事实或统计数据 |
| 可视化范围 | `visualModel` 的 `事件|身份|区域|部件` 键 | 由属性与区域决定；`sticky`仅副窗口／OBS | `CompatibleThemeCapabilityMap`的事件、身份、区域和部件选择器 | 各版真实color/font/px/raw/visible单位及代码/继承默认 | 控件只写单属性受管CSS；唯一声明或computed可读；混合/歧义不猜值 |
| 自定义代码 | `styles.visualCss`、`styles.customCss` | 随该主题绑定的输出 | 逐版真实DOM | 原CSS单位和层叠 | 未知声明原样保留；无效草稿不替换上一有效预览；主题外软件行为不写CSS |
| 软件行为 | 方向、筛选、N、到期、动画、置顶开关/位置/门槛/数量/排序 | 按软件设置及目标；置顶仅副窗口／OBS | 软件事件策略、窗口与OBS消费者 | 不属于主题默认 | 样式页不保存第二份值；换主题不改变这些设置 |

可视化部件的中文名、真实选择器和默认来源以“逐版 DOM 与区域映射”为唯一清单；属性单位与缩放以“单位与缩放”为唯一清单。界面层不得另建平行映射。`visualModel` 的作者声明值与 iframe 的 computed 测量值必须分开：测量值用于反馈，只有明确编辑才生成局部声明。

### 规范差异裁决

- LAPLACE `showGiftHighlightAbove` 默认 30 元且包含边界，保持来源的 `>=` 判断。软件统一置顶门槛也默认 30 元，但两者仍是独立设置，修改任一项不得联动另一项。
- CSS导出沿用原生底座当前已验收的四种范围：完整、基础与可视化、仅可视化、仅自定义。正式基线早期的三种范围缺少“仅可视化”，不再约束当前入口；完整主题包仍是无损保存格式。
- 保存操作沿用当前原生底座：编辑只更新草稿；自定义主题保存，内置主题另存；“应用”用于选择目标。原型中的“保存并更新”文字不作为独立兼容流程。
- 普通兼容主题支持现场；固定 SDK 1.0.1 的 BLC 外部 HTML 仍因缺少现场菜单、定位和阅读状态回传而只支持副窗口与OBS。这是来源能力限制，不是普通BLC主题限制。

## 验证边界

各模板可编辑范围以真实节点为准，不为缺失的节点增加控件。固定样例、组件检查和桌面输出分别核对；远程素材能加载不等于已取得再分发许可。外部HTML只在本契约规定的场景和SDK范围内使用。

## 编辑控件与范围约定

- LAPLACE 输出按链接、配置、有效场景及软件配色解析明暗，优先级见 [UX-CONTRACT.md](../../UX-CONTRACT.md#主题调整与-obs-输出契约)；预览明暗仅用于预览，不写入主题。可视化配色仍分通用、浅色、深色。BLC 两版只提供通用编辑配色，既有分色 CSS 保留。
- 开放版主区礼物描述、LAPLACE 剧透解析及礼物高亮金额放在模式特色。LAPLACE 高亮默认 30 元，包含等于门槛的金额。开放版不提供来源默认皮肤开关，既有皮肤设置继续生效；LAPLACE 场景在高级编辑。
- LAPLACE 按实际流向计算阅读位置；距窗口前后边界250px用于分段补载，不用于恢复最新跟随。用户回到最新端后才恢复本页跟随，其他页面位置保持独立。
- BLC 两版头像、用户名、时间、用户名打码、房管与大航海标记由各真实信息节点承接；开放版粉丝牌保留当前房间、点亮事实并按主题条件显示。
- LAPLACE 礼物父范围包含普通礼物、红包、天选；子范围从来源原始事件选择器生成，不将父范围展开结果作为子范围输入。
- 复合身份规则以相同选择器优先程度参与排序；普通用户排除主播、房管和大航海。已有统一大航海规则保留，顶层身份入口按原生分类展示。
- BLC 正文区域与内容区域共用内容区域编辑目标。已有全局正文中更具体的礼物细项规则保留原来生效的覆盖关系；仅规范化已识别的受管理规则，不重写未知手写 CSS。
- 隔离预览按就绪消息结束加载；失败后重试重载当前页面，保留主题草稿。正式程序使用随包资源，不依赖开发服务。

## OBS 浏览器输出

软件在固定本机端口提供 `/obs` 和 `/preview`。正式地址以配置稳定短码确定输出；修改配置名称、房间或主题保持地址不变。链接可临时覆盖房间和明暗，不反写配置。房间连接共享，输出队列按配置、真实房间和主题隔离。

原生、BLC 两版和 LAPLACE 使用相同的 OBS 呈现组件；浏览器接收软件确定的设置、事件、置顶项和截止时间，不自行重做准入与合并。输出明暗按各配置及链接覆盖值解析；独立预览的明暗、背景和画布参数只影响预览。

“保存调整”写入个人调整，“应用”发布到明确目标，两者独立。内置主题基准只读，但允许保存个人调整和另存；恢复默认先更新草稿。目标准备失败保留原输出，未保存草稿只用于编辑和预览。

OBS 目标显示缩放以配置本次保存值为准，现场和副窗口沿用各自已绑定缩放。关闭最后一个观察者后保留输出 30 秒，刷新不重算寿命；超过 30 秒释放，重开从新事件开始。删除配置立即使旧地址失效并释放其订阅。


## 公共事件行为

内容对齐决定短列表贴合顶部或底部；最新事件位置决定排序、插入端及回到最新的目标端。两项属于软件设置，现场、副窗口、OBS和预览共用，不写入主题。各页面的阅读位置独立。五种公共事件动画共用效果参数及配置时长，兼容宿主保留来源布局运动与事件内动图；原生回退行不重复播放入场动画。

BLC 原版由宿主管理的整条事件在 config 层关闭来源生成器的入场 animation，按软件动画设置播放；后代节点的装饰动画及图片动效保留。显式 custom 层规则继续按既有层级覆盖。

输出保留条数、定时消失、相同弹幕合并集中于“副窗口与 OBS”，不限制现场会话历史。最低显示金额控制事件准入；置顶最低金额只控制置顶；LAPLACE礼物高亮金额保留在模式特色，默认30元。

预览“当前设置”执行所选目标的公共策略；“显示全部部件”临时放开样例的分类、元素及显示筛选。静态和点选保留固定样例，动态继续执行目标容量与寿命。三页共用事件及草稿样式，暂停不冻结动态事件的到期时间。固定样例在判断中代表预览目标房间，来源样例原始字段保持。

OBS礼物特效使用独立软件开关，默认关闭；复用现有VAP播放器和FIFO队列，不受主流容量或图片元素隐藏影响。新通知按房间会话和递增序号接收，重连不补播历史特效；同房间切换主题不中断当前播放，换房取消当前及等待项。视频和配置经同源资源服务提供，支持浏览器Range请求。礼物事件中的动图与独立礼物特效分别控制。


已保存的旧配置缺少内容对齐字段时保留来源布局：BLC原版底部、开放版随最新位置、LAPLACE顶部；显式选择后使用公共值。首次安装默认顶部。主题和输出链接不保存另一份对齐设置。
## 兼容主题外观层级

三版运行时按 default、config、custom 组织普通外观声明。来源样式内部顺序保留在默认范围；可视化规则进入配置范围；自定义普通规则进入 custom。独立来源样式表和动态注入与主题组合使用相同层序。源文件、保存的手写声明保持原文。

显式手写层保持其浏览器语义；important 仍按反向层序，内联值仍按浏览器规则处理。普通层级保证只比较同一元素上的竞争声明，不改变继承关系。运行、预览和完整 CSS 导出须验证同一覆盖结果。

## OBS 浏览器源自定义 CSS

OBS 浏览器源的“自定义 CSS”在当前网页内作用于原生输出，并同步到三版兼容渲染环境。普通声明进入 custom 层，排在软件主题自定义之后；同层同优先程度时由 OBS 声明覆盖。显式作者层和 important 保持浏览器语义，文件无需修改层名。

首次载入、修改、清空及兼容主题切换均同步。软件主题样式更新后仍保持上述顺序。相对资源地址以外层 OBS 网页为基准。该覆盖只属于当前浏览器源，不保存到主题，也不发布给其他输出。软件自身的样式不作为用户自定义转发。

## BLC 原版文字继承

基础字体比例在来源原有的层级建立：弹幕事件容器13px、付费事件容器15px、大航海卡片14px、置顶单项14px，均按G/F变化。弹幕用户名、正文，付费正文、金额，以及大航海用户名保持来源继承路径，不给继承文字额外写死子节点字号。

来源独立声明继续独立：付费用户名14px、时间11px、大航海说明15px。正文默认行高按来源比例随字号变化；可视化显式值和手写固定px声明保留自身行为。重复次数保留来源固定12px字号与18px行高。


## 主题交换与范围编辑

- 普通事件、单条置顶和LAPLACE所有事件保留合法事件范围与用户身份；事件区、列表和整个置顶栏仍为全局部件。LAPLACE所有事件共用主流与置顶的原始类型选择器，分类后不把红包、抽奖并入普通礼物。
- 导入更新和远程更新只更新文件，不自动重发已应用的输出快照；更新提示说明重新应用后生效。编辑器保存并更新继续发布到引用目标。
- 脏会话遇到文件更新仍保留草稿、素材与历史。重新载入只有完整读取成功后才替换会话；失败保留原草稿及恢复入口。
- 单主题ZIP及本软件导出的一级主题合集共用导入确认队列。合集逐项处理有效、损坏、同ID和内置ID，不递归解释任意档案格式。
- 主题信息沿用同一元信息模型，名称、作者、版本与来源网址、作者更新时间、导入时间、本地修改时间分别展示，缺失显示未标注。内置信息面板仅以文本展示，只保留关闭。编辑页顶部的另存为用于创建自定义副本。
- LAPLACE头像框使用当前房间真实舰队人数。房间级人数与单条粉丝牌档位独立；未知人数不由用户身份、粉丝牌或历史成就推算。

- 点选身份从所属事件根节点读取，并遵循编辑器当前身份优先级；负向普通用户选择器不能通过匹配正文子节点改变所选身份。

## 主题来源元信息

LAPLACE内置模板使用固定官方目录的author、version和updated，不以主播名或CSS普通署名替代；四款精选及网址CSS沿用明确头部字段。目录没有版本时保持未标注，不从其他注释或渲染器版本补写。BLC两版内置主题缺作者时使用default，其他已确认署名保持。主题仅有作者一项，另存后允许修改，不新增原作者字段。本地CSS导入与远程读取共用明确头部字段解析；作者更新时间不使用导入或本地修改时间冒充。外部HTML不继承默认主题的作者。

来源时间保留原值；显示统一使用本地YYYY-MM-DD HH:mm，仅日期保留日期，无时区保留原时刻并注明。新操作时间保存YYYY-MM-DD HH:mm:ss ±HH:mm，来源不明确的时刻不推算。原生默认更新时间保存2026-10-21。

## 素材归属与传输

四格式共用主题仓库和素材解析。内置公共素材、远程缓存、用户添加素材分别存放，不修改三版原 DOM 和来源 CSS；只在现有解析阶段解析资源地址。运行时按需使用资源 URL，完整素材只在主题 ZIP 或单 CSS 导出时读取。

远程 CSS 按最终响应地址处理相对依赖与嵌套导入，保留条件和层序。普通打开复用最近成功缓存，显式更新固定新版本；更新失败保留已保存主题。完整 ZIP 展开共享和缓存依赖，缺项明确失败；导入副本不依赖原机器目录。

## 主题区域隔离

BLC原版、BLC开放版、LAPLACE与原生样式共用主题区域边界：现场、副窗口、OBS和相应预览可以加载各自绑定主题，回看、检索与收藏独立。现有区域节点使用通用 `.theme-surface`；不新增渲染包装，也不改变来源DOM或选择器语法。

三个兼容模式继续在独立渲染文档内加载基础、可视化及高级CSS；原生回退部件遵守同一主题区域边界。回看事件列表不接受兼容主题渲染。编辑只保存所属主题的数据，不修改回看设置。相同主题的公共选择器在各适用场景共用，区域差异沿用既有场景选择器和绑定关系。

## 当前编辑与显示规则

现场不读取主题的事件类型和细项开关；副窗口大类跟随现场与自身承载开关，细项读取主题；OBS 读取主题大类和细项。外部 HTML 的现场限制仍按上述 SDK 能力执行。预览按选定目标采用相同准入规则。

BLC 两版不提供盲盒专属展示或编辑分类。开放版把盲盒降级为实际开出的普通礼物，保留用户、礼物名、数量和开出价值，不显示盲盒来源与盈亏；原版保持既有准入规则。礼物入口不增加免费／普通二级分类，长条表情归入大表情编辑范围。BLC 开放版目录保留“经典”，重复的旧 YT 主题文件仅为既有引用保留。

图片背景、装饰图、图片边框和自定义头像框使用各模式实际部件能力，具体清单见[兼容可视化目标](compatible-visual-targets.md)和图片编辑实机验收。不能仅凭名称相似把原生 DOM 选择器用于兼容文档。

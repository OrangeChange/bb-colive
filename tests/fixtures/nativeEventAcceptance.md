# 事件组件验收入口

手机号状态验收：在弹幕窗合成页面发送“未验证、已验证与未知同文弹幕”，默认保留已验证与未知两条。开启显示未验证用户后为三条；开启合并时分别显示 `×2`／`×3`。未验证代表事件根带 `.chat-phone-unverified`；该属性与 `.chat-auto` 可共存。真实日志已确认数组字段存在，但当前已检查样本没有值0，未验证分支使用合成样本验收。

自动弹幕验收：打开 `nativeEventWindow.html?kind=display`，发送“自动与普通同文弹幕”。默认显示两条；打开“合并相同弹幕”显示一条及 `×2`。关闭“显示自动弹幕”后保留普通消息、无重复计数；重新开启恢复 `×2`，合并代表事件为自动消息时根带 `.chat-auto`。该入口使用内存端口，不连接真实直播、不写真实档案。

在仓库根安装项目依赖后启动测试服务：

```powershell
npx vite --config tests/fixtures/nativeEvent.vite.config.mjs --port 1423
```

该配置复用生产配置，原生 API 使用测试内存端口，缓存位于 `node_modules/.vite-native-events`。仅用于 fixture 验收服务。所有事件与媒体变体均为合成样本，不连接直播间，不写入真实档案；本地媒体复用已认可财富图片。浮窗浏览器结果与原生桌面结果分别记录。

## 页面

| 页面 | 用途 |
| --- | --- |
| `/tests/fixtures/nativeEventStyle.html?task=4` | 公共 27 参数、级联、默认尺寸和同屏实例矩阵 |
| `/tests/fixtures/nativeEventIntegration.html` | 真实预览、样式编辑、现场 EventList 与回看 ReviewSessionTimeline |
| `/tests/fixtures/nativeEventWindow.html?kind=display` | 真实弹幕窗组件及内存原生端口 |
| `/tests/fixtures/nativeEventWindow.html?kind=gift` | 真实礼物窗组件及内存原生端口 |
| `/tests/fixtures/nativeEventSemanticRegression.html` | 零价礼物以外的四项语义回归：标题颜色、局部字级与比例、三点截断、粉丝牌文字色；点击“运行回归核验”读取实际样式与几何 |

## 预览

“现场／回看／弹幕窗／礼物窗”“全部部件／当前设置”切换对应上下文与局部模式。隐藏身份与媒体、身份文字/图标、图片成功/失败、恢复设置均由页面按钮控制。“打开样式编辑”打开真实编辑器，关闭或 Escape 返回。主题与窄区域由 UI 控制，窄区域只收窄事件区域到 240px。

`[data-preview-fixture-state]` 显示当前设置，`[data-preview-context][data-preview-mode]` 为事件区域，`[data-event-id]` 为稳定行键。默认现场 16px、回看 13px、两副窗 22px；大表情尺寸分别为 40px、32px、80px。副窗只显示生产支持的类别，组合没有样本时显示空态。编辑器 remote 图片失败不作为媒体尺寸证据，确定性媒体使用本地 fixture。

## 现场与回看

入口按钮“现场列表”“回看时间线”切换真实宿主。每次切换重建对应合成验收场景；场景内追加、设置变化和定位不重挂载列表。现场 720 条，回看两场各 720 条，真实时间线每页请求 320 条。

目标 A/B 的稳定键为 `fixture-session-2:event:360` 和 `fixture-session-2:event:361`，UID 同为 `fixture-same-user`。两个目标位于首屏外，原始事件使用完整 DanmakuEvent，弹幕正文为 `text`，档案分类为 `danmu`。

现场先选顶部追加或底部追加，使用“筛选目标用户”显示目标，再从真实行菜单“查看上下文”定位。收藏和标记直接操作真实行按钮；同 UID 的另一行应保持独立。持续追加时锁定目标相对视口位置，使用组件“回到最新”恢复跟随。回看分别验收顺序排列、倒序排列；菜单查看上下文保留分类筛选，也可用定位目标 A/B 控件触发实际 targetEventKey 消费。

“追加一条／追加十条／持续追加／暂停追加”“间距0／间距8”“小媒体20／大媒体80”“窄区域240／宽区域”“开启动画／关闭动画”均作用于真实组件 props 或内存查询数据。回看主播历史显示场次分界；滚动到真实加载边缘加载更多，两方向游标与目标 anchor 均实际消费。锁定状态下回看暂停增量查询，内存数据增长与当前视口稳定分别核对；跳到最新后应看见新增数据。

| 选择器 | 结果 |
| --- | --- |
| `[data-live-fixture-state]` | 事件数、方向、查询、收藏键、标记键、定位消费与实际 feedSession |
| `[data-live-fixture-geometry]` | 实际 scrollTop/scrollHeight/clientHeight、可见槽位键/y/高度/spacer |
| `[data-review-fixture-state]` | 内存记录数、排列、范围、筛选、目标 found、最后 query/cursor/anchor/limit、收藏与阅读记忆 |
| `[data-review-fixture-geometry]` | 实际槽位与场次边界几何 |
| `[data-review-timeline-scroll] [data-event-key]` | 回看真实行稳定键 |
| `[data-live-fixture] .event-area [data-event-id]` | 现场真实槽位稳定键 |

“读取测量”刷新只读 DOM 结果；输出不直接修改滚动位置或组件状态。geometry 也随滚动、DOM变化、区域 resize 和媒体加载更新。确认间距参与槽位测量而事件背景不覆盖空隙，媒体变高后目标仍在原视口位置。

## 自动检查

```powershell
node --experimental-transform-types --test --test-concurrency=2 tests/stylePreviewContext.test.mjs tests/stylePreviewEvents.test.mjs tests/nativeEventRepository.test.mjs tests/nativeEventStyleContract.test.mjs
npx tsc --noEmit -p tests/fixtures/tsconfig.nativeEvents.json
npx tsc --noEmit
npm run build
node --experimental-transform-types --test --test-concurrency=2 tests/*.test.mjs
```

全部 fixture（含浮窗与内存原生端口）统一使用 tests/fixtures/tsconfig.nativeEvents.json 类型检查。自动结果、实际组件浏览器结果和未测原生桌面项分别写入阶段报告。

## 阶段2中奖名单

入口：`http://localhost:1423/tests/fixtures/nativeEventIntegration.html`。

- “阶段2现场名单”→“定位中奖名单”：真实 EventList 的目标A为160人天选开奖；展开／收起并读取槽位测量，追加事件检查阅读定位。点击第二位“目标用户”后，现场 uid 为 fixture-same-user，命中目标B弹幕。
- “阶段2回看名单”→“定位目标A”：真实 ReviewSessionTimeline 同一名单，检查倒序／顺序、展开内部滚动和收起后的测量；点击第二位后 filters.userUid 为 fixture-same-user，命中目标B。
- “阶段2宿主边界”：现场无回调名单允许展开，用户名全为 span；单人红包可展开，空名单无入口。弹幕／礼物窗无 details；天选条件存在但默认隐藏。
- 选择器：`.winner-list`、`.winner-list-toggle`、`.winner-list-items`、`.winner-list-item .username`、`.lottery-requirement`；宿主边界使用 `[data-task2-host]`，实际测量和筛选使用既有 `[data-live-fixture-geometry]`／`[data-review-fixture-geometry]` 和对应 state。
## 阶段4收益分窗入口

`nativeEventWindow.html?kind=gift` 为组合窗口；将kind替换为 `gift-only`、`superchat`、`guard` 可验收三个子窗。各入口使用真实 `FloatingEventWindow` 和内存ports，无真实连接或档案写入。标题按kind显示。

- 模式：`#mode-combined`、`#mode-split`；状态：`#revenue-selection`。
- 实际侧栏：`#sidebar-host` 内的 `Sidebar`，总按钮使用“打开收益窗／关闭收益窗”，三个子按钮使用“礼物窗／醒目留言窗／大航海窗：已开启／已关闭”及 `aria-pressed`。

“头像框位置”入口使用真实现场 EventList，从空列表追加同尺寸消息，可切换头像框、长昵称与追加方向；用于比较事件槽位高度、行内头像位置与列表位置。样本仅保存在页面内存。
- 混合普通样本：`#send-samples`；固定样本：`#sticky-on`、`#send-sticky`；撤回：`#sticky-recall`。
- 固定栏单行：发送固定样本后点击 `#check-sticky`，`#sticky-check` 的 singleLine、clipped、styled、uniformText、uniformHeight 应均为true；使用窄窗按钮切换320／480px，固定栏高度保持不变，超宽内容裁切。16px字号下全部卡片24px高、文字14px／20px；“同步字号与身份”切换24px后全部34px高、文字21px／30px。大航海购买卡片末尾为 `img.event-icon`，用户栏不重复身份徽章。
- 固定动画：固定栏置顶或置底均从左侧12px滑入、向左侧滑出，持续200ms并淡入淡出。醒目留言子窗发送固定样本后，点击 `#sticky-check-exit`，frames记录透明度及水平位移；非减少动态效果环境的 slidOut、removed 应为true。最后一张移除后固定区高度和外边距均为0。减少动态效果环境即时移除，不要求中间帧。切房不得保留旧卡片退场画面。
- 切房与旧房样本：`#switch-room`、`#send-old-room`；关闭重开：`#close-window`、`#reopen-window`。

切分窗后关醒目留言，再总关／总开，应恢复礼物与大航海；悬停不改变选择。各子窗普通行与固定区只出现自身类别；切房和旧房消息不产生残留。侧栏验收使用生产组件和纯选择模型，原生创建与桥接生命周期另由自动测试及最终桌面验收覆盖。

## 媒体回退与红包中奖

在 `nativeEventIntegration.html` 选择“阶段1媒体”，检查失败图片的回退及头像框尺寸；副窗入口的“发送失败媒体样本”覆盖同一媒体规则。

选择“红包中奖现场”或“红包中奖回看”，定位中奖名单后展开160人名单，检查内部滚动、用户名筛选以及追加事件后的阅读位置。全部使用内存样本，不连接真实直播或写入档案。

# 当前架构

## 样式边界

四类主题通过公共主题文档、素材管理和编辑会话保存；原生复用EventRow与基础CSS，BLC原版、BLC开放版和Laplace保留各自渲染结构。图片及渐变编辑生成对应部件的CSS，并通过现有预览宿主展示。具体使用规则见[样式与可视化编辑](features/themes-and-editor.md)。

回看仍复用事件内容与公共身份组件，但由`reviewStyleSettings.ts`和`archiveEventStyle.css`独立控制外观；不加载已应用主题。软件配色由`theme.ts`持久化选择，`customPalette.ts`生成自定义明暗色，传递到主窗、副窗口和预览环境。

技术栈：Tauri 2、React 19、TypeScript、Zustand、WebView2。直播连接由主程序管理，副窗口消费已适配事件；OBS 同房间复用连接，不同房间由独立房间会话管理，浏览器页本身不另建采集器。

兼容实现按来源分工：BLC 原版使用固定上游组件，BLC 开放版使用 DoodleBears/blivechat 的 MIT 组件，LAPLACE 使用自行实现的渲染组件。投影、编辑和预览由本项目宿主协调；上游连接、登录和采集不接入。入口、构建产物和素材关系见[目录职责](development/repository-structure.md)。

## 数据流

```text
B 站接口与 WebSocket
  → 协议解码、字段归一化、原始诊断
  → 标准事件
      ├─ 档案写入（先于显示合并与筛选）→ SQLite → 回看／收藏／导出
      └─ 现场去重、合并与显示投影 → 主窗口／副窗口／语音／特效
```

隐藏事件只改变展示，不删除原始档案或诊断资料。榜单快照与统计状态不伪装成普通用户事件。

## 模块职责

| 模块 | 职责 |
| --- | --- |
| `src/protocol/` | B 站请求、扫码、连接、JSON／protobuf 适配、房间资料与兼容状态输出 |
| `src/events/` | 事件键、内容提取、回复、礼物合并、现场投影和定位计算 |
| `src/stores/connection.ts`、`liveSession.ts` | 当前连接与现场会话、开播／下播证据 |
| `src/runtime/` | 应用生命周期与事件分发，连接主窗口、副窗口、语音和特效 |
| `src/archive/` | SQLite、写入队列、场次状态、查询、收藏、传输、导出及回看阅读控制 |
| `src/windows/` | 副窗口桥接、偏好、房间代次、布局、到期移除与特效播放 |
| `src/themes/`、`src/compat/` | 主题文档、编辑会话、CSS 与素材、场景显隐，以及三类兼容投影和渲染器 |
| `src/obs/` | OBS 配置、已应用快照、本机输出服务和共享／独立房间会话 |
| `src/cloudSync/` | 云端服务契约、恢复进度、下载转换与本地档案写入协调 |
| `src/diagnostics/` | 诊断流、功能登记、批量写入、窗口接收与快照 |
| `src/components/` | 主工作区、功能面板、共享事件行、身份标记和交互控件 |
| `src-tauri/src/` | 原生窗口、HTTP／存储、音频、文件写入、诊断压缩和退出 |

## 共享与独立边界

- 公共事件数据规则不依赖 React 界面、Zustand 或 Tauri 窗口；协议枚举只维护一份。原生展示层通过共享 React 事件行消费这些规则，三类兼容主题通过各自投影和渲染器消费标准事件。
- 现场、回看、收藏共用内容提取、昵称与收藏身份，但独立管理筛选和阅读状态。现场标记不进入回看。
- `favoriteActions.ts` 提交明确目标，`eventIdentity.ts` 区分现场行、连击及档案持久身份，不能按 UID 标记或收藏整个用户。
- `giftMerge.ts` 管理数量、价值与可信支付；展示和导出复用同一口径。
- `archiveRuntime.ts` 管理写入器、刷盘、刷新版本与传输互斥，不复制现场会话。录档变化与收藏／整理／导入／删除通知分开。
- `useReviewTimelinePages` 管理分页与请求代次；`useReviewTimelineReading` 管理定位、阅读与跟随；`useReviewTimelineRefresh` 管理增量刷新；`ReviewSessionTimeline` 负责虚拟列表测量和呈现。
- `FloatingEventWindow(kind="display")` 为弹幕窗入口，`GiftWindow` 内部使用 `FloatingEventWindow(kind="gift")`。`DisplayWindow.tsx` 是未接入入口的旧实现，不作为当前窗口依据。
- `useApplicationLifecycle` 负责会话标记、全局异常、退出刷盘与关闭；`useAuxiliaryWindows` 管理副窗口状态与偏好；`applicationSnapshot` 收集快照。
- `DiagnosticBatch` 统一失败保留、容量和计数，各流仍维护自己的格式、文件和定时器。

## 事件展示与样式

`src/components/EventRow.tsx` 分别由 `NativeEventContent` 和 `ReviewEventContent` 组装原生与回看内容，共用身份、金额及事件内容部件。事件交互通过 `src/events/eventInteractionSettings.ts` 读取用户名别名和快捷动作，快捷动作规则在 `eventInteractionPolicy.ts` 维护，持久化沿用现有设置。BLC 与 Laplace 的回退样式挂载共用 `blivechatFallbackSurface.ts`，不依赖预览组件。

`src/components/EventRow.tsx` 与身份组件提供共享展示；`src/events/publicEventStyle.ts` 将标准事件和内部大航海等级投影到公共语义，不改变协议、档案或金额数据。公共区域及参数只在[原生事件 DOM 与样式契约](development/native-event-style-contract.md)维护。

`src/eventStyle.css` 消费事件外观参数，`src/eventAreaStyleConfig.ts` 复用已有样式解析器，`src/components/EventAreaStyle.tsx` 为每个区域实例生成一份作用域配置。配置规模由角色与设置类型决定，不随事件数增长；用户名身份色与正文类型色分别解析。现场、副窗和原生主题预览使用该配置接口；回看时间线、检索和收藏使用独立回看设置。

`StylePreviewArea.tsx` 与 `stylePreviewContext.ts` 复用真实事件行，解析所选上下文的尺寸、排版、显示偏好和副窗类别。当前设置与全部部件仅为局部预览模式，不增加持久化结构。

现场 `EventList` 与回看 `ReviewSessionTimeline` 保持独立虚拟滚动机制，共用 `EventRowSlot` 与 ResizeObserver 测量边界。现场顶部锁定阅读使用稳定事件键和视口偏移持续保护前插与高度重测；底部只在尺寸重排期间恢复稳定锚点，普通追加和跟随沿用原路径。`src/events/feedScroll.ts` 读取未裁剪的行测量起点，在最终滚动位置计算后限制范围。回看继续由原分页、阅读和刷新模块管理定位、阅读锁定及持续跟随。

交互契约见 [UX-CONTRACT.md](../UX-CONTRACT.md)，具体行为以[功能文档](README.md#功能文档)为准。架构调整的阶段证据保存在[历史记录](README.md#历史记录)。

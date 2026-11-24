# BLC 开放版运行时

这里是 `scripts/build-openlive.cjs` 的宿主输入目录，发布到 `public/openlive/`。渲染组件以 DoodleBears/blivechat 的 MIT 提交 `0da8c94d40a8791bb212985f6ac0ae55765c3a03` 为来源，组件与依赖声明见 [vendor/openlive](../../../../vendor/openlive/UPSTREAM.md)。

`bridge.mjs` 维护允许的命令；`entry.mjs` 接入事件、配置、CSS、快照、定位、阅读恢复、点选与部件预览。主程序负责连接和事件准入，运行时不启动上游连接、翻译或权益请求。

`core.mjs` 保留软件提供的事件事实、合并与生命周期。渲染层使用单条弹幕模型，保持现有开放版公开节点、文案、金额精度和 CSS 层级。盲盒回调只携带实际礼物与开出价值。`simulation.mjs` 使用已审核的项目样例。表情图片仅使用消息或样例提供的数据；未提供图片的关键词保持原文。

当前部件和单位见[兼容可视化目标](../../../../docs/development/compatible-visual-targets.md)，图片设置与显示边界见[图片样式契约](../../../../docs/development/image-style-contract.md)。

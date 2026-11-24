# BLC 开放版渲染来源

- 仓库：https://github.com/DoodleBears/blivechat
- 提交：0da8c94d40a8791bb212985f6ac0ae55765c3a03
- 许可证：MIT，见 LICENSE。

frontend 保留渲染组件、金额档位、粉丝牌配色、滚动队列和动画。适配为本项目已支持的单条弹幕模型，沿用现有开放版的节点、文案、金额精度和置顶进度。host 注册 Vue 与 Element UI，并提供本项目配置及基础样式差异。大航海置顶使用原版中文“会员”；主题 CSS 提供替代文案时优先显示主题文案。

不接入聊天室连接、登录、翻译请求、赞助权益、同用户线程、随机布局、互动扩展与自定义 HTML。事件桥接、可视化编辑、图片设置和预览控制由本项目实现。盲盒只显示实际开出的礼物，金额采用开出价值，采集与收益统计保持原始事实。

构建复用 `vendor/blivechat/package-lock.json` 已锁定的 Vue 2／Element UI／Webpack 工具链，执行 `node scripts/build-openlive.cjs`。生成物包含本目录 MIT 许可证、Vue 注释声明及实际打包依赖的完整许可证。软件既有第三方主题 CSS 和素材保持各自来源，不由本目录许可证重新授权。表情显示使用消息或预览样例提供的图片数据，不维护全局关键词图片映射。

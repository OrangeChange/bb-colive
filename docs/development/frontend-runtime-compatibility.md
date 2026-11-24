# 前端运行环境与兼容约定

## 支持范围

正式桌面平台为 Windows 10/11 x64，使用系统 Evergreen WebView2。安装版和便携版保持一致。macOS、Linux 未完成正式验收。Windows 10 功能更新版本、CPU、内存和显卡的硬性下限尚未测定。

最低浏览器内核尚未完成整机核定。Chromium 111 是由现用 Tailwind CSS 4 的支持范围得到的候选核查下限，不能把候选内核的组件测试写成 WebView2 或 OBS 整体兼容承诺。

## 现用能力

| 能力与位置 | 候选 Chromium 111 实测 | 当前 Chromium 157 实测 | 处理 |
| --- | --- | --- | --- |
| 原生 dialog.showModal | 支持 | 支持 | 可用于局部弹窗，保留项目外观和保存状态 |
| :has、container-type、color-mix | 支持 | 支持 | 继续核对最终 CSS 与实际组件，不仅检查语法 |
| structuredClone、Intl.Segmenter、ResizeObserver、crypto.randomUUID | 支持 | 支持 | 现有实现不因语法偏好重写 |
| @starting-style | 不支持 | 支持 | 仅入场动画增强，不作为功能前提 |
| scrollend | 不支持 | 支持 | useLocalFeedReading 同时有定时清除状态，不单独依赖该事件 |
| 无前缀 image-set | 不支持 | 支持 | 新增此写法时保留单张图片基础声明；不重编码用户素材 |

测试环境为隔离的 Chromium 111.0.5563.33 与 Chrome 157.0.8103.79，未替换系统 WebView2。111 为自动化浏览器构建，不代表 Windows 上同版本 Evergreen WebView2 已验收。能力探测只验证所列能力，不代表所有第三方主题或依赖均已覆盖。

- Tailwind CSS 4 官方支持 Chrome 111、Safari 16.4、Firefox 128 起：https://tailwindcss.com/docs/compatibility
- Vite 7 默认最终构建目标包含 Chrome/Edge 107、Firefox 104、Safari 16；当前未单独覆盖 build.target：https://v7.vite.dev/config/build-options
- TypeScript 的 ES2020 与 ES2022.Intl 类型库不是浏览器运行时声明，也不自动补齐 API。
- 主窗口、副窗口采用 WebView2；OBS 浏览器源采用其自身内核；外置网页采用用户浏览器。分别记录实际版本，不互相替代验收。

## 前端修改约定

- 先通过 Modern Web Guidance 查询对应能力并读取完整指南，再核对现有实现和本约定。
- 基础交互不依赖未核定的新能力。新版专有能力仅作渐进增强，不支持时仍可显示和操作。
- 不为语法简化提高最低版本、引入兼容库或升级工具链。
- 兼容主题保留上游设计与现有 DOM；物化输出不作为手工修复入口。
- 共享渲染变化核对现场、副窗口、OBS及外置预览；桌面控件变化限定其实际入口。
- 显示缩放覆盖100%、125%、150%；同时检查文字换行、滚动、点选和菜单边界。
- 页面不可见时可暂停纯展示工作，采集、录档、合并、同步和播报不受影响。

## 支持矩阵与硬件配置

当前稳定版 WebView2、候选旧版 WebView2、Windows 10/11、OBS内核与外置浏览器分别登记验证状态。缺少环境时记为未验证，不推导通过。

硬件测试使用固定真实负载，记录程序版本、事件数量、档案规模、窗口和特效设置、响应、内存峰值、CPU/GPU及持续运行结果。单机观测只能作为参考，不能推导所有用户最低配置。安装空间、用户档案增长和开发构建缓存分开说明。

Chromium111的组件与网页结果不扩大为旧版WebView2或OBS本体承诺。

固定负载和本机资源测量不替代低配设备与旧系统验证。

原生窗口材质和桌面行为需要在对应系统上验证，不能由浏览器组件结果代替。

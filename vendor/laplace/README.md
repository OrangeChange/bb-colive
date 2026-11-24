# LAPLACE 兼容资源

正式渲染入口位于 `src/compat/laplace/renderer/product.tsx`，使用项目自行实现的组件、布局与动画。构建命令为 `node scripts/build-laplace-product.mjs`，输出到 `public/laplace/product/`。

正式图片映射为 `src/compat/laplace/renderer/asset-locations.json`。主题与图片位于 `public/laplace/`，产品预览数据在 `src/compat/laplace/`；原始测试对照数据在 `tests/fixtures/compat/laplace/`。

`licenses/` 保存相关第三方组件的原始许可。项目许可汇总见根目录 `THIRD_PARTY_NOTICES.md`。

正式资源来源地址见 `src/compat/laplace/renderer/asset-locations.json`。

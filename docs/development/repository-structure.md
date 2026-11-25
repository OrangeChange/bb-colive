# 项目目录与资源职责

## 正式源码

| 路径 | 职责 |
| --- | --- |
| src/ | 应用、事件投影、主题、编辑器、预览及兼容宿主 |
| src/components/shadcn/ | shadcn/ui 注册表组件及项目适配，许可独立保留 |
| src/components/ui/ | 共享控件的业务接口与组合 |
| src/shadcn.css、components.json | 宿主控件令牌与组件接入配置 |
| src/i18n/、docs/translations/ | 四语言运行文案、格式化、术语及翻译清单 |
| src-tauri/src/ | 原生窗口、存储、HTTP、音频与本机输出 |
| src-tauri/native/ | 正式液态玻璃实现及着色器 |
| resources/theme-catalog/ | 内置主题CSS、素材定义与来源映射 |
| vendor/blivechat/ | BLC原版固定来源组件及构建工具链 |
| vendor/openlive/ | BLC开放版MIT来源组件及宿主 |
| vendor/laplace/ | LAPLACE兼容资源说明及依赖许可 |
| public/ | 需要原路径提供的运行资源与兼容渲染生成物 |
| tests/fixtures/compat/ | 三版兼容的固定测试数据与SDK测试页 |
| scripts/ | 构建、素材准备、发布和可复用验证工具 |

## 兼容渲染

| 模式 | 可维护源码 | 构建入口 | 运行入口 |
| --- | --- | --- | --- |
| BLC原版 | vendor/blivechat/upstream/、vendor/blivechat/host/、src/compat/blivechat/ | scripts/build-blivechat.cjs | public/blivechat/renderer.html |
| BLC开放版 | vendor/openlive/、src/compat/openlive/ | scripts/build-openlive.cjs | public/openlive/renderer.html |
| LAPLACE | src/compat/laplace/renderer/ | scripts/build-laplace-product.mjs | public/laplace/product/index.html |

宿主消费软件统一事件，通过各模式投影输入渲染器。公共事件、菜单、特效、预览、编辑与场景筛选仍归软件管理。能力与外部HTML边界见[兼容主题契约](compatible-theme-contract.md)。

测试数据不放在public下，避免被Vite原样复制到发布目录。主题样例实际使用的头像、表情和礼物仍在public/media中；测试数据与产品预览素材不是同一类文件。

## 构建与运行目录

- dist是Vite生成的前端产物，构建后交给Tauri嵌入；不能当作可维护源码修改。
- src-tauri/style-distribution是内置主题分发目录，由主题源码和目录定义生成，安装及便携打包均从这里取资源。
- 程序旁style保存主题原件、用户自定义内容和素材缓存。源码中的旧src-tauri/style暂留本机，不作为当前分发生成入口。
- src-tauri/target和node_modules是构建、依赖目录，不提交Git。清理前确认其中是否有正在运行的程序。
- release保存本机发布物；旧安装包和便携包按版本保留，不混入前端资源或文档附件。

## 文档与本地资料

根目录 README 是软件介绍和使用入口，docs/README.md 是开发文档索引。产品、视觉和交互规范集中在 docs/specifications，具体操作维护在 docs/user-guide.md。

公开文档维护当前产品、架构、功能、开发方法和必要协议依据。历史过程统一放在docs/local-history；.hallmark、.impeccable、.superpowers及本机AGENTS.md不进入公开源码。范围见[文档维护](documentation-maintenance.md)。

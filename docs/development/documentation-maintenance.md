# 文档维护

## 当前文档

| 路径 | 职责 |
| --- | --- |
| README.md | 面向使用者的项目介绍、功能预览和上手入口 |
| docs/user-guide.md | 日常操作、主题、窗口、记录备份与问题反馈 |
| docs/images/ | README 和现行用户文档引用的界面图片及徽章 |
| docs/specifications/PRODUCT.md | 产品范围与使用场景 |
| docs/specifications/DESIGN.md | 全局视觉、排版与文案 |
| docs/specifications/UX-CONTRACT.md | 跨功能交互约定 |
| docs/project-status.md | 当前完成范围、待办与已知限制 |
| docs/architecture.md | 模块职责与数据流 |
| docs/features/ | 按功能维护当前行为、设置与金额口径 |
| docs/development/ | 构建、开发、兼容、资源与维护契约 |
| docs/development/interface-localization.md | 界面翻译边界、开发流程、用语确认与多语言完成条件 |
| src/components/shadcn/README.md | 共享组件用法、项目适配及交互边界 |
| docs/translations/ | 统一术语与当前界面翻译清单 |
| docs/research/ | 必要字段依据、协议样本与调查结论 |
| docs/roadmap/ | 尚未实现的后续方案 |

根目录 README.md 为简体中文入口，README.zh-Hant.md、README.en.md、README.ja.md 为对应译文，顶部语言链接相互连通。功能、版本、下载链接和操作入口变更时同步四份 README；相对路径、HTML、图片和代码命令保持有效，主题标识与界面术语遵循现有约定。

同一规则只在所属文档维护，其他文档链接引用。公共事件语义由native-event-style-contract.md维护，视觉规则与交互规则分别归 docs/specifications/DESIGN.md、docs/specifications/UX-CONTRACT.md。旧计划不能替代当前代码和契约。

## 版本与状态

README 和功能文档描述当前主分支；下载徽章与分发说明保留实际已发布版本。尚未发布的合入内容集中记录在 `docs/project-status.md`，不通过修改文档版本号暗示安装包已更新。历史版本、迁移范围和有日期的验收记录保留其原始版本含义。组件规则以组件说明及视觉、交互规范为准，多语言用语确认以界面语言适配文档为准。

## 本地历史

历史计划、验收截图、执行报告、旧版本状态和来源替换过程放在docs/local-history，保留原记录及日期，不再按当前版本改写。现行文档不依赖该目录才能阅读或构建。仍有效的要求先纳入所属契约，原件只供本机追溯。

.hallmark、.impeccable、.superpowers是审阅或技能工作资料；AGENTS.md是本机执行规则。它们不属于软件资源，也不进入GitHub或源码包。docs/specifications 中的产品、视觉和交互规范属于正式项目文档，继续提交。

## GitHub与源码包

README、正式规范、架构、功能、构建开发说明和必要协议研究随源码发布。README 和现行用户文档引用的界面图片及徽章随文档发布。历史过程及其验收截图、日志、私密设置、数据库、技能工作目录、依赖和构建缓存不发布。

.gitignore防止新文件加入；已经跟踪的旧文件需要在整理提交中移出当前版本。export-ignore只约束源码归档，不控制git push或程序打包。既有私有Git历史保持原样，公开内容按已核定的源码范围准备，不直接把本机历史和发布物一起推送。

## 验证与进度

文档变更检查相对路径、章节引用和实际源码入口；移动测试数据时验证所有读取者。文案相关断言随正式文案更新，不修改产品迎合旧测试。多语言的详细流程与用语确认规则统一维护于[界面文案](interface-localization.md#开发流程与用语确认)，视觉、交互、验收及本地升级流程链接引用。只改资料结构不重编译Rust或重启正在录档的程序。

进度只记录当前完成范围与待办。历史验收结果带原日期，不作为本轮重新验收的结论。图片与文件命名按asset-naming.md维护，目录职责见repository-structure.md。

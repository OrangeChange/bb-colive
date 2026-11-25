# shadcn/ui 组件

来源为官方 shadcn/ui 注册表，使用 CLI 4.23.0 与 `radix-nova` 样式接入。原始组件适用本目录 [MIT 许可](LICENSE)，项目自有协议不替代该许可。

`components.json` 是组件入口和样式配置，`src/shadcn.css` 将组件语义映射到现有软件主题。组件使用官方 `radix-ui`、`cn` 和 `class-variance-authority`，不在业务页另行仿写。

## 使用

```tsx
import { Button } from "@/components/shadcn/button"
import { Input } from "@/components/shadcn/input"

<Button>保存调整</Button>
<Input aria-label="主题名称" />
```

工具栏使用 `sm`（28px）或默认（32px），标准表单使用 `lg`（36px）的按钮；普通输入与选择器以32px为当前试作基线。`Tooltip` 在页面根部使用共享 `TooltipProvider`。

新增组件使用 `npx shadcn add <组件名>`，依赖本地锁定的 CLI。更新前使用 `npx shadcn add <组件名> --diff` 核对差异，不直接覆盖项目适配。

## 项目适配

- 主色、前景、边界、弱强调和危险色引用软件现有令牌，统一7px基础圆角和14px控件文字；不引入独立品牌颜色。
- 弱强调使用 `secondary` 映射，避开现有品牌 `accent` 的语义冲突。主按钮使用软件既有的悬停与按下色。
- 开关沿用36×20px尺寸与白色滑块；分段选中态统一弱强调。
- 表单弹窗最大宽440px，窄窗口受视口约束；底部操作靠右并允许换行。标题和说明关联沿用官方实现，关闭文案使用现有语言模块。
- 滑块将字段名称传递给可聚焦的滑块手柄；多手柄追加序号。
- 减少动效时保留状态、焦点与操作，取消组件的展示动画和过渡。

现有组件目录仍用于迁移前对照，正式页面的逐项替换另行实施；不改变弹幕主题及事件渲染契约。

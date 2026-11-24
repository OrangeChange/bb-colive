# 构建与发布

## 当前分发

客户端版本 1.1.0，正式支持 Windows 10/11 x64。分发文件：

- NSIS 安装包：`release/bb-colive_1.1.0_x64-setup.exe`
- 便携 ZIP：`release/bb-colive_1.1.0_x64-portable.zip`
- 便携解压目录：`release/bb-colive-1.1.0-portable/`
- 源码 ZIP：`release/bb-colive-1.1.0-source.zip`，包含生成时的正式源码和文档，并遵循 `.gitattributes` 排除规则。

不包含 MSI。安装包与便携包使用同一次 release 构建，源码包对应同一发行源码。NSIS 原始输出位于 Cargo 目标目录的 `release/bundle/nsis/`。

应用标识为 `orange.bbcolive`。安装版的数据根目录为 `%APPDATA%\BB CoLive\`；便携版由程序旁 `portable.flag` 启用同目录 `data/`。数据库、配置、日志、云恢复文件均使用该根目录，WebView 状态位于其 `WebView/` 子目录；主题仍位于程序旁的 `style/`。

安装版提供安装目录、快捷方式与卸载项，便携解压运行；两者功能和 WebView2 依赖相同。安装包与便携包都必须包含四模式 `style` 目录和内置主题文件；构建产物不含用户凭据、数据库或本地音频。自定义主题写入该目录，目录不可写时程序明确提示，不回退到应用数据目录。

主题库展示31个内置主题：原生3、BLC原版3、BLC开放版7、LAPLACE 18。分发目录另保留BLC开放版旧YT主题文件，合计32份，旧引用仍可读取。`npm run themes:prepare`生成干净的`src-tauri/style-distribution`，安装和便携打包均部署为程序旁`style/`。分发只包含主题定义和9个来源内嵌SVG。网络依赖保留原址，预览按需经本机服务进入`style/remote-cache`；应用时固定成功获取的依赖版本，失败的网络依赖保留原CSS回退行为，不阻断整个主题；完整ZIP必须准备全部依赖，失败不生成不完整包。覆盖升级保留旧资源和自定义主题；卸载后重装不等同于覆盖升级。

`style/catalog-assets.json` 为已应用快照的旧素材地址提供定位；本地服务仍可读取旧 `/theme-catalog/assets/` 地址，实际素材取自程序旁主题目录。新的应用按清单使用 `/theme-assets/` 或版本固定的 `/theme-resources/`。迁移目录不会清空应用绑定或重新应用主题。主题文件缺失时保留原绑定及已发布快照，编辑明确提示恢复文件或重新导入，不替换成默认主题。

主题绑定、OBS 配置及完整的已应用样式快照仍保存在用户数据目录。快照包含 CSS 和显示参数，也可能含内嵌素材；它用于恢复已应用效果，不能替代 `style` 的主题备份。移动完整便携目录会同时携带 data、style、设置、档案及登录态。升级时保留这两个目录；分发包不携带用户数据。

## 兼容渲染构建

修改BLC原版或开放版源码后，分别运行 `node scripts/build-blivechat.cjs`、`node scripts/build-openlive.cjs`，提交对应public生成物及许可声明。`npm run build`会准备主题、构建LAPLACE并整理分发许可，然后执行TypeScript和Vite构建；它不会自动重建两版BLC。正式资源和测试数据的归属见[目录职责](repository-structure.md)。

## 操作

开发命令见[项目说明](../../README.md)，原目录调试要求见[调试与验收](debugging-and-testing.md)。构建使用 `npm run tauri -- build --bundles nsis`；生成便携包时使用同一 release exe。关于页保留必要致谢。安装版与便携版附带相同的 `licenses/THIRD_PARTY_NOTICES.txt` 与 `licenses/Tsanger.pdf`，可离线查阅。

客户端版本采用 `主版本.次版本.修订版本`，Release 标签为 `v<版本号>`。安装包、便携包和源码包使用同一版本。源码包遵循 `.gitattributes` 归档排除规则，包含正式文档、运行资源及许可资料，不包含运行数据、凭据和构建缓存。

远程主题依赖缓存位于程序旁 `style/remote-cache`，不混入公共素材库；本地素材的发布副本位于 `style/published-assets`。安装升级须保留自定义主题和被旧快照引用的素材版本。构建源码中的内置素材不包含用户运行缓存。

许可原文与来源索引见[第三方许可](../../THIRD_PARTY_NOTICES.md)。更新运行依赖后执行 `npm run licenses:collect` 并提交许可目录；生成命令依据当前锁文件与已安装依赖收集原文，不在用户使用时联网获取。

## 1.0.0 升级

首次启动前退出旧版。迁移复制 `%APPDATA%\cc.orange.danmu-app` 与旧 WebView 状态，在独立暂存目录完成后启用新数据目录；原目录保留。新目标已有数据时不覆盖。程序占用、权限或复制失败会提示处理方式，不启用半份迁移数据。过渡迁移限旧品牌目录，后续版本移除时间另定。

安装器使用新品牌安装身份，不自动卸载旧版或删除旧安装目录。能够定位旧版安装位置时，复制缺失的主题和素材，不覆盖新版已有文件。旧便携版应在备份后于原目录升级，保留 style 与 portable.flag；不要只移动 exe。

构建执行 `node scripts/package-license-notices.mjs`，合并相同许可原文并保留各组件来源，仓耳授权随原 PDF 分发。原始许可资料继续保存在源码中。便携脚本生成 portable.flag，不预装 data。协议为《BB CoLive 软件与源码使用许可协议》1.1，署名为橙橙子君（Orange）。

## 软件内更新

更新入口位于设置 → 关于，与品牌和版本入口放在同一组。自动检查不会自动下载或退出程序。自动线路通过 IP 国家代码选择：CN 使用国内，其他地区使用国外；定位失败暂用国内。用户可随时选择国内或国外。自动模式比较两边的正式版本，备用下载仅限同版本；手动模式遵循选定线路。

安装版使用原安装目录静默更新，由独立窗口展示状态；便携版原位替换程序文件，替换前备份受影响文件，失败时恢复。下载完成后由用户选择“重启并更新”，沿用保存、停止记录及关闭窗口的退出流程。用户数据、主题调整、自定义主题和素材保留。独立窗口可以最小化，更新完成后重新打开软件。

更新包采用 Tauri 兼容的 Minisign 签名。仓库只保存 `src-tauri/update-public.key`；私钥保存在构建机器外部，通过 `TAURI_SIGNING_PRIVATE_KEY_PATH` 提供，不进入源码或分发包。丢失私钥将无法继续为现有客户端发布可验证的更新，应单独备份。

生成同版本安装包和便携包后执行：

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY_PATH = '签名私钥的绝对路径'
node scripts/prepare-update-release.mjs <版本号> <安装包路径> <便携包路径> <清单输出目录>
```

脚本生成两个包的 `.sig`，以及 `domestic/update.json`、`foreign/update.json`。两站上传同一对已签名更新包，各自上传对应的 `update.json`，文件名保持不变。完成包上传后再上传清单，清单是该版本可供软件内更新的标记。GitHub 可在草稿中准备；Gitee 应最后上传清单。首次包含更新功能的版本仍需手动安装一次，已发布的 1.0.0 不会因此获得更新能力。


更新界面回归可在开发服务运行后执行：

```powershell
node tests/softwareUpdate.browser.mjs
node tests/softwareUpdateNotifications.browser.mjs
```

使用其他开发端口时，通过 `BB_COLIVE_TEST_BASE_URL` 指定服务地址。两个用例直接加载正式更新组件，检查线路切换、失败重试、取消与就绪状态、关于入口、铃铛通知及窗口内容高度。真实安装与便携替换仍需使用隔离程序和独立数据目录验证，不替换日常程序。

# 第三方许可

本项目自有代码采用 [BB CoLive 软件与源码使用许可协议](LICENSE)。第三方代码、字体、主题和素材遵循各自的授权条款。

关于页保留必要致谢与 MiSans 字体说明。安装版与便携版均在程序旁的 `licenses/` 提供同一套离线声明：`THIRD_PARTY_NOTICES.txt` 合并软件协议和第三方原文，`Tsanger.pdf` 保留仓耳授权原件。

## 依赖与许可原文

- [许可目录](licenses/notices.json)：Windows x64 运行依赖、兼容渲染依赖和字体许可。
- [补充原文](licenses/supplemental/index.json)：依赖发布包未附原文时，记录上游原文及来源地址。
- [字体授权](licenses/fonts/)：MiSans 协议、仓耳授权声明原件及其阅读图片，以及 LAPLACE 使用的 Barlow Condensed 字体 OFL 原文。
- [BLC 原版](vendor/blivechat/LICENSE) 与 [BLC 开放版](vendor/openlive/LICENSE)：兼容渲染使用的上游 MIT 许可。
- [LAPLACE 依赖许可](vendor/laplace/licenses/)：对应第三方组件的原始声明。

执行 `npm run licenses:collect` 可依据锁文件和本机已安装的依赖重新生成目录；需要已安装 Node 与 Rust 依赖。生成过程不下载许可证。

## 来源与适用范围

Rust 依赖保留原许可证标识和精确版本的 crates.io 来源地址，包括 MPL-2.0 组件的源代码获取地址。JavaScript 依赖保留原许可证文本与上游来源。双许可证依赖保留上游声明。

主题 CSS、平台图片和官方预览素材的来源记录保留在各自目录中；项目自有代码的许可不改变这些内容的原有权利归属。

合并分发文件通过 `node scripts/package-license-notices.mjs` 生成。相同原文合并一次，所有组件、版本、来源及声明均保留；原始授权资料继续保存在源码中。

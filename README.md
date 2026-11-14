# 小睦 Codex Skin

小睦 Codex Skin 是给 Windows 版 Codex 做的非官方粉丝外观，目前整理到了 1.0.0 正式版。整个界面换上了浅绿底色和奶白卡片，首页有安静的窗边背景，侧栏欢迎区、卡片和头像里也能看到小睦的身影，适合平时喜欢把工作桌面收拾得温和一点的同好。

日常用到的输入区、代码对比、终端和原本的操作方式都照旧保留，文件夹、代码、终端、设置这些常用图标也维持着大家熟悉的轮廓。上手时可以顺着平时的习惯直接使用，在顺手干活的同时，让眼前常开的窗口多几分柔和耐看的气息。

当前版本：**1.0.0 正式版**

[下载安装包](https://github.com/lucifergzsz414/xiaomu-codex-skin/releases/download/v1.0.0/xiaomu-codex-skin-20261114-2228-v1.0.0.zip) · [发布说明](https://github.com/lucifergzsz414/xiaomu-codex-skin/releases/tag/v1.0.0) · [日常使用与反馈](docs/BETA-TRYOUT.md) · [设计说明](docs/DESIGN.md) · [历史版本](https://github.com/lucifergzsz414/xiaomu-codex-skin/releases)

![浅绿主题与小睦窗边背景素材演示](docs/images/material-preview.png)

*素材示意。仓库里的 [本地预览页](docs/demo/index.html) 可在下载后用浏览器打开。*

## 平时会遇到的几处变化

- 从「小睦 Codex」完整启动时，播放一次五秒静音片头；可以点“跳过”或按 Esc。
- 首页的八秒静音窗边背景可以手动暂停，窗口失焦或收窄时也会自动暂停。
- 文件与文本搜索会按当前聊天记住所选的项目目录。
- 桌面入口负责日常启动，开始菜单里的「小睦皮肤管理」集中提供暂停、恢复和修复。

## 使用前准备

| 项目 | 要求 |
| --- | --- |
| 系统与客户端 | Windows x64；Microsoft Store Codex **26.1111.2228.0** |
| Node.js | **22 或更高版本**，安装在默认目录 `C:\Program Files\nodejs` |
| Codex 外观 | 在 Codex 原生设置中选择**浅色主题** |

## 安装与恢复

1. 下载完整安装包，解压后保留原压缩包与解压目录。
2. 双击 `skin\manage.vbs`，选择“安装 / 修复”（详细步骤见包内 `START-HERE.md`）。
3. 保存手头的工作，正常退出 Codex，再从桌面「小睦 Codex」打开。

平时想暂时切回原版，打开开始菜单的「小睦皮肤管理」即可暂停或恢复。选择“恢复官方外观”会撤下皮肤并恢复受管入口，已经打开的 Codex 窗口不会关闭，专用小睦入口和备份也会保留下来。

## 从旧版升级

如果你之前装过旧版，请按下面的步骤更新（直接在旧安装上点“安装 / 修复”只会补齐入口，不会替换程序文件）：

1. 打开「小睦皮肤管理」暂停皮肤，等它完全停止后关闭管理窗口。
2. 解压新版本安装包，在新包的 `skin` 文件夹中打开 Windows PowerShell，执行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -SourceRoot . -Repair
```

3. 原来的安装内容会自动备份到 `backup-repair-*`。升级完成后皮肤默认保持暂停状态，重新打开管理窗口，等检测通过后点“启动 / 继续”即可启用。

更多修复与恢复说明见包内 `skin\USAGE.md` 及 [日常使用与反馈](docs/BETA-TRYOUT.md)。

## 验收记录

已完成 244 项源码与无头样例检查，以及 12 项同包安装、升级和恢复流程的隔离检查。整包冷启动和独立 Windows 11 普通用户首装仍待确认；完整记录和其他待确认项目见 [验收记录](qa/RELEASE-READINESS-1.0.0.md)。

## 从源码构建

如果只是日常使用，直接下载上面的 Release 安装包即可。需要自行构建时，可使用 [1.0.0 标签源码](https://github.com/lucifergzsz414/xiaomu-codex-skin/tree/v1.0.0)，在 Windows 下准备 Node.js 22+、Windows PowerShell 和系统自带的 .NET Framework C# 编译器，在仓库根目录依次执行：

```powershell
node .\integration-v1\native-v1\build-native.cjs
node .\integration-v1\release-v1\build-release.cjs
```

生成结果位于 `integration-v1\release-v1\package`。

## 来源与反馈

上游辅助脚本沿用 Codex Dream Skin Studio 的 MIT 许可，完整说明见 [第三方与素材说明](THIRD-PARTY-NOTICES.md)、[素材来源](integration-v1/release-v1/ASSET-SOURCES.md) 与 [素材清单](integration-v1/release-v1/asset-ledger.json)。

用的时候如果遇到问题，欢迎通过 [反馈表](https://github.com/lucifergzsz414/xiaomu-codex-skin/issues/new?template=skin-problem.yml) 写下你的版本号、刚才的操作步骤和实际画面表现；附截图前记得先遮住私人内容。

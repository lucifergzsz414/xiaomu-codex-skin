# 小睦 Codex Skin

小睦 Codex Skin 是给 Windows 版 Codex 做的非官方粉丝外观。浅绿底色、奶白卡片和安静的窗边背景，让平时常开的工作窗口多一点小睦的气息。

输入区、代码对比、终端和原本的操作方式照旧保留，文件夹、代码、终端、设置等常用图标也维持熟悉的轮廓，可以顺着平时的习惯直接使用。

当前版本：**1.0.2 正式版**

[下载安装包](https://github.com/lucifergzsz414/xiaomu-codex-skin/releases/download/v1.0.2/xiaomu-codex-skin-20261115-2228-v1.0.2.zip) · [发布说明](https://github.com/lucifergzsz414/xiaomu-codex-skin/releases/tag/v1.0.2) · [日常使用与反馈](docs/BETA-TRYOUT.md) · [设计说明](docs/DESIGN.md) · [全部发布](https://github.com/lucifergzsz414/xiaomu-codex-skin/releases)

![浅绿主题与小睦窗边背景素材演示](docs/images/material-preview.png)

*素材示意。仓库里的 [本地预览页](docs/demo/index.html) 可在下载后用浏览器打开。*

## 平时会遇到的几处变化

- 从「小睦 Codex」完整启动时，播放一次五秒静音片头；可以点“跳过”或按 Esc。
- 首页的八秒静音窗边背景可以手动暂停，窗口失焦或收窄时也会自动暂停。
- 文件与文本搜索会按当前聊天记住所选的项目目录。
- 桌面提供「小睦 Codex」和「小睦皮肤管理」两个常用入口，分别用于启动和管理皮肤；开始菜单也保留管理入口。

## 使用前准备

| 项目 | 要求 |
| --- | --- |
| 系统与客户端 | Windows x64；Microsoft Store Codex **26.1111.2228.0** |
| Node.js | **22 或更高版本**，安装在默认目录 `C:\Program Files\nodejs` |
| Codex 外观 | 在 Codex 原生设置中选择**浅色主题** |

## 安装与恢复

1. 下载完整安装包并解压，保留原压缩包与解压目录。
2. 双击 `skin\manage.vbs`，选择“安装 / 修复”（详细步骤见包内 `START-HERE.md`）。
3. 保存手头的工作，正常退出 Codex，再从桌面「小睦 Codex」打开。

平时想暂时切回原版，打开桌面或开始菜单的「小睦皮肤管理」即可暂停或恢复。选择“恢复官方外观”会撤下皮肤并恢复受管入口，已经打开的 Codex 窗口、专用小睦入口和备份都会保留。

## 更新皮肤

在「小睦皮肤管理」里点“检查更新”，有新版本时再点“下载并更新”。管理器会从 GitHub 下载正式版，自动校验安装包、备份旧安装，完成后重新打开管理窗口；无需登录 GitHub，也不用安装 `gh`。

更新后皮肤保持暂停，检测通过后点“启动 / 继续”即可。Codex 窗口和运行中的任务会保留。只有点击按钮时才联网检查，不影响日常启动。

**旧管理器没有更新按钮：**这次先下载并解压 1.0.2，关闭旧管理窗口，再打开新包的 `skin\manage.vbs`，点“安装 / 修复”。这一步会换上新管理器，以后就可以在管理窗口里更新。

需要手动更新时，备用命令和恢复步骤见 [完整使用说明](integration-v1/release-v1/USAGE.md)。管理窗口显示产品版本 1.0.2。

1.0.2 让桌面入口更方便，浅绿主题、片头、背景和管理器更新流程照旧。本次改动与验证记录见 [1.0.2 更新说明](integration-v1/release-v1/RELEASE-NOTES-1.0.2.md)。

## 从源码构建

日常使用直接下载上面的 Release 安装包即可。需要自行构建时，可使用 [1.0.2 标签源码](https://github.com/lucifergzsz414/xiaomu-codex-skin/tree/v1.0.2)，在 Windows 下准备 Node.js 22+、Windows PowerShell 和系统自带的 .NET Framework C# 编译器，在仓库根目录依次执行：

```powershell
node .\integration-v1\native-v1\build-native.cjs
node .\integration-v1\release-v1\build-release.cjs
```

生成结果位于 `integration-v1\release-v1\package`。

## 来源与反馈

上游辅助脚本沿用 Codex Dream Skin Studio 的 MIT 许可，完整说明见 [第三方与素材说明](THIRD-PARTY-NOTICES.md)、[素材来源](integration-v1/release-v1/ASSET-SOURCES.md) 与 [素材清单](integration-v1/release-v1/asset-ledger.json)。

遇到问题时，欢迎通过 [反馈表](https://github.com/lucifergzsz414/xiaomu-codex-skin/issues/new?template=skin-problem.yml) 写下版本号、操作步骤和实际表现；附截图前记得遮住私人内容。

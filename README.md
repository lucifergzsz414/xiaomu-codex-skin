# 小睦 Codex Skin

浅绿、奶白，还有窗边的小睦。

为 Windows 版 Codex 制作的非官方粉丝主题，包含小睦首页、特色图标、动态背景与五秒静音雨景片头，沿用 Codex 原生输入、菜单和工作流程。

**1.0.0 正式版**

[下载安装包](https://github.com/lucifergzsz414/xiaomu-codex-skin/releases/download/v1.0.0/xiaomu-codex-skin-20261114-2228-v1.0.0.zip) · [发布说明](https://github.com/lucifergzsz414/xiaomu-codex-skin/releases/tag/v1.0.0) · [使用说明](docs/BETA-TRYOUT.md) · [历史版本](https://github.com/lucifergzsz414/xiaomu-codex-skin/releases)

![浅绿主题与小睦窗边背景素材演示](docs/images/material-preview.png)

素材演示 · [播放背景与片头](docs/demo/index.html)

## 这一版

- 小睦首页、侧栏和图标，配合浅绿界面与窗边动态背景。
- 正常启动时播放一次五秒片头；点击、输入不再提前取消，可用“跳过”或 Esc 结束。
- 适配新版搜索弹窗、右键主菜单与子菜单；文件和文本搜索会记住所选项目目录。
- 保留两个入口：桌面「小睦 Codex」、开始菜单「小睦皮肤管理」。

## 使用前准备

| 项目 | 要求 |
| --- | --- |
| 系统与客户端 | Windows x64；Microsoft Store Codex **26.1111.2228.0** |
| Node.js | **22 或更高版本**，默认目录 `C:\Program Files\nodejs` |
| Codex 外观 | 在 Codex 原生设置中选择**浅色主题** |

## 安装与恢复

1. 下载完整安装包，解压后保留原包与解压目录。
2. 双击 `skin\manage.vbs`，选择“安装 / 修复”。详细步骤见包内 `START-HERE.md`。
3. 保存工作，正常退出 Codex，再从桌面「小睦 Codex」打开。

开始菜单中的「小睦皮肤管理」可暂停、恢复或修复皮肤。选择“恢复官方外观”会撤下皮肤并恢复受管入口，Codex 保持打开；专用小睦入口和备份会保留。

## 从旧版升级

1. 在「小睦皮肤管理」暂停皮肤，等停止后关闭管理窗口。
2. 解压新包，在新包的 `skin` 文件夹中打开 Windows PowerShell，执行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -SourceRoot . -Repair
```

3. 旧安装会保存在 `backup-repair-*`。重新打开管理窗口，检测通过后选择“启动 / 继续”。

升级后保持暂停，启用时间由你决定。旧安装重复点“安装 / 修复”只会补齐入口；更新程序请使用上面的命令。修复与恢复步骤见包内 `skin\USAGE.md`。

## 验收记录

已完成自动回归和本机兼容核对。本版实际片头播放、搜索与菜单交互、整包冷启动及独立 Windows 11 普通用户首装仍待确认，详见[验收记录](qa/RELEASE-READINESS-1.0.0.md)。

## 从源码构建

使用 [1.0.0 标签源码](https://github.com/lucifergzsz414/xiaomu-codex-skin/tree/v1.0.0)，在 Windows 下准备 Node.js 22+、Windows PowerShell 和系统自带的 .NET Framework C# 编译器，然后在仓库根目录执行：

```powershell
node .\integration-v1\native-v1\build-native.cjs
node .\integration-v1\release-v1\build-release.cjs
```

构建结果位于 `integration-v1\release-v1\package`。直接使用请选择 Release 安装 ZIP。

## 来源与反馈

上游辅助脚本沿用 Codex Dream Skin Studio 的 MIT 许可。完整说明见[第三方与素材说明](THIRD-PARTY-NOTICES.md)、[素材来源](integration-v1/release-v1/ASSET-SOURCES.md)与[素材清单](integration-v1/release-v1/asset-ledger.json)。

遇到问题时，通过[反馈表](https://github.com/lucifergzsz414/xiaomu-codex-skin/issues/new?template=skin-problem.yml)写明版本、操作步骤和实际结果，截图先遮住私人内容。

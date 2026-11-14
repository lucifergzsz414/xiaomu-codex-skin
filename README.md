# 小睦 Codex Skin

为 Windows 版 Codex 制作的非官方小睦主题：浅绿与奶白配色、Q 版若叶睦、侧栏与首页装饰、八秒静音首页循环，以及五秒静音雨景开场。保留 Codex 原生菜单、输入与交互，终端、代码、差异和状态颜色保留原有语义。

这是粉丝制作的外观项目，与 OpenAI、BanG Dream! 及相关权利方无隶属或背书关系。

**当前预发布为 4239 RC2，候选编号 20261109-4239-rc2。**

[下载 4239 RC2 安装包](https://github.com/lucifergzsz414/xiaomu-codex-skin/releases/download/v1.0.0-4239-rc2/xiaomu-codex-skin-20261109-4239-rc2.zip) · [发布说明与 SHA256](https://github.com/lucifergzsz414/xiaomu-codex-skin/releases/tag/v1.0.0-4239-rc2) · [第三方与素材说明](THIRD-PARTY-NOTICES.md)

![小睦素材演示页：浅绿配色与窗边背景，非实机录屏](docs/images/material-preview.png)

素材演示，非实机录屏。[播放背景和片头](docs/demo/index.html) · [4239 RC2 试用说明](docs/BETA-TRYOUT.md)

本版适配 Microsoft Store Codex **26.1103.4239.0**，修复片头不播放和设置切页时皮肤短暂消失。全新安装提供桌面「小睦 Codex」和开始菜单「小睦皮肤管理」两个入口。

## 使用前准备

| 项目 | 当前要求 |
| --- | --- |
| 系统与客户端 | Windows；当前用户已安装 Microsoft Store Codex **26.1103.4239.0** |
| Node.js | **22 或更高版本**，安装在默认目录 `C:\Program Files\nodejs` |
| Codex 外观 | 在 Codex 原生设置中选择**浅色主题** |

启动时会检查当前 Codex 版本的兼容性。

## 安装与恢复

1. 下载 [4239 RC2 安装包](https://github.com/lucifergzsz414/xiaomu-codex-skin/releases/download/v1.0.0-4239-rc2/xiaomu-codex-skin-20261109-4239-rc2.zip)，完整解压并保留原包。
2. 阅读包内的 `START-HERE.md` 和 `skin\USAGE.md`，双击 `skin\manage.vbs`，选择“安装 / 修复”。
3. 保存工作并正常退出全部 Codex 窗口，再从桌面“小睦 Codex”或管理窗口的“启动 / 继续”进入。
4. 暂时停用可选“暂停皮肤”；撤回外观与受管快捷方式可选“恢复官方外观”。

恢复会保留专用小睦入口和备份，Codex 保持打开；本版没有一键完整卸载入口。皮肤不修改官方应用包、模型、登录、权限或原生主题设置。

包内两个辅助 EXE 尚未数字签名。若 Windows、安全软件或组织策略阻止运行，请保留提示并停止，不关闭防护。

4239 RC2 ZIP 的 SHA256

```text
bec77285326f6ad2505902774ed9f6eef86606ed8d9f2042c2ffe4ec37b9823e
```

## 已安装旧候选时升级

管理窗口、运行清单和安装目录仍显示运行版本 **`1.0.0`**。请用候选编号 `20261109-4239-rc2` 识别本版。完整旧安装重复点击“安装 / 修复”只会补齐入口，升级请按以下步骤进行。

1. 保留旧包，在管理窗口点“暂停皮肤”，等皮肤停止，再关闭所有小睦管理窗口。
2. 完整解压新包，在新包的 `skin` 文件夹中打开 Windows PowerShell，运行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -SourceRoot . -Repair
```

3. 等待校验与替换完成。旧安装会保存为 `backup-repair-*`，请保留备份。
4. 重新打开“小睦皮肤管理”，点“重新检测”，通过后主动点“启动 / 继续”。升级后保持暂停，不自动启用。

修复和回退也应使用另一份可信的完整解压包，勿以已安装目录自身作为来源。详细步骤见当前解压包中的 `skin\USAGE.md`。

## 当前验证范围

- 现用安装的片头、设置页、搜索、右键主菜单与子菜单已实机确认正常。
- 终端显示、文件差异的视图切换与窄栏布局已实机检查；仓库访问审批确认后成功创建工作目录。
- 发布 ZIP 通过 12 项本机隔离检查，覆盖安装、重复安装、升级、损坏修复、暂停和恢复。
- 待验收：执行命令审批、整包冷启动、独立 Windows 11 普通用户环境。

## 本地素材演示

完整克隆或下载本仓库后，在浏览器打开 [`docs/demo/index.html`](docs/demo/index.html)，可查看实际使用的八秒首页背景、五秒片头和四张 Q 图。演示页面使用预设说明文字，标明“素材演示 · 非实机录屏”；无需预览服务，不连接 Codex，也不执行安装。它不是完整产品界面或新的实机验收记录。

[素材清单](integration-v1/release-v1/asset-ledger.json)记录实际文件、来源链、哈希和仍缺的作者／权利记录。

## 从源码构建

请使用 [4239 RC2 标签源码](https://github.com/lucifergzsz414/xiaomu-codex-skin/tree/v1.0.0-4239-rc2)构建。

```text
integration-v1\
  native-v1\              原生界面适配与自包含皮肤构建
  release-v1\             Windows 管理、安装、恢复与打包
preview-v6\
  index.html              页面与图标来源
  assets\                 本候选引用的静态图与首页循环素材
  pv-v1\                  本候选引用的五秒开场素材
research\internet-angel\  两个上游辅助脚本与原 MIT 许可
```

构建需要 64 位 Windows、Windows PowerShell、Node.js 22+，以及系统自带的 .NET Framework C# 编译器。保留的 `preview-v6\index.html` 是构建输入，仓库未包含完整预览站点。

在该标签源码的根目录依次执行：

```powershell
node .\integration-v1\native-v1\build-native.cjs
node .\integration-v1\release-v1\build-release.cjs
```

生成的皮肤和安装文件位于 `integration-v1\release-v1\package`。构建产物、安装备份、测试输出和本地配置不纳入源码仓库。下载即用请选择 Release ZIP；源码压缩包不能代替完整安装包。

## 来源与反馈

两个上游辅助脚本沿用 Codex Dream Skin Studio 的 MIT 许可，原文随仓库和安装包保留。此许可不自动覆盖本项目新增代码或视觉素材；本项目未为全部新增代码另行声明统一许可证。

角色图、背景、视频与图标的部分来源、署名及再分发记录仍待补齐，详见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) 和 [ASSET-SOURCES.md](integration-v1/release-v1/ASSET-SOURCES.md)。

反馈请提供候选编号、Windows / Store Codex / Node.js 版本、操作步骤和完整错误提示。截图先遮住私人内容；请勿上传聊天正文、登录资料或密钥。

可以使用[皮肤问题反馈表](https://github.com/lucifergzsz414/xiaomu-codex-skin/issues/new?template=skin-problem.yml)填写。不知道的环境信息写“不确定”即可。试用步骤见 [4239 RC2 试用说明](docs/BETA-TRYOUT.md)。

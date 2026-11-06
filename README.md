# 小睦 Codex Skin

为 Windows 版 Codex 制作的非官方小睦主题：浅绿与奶白配色、Q 版若叶睦、侧栏与首页装饰、八秒静音首页循环，以及五秒静音雨景开场。保留 Codex 原生菜单、输入与交互，终端、代码、差异和状态颜色保留原有语义。

这是粉丝制作的外观项目，与 OpenAI、BanG Dream! 及相关权利方无隶属或背书关系。

**当前预发布为 3517 兼容测试版，候选编号 20261106-3517-rc1。**

[下载 3517 安装包](https://github.com/lucifergzsz414/xiaomu-codex-skin/releases/download/v1.0.0-3517-rc1/xiaomu-codex-skin-20261106-3517-rc1.zip) · [发布说明与 SHA256](https://github.com/lucifergzsz414/xiaomu-codex-skin/releases/tag/v1.0.0-3517-rc1) · [第三方与素材说明](THIRD-PARTY-NOTICES.md)

[7803 发布页](https://github.com/lucifergzsz414/xiaomu-codex-skin/releases/tag/v1.0.0-7803-rc1) · [7803 ZIP](https://github.com/lucifergzsz414/xiaomu-codex-skin/releases/download/v1.0.0-7803-rc1/xiaomu-codex-skin-20261105-7803-rc1.zip) · [7803 SHA256](https://github.com/lucifergzsz414/xiaomu-codex-skin/releases/download/v1.0.0-7803-rc1/xiaomu-codex-skin-20261105-7803-rc1.zip.sha256) · [Beta.2（3384 兼容版）](https://github.com/lucifergzsz414/xiaomu-codex-skin/releases/tag/v1.0.0-beta.2) · [Beta.1](https://github.com/lucifergzsz414/xiaomu-codex-skin/releases/tag/v1.0.0-beta.1)

![小睦素材演示页：浅绿配色与窗边背景，非实机录屏](docs/images/material-preview.png)

上图是素材演示页截图，非真实 Codex 窗口。[本地播放背景和片头](docs/demo/index.html) · [3517 试用说明](docs/BETA-TRYOUT.md)

[十五秒素材短片](docs/demo/beta2-materials-15s.mp4)：现有片头、窗边循环与版本卡的静音剪辑，非实机录屏。[Beta.2 分享文案草稿](docs/SHARE-DRAFT.md)。

本版适配 Microsoft Store Codex 26.1103.3517.0 的聊天搜索弹窗、右键菜单和子菜单。全新安装提供桌面「小睦 Codex」和开始菜单「小睦皮肤管理」两个入口。

## 使用前准备

| 项目 | 当前要求 |
| --- | --- |
| 系统与客户端 | Windows；当前用户已安装 Microsoft Store Codex **26.1103.3517.0** |
| Node.js | **22 或更高版本**，安装在默认目录 `C:\Program Files\nodejs` |
| Codex 外观 | 在 Codex 原生设置中选择**浅色主题** |

启动时会检查当前 Codex 版本的兼容性。

## 安装与恢复

1. 下载 [3517 安装包](https://github.com/lucifergzsz414/xiaomu-codex-skin/releases/download/v1.0.0-3517-rc1/xiaomu-codex-skin-20261106-3517-rc1.zip)，完整解压并保留原包。
2. 阅读包内的 `START-HERE.md` 和 `skin\USAGE.md`，双击 `skin\manage.vbs`，选择“安装 / 修复”。
3. 保存工作并正常退出全部 Codex 窗口，再从桌面“小睦 Codex”或管理窗口的“启动 / 继续”进入。
4. 暂时停用可选“暂停皮肤”；撤回外观与受管快捷方式可选“恢复官方外观”。

恢复会保留专用小睦入口和备份，Codex 保持打开；本版没有一键完整卸载入口。皮肤不修改官方应用包、模型、登录、权限或原生主题设置。

包内两个辅助 EXE 尚未数字签名。若 Windows、安全软件或组织策略阻止运行，请保留提示并停止，不关闭防护。

3517 ZIP 的 SHA256

```text
b92378dabf1f3dfaae0b46a813c71c1ee866f0c2ca29b13d49d2aa0967d6b417
```

## 已安装旧候选时升级

管理窗口、运行清单和安装目录仍显示运行版本 **`1.0.0`**。请用候选编号 `20261106-3517-rc1` 识别新版。完整旧安装重复点击“安装 / 修复”只会补齐入口，升级请按以下步骤手动进行。

1. 保留旧包，在管理窗口点“暂停皮肤”，等皮肤停止，再关闭所有小睦管理窗口。
2. 完整解压新包，在新包的 `skin` 文件夹中打开 Windows PowerShell，运行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -SourceRoot . -Repair
```

3. 等待校验与替换完成。旧安装会保存为 `backup-repair-*`，请保留备份。
4. 重新打开“小睦皮肤管理”，点“重新检测”，通过后主动点“启动 / 继续”。升级后保持暂停，不自动启用。

修复和回退也应使用另一份可信的完整解压包，勿以已安装目录自身作为来源。详细步骤见 3517 解压包中的 `skin\USAGE.md`。

## 当前验证范围

- 本机热更新后，聊天搜索弹窗、右键主菜单和子菜单的样式与操作已通过实机验收。
- 发布 ZIP 通过本机隔离安装、从 7803 升级和恢复官方快捷方式的检查。
- 整包冷启动和独立 Windows 11 普通用户环境仍待验收。

[3517 发布记录](https://github.com/lucifergzsz414/xiaomu-codex-skin/releases/tag/v1.0.0-3517-rc1) · [7803 发布记录](https://github.com/lucifergzsz414/xiaomu-codex-skin/releases/tag/v1.0.0-7803-rc1) · [Beta.2 历史验收记录](qa/RELEASE-READINESS.md)

## 本地素材演示

完整克隆或下载本仓库后，在浏览器打开 [`docs/demo/index.html`](docs/demo/index.html)，可查看实际使用的八秒首页背景、五秒片头和四张 Q 图。演示页面使用预设说明文字，标明“素材演示 · 非实机录屏”；无需预览服务，不连接 Codex，也不执行安装。它不是完整产品界面或新的实机验收记录。

2026-11-02 新增[脱敏素材清单](integration-v1/release-v1/asset-ledger.json)，记录当前包的实际文件、来源链、哈希和仍缺的作者／权利记录。原始制作收据含本地或服务信息，未直接发布。

## 从源码构建

[3517 适配源码](https://github.com/lucifergzsz414/xiaomu-codex-skin/tree/v1.0.0-3517-rc1) · [7803 适配源码](https://github.com/lucifergzsz414/xiaomu-codex-skin/tree/v1.0.0-7803-rc1)。以下是默认分支的旧版构建说明。

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

在仓库根目录依次执行：

```powershell
node .\integration-v1\native-v1\build-native.cjs
node .\integration-v1\release-v1\build-release.cjs
```

生成的皮肤和安装文件位于 `integration-v1\release-v1\package`。构建产物、安装备份、测试输出和本地配置不纳入源码仓库。下载即用请选择 Release ZIP；源码压缩包不能代替完整安装包。

默认分支的封包脚本仅对应 Beta.2。维护者如需复核旧版封包流程，请使用包含历史提交的 Git 克隆并先提交所有源文件，再运行 `powershell.exe -NoProfile -File .\integration-v1\release-v1\prepare-release-candidate.ps1`。封包脚本读取既有验收记录，验证源码关联，并拒绝覆盖同名已封包文件。

## 来源与反馈

两个上游辅助脚本沿用 Codex Dream Skin Studio 的 MIT 许可，原文随仓库和安装包保留。此许可不自动覆盖本项目新增代码或视觉素材；本项目未为全部新增代码另行声明统一许可证。

角色图、背景、视频与图标的部分来源、署名及再分发记录仍待补齐，详见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) 和 [ASSET-SOURCES.md](integration-v1/release-v1/ASSET-SOURCES.md)。

反馈请提供候选编号、Windows / Store Codex / Node.js 版本、操作步骤和完整错误提示。截图先遮住私人内容；请勿上传聊天正文、登录资料或密钥。

可以使用[皮肤问题反馈表](https://github.com/lucifergzsz414/xiaomu-codex-skin/issues/new?template=skin-problem.yml)填写。不知道的环境信息写“不确定”即可。试用步骤见 [3517 试用说明](docs/BETA-TRYOUT.md)。旧版资料见 [7803 试用记录](https://github.com/lucifergzsz414/xiaomu-codex-skin/blob/8d9624d49986eb89f66c0b7bc799317007b8f20f/docs/BETA-TRYOUT.md)和 [Beta.2 试用记录](https://github.com/lucifergzsz414/xiaomu-codex-skin/blob/6f98a3d796949e39c71980e09d0a5582dedb29c3/docs/BETA-TRYOUT.md)。

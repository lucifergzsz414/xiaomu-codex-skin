# 小睦 Codex Skin

为 Windows 版 Codex 制作的非官方小睦主题：浅绿与奶白配色、Q 版若叶睦、侧栏与首页装饰、八秒静音首页循环，以及五秒静音雨景开场。保留 Codex 原生菜单、输入与交互，终端、代码、差异和状态颜色保留原有语义。

这是粉丝制作的外观项目，与 OpenAI、BanG Dream! 及相关权利方无隶属或背书关系。

**当前预发布：`1.0.0-beta.2` · 候选编号：`20261031-3384-rc2`**

[下载安装包](https://github.com/lucifergzsz414/xiaomu-codex-skin/releases/tag/v1.0.0-beta.2) · [详细使用说明](integration-v1/release-v1/USAGE.md) · [第三方与素材说明](THIRD-PARTY-NOTICES.md)

**本版修正（2026-10-31）：** 已修正非中文 Windows 创建中文快捷方式失败的问题。本次最终 ZIP 在独立 Windows Server 测试机上通过 26 项检查；[beta.1 原包](https://github.com/lucifergzsz414/xiaomu-codex-skin/releases/tag/v1.0.0-beta.1)及其校验值继续保留。Windows 11 普通用户、Store Codex 实际启动与重启验收仍待完成，详见 [验收记录与正式版门槛](qa/RELEASE-READINESS.md)。

## 使用前准备

| 项目 | 当前要求 |
| --- | --- |
| 系统与客户端 | Windows；当前用户已安装 Microsoft Store Codex **26.1027.3384.0** |
| Node.js | **22 或更高版本**，安装在默认目录 `C:\Program Files\nodejs` |
| Codex 外观 | 在 Codex 原生设置中选择**浅色主题** |

以上是本候选的实测范围。其他 Codex 版本需要重新检测与验收；未来更新可能使部分装饰停用，或退回官方界面。运行皮肤无需启动本地预览服务器。

## 安装与恢复

1. 从 [Releases](https://github.com/lucifergzsz414/xiaomu-codex-skin/releases/tag/v1.0.0-beta.2) 下载 `xiaomu-codex-skin-1.0.0-beta.2-20261031-3384-rc2.zip`，完整解压并保留原包。
2. 阅读解压目录的 `START-HERE.md`，双击 `skin\manage.vbs`，选择“安装 / 修复”。
3. 保存工作并正常退出全部 Codex 窗口，再从桌面“小睦 Codex”或管理窗口的“启动 / 继续”进入。
4. 暂时停用可选“暂停皮肤”；撤回外观与受管快捷方式可选“恢复官方外观”。

恢复会保留专用小睦入口和备份，Codex 保持打开；本版没有一键完整卸载入口。皮肤不修改官方应用包、模型、登录、权限或原生主题设置。

包内两个辅助 EXE 尚未数字签名。若 Windows、安全软件或组织策略阻止运行，请保留提示并停止，不关闭防护。

压缩包 SHA256：

```text
fc70bf3b564e89cea6644f66d4565ca0d98659e2c9a75f09844de5489cc3e1cb
```

## 已安装旧候选时升级

对外版本为 `1.0.0-beta.2`，管理窗口、运行清单和安装目录版本仍为 **`1.0.0`**。请同时核对候选编号。本版没有自动升级：包括从 beta.1 升级时，完整旧安装重复点击“安装 / 修复”只补齐入口。

1. 保留旧包，在管理窗口点“暂停皮肤”，等皮肤停止，再关闭所有小睦管理窗口。
2. 完整解压新包，在新包的 `skin` 文件夹中打开 Windows PowerShell，运行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -SourceRoot . -Repair
```

3. 等待校验与替换完成。旧安装会保存为 `backup-repair-*`，请保留备份。
4. 重新打开“小睦皮肤管理”，点“重新检测”，通过后主动点“启动 / 继续”。升级后保持暂停，不自动启用。

修复和回退也应使用另一份可信的完整解压包，勿以已安装目录自身作为来源。详细步骤见 [USAGE.md](integration-v1/release-v1/USAGE.md)。

## 当前验证范围

本次最终 Beta.2 ZIP 在全新的英文 Windows Server 2022 管理员测试机上 **26/26 项通过**：实际安装、中文入口回读、缺依赖启动拦截、暂停、恢复、重复操作和损坏修复。32 个包内文件完成逐项校验。[完整运行](https://github.com/lucifergzsz414/xiaomu-codex-skin/actions/runs/41209958097) · [原样结果 JSON](qa/results/beta2-archive-20261031.json)。

皮肤 `skin.js` 与此前本机 Store `26.1027.3384.0` 验证的版本完全相同，原有冷启动、片头自然结束与右键菜单记录仍保留。Windows 11 普通用户的真实 Codex 启动、画面、系统重启和下载安全提示尚未完成验收；本轮也没有重新实测片头“跳过”或 Esc。独立桌面环境按包内 `CLEAN-TEST-GUIDE.md` 继续记录，26 项结果不代表这些项目已通过。

本仓库与 GitHub Release 以**公开预发布**提供 Beta.2。包内 `RELEASE-CANDIDATE.json` 保留封包时“准备公开发布”的记录；封包后的最终 ZIP 验收见上面的运行链接和 Release 页面。旧 Beta.1 中的“受邀测试”“尚未公开发布”等字段是旧包的历史记录，旧包未覆盖。测试和素材记录中的待完成项继续有效。

## 从源码构建

仓库保留原有相对目录，供构建脚本读取固定素材：

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

维护者如需生成完整 ZIP，应使用包含历史提交的 Git 克隆并先提交所有源文件，再运行 `powershell.exe -NoProfile -File .\integration-v1\release-v1\prepare-release-candidate.ps1`。封包脚本读取既有验收记录，验证源码关联，并拒绝覆盖同名已封包文件。

## 来源与反馈

两个上游辅助脚本沿用 Codex Dream Skin Studio 的 MIT 许可，原文随仓库和安装包保留。此许可不自动覆盖本项目新增代码或视觉素材；本项目未为全部新增代码另行声明统一许可证。

角色图、背景、视频与图标的部分来源、署名及再分发记录仍待补齐，详见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) 和 [ASSET-SOURCES.md](integration-v1/release-v1/ASSET-SOURCES.md)。

反馈请提供候选编号、Windows / Store Codex / Node.js 版本、操作步骤和完整错误提示。截图先遮住私人内容；请勿上传聊天正文、登录资料或密钥。

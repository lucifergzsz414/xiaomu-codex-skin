# 正式版前的验收状态

更新：2026-10-31。当前公开测试版为 `1.0.0-beta.2 / 20261031-3384-rc2`，单独提供新的安装包与校验值。旧 `1.0.0-beta.1 / 20261031-3384-rc1` 保留原样，仍附中文快捷方式已知问题说明。

## 独立 Windows 实测

测试使用 GitHub 新分配的 Windows Server 2022 x64 托管虚拟机，系统构建 `20348`，管理员身份，Node.js `v22.23.4`。基线确认没有旧小睦安装、官方 Codex 注册或 ChatGPT 进程。它不是 Windows 11 普通用户的桌面环境。

公开 RC1 的 ZIP 和 24 个运行文件校验通过，但在创建中文桌面快捷方式时失败。两次独立运行均定位到 `install.ps1:88` 的 WScript 快捷方式保存操作：

- [首次失败：41188226459](https://github.com/lucifergzsz414/xiaomu-codex-skin/actions/runs/41188226459)
- [保留失败并补充诊断：41188548267](https://github.com/lucifergzsz414/xiaomu-codex-skin/actions/runs/41188548267)

修正候选使用 Unicode `IShellLinkW` / `IPersistFile` 读写快捷方式。其源码提交为 `adec39e598897a653d654a3a051f102e5dd92ed4`；同一测试流程在全新的英文 Windows Server 测试机上 **26/26 通过**：

- [通过的完整运行：41189074442](https://github.com/lucifergzsz414/xiaomu-codex-skin/actions/runs/41189074442)
- [原样保留的结果 JSON](results/windows-server-2022-20261031.json)

通过范围：默认用户目录的实际安装、24 文件校验、三个中文桌面入口及回读、重复安装、真实缺依赖启动拦截、暂停、恢复、重复恢复、损坏检测、由可信来源修复、完整旧目录备份，以及修复后的恢复。原有入口的逐字节恢复使用真实 COM 快捷方式的独立夹具验证；该夹具没有执行假目标。

测试包由该提交重新构建，仅用于本次验收。流程另行下载并固定校验公开 RC1，确认新构建的 `skin.js` 与 RC1 完全相同；该对比不能把公开 RC1 的安装问题算作已修复。测试过程没有操作开发电脑或重启其 Codex。

## Beta.2 最终封包验收

以下是单独封好的最终发行 ZIP，未在测试后重新打包：

- 源码提交：`6d60e727ec4bb85dd497c7c00bb7d3fa29f7da19`。
- [构建、封包与最终 ZIP 的完整验收](https://github.com/lucifergzsz414/xiaomu-codex-skin/actions/runs/41209958097)：同一份 ZIP 在新分配的英文 Windows Server 2022 管理员测试机上 **26/26 通过**。
- [原样保留的最终包结果 JSON](results/beta2-archive-20261031.json)。此结果与前面的源码候选记录分别保存，没有相加成更大的测试数量。
- ZIP SHA256：`fc70bf3b564e89cea6644f66d4565ca0d98659e2c9a75f09844de5489cc3e1cb`。

仍没有官方 Store Codex 注册，因此“启动”覆盖缺依赖时的真实拒绝路径，未取得官方 Codex 成功启动或皮肤渲染证据。全部 32 项封包内容及其校验清单另行检查，旧 Beta.1 的资源和校验值保留。

## 正式版仍缺的证据

| 门槛 | 状态与下一步 |
| --- | --- |
| Windows 11 x64 普通用户完整流程 | 未验收：安装官方 Store Codex、正常登录、选择浅色、安装皮肤、实际启动、暂停/恢复、再次启用、测试系统重启后自动加载。 |
| 当前版本的实际界面 | 待复核：首页、正文、设置、Dot、标题栏、图片关闭按钮、Enter 闪色，以及片头跳过和 Esc。既有本机冷启动与右键菜单证据继续保留。 |
| 下载与运行保护提示 | 未验收：浏览器下载后的标记、解压后首次执行和未签名辅助程序的实际系统提示。命令行下载及哈希通过不能替代这些结果。遇到阻止时停止，不关闭防护。 |
| 素材与发行记录 | Beta.2 已单独封包和校验，旧 RC1 保留；部分素材来源、署名、再分发依据仍待补齐。 |

本次没有 Store Codex 成功启动或皮肤渲染证据。报告明确保留 `officialCodexLaunched: false` 和 `independentDesktopWindowsVerified: false`。因此当前仍为 Beta 阶段。

本版没有自动升级、一键彻底卸载或数字签名；它们不是本轮新增功能要求。现有手动升级、恢复范围和未签名提示应继续如实说明。

# 小睦皮肤 · 独立 Windows 验收指南

本指南用于 6628 安装候选 `20261112-6628-rc1`。运行版本仍为 `1.0.0`，最终包冷启动及独立 Windows 11 普通用户完整流程尚待验收。

## 测试环境

使用另一位试用者的 Windows 11 x64 普通用户电脑即可。已有独立测试系统也可使用；无需专门搭建虚拟机。先记录 Windows 版本、是否普通用户，以及系统里是否已有 Codex、Node.js；无需提供账户名或登录资料。当前开发电脑上的新文件夹只算隔离目录检查，不能算独立用户首装。

包内 skin 文件夹是完整皮肤。manage.vbs 为管理入口。不要关闭系统防护，不必修改系统执行策略。企业策略、应用控制或安全软件若阻止运行，记录提示并停止，不绕过组织策略。

## 验收顺序

1. **安装前基线**：先不要安装皮肤。在此目录打开 Windows PowerShell，运行下方 Before 命令。必须没有旧的小睦安装目录或修复备份。脚本会报告依赖；缺少依赖不影响保存基线，也不能被当作启动成功。
2. **缺依赖场景**：如果原本没有 Node.js 或 Codex，先打开 skin\manage.vbs，确认能显示缺少项和处理提示，且不会启用皮肤。安装皮肤、暂停或恢复不应要求先补齐 Node.js。不要为了此项测试卸载已有软件。
3. **补齐依赖**：使用你信任的官方渠道安装 Node.js 22 或更高版本到默认位置 C:\Program Files\nodejs，并安装当前用户的官方 Store Codex；本包适配的 Store 版本为 `26.1106.6628.0`，其他版本需重新检测。手动完成登录，不向测试记录复制认证资料。打开 Codex 一次，在其原生设置中选择浅色，再正常退出。
4. **全新安装**：打开 skin\manage.vbs，点“安装 / 修复”。确认桌面“小睦 Codex”和开始菜单“小睦皮肤管理”出现、名称和目标正确、文件校验通过，再运行 Installed 检查。若条件允许，另在非中文系统或包含中文字符的用户目录中重复检查快捷方式。
5. **首次启动**：点“启动 / 继续”。等状态显示正在运行，再运行 Started 检查。人工检查片头、首页、聊天正文、设置、标题栏、搜索、右键主菜单与子菜单、终端、文件差异和 Dot 头像；记录文字是否清楚、布局是否正常、Enter 是否闪紫。审批仅在自然出现时检查，并注明仓库访问或命令执行类型。无需发送测试消息。
6. **恢复官方外观**：点“恢复官方外观”。确认 Codex 保持打开且皮肤撤下，原快捷方式恢复。专用小睦/管理入口保留是设计行为。运行 Restored 检查。
7. **再次启用与冷启动**：从小睦专用入口重新启用。确认后正常退出全部 Codex 窗口，再从受管入口启动；复查自动加载。仅在测试机安排重启后再检查一次，不中断开发机任务。
8. **下载保护与退出**：记录压缩包真实下载后、解压后运行时的 Windows 提示。两个辅助程序目前未数字签名。若出现阻止，不关闭系统防护；保留提示供排查。需要撤销时先恢复官方外观；本版没有一键彻底卸载按钮。

## 检查命令

在本目录的 Windows PowerShell 中逐次执行，对应上面的阶段。ExecutionPolicy 只作用于该次检查进程，不修改系统全局设置；有组织强制策略时仍应停止并记录。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\clean-environment-check.ps1 -Phase Before
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\clean-environment-check.ps1 -Phase Installed
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\clean-environment-check.ps1 -Phase Started
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\clean-environment-check.ps1 -Phase Restored
```

结果保存在 acceptance-results。脚本不会发送消息、记录聊天或认证内容；也不能自动证明系统干净或画面正确，所以报告中的 independentCleanWindowsVerified 始终为 false。人工截图请先遮住私人信息。

## 已有旧版的升级测试

升级场景与上述全新安装基线分开记录，不要在已有安装的电脑上将 Before 检查记为通过。保留旧完整包，先暂停皮肤、等待停止并关闭所有小睦管理窗口，再在新完整包的 `skin` 目录运行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -SourceRoot . -Repair
```

核对旧目录的 `backup-repair-*` 完整备份、入口恢复记录和暂停状态；重新检测后再主动启用。完整旧安装重复点“安装 / 修复”只补入口，不代表已经升级。升级和恢复不会强制关闭 Codex。

测试时保持压缩包与解压目录作为恢复来源。若安装损坏，关闭管理窗口，从这份完整包的 manage.vbs 打开，再选择安装/修复或恢复；不要以损坏安装自己作为修复源。文件哈希用于发现损坏，不代表发行者数字签名。

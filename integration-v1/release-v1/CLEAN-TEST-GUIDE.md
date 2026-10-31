# 小睦皮肤：独立 Windows 验收包

这是受邀测试候选包，不是已经完成干净系统验收的正式版。

## 测试环境

使用另一台 Windows 电脑，或全新 Windows 虚拟机的普通用户。不要使用当前开发电脑上的新文件夹代替干净系统。先记录 Windows 版本、是否普通用户，以及系统里是否已有 Codex、Node.js；无需提供账户名或登录资料。

包内 skin 文件夹是完整皮肤。manage.vbs 为管理入口。不要关闭系统防护，不必修改系统执行策略。企业策略、应用控制或安全软件若阻止运行，记录提示并停止，不绕过组织策略。

## 验收顺序

1. **安装前基线**：先不要安装皮肤。在此目录打开 Windows PowerShell，运行下方 Before 命令。必须没有旧的小睦安装目录或修复备份。脚本会报告依赖；缺少依赖不影响保存基线，也不能被当作启动成功。
2. **缺依赖场景**：如果原本没有 Node.js 或 Codex，先打开 skin\manage.vbs，确认能显示缺少项和处理提示，且不会启用皮肤。安装皮肤、暂停或恢复不应要求先补齐 Node.js。不要为了此项测试卸载已有软件。
3. **补齐依赖**：使用你信任的官方渠道安装 Node.js 22 或更高版本到默认位置 C:\Program Files\nodejs，并安装当前用户的官方 Store Codex。手动完成登录，不向测试记录复制认证资料。打开 Codex 一次，在其原生设置中选择浅色，再正常退出。
4. **全新安装**：打开 skin\manage.vbs，点“安装 / 修复”。确认三个专用桌面入口出现、文件校验通过，再运行 Installed 检查。
5. **首次启动**：点“启动 / 继续”。等状态显示正在运行，再运行 Started 检查。人工检查首页、聊天正文、设置、标题栏、右键菜单、Dot 头像；记录文字是否清楚、布局是否正常、Enter 是否闪紫。无需发送测试消息。
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

测试时保持压缩包与解压目录作为恢复来源。若安装损坏，关闭管理窗口，从这份完整包的 manage.vbs 打开，再选择安装/修复或恢复；不要以损坏安装自己作为修复源。文件哈希用于发现损坏，不代表发行者数字签名。

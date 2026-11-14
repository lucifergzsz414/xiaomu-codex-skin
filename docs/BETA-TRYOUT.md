# 小睦 Codex 使用与反馈

当前正式版为 **1.0.0**。[下载安装包](https://github.com/lucifergzsz414/xiaomu-codex-skin/releases/download/v1.0.0/xiaomu-codex-skin-20261114-2228-v1.0.0.zip) · [发布说明](https://github.com/lucifergzsz414/xiaomu-codex-skin/releases/tag/v1.0.0)

## 开始使用

准备 Microsoft Store Codex **26.1111.2228.0**、默认安装目录 `C:\Program Files\nodejs` 下的 **Node.js 22+**，并把 Codex 原生外观设为**浅色**。

完整解压安装包，双击 `skin\manage.vbs`，选择“安装 / 修复”。保存工作并正常退出 Codex，再从桌面「小睦 Codex」打开。管理入口在开始菜单的「小睦皮肤管理」。

## 从旧版升级

先在管理窗口暂停皮肤，等待停止并关闭管理窗口。在新包的 `skin` 文件夹中打开 Windows PowerShell，执行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -SourceRoot . -Repair
```

旧安装保存在 `backup-repair-*`。升级完成后，重新打开管理窗口，检测通过后选择“启动 / 继续”。

## 平时使用

| 功能 | 使用方式 |
| --- | --- |
| 开屏片头 | 每次正常启动播放一次，可点击“跳过”或按 Esc 结束；点击、输入不再提前取消 |
| 文件与文本搜索 | 在搜索框底部切换类别，再用目录菜单选择项目；同一聊天重开搜索会记住选择 |
| 右键菜单 | 沿用原菜单选项、子菜单与快捷键 |
| 暂停皮肤 | 在管理窗口选择“暂停皮肤” |
| 恢复官方外观 | 在管理窗口选择“恢复官方外观”，Codex 保持打开 |

包内 `START-HERE.md`、`skin\USAGE.md` 提供完整安装与恢复步骤；独立电脑的四阶段验收方法见 `CLEAN-TEST-GUIDE.md`。本版验证范围统一记录在[验收记录](../qa/RELEASE-READINESS-1.0.0.md)。

## 告诉我们哪里有问题

通过[反馈表](https://github.com/lucifergzsz414/xiaomu-codex-skin/issues/new?template=skin-problem.yml)提供：

- 皮肤、Microsoft Store Codex、Windows 和 Node.js 版本。
- 操作步骤、实际结果和期望结果。
- 有帮助的截图或完整错误提示。

不知道的版本可以写“不确定”。截图先遮住私人内容。需要恢复时，从管理窗口选择“恢复官方外观”，并保留原包和备份以便修复。

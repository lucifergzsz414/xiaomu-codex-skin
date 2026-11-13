# 小睦 Codex · 1.0.0 最终安装候选

浅绿界面、五秒雨景片头、小睦首页与动态背景。适配 Microsoft Store Codex **26.1106.6628.0**，候选编号 **20261113-6628-rc2**。

## 开始使用

1. 安装官方 Store Codex，以及默认目录 `C:\Program Files\nodejs` 下的 Node.js 22 或更高版本。在 Codex 外观设置中选择浅色。
2. 完整解压本包，双击 `skin\manage.vbs`，选择“安装 / 修复”。桌面提供“小睦 Codex”，开始菜单提供“小睦皮肤管理”。
3. 首次启用时，保存工作、正常退出 Codex，再从“小睦 Codex”进入。
4. 暂时不用时选择“暂停皮肤”；撤回外观和受管入口时选择“恢复官方外观”。

## 更新旧版

先暂停皮肤，等停止后关闭小睦管理窗口。在新包的 `skin` 文件夹打开 Windows PowerShell，执行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -SourceRoot . -Repair
```

旧安装完整保留在 `backup-repair-*`。更新后保持暂停；重新检测后主动启用。更新和恢复不会关闭 Codex。

## 当前验收

本机已在保持 Codex 运行的情况下热更新。组件检测六项通过，皮肤活动状态正常；运行时 227 项自动化回归通过，项目内搜索和目录重开记忆已实测，同版原生菜单记录保留。封包工具检查计入构建记录。

最终安装包冷启动和独立 Windows 11 普通用户首装待验收。其他页面及审批记录、素材来源见随包说明。包内 [构建记录](RELEASE-CANDIDATE.json) 区分已完成检查和待验收项；最终 ZIP 的安装、修复与恢复结果另行记录。

[完整使用说明](skin/USAGE.md) · [本版改动](skin/RELEASE-NOTES-6628-rc2.md) · [独立环境指南](CLEAN-TEST-GUIDE.md) · [素材来源](skin/ASSET-SOURCES.md)

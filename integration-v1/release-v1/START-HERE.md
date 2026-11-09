# 小睦 Codex · 4239 测试版

浅绿界面、五秒雨景片头、小睦首页与动态背景。适配 Microsoft Store Codex **26.1103.4239.0**。

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

## 本轮记录

当前安装中的片头、搜索、右键主菜单与子菜单已实机检查。终端和审批卡片的配色已检查；文件差异及审批执行链路另行记录。

新整包冷启动、独立 Windows 11 普通用户环境仍待验收。包内 [构建记录](RELEASE-CANDIDATE.json) 区分源码检查与整包检查。

[完整使用说明](skin/USAGE.md) · [本版改动](skin/RELEASE-NOTES-4239-rc1.md) · [独立环境指南](CLEAN-TEST-GUIDE.md) · [素材来源](skin/ASSET-SOURCES.md)

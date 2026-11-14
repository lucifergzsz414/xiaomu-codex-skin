# 小睦 Codex · 1.0.0

浅绿界面、小睦首页、动态背景与五秒雨景片头。适配 Microsoft Store Codex **26.1111.2228.0**，构建编号 **20261114-2228-v1.0.0**。

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

## 本版更新

开屏改为每次正常启动直接播放一次，点击或输入不再提前取消；保留“跳过”和 Esc。搜索与菜单已适配新版，文件与文本搜索会记住所选项目目录。

当前本机六项兼容能力已启用，自动化与热更新记录见 [构建记录](RELEASE-CANDIDATE.json)。最终整包冷启动、实际片头播放和独立 Windows 11 普通用户首装待验收。

[完整使用说明](skin/USAGE.md) · [本版改动](skin/RELEASE-NOTES-1.0.0.md) · [独立环境指南](CLEAN-TEST-GUIDE.md) · [素材来源](skin/ASSET-SOURCES.md)

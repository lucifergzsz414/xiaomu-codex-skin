# 小睦 Codex · 快速开始

这是精简快捷方式和细分启动诊断的本地候选，适配 Microsoft Store Codex `26.1029.7803.0`。运行版本仍为 `1.0.0`，候选编号见包内记录。

## 先准备

- 当前用户已安装上述官方 Microsoft Store Codex。
- Node.js 22 或更高版本位于默认目录 `C:\Program Files\nodejs`。
- 在 Codex 自身的外观设置中选择浅色。

## 安装和使用

1. 将整个压缩包解压，保留这份完整包作为修复来源。
2. 双击 `skin\manage.vbs`，选择“安装 / 修复”。安装后桌面有“小睦 Codex”，开始菜单有“小睦皮肤管理”。
3. 首次启用前保存工作并正常退出全部 Codex 窗口，再从桌面“小睦 Codex”或管理窗口的“启动 / 继续”进入。启动器不会强制关闭 Codex。
4. 暂时不用时可“暂停皮肤”；要撤回外观和受管快捷方式时选“恢复官方外观”。

## 已有旧版

完整旧安装不会自动升级。先在管理窗口点“暂停皮肤”，等停止后关闭所有小睦管理窗口。在新包的 `skin` 文件夹中打开 Windows PowerShell，执行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -SourceRoot . -Repair
```

更新会保留整个旧目录为 `backup-repair-*`，并保留入口恢复记录；更新后保持暂停，需要主动启用。更新、暂停和恢复操作不会关闭 Codex。详见 [使用说明](skin/USAGE.md)。恢复官方外观保留专用入口与备份，不等于彻底卸载。

## 本轮测试

当前候选的构建、校验与验收范围见[包内记录](RELEASE-CANDIDATE.json)。

Windows 11 x64 普通用户的实际启动、系统重启后加载，以及浏览器下载和首次执行时的安全提示仍待验收。另一台电脑或全新 Windows 虚拟机请按 [独立环境测试指南](CLEAN-TEST-GUIDE.md) 操作。两个辅助 EXE 尚未数字签名；出现系统或组织策略阻止时记录提示，不关闭防护或绕过限制。

[素材来源与待补记录](skin/ASSET-SOURCES.md)

素材的部分来源、署名和分发依据仍待归档。请提供问题发生时的版本、操作步骤和已遮住私人内容的截图；无需提供聊天正文、登录资料或密钥。

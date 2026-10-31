# 小睦 Codex · 1.0.0-beta.2

这是公开预发布的 Windows 测试版，编号 `20261031-3384-rc2`，修正非中文系统创建中文快捷方式失败的问题。旧 beta.1 安装包单独保留。当前客户端适配范围为 Microsoft Store Codex `26.1027.3384.0`；运行目录版本仍为 `1.0.0`。

## 先准备

- 当前用户已安装上述官方 Microsoft Store Codex。
- Node.js 22 或更高版本位于默认目录 `C:\Program Files\nodejs`。
- 在 Codex 自身的外观设置中选择浅色。

## 安装和使用

1. 将整个压缩包解压，保留这份完整包作为修复来源。
2. 双击 `skin\manage.vbs`，选择“安装 / 修复”。
3. 首次启用前保存工作并正常退出全部 Codex 窗口，再从桌面“小睦 Codex”或管理窗口的“启动 / 继续”进入。启动器不会强制关闭 Codex。
4. 暂时不用时可“暂停皮肤”；要撤回外观和受管快捷方式时选“恢复官方外观”。

## 已有 beta.1 或其他旧版

完整旧安装不会自动升级。先在管理窗口点“暂停皮肤”，等停止后关闭所有小睦管理窗口。在新包的 `skin` 文件夹中打开 Windows PowerShell，执行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -SourceRoot . -Repair
```

更新会保留整个旧目录为 `backup-repair-*`，并保留入口恢复记录；更新后保持暂停，需要主动启用。更新、暂停和恢复操作不会关闭 Codex。详见 [使用说明](skin/USAGE.md)。恢复官方外观保留专用入口与备份，不等于彻底卸载。

## 本轮测试

本修正的源码候选已在独立英文 Windows Server 2022 测试机上通过 26 项安装、依赖拦截、暂停、恢复和损坏修复检查。测试身份是管理员，未安装 Store Codex；这不包含真实 Codex 启动、画面或 Windows 11 普通用户验收。当前压缩包的构建与校验信息见 [包内记录](RELEASE-CANDIDATE.json)，封包后的验收结果以该记录和 GitHub Release 页面为准。

Windows 11 x64 普通用户的实际启动、系统重启后加载，以及浏览器下载和首次执行时的安全提示仍待验收。另一台电脑或全新 Windows 虚拟机请按 [独立环境测试指南](CLEAN-TEST-GUIDE.md) 操作。两个辅助 EXE 尚未数字签名；出现系统或组织策略阻止时记录提示，不关闭防护或绕过限制。

[发布说明](skin/RELEASE-NOTES-1.0.0-beta.2.md) · [素材来源与待补记录](skin/ASSET-SOURCES.md)

素材的部分来源、署名和分发依据仍待归档。请提供问题发生时的版本、操作步骤和已遮住私人内容的截图；无需提供聊天正文、登录资料或密钥。

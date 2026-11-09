# 小睦皮肤 4239 RC2 试用说明

当前试用版为 **4239 RC2**，候选编号 **20261109-4239-rc2**，适配 Microsoft Store Codex **26.1103.4239.0**。

片头、聊天搜索、右键主菜单和子菜单、终端与文件差异面板已实机检查。仓库访问审批经用户允许后，工作树创建成功。最终 ZIP 的隔离安装、升级、损坏修复和入口恢复检查已通过。

**待验收：命令执行审批、整包冷启动、独立 Windows 11 普通用户环境。**

## 开始之前

- 使用 Microsoft Store 版 Codex **26.1103.4239.0** 和安装在默认目录 `C:\Program Files\nodejs` 的 **Node.js 22 或更高版本**，在 Codex 原生设置中选择**浅色主题**。
- 下载 [4239 RC2 安装包](https://github.com/lucifergzsz414/xiaomu-codex-skin/releases/download/v1.0.0-4239-rc2/xiaomu-codex-skin-20261109-4239-rc2.zip)，SHA-256 见[发布说明](https://github.com/lucifergzsz414/xiaomu-codex-skin/releases/tag/v1.0.0-4239-rc2)。完整解压，保留原包与解压目录。包内 `START-HERE.md` 和 `skin\USAGE.md` 有安装、修复和恢复说明。
- [首次安装](../README.md#安装与恢复)会创建桌面的「小睦 Codex」和开始菜单的「小睦皮肤管理」两个入口。
- [旧版升级](../README.md#已安装旧候选时升级)保留自定义或来源无法核验的旧快捷方式。先暂停皮肤并关闭管理窗口，再在新包的 `skin` 文件夹中用 Windows PowerShell 执行以下命令。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -SourceRoot . -Repair
```

## 平时使用时留意这些地方

| 场景 | 可以留意什么 |
| --- | --- |
| 首页与聊天 | 浅绿是否加载，正文是否清楚，窄窗口下有没有遮挡 |
| 五秒片头与背景 | 正常冷启动是否播放一次，跳过和 Esc 能否结束，首页背景能否暂停 |
| 设置页 | 在常规和外观之间切换时，选中项、文字和控件是否清楚 |
| 搜索弹窗 | 输入已知聊天标题的片段能否找到结果，无匹配时是否结束加载，Esc 能否关闭 |
| 聊天右键菜单 | 菜单和「复制」等子菜单能否展开，窗口边缘有无裁切，Esc 能否逐级关闭 |
| 终端 | 提示符和输出是否清楚，面板缩窄后能否正常使用 |
| 文件差异 | 增删行数字是否清楚，分栏和统一视图能否切换，窄面板和长行是否可读 |
| 审批卡片 | 仓库访问与命令执行分别注明，检查内容、按钮和确认后的结果 |
| 暂停与恢复 | 管理窗口提示是否清楚，皮肤是否撤下，Codex 是否仍保持打开 |

下次原本就要打开 Codex 时，可以顺手留意皮肤出现的时间和五秒片头是否自动播放。先让当前任务完成，再按平时的方式操作。跳过的场景直接写“未测试”即可。

## 遇到问题

通过[问题反馈表](https://github.com/lucifergzsz414/xiaomu-codex-skin/issues/new?template=skin-problem.yml)写明操作步骤、实际结果和期望结果，填写皮肤候选编号、Microsoft Store Codex 包版本、Windows 和 Node.js 版本。若在独立 Windows 11 普通用户环境试用，也请注明。无法确认的项目填“不确定”。

截图和错误提示可选，提交前遮住私人内容。需要退回官方外观时，按当前解压包内 `skin\USAGE.md` 的恢复说明操作。

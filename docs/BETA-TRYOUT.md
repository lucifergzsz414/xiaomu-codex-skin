# 小睦皮肤 7803 试用说明

当前试用版为 **7803 兼容测试版**，候选编号 **20261105-7803-rc1**，适配 Microsoft Store Codex **26.1029.7803.0**。欢迎按平时的方式试用，也欢迎反馈旧版或其他客户端版本的问题。

维护者已在现用 Codex 中确认启动体验、设置页、搜索弹窗和聊天右键菜单正常。发布的同一份 ZIP 通过了 9 项本机隔离检查，覆盖安装、损坏检测、修复和快捷方式恢复。**尚未在独立 Windows 11 普通用户环境验收完整安装、登录和启动流程。** [7803 发布记录](https://github.com/lucifergzsz414/xiaomu-codex-skin/releases/tag/v1.0.0-7803-rc1)

## 开始之前

- 使用 Microsoft Store 版 Codex **26.1029.7803.0** 和安装在默认目录 `C:\Program Files\nodejs` 的 **Node.js 22 或更高版本**，在 Codex 原生设置中选择**浅色主题**。
- 从 [7803 发布页](https://github.com/lucifergzsz414/xiaomu-codex-skin/releases/tag/v1.0.0-7803-rc1) 下载安装 ZIP 和 SHA-256 校验文件。完整解压，保留原包与解压目录。包内 `START-HERE.md` 和 `skin\USAGE.md` 有本版的安装、修复和恢复说明。
- [首次安装](../README.md#安装与恢复)与[旧版手动升级](../README.md#已安装旧候选时升级)使用不同步骤。完整旧安装重复点击“安装 / 修复”只会补齐入口。

## 平时使用时留意这些地方

| 场景 | 可以留意什么 |
| --- | --- |
| 首页与聊天 | 浅绿是否加载，正文是否清楚，窄窗口下有没有遮挡 |
| 设置页 | 在常规和外观之间切换时，选中项、文字和控件是否清楚 |
| 搜索弹窗 | 输入已知聊天标题的片段能否找到结果，无匹配时是否结束加载，Esc 能否关闭 |
| 聊天右键菜单 | 菜单和「复制」等子菜单能否展开，窗口边缘有无裁切，Esc 能否逐级关闭 |
| 暂停与恢复 | 管理窗口提示是否清楚，皮肤是否撤下，Codex 是否仍保持打开 |

下次原本就要打开 Codex 时，可以顺手留意皮肤出现的时间和五秒片头是否自动播放。先让当前任务完成，再按平时的方式操作。跳过的场景直接写“未测试”即可。

## 遇到问题

通过[问题反馈表](https://github.com/lucifergzsz414/xiaomu-codex-skin/issues/new?template=skin-problem.yml)写明操作步骤、实际结果和期望结果。请填写实际的皮肤候选编号、Microsoft Store Codex 包版本、Windows 和 Node.js 版本。若在独立 Windows 11 普通用户环境试用，也可以顺手注明。无法确认的项目填“不确定”。

截图和错误提示可选。提交前请遮住私人内容，尤其是聊天正文、登录资料、密钥、令牌和本机私人路径。遇到系统或安全软件阻止运行时，请保留提示并停止。需要退回官方外观时，按 7803 解压包内 `skin\USAGE.md` 的恢复说明操作。

## 旧版记录

[Beta.2 下载](https://github.com/lucifergzsz414/xiaomu-codex-skin/releases/tag/v1.0.0-beta.2) · [Beta.1 下载](https://github.com/lucifergzsz414/xiaomu-codex-skin/releases/tag/v1.0.0-beta.1) · [Beta.2 试用说明](https://github.com/lucifergzsz414/xiaomu-codex-skin/blob/6f98a3d796949e39c71980e09d0a5582dedb29c3/docs/BETA-TRYOUT.md) · [旧反馈模板](https://github.com/lucifergzsz414/xiaomu-codex-skin/blob/6f98a3d796949e39c71980e09d0a5582dedb29c3/.github/ISSUE_TEMPLATE/skin-problem.yml) · [旧版验收记录](../qa/RELEASE-READINESS.md)

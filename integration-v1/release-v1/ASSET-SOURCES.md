# 素材来源记录

2026-10-31｜小睦 × Codex `1.0.0-beta.2 / 20261031-3384-rc2` 公开测试版。记录当前素材来源与归档状态；本次快捷方式兼容修正未改变视觉素材。

| 素材组 | 来源与处理 | 尚缺记录 |
| --- | --- | --- |
| 四张 Q 版人物图 | `q-idle.png` 等四张沿用既有 xiaomu-desktop 项目的“平静、学习、工作中、思考组件”；来源表留有原路径及哈希。 | 原作者、最初发布链接、再分发授权。 |
| 窗边背景与循环 | `hair-rig-v31` 首帧及 `window-loop.mp4`；以 `quiet-loop-v1\source.png`、既有环境视频和发层等材料作本地分层变形、合成。 | 初始底图、环境视频的完整出处、作者及授权／条款。 |
| 五秒开场 PV | VIDU Q4 Preview，以三张参考图生成一次，250 积分，1080p、无声；本地添加字标、淡出并裁至五秒，后期无额外生成。 | 三张参考图完整来源、角色／乐器素材使用依据及生成服务适用条款。 |
| 功能 SVG 图标 | 页面内 11 个 symbol，加构建脚本内 3 个入口图标；定义均在本项目源码中。 | 单独作者署名或外部图标库归属记录。 |
| 管理器图标 | 沿用本地 `xiaomu.ico`。 | 原始图像出处、制作记录及授权。 |

角色与乐器参考归档包含 [BanG Dream! 若叶睦角色页](https://anime.bang-dream.com/avemujica/character/mutsumi/) 与 [SCHECTER MORTIS 七弦琴资料](https://schecter.co.jp/collaboration/4432/?products=ac-ex-7-avemujica%2Fmortis%2Fsig)。当前 PV 的本地身份锚点为 `quiet-loop-v1\source.png`；早期官图参考稿与当前 PV 为不同制作记录。网页、条款本次未在线复核。

## 代码署名

沿用代码来自本地 `research\internet-angel` 检出目录，其 README 标识为 [Codex-Dream-Skin-Needy-Girl-Overdose](https://github.com/EmiyaKatuz/Codex-Dream-Skin-Needy-Girl-Overdose)，源于 [Fei-Away/Codex-Dream-Skin](https://github.com/Fei-Away/Codex-Dream-Skin)。随包保留 MIT 全文 `LICENSE-upstream.txt`：

Copyright (c) 2026 Codex Dream Skin Studio contributors

该声明对应沿用软件代码；上述视觉素材的授权记录仍以表中状态为准。

## 本地证据索引

以下路径相对项目根目录：

- 引用清单：`integration-v1\native-v1\build-native.cjs`、`integration-v1\release-v1\build-release.cjs`。
- Q 图：`preview-v6\asset-provenance.json`；SVG：`preview-v6\index.html` 与上述 native 构建脚本。
- 背景：`preview-v6\assets\hair-rig-v31\full-background\pilot-003\full-background-check.json`。
- PV：`preview-v6\pv-v1\opening-rain-motion-v1\generation-result-20261030.json`；`preview-v6\pv-v1\opening-rain-final-v1\provenance.json`、同目录 `acceptance.json`。
- 上游：`research\internet-angel\README.md`、`LICENSE`。

PV 保存验收文件确认原始片，字标／淡出字段仍为 `pending-user-review`。2026-10-31 的既有实际冷启动记录为自然播放结束；本轮未新增修正版启动或跳过测试。公开预发布不会补齐表中来源、署名与授权／条款记录，这些缺项仍然保留，也不表示全部视觉素材已获得再分发授权。上游 MIT 许可不自动覆盖本项目新增代码或视觉素材。

# 素材来源记录

2026-10-31｜小睦 × Codex `1.0.0-beta.2 / 20261031-3384-rc2` 公开测试版。记录当前素材来源与归档状态；本次快捷方式兼容修正未改变视觉素材。

2026-11-02 补充：新增[脱敏素材清单](asset-ledger.json)，逐项记录公开仓库路径、SHA256、实际用途和已证实的制作链。4张 Q 图、背景封面、8秒循环和5秒片头均已静态核对为最终公开 Beta.2 `skin.js` 中实际内嵌的原始字节；管理器人物图等于 `q-idle.png`。本次仅补记录，没有更换素材或修改已发布 ZIP。

| 素材组 | 来源与处理 | 尚缺记录 |
| --- | --- | --- |
| 四张 Q 版人物图 | `q-idle.png` 等四张与既有 xiaomu-desktop 的“平静、学习、工作中、思考组件”原文件逐字节相同；具体映射见脱敏清单。没有证据可将它们标为某次指定模型的生成产物。 | 原作者、最初发布链接、生成批次及再分发授权。 |
| 窗边背景与循环 | `hair-rig-v31` 首帧及 `window-loop.mp4`；以 `quiet-loop-v1\source.png`、既有环境视频和发层等材料作本地分层变形、合成。 | 初始底图、环境视频的完整出处、作者及授权／条款。 |
| 五秒开场 PV | VIDU Q4 Preview，以三张参考图生成一次，250 积分，1080p、无声；本地添加字标、淡出并裁至五秒，后期无额外生成。 | 三张参考图完整来源、角色／乐器素材使用依据及生成服务适用条款。 |
| 功能 SVG 图标 | 页面内 11 个 symbol，加构建脚本内 3 个入口图标；定义均在本项目源码中，构建时不下载外部图标库。内联定义不等于已证实全部原创。 | 单独作者署名或初始图标库归属记录。 |
| 管理器图标 | 沿用本地 `xiaomu.ico`。 | 原始图像出处、制作记录及授权。 |

角色与乐器参考归档包含 [BanG Dream! 若叶睦角色页](https://anime.bang-dream.com/avemujica/character/mutsumi/) 与 [SCHECTER MORTIS 七弦琴资料](https://schecter.co.jp/collaboration/4432/?products=ac-ex-7-avemujica%2Fmortis%2Fsig)。当前 PV 的本地身份锚点为 `quiet-loop-v1\source.png`；早期官图参考稿与当前 PV 为不同制作记录。上述网页只说明角色和乐器身份，不是本项目素材分发授权。

2026-11-02 在线核对：SCHECTER 产品页可读取；若叶睦角色页有官方搜索索引，但本次直接抓取返回404，未据此认定页面永久失效。已查到的 [Vidu API 使用条款](https://platform.vidu.com/docs/terms-and-policies/terms-of-use)范围是 API 服务，不能直接作为本次经 Updream 生成素材的适用条款证明。[Updream 官网](https://www.updream.cn/)可访问，但本次未取得与当次生成对应的用户协议版本或素材权利证明；该项继续待补。

## 代码署名

沿用代码来自本地 `research\internet-angel` 检出目录，其 README 标识为 [Codex-Dream-Skin-Needy-Girl-Overdose](https://github.com/EmiyaKatuz/Codex-Dream-Skin-Needy-Girl-Overdose)，源于 [Fei-Away/Codex-Dream-Skin](https://github.com/Fei-Away/Codex-Dream-Skin)。随包保留 MIT 全文 `LICENSE-upstream.txt`：

Copyright (c) 2026 Codex Dream Skin Studio contributors

该声明对应沿用软件代码；上述视觉素材的授权记录仍以表中状态为准。

## 可公开复核的材料

- [脱敏素材清单](asset-ledger.json)：当前文件哈希、桌宠直接来源映射、合成链、PV 生成配置及未知项。不是对原始制作收据的完整公开或独立认证。
- [实际构建引用](../native-v1/build-native.cjs)和[发行文件映射](build-release.cjs)。
- [Q 图和 SVG 源码登记](../../preview-v6/index.html)。
- [随仓库保留的上游 MIT 许可](../../research/internet-angel/LICENSE)。

## 维护者保留的原始记录

原始桌宠映射表、背景合成检查、PV 报价与生成收据、后期工程及验收 JSON 保存在本地制作工程中，未包含在公开仓库。它们可能含私有路径或服务任务信息，不能作为公开仓库内可访问的文件链接；上述脱敏清单只摘录本次复核到的事实。

背景循环可追溯到原位眨眼状态、Blender 发层及环境片的本地合成，但尚缺把初始底图和最终采用的环境片连接到最初生成批次的完整记录。早期未采用的视频生成记录不能替代这条来源链。

PV 的3张参考图可追溯到同一人物造型目录，配置、原片与最终后期的哈希链已记录；这3张参考图自身的完整生成收据和独立来源记录仍缺失。不能用相邻的早期分镜记录替代。

PV 保存验收文件确认原始片，字标／淡出字段仍为 `pending-user-review`。2026-10-31 的既有实际冷启动记录为自然播放结束；本轮未新增修正版启动或跳过测试。公开预发布不会补齐表中来源、署名与授权／条款记录，这些缺项仍然保留，也不表示全部视觉素材已获得再分发授权。上游 MIT 许可不自动覆盖本项目新增代码或视觉素材。

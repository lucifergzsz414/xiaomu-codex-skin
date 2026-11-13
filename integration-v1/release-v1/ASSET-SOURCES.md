# 素材来源记录

2026-11-13 · 小睦 × Codex `6628-rc2 / 20261113-6628-rc2` 本地候选。

本次适配沿用现有视觉素材。四张 Q 版图、首页封面、8 秒背景循环和 5 秒片头，均与当前 `skin.js` 内嵌的原始字节一致；准备包的管理器头像与 `q-idle.png` 相同，图标与源文件相同。当前皮肤 SHA256：`cb15d319d13fed1780c85baa7b6549192417a1883702a06a9b89005d23cd6669`。

2026-11-12，维护者确认四张 Q 版图、窗边底图和雨景 PV 的三张参考图“全部由本对话生成”。这是维护者提供的生成来源记录；文件身份与本地加工链另经哈希核对。未归档的逐图平台收据作为记录缺项保留，不要求维护者重新搜证。角色、参考与服务条款沿用下文说明。

## 素材与制作链

| 素材 | 来源与处理 | 归档说明 |
| --- | --- | --- |
| 四张 Q 版小睦 | 本对话生成（维护者确认），从已有桌宠 `xiaomu-desktop` 逐字节复用：`q-idle.png` 对应“平静”，`q-reading.png` 对应“学习”，`q-work.png` 对应“工作中”，`q-think.png` 对应“思考组件”。 | 原文件映射和现用字节已核对；桌宠再生成计划列有这四个目标文件，独立逐图收据未归档。 |
| 首页封面与循环 | 窗边底图由本对话生成（维护者确认）。成品来自 `hair-rig-v31` 的首帧 `frame-000.png` 和 `window-loop.mp4`。本地检查记录核对了底图 `quiet-loop-v1/source.png`、环境片段 `xiaomu-background-v4-window-curtain-review.mp4`、眨眼状态及头发分层合成；合成阶段没有付费生成。 | 底图逐图收据未归档；实际环境片段的原始来源与适用条款仍待补记。 |
| 五秒开屏 PV | 三张参考图由本对话生成（维护者确认）。本地报价、生成结果与原片哈希对应：Updream，VIDU Q4 Preview，5 秒、1080p、静音，提交 1 次、250 积分、无自动重试。后期添加字标和末尾淡出，裁为 5 秒；无变速、空间变形或追加生成。 | 三张实际参考图的文件身份已核对，独立逐图收据未归档；适用服务条款说明见下文。 |
| 功能 SVG | 页面中 11 个 symbol，构建脚本中 3 个入口图标；定义随源码保存，构建时不下载外部图标。 | 初始作者或外部图标库及相应许可记录。内联定义本身不能证明全部原创。 |
| 管理器图标 | 沿用 `xiaomu.ico`。桌宠的 `tray-icon.ico` 与它哈希不同，不能作为其来源证明。 | 原始图像、图标转换制作记录与分发依据。 |

## 文件身份

| 文件 | SHA256 |
| --- | --- |
| `q-idle.png` | `34a7ab3cc5d4f64d9c84a51080a738903f6b210ef3dfdb31faf0a29b88971522` |
| `q-reading.png` | `365c30c18e859aa90f2c241ab4682b7a595158713adc253cddcc3200b148b1ba` |
| `q-work.png` | `38f0e622e2cdec663deafb0d466b2593bcae8aec8110fe113292f4598bc6fc47` |
| `q-think.png` | `fdba28adb2e5da755c89fa49707e1433fb0637476e7346aa9e5d287d9902b59a` |
| 封面 `frame-000.png` | `dbf6e027333ad17af25deb011b9fd46d0d49a4bed5a9ea7278caf66b112b3056` |
| 循环 `window-loop.mp4` | `7cc30c32c845222ace86d542242b87c71efba2363883a12ff7356c1adcfe0d33` |
| 五秒片头 | `9c7f8ab53b007172cf578c57e98494b6ad9e8988e4c38de65e27359cbdecf020` |
| `xiaomu.ico` | `9d3ce2434ad5f6d79ab5bbed10f3f3f65f8faa7828811cf7016308dd81f862d1` |

PV 三张实际参考图已逐一核对：`shot-01-room-bg-identity.png`、`shot-02-pick-bg-identity.png`、`shot-03-gaze-bg-identity.png`。较早分镜另有内置图像工具制作记录，与这三张文件分别归档。

## 参考页面与使用依据

角色及乐器参考记录指向 [BanG Dream! 若叶睦角色页](https://anime.bang-dream.com/avemujica/character/mutsumi/) 和 [SCHECTER MORTIS 七弦琴产品页](https://schecter.co.jp/collaboration/4432/?products=ac-ex-7-avemujica%2Fmortis%2Fsig)。它们用于核对设计身份，不是本项目素材的分发许可。

现有 [Vidu API 使用条款](https://platform.vidu.com/docs/terms-and-policies/terms-of-use) 面向 API 服务，尚未核实是否适用于本次经 [Updream](https://www.updream.cn/) 完成的生成；需补当时适用的服务协议或其他明确分发依据。

## 上游软件

Windows 辅助脚本 `common-windows.ps1`、`config-utf8.ps1` 来自 [Codex-Dream-Skin-Needy-Girl-Overdose](https://github.com/EmiyaKatuz/Codex-Dream-Skin-Needy-Girl-Overdose)，其上游为 [Fei-Away/Codex-Dream-Skin](https://github.com/Fei-Away/Codex-Dream-Skin)。安装包保留上游 MIT 全文 `LICENSE-upstream.txt`：

Copyright (c) 2026 Codex Dream Skin Studio contributors

该许可适用于对应上游代码，不自动覆盖本项目新增代码与视觉素材。

完整结构化清单 `asset-ledger.json` 和根目录 `THIRD-PARTY-NOTICES.md` 保存在公开源码中，不随安装包附带。原始制作记录保留在维护者工程中；公开清单只摘录来源确认、哈希、配置与制作链，不附私有路径、账户信息或服务任务标识。生成来源确认未改变原作角色、参考素材及第三方服务的权利说明。

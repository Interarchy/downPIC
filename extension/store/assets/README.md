# Chrome Web Store 图像素材状态

## 0.6.0 V4：2026-10-01 已生成

五张当前截图位于 `v4/`，统一为 **1280×800、RGB 24 位 PNG、无透明通道、方角画布**。符合 Chrome 官方截图尺寸要求；后台分别上传 PNG，不直接上传截图 ZIP。

| 文件 | 展示内容 |
| --- | --- |
| 01-project-library-1280x800.png | 项目类型、项目文件夹、宽松缩略预览与文件夹导入入口 |
| 02-image-description-1280x800.png | 全部图片、单图详情、核心视觉描述与三个操作入口 |
| 03-prompt-library-1280x800.png | 图片对应提示词、用户分组与 Prompt 版本历史 |
| 04-prompt-builder-1280x800.png | 参考图维度选择与整体 Prompt 预览；两处真实侧栏截图加说明排版 |
| 05-prompt-optimization-1280x800.png | 效果图导入、基本提示词选择与开始评估；真实侧栏截图加说明排版 |

推荐上传顺序：01 → 02 → 04 → 05 → 03。

- 由当前真实未打包扩展加载到独立 Chromium profile 后截图，不修改扩展 UI，不读取开发者日常浏览器或私人图库。
- 使用仓库已有的建筑演示图板和手工示例描述、Prompt、版本；截图不是模型效果、召回率或性能的评测证据。没有调用模型，也不虚构评估结果。
- `v4/capture-evidence.json` 记录加载方式、页面异常与请求拦截证据；`v4/image-format-check.json` 记录最终格式核对。
- 上传用独立 ZIP：`extension/dist/v4-store-20260930/archbuddy-store-screenshots-0.6.0.zip`，仅包含五张 PNG。
- 生成脚本：`extension/scripts/capture-v4-store-screenshots.mjs`。需已安装 Playwright、Sharp 和支持加载扩展的 Chromium；通过 NODE_PATH 指向已有依赖，通过 ARCHBUDDY_SCREENSHOT_BROWSER 指定浏览器。本轮没有安装新依赖。
- 中间的窄侧栏截图与临时 profile 位于已忽略的 extension/dist，不进入插件 ZIP 或商店素材上传。

## 既有素材

- `small-promo-440x280.png`：现有品牌宣传图。
- `extension/icons/icon-128.png`：128×128 扩展图标。
- `screenshot-1-reverse-prompt-1280x800.png`、`screenshot-2-download-classify-1280x800.png`：历史原型截图，保留历史但不用于当前 0.6.0 提交。

官方格式依据：https://developer.chrome.com/docs/webstore/images

## 2026-10-01：完整商店图片包

- 小型宣传图：`v4/small-promo-440x280.png`，440×280。
- 顶部宣传图：`v4/marquee-promo-1400x560.png`，1400×560。
- 两图沿用当前绿色 Logo，顶部图包含既有真实 V4 项目图库截图；不新增或虚构界面和功能，不调用模型。
- 五张截图和两张宣传图均经 Sharp 核对尺寸、RGB 三通道、无透明通道；Logo 使用原 128×128 PNG，保留透明背景。
- 一并下载：`extension/dist/v4-store-20260930/archbuddy-chrome-store-media-0.6.0.zip`，包含 screenshots、promotions、icon 三个目录和中文上传说明，解压后逐项上传 PNG。这不是扩展代码上传包。
- 宣传图排版与导出脚本：`extension/scripts/generate-v4-store-promotions.mjs`，复用现有 Playwright、Sharp 和 Chromium。
- 原根目录小型宣传图为历史素材，本次上传使用 v4 目录的新图。
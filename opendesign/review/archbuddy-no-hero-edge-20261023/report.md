# 移除首屏与双商店入口：独立视觉核验

日期：2026-10-23。预览：http://127.0.0.1:8766/mockups/archbuddy-showcase/?v=no-hero-edge-20261023

结论：本地核验通过，未发现阻断问题。验收仅检查页面，不编辑网站源码、部署或安装扩展。

## 关键观察

- Chrome 无头独立上下文检查 1440×1000、390×844、1920×1080。页面从导航直接进入 01，DOM 中无首屏节点。当前版本开场即显示 A 痛点；B、C 保留滚动显现。首屏及 01 完整态截图均已目视。
- 宽屏滚轮滚动使 01 的 `step=0` 经中间过渡进入 02 的 `step=1`，继续滚动释放到 03；手机按自然纵向顺序阅读 01、02、03。进度按钮亦能切换 01/02。详见 `scroll-summary.json` 与 `check-summary.json`。
- 03 三创作环节和共同资产底座排版完整。资产底座背景为 `rgb(21, 59, 45)`，图标、标题为 `rgb(245, 247, 244)`；没有橙色资产图标。章节文案没有右侧“插件 × Canvas”或底下注释。
- 04 三项创作功能与下方资产底座排版完整；资产底座图标为 `rgb(245, 247, 244)`。手机单列重排，没有遮挡。
- 05 桌面两个商店按钮并列，手机竖排；三步安装说明同时适用于 Chrome 与 Edge。可见内容无测试集或教程入口。
- 两个按钮的实际 `href` 为 Chrome：`https://chromewebstore.google.com/detail/archbuddy/hkbnjlapflleibeodhghbephgpacbhle?authuser=0&hl=zh-CN`；Edge：`https://microsoftedge.microsoft.com/addons/detail/archbuddy/bdbnnnababglblekgnfpdcmeihjhflok?hl=zh-CN`。外部商店页面经网页访问工具均不可访问，因此只核对页面链接本身，未核实商品页标题。

## 技术核验

三个视口均返回 HTTP 200，`document.documentElement.scrollWidth` 等于视口宽度；页面 JS/console 错误、HTTP ≥400 响应、实际图片加载失败均为 0。空 `#dialog-image` 为尚未打开的弹图占位，不计为破图。章节截图和数据保存在本目录；`verify.cjs`、`scroll-check.cjs` 可复跑。

本轮仅本地静态页面核验，不涉及 CloudBase 资源、账号、用户数据、模型调用、部署或 Git 提交。

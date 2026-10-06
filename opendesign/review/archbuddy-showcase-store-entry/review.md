# ArchBuddy 第七版独立定向复核

结论：本地与公网均通过，无需修复。此次独立证据对应 `store-entry-20261005`，未沿用前六版的检查结果。

复核时间：2026-10-05 23:57 至 2026-10-06 00:01（Asia/Shanghai）。公网地址：https://archbuddy-dev-showcase-dev-mel-d9guu8bpu44029179.webapps.tcloudbase.com/ 。

## 本轮范围与结果

仅复核新 slogan、首屏及下载区两处商店入口、两处测试集链接、版本与页面异常。使用隔离 Chromium context，分别检查 1440、390、360 px；未修改站点源码、部署、登录、安装插件或执行压缩包。本轮没有重跑画廊、流程图、安装复制和归档下载。

| 项目 | 本地 | 公网 |
| --- | --- | --- |
| 检查数 | 19 项全部通过 | 23 项全部通过 |
| 页面错误 | 0 | 0 |
| 独立截图 | 6 张 | 6 张 |
| 样式及脚本缓存版本 | store-entry-20261005 | store-entry-20261005 |

目视三种宽度的实际首屏截图，新标题依次显示为「打通创作断点，」「让设计思路」「一路向前。」三行。桌面与手机均维持原有字号、色彩层级与布局，没有孤字、重叠或裁切。逐字 Range 的边界处于 h1 容器内，三个宽度的 document.scrollWidth 均等于视口宽度；并非依赖 overflow 隐藏来判断通过。公网下载区在桌面并列、手机纵向，按钮文字和图标清晰完整。

首页与下载区两处按钮都保留「下载 Chrome 插件」名称，href 精确为：

https://chromewebstore.google.com/detail/archbuddy/hkbnjlapflleibeodhghbephgpacbhle?authuser=0&hl=zh-CN

两个按钮均无 `download` 属性。两处「下载图片测试集」仍指向 `downloads/ArchBuddy-test-images.7z`，并保留 `download="ArchBuddy测试集.7z"`。本轮只检查该入口，未重复下载测试集。

## 实际公网与商店访问

三个新 context 均先出现 CloudBase 平台提醒，等待正常 3 秒倒计时后点击「确定访问」，再等待本站标题与主体显示。初始平台提醒的 HTTP 404 和相应控制台记录保存在 `platformVisits.initialErrors`；进入本站后的三个实际 Document 均为 HTTP 200、`Content-Type: text/html`、无 `Content-Disposition`，没有 HTML 附件下载。本站控制台、页面和网络异常为 0。

Chrome 商店仅尝试一次隔离访问，约 2.3 秒返回 HTTP 200，最终 URL 与用户提供的 URL 一致，标题为「ArchBuddy - Chrome 应用商店」，页面正文包含 ArchBuddy、添加至 Chrome 和版本 0.6.0。未登录或安装。此处核对商品入口，不评价商店页面全部资源。

## 本轮证据

- `local-check-summary.json`：本地 19 项结果及首屏逐字边界。
- `public-check-summary.json`：本版 `pass: true`、`version/contentVersion: store-entry-20261005`、`count.checks: 23`、`count.errors: 0`，含平台提醒与正式 Document 分开记录。
- `store-check-summary.json`、`store-page.png`：商店单次访问结果。
- `1440/390/360-homepage.png`：本地首屏。
- `public-1440/390/360-homepage.png`：公网实际首屏，均已独立目视。
- `public-1440/390/360-download-options.png`：公网下载区按钮，均已独立目视。

本轮未发现需要修复的问题。

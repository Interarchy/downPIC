# 首屏右边缘对齐定向验收

最终结论：通过。版本 `hero-align-20261006`；本地 27 项、公网 22 项定向检查全部通过。本地 1920 / 1600 / 1440 / 390 px 和公网 1920 / 1440 / 390 px 共 7 张本轮新截图均已独立目视，正式站点页面、控制台及资源网络异常 0 项。

本地：http://127.0.0.1:8766/mockups/archbuddy-showcase/。
公网：https://archbuddy-dev-showcase-dev-mel-d9guu8bpu44029179.webapps.tcloudbase.com/。

图片按钮外框、hero 容器、header 容器和“下载体验”入口右边界差均为 0 px。图片内容右边缘比按钮外框向内 1 px，符合正常边框厚度。隔离页面读入归档修前 CSS 比较确认：1920 / 1600 px 原 margin-right 为 -70 px，外框比 header 下载入口右偏 70 px；本版 margin-right 0、差值 0。

所有验收宽度均未发现标题、图片、导航或按钮碰撞、孤字或横向溢出；原 slogan、商店与测试集入口保持。首屏图库实际图片可点击放大，关闭后正常返回。未访问商店、下载或执行归档、调用 AI；未修改站点源码、云资源、后端或额度。滚动动效三方案由另一独立验收任务负责，本报告仅针对正式页首屏对齐。

公网使用三个全新隔离 context，正常等待 CloudBase 三秒倒计时后确认访问。平台初始提醒 HTTP 404 及对应控制台记录单独保存在 `platformVisits.initialErrors`，不计入正式站点错误。确认后各宽度均实际渲染本版，正式 Document 为 HTTP 200、text/html，无 Content-Disposition 附件与 HTML 下载。等待文档、CSS、字体和必要图片就绪后读取样式与截图。

证据：`local-check-summary.json`、`public-check-summary.json`，四张 `local-*-hero.png`、三张 `public-*-hero.png`；JSON 包含本版版本、精确检查数、边界数值、异常与独立目视结论。修前对比仅在隔离浏览器读入本地归档 CSS，未修改任何站点文件。

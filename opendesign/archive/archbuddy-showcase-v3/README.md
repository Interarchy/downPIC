# ArchBuddy 连续滚动展示站

2026-10-05第三版：定位 → 问题与机会 → 产品思路分析图 → 两条业务循环 → 三大功能支撑 → 下载与安装。设计参考链路与AI效果图迭代链路是业务场景；采集、提示词、资产是功能。图词资产贯穿底部，沉淀并支持找回/复用。

沿用archbuddy-portfolio深绿与暖白配色，白底绿字品牌与滚动固定透明渐变导航；小图标全部来自Lucide官方0.547.0，sprite为assets/lucide.svg，许可证assets/lucide-LICENSE.txt，出处详见部署证据。网页不调用模型、收集表单、创建账号或行为统计。

插件0.6.0 ZIP和用户图片测试集7z保留原字节，首页/安装区均可下载。旧五页历史路径保留，当前首页不要求跳转阅读；前两版源文件分别归档opendesign/archive/archbuddy-showcase-v1与archbuddy-showcase-v2。

本地预览：http://127.0.0.1:8766/mockups/archbuddy-showcase/
白名单构建：cloudbase/scripts/build-showcase-site.mjs，输出cloudbase/dist/showcase-two-workflows-20261005/site。仅22公开文件；README、环境配置、来源记录、审阅与日志不上传。

公网：https://archbuddy-dev-showcase-dev-mel-d9guu8bpu44029179.webapps.tcloudbase.com/
首次CloudBase测试域名提醒等待3秒后点击确定访问；当前改版发布状态以docs/ARCHBUDDY_SHOWCASE_SITE.md最新记录为准。

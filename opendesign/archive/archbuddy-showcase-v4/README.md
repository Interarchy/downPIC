# ArchBuddy 连续滚动展示站

2026-10-05第四版：产品定位→问题五步与对应断点→产品思路→两条完整业务闭环→三大功能支撑→双下载与安装。方案创作链路为采集参考图/方案创作/参考图库三个节点；AI链路为参考/反推/外部生图/迭代/提示词库五节点大闭环，并保留生图与迭代的小循环。

深绿与暖白视觉，既有A形Logo改为白底深绿字形、旁边白字品牌；顶部初始实色，下滑才透明渐变固定。全部通用图标沿用Lucide官方0.547.0本地sprite与许可，品牌图仅复用extension/icons/logo.svg既有路径。删除冗余图注与补充小字，问题归到对应流程步骤。

网站不调用模型、收集表单、创建账号或统计。插件0.6.0ZIP与用户测试集7z原字节不变，旧五页路径保留。前三版源码在opendesign/archive/archbuddy-showcase-v1、v2、v3，既有发布清单独立留存。

本地预览：http://127.0.0.1:8766/mockups/archbuddy-showcase/
白名单构建：cloudbase/scripts/build-showcase-site.mjs，当前输出cloudbase/dist/showcase-closed-loops-20261005/site，仅23公开文件。README、环境配置、审阅、日志不上传。

公网：https://archbuddy-dev-showcase-dev-mel-d9guu8bpu44029179.webapps.tcloudbase.com/
首次CloudBase默认域名提醒等待3秒后确认；当前改版最终发布/验收状态见docs/ARCHBUDDY_SHOWCASE_SITE.md最新记录。

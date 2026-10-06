# ArchBuddy 连续滚动展示站

2026-10-05第二版。首页从工作流断点、产品思路与闭环、三条链路、八项功能，下滑至下载与安装。三条链路全部直接可读，点击只切换或放大截图。既有五页公开路径保留兼容，首页不再要求跳转；旧首页源码保存在opendesign/archive/archbuddy-showcase-v1。

沿用archbuddy-portfolio深绿与暖白配色，截图使用演示资料。网站不调用模型、收集表单、创建账号或采集行为统计。

下载插件为已核验的0.6.0原ZIP；新增图片测试集来自用户明确提供的ArchBuddy测试集.7z，包含37张参考图片，保持原归档字节。测试集下载为downloads/ArchBuddy-test-images.7z，页面下载文件名为ArchBuddy测试集.7z。

本地预览：运行既有opendesign/serve.mjs，打开/mockups/archbuddy-showcase/。发布使用cloudbase/scripts/build-showcase-site.mjs的19文件白名单副本，不从仓库根目录上传。

公网地址：https://archbuddy-dev-showcase-dev-mel-d9guu8bpu44029179.webapps.tcloudbase.com/
新访客可能先看到CloudBase测试域名提醒，等待3秒后点击“确定访问”。当前改版是否已发布与验证以docs/ARCHBUDDY_SHOWCASE_SITE.md最新记录为准。

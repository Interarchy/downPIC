# ArchBuddy 第十六版展示站验收

2026-10-16。目标为已登记的ArchBuddy development静态展示应用archbuddy-dev-showcase及前缀archbuddy/dev/showcase/。用户授权将已选浅底接力动效与05墨绿版直接部署公网。

源码：opendesign/mockups/archbuddy-showcase。新动效文件story-section.css/js；本地候选的比较工具栏没有进入正式站。01断点A/B/C逐次强调，新增圆环内侧两业务链路，01/02标题统一琥珀色；05全宽墨绿及浅色说明、双下载按钮。保留商店链接和原测试集归档。旧正式源归档opendesign/archive/archbuddy-showcase-before-motion-install-20261016。

静态核查：四个正式脚本node --check通过；29文件白名单构建通过，16011569字节；下载ZIP和测试集7z与固定SHA256一致，无疑似凭据、缺失引用或开发配置。交付目录：cloudbase/dist/showcase-motion-install-20261016。

本地浏览器：1440×1000检查A/B/C逐次显现、完整01、水平过渡、完整02与05；1366×768启用水平接力；390×844纵向完整阅读。截图均无横向溢出、脚本或请求错误，正式页无比较控件；商店和测试集各有两个正确入口。

发布前只读核对：015/SUCCESS、旧27文件精确清单、隐私站200/6364字节及SHA256匹配。CloudBase CLI固定应用/环境/路径发布退出0；016/SUCCESS。主域29文件和备用3资源逐项HTTP200/SHA256一致，范围精确29文件、临时cloudbaserc已清理。隐私站原哈希不变。

公网新浏览器：1440/390都经历平台默认的3秒风险提示；确认后正式Document为200/text-html且无附件下载。01/转场/02/05截图已目视，墨绿#153B2D、圆环两标签、三断点、2/4产品机会完整，无横溢、JS错误或资源失败。公网页面：https://archbuddy-dev-showcase-dev-mel-d9guu8bpu44029179.webapps.tcloudbase.com/?v=motion-install-20261016 。

范围结论：不涉及账号积分、插件商店包、后端014、用户数据、身份、密钥、统计、日志、模型、每日50/500额度或其他项目。CloudBase现有环境级凭据边界仍为已登记限制；本轮仅限定静态站路径，无新增数据访问。未提交或推送Git。

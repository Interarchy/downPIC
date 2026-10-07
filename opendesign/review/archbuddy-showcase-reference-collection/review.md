# 收集参考图节点定向公网验收

结论：通过。内容版本 `reference-collection-20261007`；1440 / 390 px 两个全新隔离 context，共 13 项定向检查全部通过，2 张本轮截图已独立目视，正式站点页面、控制台及网络异常 0 项。

公网：https://archbuddy-dev-showcase-dev-mel-d9guu8bpu44029179.webapps.tcloudbase.com/。

01 分析图首个节点准确为“收集参考图”。桌面和手机五字均为完整单行，字形处于实际节点边界内，无孤字、裁切、相邻节点或断点碰撞，页面无横向溢出。正常启用方案 1 轻量进入，滚动到 01 后标题与内容均正常浮现，最终 opacity 1、transform 为单位矩阵，新节点清楚可读。

正常等待 CloudBase 三秒倒计时并确认后，正式 Document 为 HTTP 200、text/html，无附件响应头和 HTML 下载。平台初始提醒 HTTP 404 及对应错误单独保存在 `platformVisits.initialErrors`，不计为正式站点错误。等待文档、CSS、字体及必要图片就绪后检查。

证据：`check-summary.json`、`public-1440-problem.png`、`public-390-problem.png`。仅验收这次节点文案和排版；未扩大图库、下载或其他章节回归，未修改源码或部署，未建立新测试框架。仓库现有提交、测评与埋点方案归档记录保持。

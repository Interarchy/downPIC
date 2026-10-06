# ArchBuddy 商店安装说明独立定向复核

结论：本地与公网均通过，无需修复。此次独立证据对应 `store-install-20261006`。复核日期：2026-10-06（Asia/Shanghai）。

| 范围 | 检查 | 站点异常 | 截图 |
| --- | --- | --- | --- |
| 本地 1440 / 390 / 360 px | 37 项全部通过 | 0 | 6 张 |
| 公网三个全新 context，同上宽度 | 41 项全部通过 | 0 | 6 张 |

已独立目视本地、公网三个宽度的整个 05 章节及展开的两项 FAQ。商店页面→添加至 Chrome 并确认添加扩展程序→固定图标、从菜单进入功能，安装顺序与文字清楚，没有重叠、孤字或横向溢出。第三步与当前插件 popup 菜单入口一致，没有写成点击图标直接打开侧栏。

05 中旧插件 ZIP、开发者模式、目录加载、manifest.json、chrome://extensions、复制管理地址说明及旧复制控件均已移除。测试集的解压、图词库导入文件夹说明保留。FAQ明确 AI 反推/评估需联网并确认数据处理，以及本机保存、不支持跨设备同步、清除或卸载可能丢失资料。

两处商店 CTA 保留原名称、精确 URL 和无 download 属性，两处测试集入口保留，slogan 和 02 轻配色快速断言通过。两组画廊在三个宽度均可切换并切回，图片放大、关闭正常；删除旧复制监听没有造成 pageerror。

公网地址：https://archbuddy-dev-showcase-dev-mel-d9guu8bpu44029179.webapps.tcloudbase.com/ 。三个新 context 均正常等待平台 3 秒并确认，随后明确等待 document complete、CSS sheet、品牌图片与字体就绪再读取。初始平台提醒的 404 单独记录；正式 Document 三个均 HTTP 200、text/html、无附件头或 HTML 下载。本站页面、控制台、网络异常为 0。

证据：`local-check-summary.json`；`public-check-summary.json`（`contentVersion: store-install-20261006`、`pass: true`、`count.checks: 41`、`count.errors: 0`）；`local/public-1440-install.png`、`local/public-390-install.png`、`local/public-360-install.png` 均已独立目视，另有对应安装步骤截图。

本轮只读定向检查，未修改或部署源码、实际安装插件、登录、调用 AI、访问商店或下载/执行归档，也未重跑流程图。

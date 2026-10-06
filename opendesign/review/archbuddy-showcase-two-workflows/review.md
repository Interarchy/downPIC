# ArchBuddy 第三版独立复核

日期：2026-10-05。执行者：独立 verifier。结论：**本地及第三版公网复核通过**，未发现阻断问题。

## 范围与方法

只读检查 opendesign/mockups/archbuddy-showcase，实际运行 Chromium 隔离 context，不读取日常浏览器 profile，不调用模型，不执行或解压下载包。按 OpenDesign 要求检查实际截图，覆盖 1440、1024、390、360px。证据写入本目录，不修改站点源码。预览地址：http://127.0.0.1:8766/mockups/archbuddy-showcase/。

## 视觉与产品表达

- 五个醒目编号章节把问题、产品思路、业务链路、功能支撑和安装区分清楚。深绿、暖白、轻边框与真实截图统一；中文标题没有孤字，手机端布局和全页宽度均无横向溢出。
- 问题图：四个红色断点分别放在对应连接线上，unlink 图标、方向 chevron 与说明能对应到上下游；移动端转换为向下顺序，标签留在连线上。
- 产品图：采集→构建→评估向右，底部图词资产承接采集/评估的沉淀；找回箭头回到采集，复用箭头回到构建。资产作为共用底座的层级明确。
- 设计参考循环：外部采集/自有图库→设计方案，右侧向下、底部向左、左侧向上回流；“设计图片，成为下一轮参考”与回路对应。
- AI 循环：收集参考图↓反推提示词↓外部生成 AI 效果图→评估并迭代提示词，修改后沿底部回路再次外部生图。四宽度入口与外部生图中心一致。
- 三大功能：桌面采集与提示词并列，资产贯穿底部；手机按顺序呈现，并保留图片归档/找回参考、图词沉淀/复用意图说明。八项能力归属为 2 / 4 / 2，符合两条业务链路和三类功能区分。

## 本轮发现与闭环

1. 初版 AI 前导节点横排，移动端下箭头在采集下方，反推提示词像被绕过。已反馈由实现者改为纵向连续下接。四宽度实际截图与中心对齐几何检查通过。
2. 390px 设计方案说明“设计师选择参考、推进方案”末字独立成行。实现者缩为“选择参考、推进方案”，390/360px 复看通过。
3. 首轮通用图标测量将关闭 dialog 的 X 和响应式隐藏的图标纳入 getBBox 检查，产生四项假失败；隐藏状态不构成渲染问题。随后只检查可见 SVG，另打开弹窗检查 X，12 项复核全部通过。原始 JSON 保留以供追溯，最终以 fix-and-icon-recheck.json 为准。

## 功能与浏览器

- Header 实际固定顶部，白底绿字品牌可读，透明渐变和 blur 存在；滚动后阴影出现。点击各可见导航目标，章节标题处在 header 下方。
- 64 个 use 引用均对应本地 Lucide sprite 中的官方 symbol。所有可见图标非零 bbox，弹窗关闭图标在打开状态正常；favicon 返回 SVG，使用品牌绿色。正文无遗留文字符号箭头/关闭符号。
- 两组截图切换在四宽度均改变为对应图片；四张截图放大显示完整源 URL，关闭有效。安装地址复制结果为 chrome://extensions/。
- 实际点击下载并读取浏览器下载临时文件，未执行文件：插件 179857 字节，SHA-256 34B10BDF1C17FB712FDD721CCF06ED33EA72D87B318402C3471212A021FC113D；图片测试集 12020913 字节，SHA-256 18E01EDB67EDCF5A1AC32CB6545DAED6C064D0AFA3C3DD3B2EBFA7BF91D7D8AD。均与给定基准相同。
- 首页与资源加载正常。页面异常、控制台 error、失败请求及 HTTP 错误均为 0。

## 证据索引

- [首次浏览器记录](local-browser-summary.json)：67 项检查、52 张截图；四项隐藏图标误判见上文。
- [修复与图标复核](fix-and-icon-recheck.json)：12 项通过，8 张修复截图。
- AI 入口最终：[1440](1440-ai-cycle-recheck.png)、[1024](1024-ai-cycle-recheck.png)、[390](390-ai-cycle-recheck.png)、[360](360-ai-cycle-recheck.png)。
- 设计回路最终：[1440](1440-reference-cycle-recheck.png)、[390](390-reference-cycle-recheck.png)、[360](360-reference-cycle-recheck.png)。
- 产品底座：[1440](1440-concept.png)、[1024](1024-concept.png)、[390](390-concept.png)、[360](360-concept.png)。
- 三功能整体：[1440](1440-features-clean.png)、[1024](1024-features-clean.png)、[390](390-features-clean.png)、[360](360-features-clean.png)。clean 截图仅在截图渲染期间隐藏 header，避免 locator 长截图中固定栏插入画面的采集伪影；固定栏真实行为见 [1440 滚动](1440-header-scrolled.png) 与 [390 滚动](390-header-scrolled.png)。

## 公网核验范围

本轮发布后已核验原独立域名真实新访客流程、HTML 渲染、两业务循环/三功能、图标与导航、截图/放大/复制、双下载哈希、页面与网络异常及窄屏溢出。旧五页不在本轮核验范围。


## 公网最终结果

正式 URL：[ArchBuddy 展示站](https://archbuddy-dev-showcase-dev-mel-d9guu8bpu44029179.webapps.tcloudbase.com/)。本轮线上浏览器记录：[public-check-summary.json](public-check-summary.json)，50 项检查全部通过，9 张截图，站点页面/控制台/网络错误为 0。

- 1440 / 390 / 360px 均使用全新隔离 context。首次看到 CloudBase 平台风险提醒，正常等待倒计时后点击“确定访问”；随后同一域名真正渲染 ArchBuddy 新页面。三次实际 Document 均为 HTTP200、Content-Type text/html、Content-Disposition 为空，无 HTML 附件下载，也没有循环提醒。平台提醒本身返回的 HTTP404 和对应 console 消息单独保留在 platformVisits.initialErrors，不误归为站点错误。
- 五个编号章节、两条业务循环、三功能共用资产底座和 2 / 4 / 2 项能力正确。AI 前导入口纵向进入外部生图且中心对齐。线上实际截图已独立目视：[1440 AI 循环](public-1440-ai-cycle.png)、[360 AI 循环](public-360-ai-cycle.png)、[390 固定导航](public-390-scrolled.png)，与修复后本地一致。
- 所有可见 Lucide 图标和放大后的关闭图标正常。白底绿字 Logo、sticky 顶栏、透明渐变/blur、滚动阴影、各可见导航锚点无遮挡均通过。三个宽度的 scrollWidth 等于 viewport 宽度。
- 两组截图切换、实际图片放大与关闭、chrome://extensions/ 复制均通过。
- 从实际网页点击下载：ArchBuddy-0.6.0-Chrome.zip 为 179857 字节，SHA-256 34B10BDF1C17FB712FDD721CCF06ED33EA72D87B318402C3471212A021FC113D；ArchBuddy测试集.7z 为 12020913 字节，SHA-256 18E01EDB67EDCF5A1AC32CB6545DAED6C064D0AFA3C3DD3B2EBFA7BF91D7D8AD。两份均匹配原基准，download.failure 为空；未执行或解压。

第一次自动化点击等待导航使用 15 秒超时，没有形成实际站点缺陷证据。随后将点击与主体加载等待分开，正常确认流程在三个隔离 context 均通过，没有修改网站或平台配置。

# ArchBuddy 官网 SEO 策略与本地交付

初稿：2026-10-26；更新：2026-10-28。状态：已整合到 10 月 27 日官网生产代码基线，待预览与发布；尚未上线。

## 产品目标与取舍

首发假设用户为需要收集建筑参考、构建提示词并迭代视觉方案的建筑及空间设计师。搜索获客路径为：搜索具体任务 → 阅读方法与证据 → 理解 ArchBuddy → 安装图词库或进入 Canvas → 完成首次有效使用 → 再次复用图词资产。

官网维持一个产品、一个介绍首页。遵循 ARCHBUDDY_UNIFIED_HOMEPAGE.md 已确定的统一产品形态，不新增 Library/Canvas 两个产品营销首页。后续任务教程属于使用方法内容。当前没有搜索量、排名、转化基线；下列关键词均为待验证假设，不能宣称高流量或低竞争。

本轮符合章程：纯本地静态站 SEO；复用现有 HTML；不增加框架、测试框架或依赖；以元数据解析、XML 校验、正文不变和差异检查为门槛。不涉及云端资源、用户数据、统计采集、模型调用、账号或收费配置。发布与站长平台提交留待官网同步之后。

## 基线和已知事实

- 原始独立分支：codex/seo-local-20261026；来源仓库 Interarchy/downPIC。
- 原始基线：2f50011687bb56566ab3a8ada5261a97e8cd0a16，官网公开分支 codex/showcase-025-public；最新整合基线见文末记录。
- 官网： https://www.archbuddy.top/ ；Canvas： https://canvas.archbuddy.top/ 。当前工作不修改 Canvas。
- 2026-10-26 只读公网检查：首页、中英文入口及案例 URL 可访问；robots.txt 与 sitemap.xml 返回 404。
- / 与 /index.html、/case-study/ 与 /case-study/index.html 均返回 200，需用 canonical 统一；本轮不新增服务器重定向。
- 当前中文、英文首页均有标题/描述，但缺 canonical、hreflang；价格是尚未上线的提案；设计稿和短片分场景不适合作为独立搜索落地页。
- 官网源码与生产响应可能随平行任务变化；Git 基线不等于永久线上快照，发布前必须重新对照最新版本。

## 第一阶段：已有页面的搜索基础

1. 首页标题明确建筑设计、参考图、提示词与创作画布，保留现有品牌视觉及所有正文交互。
2. 7 个现有正式页面设置唯一 canonical 和描述：中英文首页、五页产品研究案例。案例讲产品设计过程，不冒充用户效果图实战案例。
3. 中英文首页互相声明 zh-CN、en 和默认中文 x-default；英文自身 canonical 指向英文，不合并到中文。
4. 根路径增加 robots.txt 和 sitemap.xml。sitemap 只收录正式规范 URL；没有真实内容更新时间依据时不编造 lastmod、priority 或 changefreq。
5. 未上线中英文定价、短片和分场景使用 noindex,follow；已有设计候选的 noindex,nofollow 保持。robots.txt 允许抓取，让搜索引擎能读取 noindex；它不承担访问控制。
6. 首页补准确的 WebSite 结构化数据和 OG URL/语言。暂不添加未经证实的评分、用户数、价格 Offer 或软件富结果承诺；不为缺少分享图而借用无关素材。
7. 保持现有 URL，不因 SEO 更换域名或批量重命名页面。当前 Vercel 静态根为 opendesign/mockups/archbuddy-showcase，新增文件位于此目录；旧 CloudBase 白名单构建不是本轮发布入口。

## 第二阶段：任务内容与品牌发现

先服务中文用户，英文现有首页完成基础关联即可。根据站长平台国家、语言、查询数据，再判断是否投入英文教程。中文以百度/Bing 数据验证，Google 保留品牌及国际发现入口。

| 优先级 | 搜索任务假设 | 建议内容 | 下一步 |
| --- | --- | --- | --- |
| P1 | 建筑参考图怎么整理、建筑图片采集插件 | 按真实项目整理参考图并保留来源，说明下载位置与恢复边界 | 安装图词库 |
| P1 | 建筑参考图反推提示词、建筑效果图提示词怎么写 | 从体量、材料、光照、构图拆解一张有权使用的参考图 | 进入图词库提示词流程 |
| P2 | AI 建筑效果图怎么迭代、参考图与生成图差异 | 展示同一任务两轮修改，记录输入、模型、版本、失败与限制 | 根据开放状态进入 Canvas 或阅读帮助 |
| P2 | 建筑图词库、提示词版本管理 | 旧项目图词如何参与新项目，说明人工传递和跨端能力现状 | 复用已确认图词 |
| P3 | ArchBuddy、ArchBuddy 安装、ArchBuddy 怎么用 | 品牌首页、商店介绍与安装帮助保持一致 | 完成首次使用 |

每篇内容发布门槛：回答一个真实任务；步骤可执行；输入/输出来自授权素材；截图与当前版本一致；说明产品边界；包含相关内部链接和一个主要行动入口。先完成 2 篇，再根据数据扩展。不批量生成模型名、城市名或建筑类型换词页面，不买链接。

分发：在用户已授权的官方账号或专业社区分享原创案例，链接到对应教程；官网与 Chrome/Edge 商店的名称、描述、官网链接保持一致。该项为后续运营任务，本轮不代发消息或修改商店。

## 第一篇内容的可执行简报

题目：如何把建筑参考图变成可修改的结构化提示词。
目标问题：用户知道喜欢某张图，却不能准确描述哪些设计特征值得保留。
文章顺序：适用任务与边界 → 选择有权使用的参考图 → 分别记录体量/材料/光照/构图 → 生成提示词后人工核对 → 只改一个设计变量 → 保存参考来源和提示词版本 → 下一轮复用。
示例描述（人工撰写的方法示意，非实测生成结论）：两层庭院建筑，浅色混凝土与木格栅，阴天柔光，人视角；修改时先固定体量与视角，只调整材料。不能承诺仅靠提示词就精确保持几何、视角或工程可实施性。
待补证据：一张可公开参考图、真实插件截图、一轮提示词修改记录、当前产品操作路径核对。补齐后才制作公开教程，不能把简报直接当实战案例上线。

## 数据口径与四周实验

负责人建议：产品负责人负责选题/素材/市场与发布决定；开发负责索引配置、同步及技术复核。官网现已接入 Vercel Web Analytics 的页面访问与来源统计；搜索查询、索引状态及跨域激活尚无贯通口径。本轮不新增追踪器，也不收集图片、提示词或用户身份。

- 第 1 周：合并基础改动并上线后验证 Search Console、Bing Webmaster Tools、百度搜索资源平台所有权，提交实际正式 sitemap；以 URL 检查确认抓取而非 site: 查询断言收录。
- 第 2 周：发布首篇完成证据的教程；确认站内可点击进入且返回 200，无 noindex；每周记录查询、页面、国家、设备维度的展示、点击、CTR 和索引状态。
- 第 3—4 周：有资源再发布第二篇；查看哪些问题带来相关用户，调整标题或下一步入口。
- 技术成功门槛：正式 URL 可抓取、canonical/hreflang 一致、站点地图无失效或预览 URL。搜索引擎是否收录不由代码保证。
- 内容决策：单页不足 100 次相关非品牌展示时仅作观察，不凭小样本比较 CTR；累计 100 次以上仍无点击时检查搜索意图和摘要；累计 30 次相关访问仍无主要入口点击时复核教程与行动入口。以上是实验触发阈值，不是行业基准或流量承诺。
- 激活定义：图词库完成首次有效采集且保存一份确认提示词；Canvas 完成一次成功生成并保存/导出结果。跨域进入、商店点击都不能当作安装或激活。尚无授权统计链路时只报告可观测的搜索表现，不伪造全漏斗归因。
- 停止条件：两篇完成内容经过 8 周仍无相关展示，先检查抓取、需求与渠道，暂停扩页；不持续批量堆内容。真实产品能力变化时及时撤回过期承诺。

## 平行更新与同步方式

本分支只交付 SEO 增量。等官网主线稳定，在最新官网分支创建整合分支，按提交 cherry-pick SEO 增量；处理 head 冲突时保留最新正文、CSS、JS 和导航。禁止复制本工作树整站覆盖最新官网。若定价已正式上线、语言 URL 或案例结构已改变，先重新决定索引范围，再更新 sitemap 和校验脚本。

执行 python cloudbase/scripts/check-showcase-seo.py 和 git diff --check。检查当前实际发布方式是否包含 robots.txt/sitemap.xml；若使用旧白名单构建则在目标分支显式补入，不能声称已自动兼容。预览部署沿用访问保护，若公开则仅预览环境返回 noindex，不能把它误带入正式站。不要放宽现有 Vercel 保护。

发布前检查目标为 archbuddy-official-site/www.archbuddy.top，与 Canvas/CloudBase 原站区分。发布后验证首页、英文页、案例规范地址、robots、sitemap 的状态码/响应类型/实际 meta 和 HTTP X-Robots-Tag；再提交站长平台。当前整合分支不直接修改生产域名；先完成预览和差异审阅。

## 官方依据

- https://developers.google.com/search/docs/fundamentals/creating-helpful-content
- https://developers.google.com/search/docs/crawling-indexing/block-indexing
- https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
- https://developers.google.com/search/docs/specialty/international/localized-versions
- https://developers.google.com/search/docs/monitor-debug/search-console-start
- https://ziyuan.baidu.com/linksubmit
- https://www.bing.com/webmasters/help/bing-webmaster-guidelines-30fba23a

Google 说明 noindex 页面必须允许抓取才能读取指令；站点地图应列出希望收录的规范地址。提交并不保证收录，结构化数据也不保证富结果。

## 2026-10-26：第二阶段本地内容

已制作 guides/ 教程与案例入口、organize-references.html 参考图整理教程、reference-to-prompt.html 结构化提示词教程。中文与英文首页仅在页脚增加教程入口，英文标注内容为中文；不新增未翻译页面的 hreflang。两篇互相推荐并引导安装插件，教程入口链接既有产品研究案例。新增 3 个规范 URL 后共 10 个 sitemap 条目。

文章是基于仓库界面与操作文档的使用说明，截图沿用官网已有 V4 系列演示材料，明确说明版本与手工示例属性。首轮采用可执行步骤及方法示例，没有声称完成真实模型生成效果实验。同步发布前仍须比对当时商店版本与实际操作路径。

## 2026-10-28：官网新版整合

Vercel 生产部署 dpl_Hq2BDP7TQia5wiChGwnw3EUQQczd 对应 Interarchy/downPIC 的 codex/waffo-legal-footer 提交 513ac6bcfe2e8f567c391dee5b8f97c3da023430。整合分支 codex/seo-site-sync-20261028 从该提交创建，逐个合入原始 SEO 三项提交，保留新版账户入口、美元定价、访问统计及正式法律页脚。中文与英文首页只增加 SEO head 与教程页脚入口。新美元定价两页仍为支付未开放的方案预览，设置 noindex,follow；旧定价跳转页沿用 noindex。

2026-10-28 只读公网核对：首页 200，/robots.txt 与 /sitemap.xml 仍为 404，/legal/privacy/ 为 200。教程页脚改用正式法律与支持链接，移除旧开发环境隐私地址。当前源码可索引范围为中英文首页、五页产品研究案例及三页教程，共 10 个 URL；16 个 HTML 页面排除索引。正式部署前再次确认生产分支、Chrome/Edge 商店版本与教程操作路径；部署后按上一节验收响应与索引配置，再将实际 sitemap 提交站长平台。

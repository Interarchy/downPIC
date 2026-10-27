# 官网 SEO 本地验收记录

原始记录日期：2026-10-26。原始分支 codex/seo-local-20261026，基线 2f50011687bb56566ab3a8ada5261a97e8cd0a16。下方保留原始验收历史；2026-10-28 整合结果见文末。均未确认搜索引擎收录。

## 改动

- 7 个正式页面具备唯一标题、描述、canonical 与 OG URL；首页补充准确的 WebSite JSON-LD。
- 中英文首页有双向 zh-CN/en/x-default 链接，自身 canonical 分别保留。
- sitemap.xml 包含 7 个正式规范 URL；robots.txt 允许抓取并声明站点地图。
- 2 个未上线定价页和 5 个短片页面新增 noindex,follow；7 个既有设计候选保持原 noindex。合计 14 个非索引页面。
- 无新增运行依赖、视觉资源、统计 SDK 或后台服务；本次不修改 CSS、JS、正文、导航或 Canvas。

## 验证与结果

1. python cloudbase/scripts/check-showcase-seo.py：PASS；21 HTML、7 可索引、14 排除、7 sitemap URL。校验标题/描述唯一、canonical、OG URL、互惠语言链接、JSON-LD 解析、XML 地址与索引范围一致。
2. 从 Git 基线读取所有 14 个修改的 HTML，与工作树逐个比较 </head> 之后的内容（只归一化 Git CRLF）：全部相同。无正文改动，无需重复验证动画布局。
3. git diff --check：通过。Python 校验脚本成功执行。仓库约定只需相关静态检查，未引入测试框架。
4. 只读公网：/、/index.html、/index-en.html、/case-study/、/case-study/index.html、/case-study/problem.html 均 200；/robots.txt 与 /sitemap.xml 均 404。这是修复前记录，不是发布后的结果。

## 待同步与限制

- 本工作树只基于上述已发布 Git 提交；官网后续平行改动需要在整合分支中处理，不整站覆盖。
- 当前 Vercel 静态源码根支持直接提供本目录文件。尚未运行线上部署、Search Console URL Inspection、Google 富结果测试或实际搜索收录验证。
- 原 CloudBase 构建脚本仍是历史发布白名单，不用于此轮 Vercel 本地交付；改走该构建入口时须补齐新文件再验证。
- 真实教程输入、截图与迭代记录尚待补齐；策略中的关键词是待验证假设。未把产品研究案例当作用户生成效果案例。
- 站长平台所有权、实际索引、移动性能和转化数据需上线后独立验收；本地 PASS 不代表排名或流量提升。

## 第二阶段：教程页面静态验收

2026-10-26 新增三页：教程与案例入口、建筑参考图整理、结构化提示词构建。基于原官网品牌资源与既有界面演示图；图片明确标注 V4 演示属性和手工示例，未调用模型或构造效果证明。

- SEO 校验：PASS，24 个 HTML、10 可索引、14 排除、10 个 sitemap URL。
- 三新页本地链接、图片/CSS/Lucide资源、目录锚点全部存在；各有一个 H1，无重复 id；manifest JSON 解析通过。
- 两个首页与修改前比较，footer 之前的内容完全一致；页脚新增教程入口。
- 生成完整 OpenDesign manifest；未增加运行依赖、统计或后端服务。
- 本地预览 http://127.0.0.1:3117/guides/ ，仅绑定127.0.0.1。浏览器独立审阅结果记在 ARCHBUDDY_SEO_GUIDES.md。
- 发布前仍须核对官网最新分支、商店版本与截图差异；本次未验证线上收录或模型效果。

## 2026-10-28：生产代码基线整合验收

- 整合分支 codex/seo-site-sync-20261028 最初基于生产提交 513ac6bcfe2e8f567c391dee5b8f97c3da023430；目标分支又增加两项提交后，已重放到 codex/waffo-legal-footer 的 43b9e6d063fece1210cc17c4234f1ccd6c79130b。保留账户菜单、美元定价、Web Analytics 和最新法律页脚布局。
- 合并了三项本地 SEO 工作；两份新版美元定价方案仍未开放支付，均增加 noindex,follow。旧定价跳转页保留现有 noindex。
- python cloudbase/scripts/check-showcase-seo.py：PASS，26 个 HTML、10 可索引、16 排除、10 个 sitemap URL；git diff --check 通过，无残留冲突标记。
- 2026-10-28 只读正式域名：/ 为 200，/robots.txt 和 /sitemap.xml 仍为 404，/legal/privacy/ 为 200；这表明 SEO 增量尚未在生产发布。
- 教程页脚已改用正式法律与客服链接。正式部署后的实际 HTTP meta、sitemap 类型、预览保护、商店版本和搜索收录仍待核查。
- 本机 Edge 在 390/1440 宽度复核教程三页：状态 200、无脚本错误或横向滚动，滚动到截图后图片解码正常；新版中英文首页的 canonical、页脚教程入口和法律链接存在。英文首页 390 宽度的文档滚动宽度为 452px，正式站同样为 452px，移除本轮教程链接后数值不变；属现有布局问题，需另行修复，不能记为本轮通过的移动体验。

# 官网 SEO 本地验收记录

日期：2026-10-26。分支 codex/seo-local-20261026。基线 2f50011687bb56566ab3a8ada5261a97e8cd0a16。此记录只确认本地交付；未发布、未提交站长平台、未确认搜索引擎收录。

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

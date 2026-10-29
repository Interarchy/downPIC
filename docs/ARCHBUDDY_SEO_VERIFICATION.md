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
- 教程页脚已改用正式法律与客服链接。正式部署后的实际 HTTP meta、sitemap 类型、预览保护和搜索收录仍待核查；商店公开页面版本核对见后续记录。
- 本机 Edge 在 390/1440 宽度复核教程三页：状态 200、无脚本错误或横向滚动，滚动到截图后图片解码正常；新版中英文首页的 canonical、页脚教程入口和法律链接存在。初次检查发现英文首页 390px 的文档宽度为 452px，正式站同样如此；移除教程链接后不变。定位为功能标题强制单行，已在本分支允许英文标题于手机宽度换行。进一步发现中文首页在 320px 有相同原因的 335px 文档宽度，已在极窄屏解除单行。修改后 Edge 检查 320/390/760/1440px 的中英文首页与教程均无横向滚动或脚本错误；英文与中文标题在窄屏均自然换行。

## 2026-10-28：Vercel 预览部署验收

- 草稿 PR #4 目标为 codex/waffo-legal-footer；GitHub 比较结果 ahead 5、behind 0、可合并。Vercel 预览部署 dpl_BRumYgKZeQoxBXMf8pYPXCFyoyF6 为 READY，Git SHA 75e127d8b7164a607f758b593291bfedcf36170a。预览域名在项目设置中受 Vercel 登录保护。
- 通过 Vercel 连接器检查实际响应：/、/index-en.html、/case-study/、/guides/、两篇教程、/film/、/pricing.html、两份 /pricing-usd/ 页面均为 200；首页和教程 canonical 指向生产规范 URL；短片、旧定价跳转页及两份美元方案含 noindex。
- /robots.txt 返回 200、text/plain，声明正式站 sitemap；/sitemap.xml 返回 200、application/xml，列出 10 个正确的正式规范 URL，未包含定价、短片或预览域名。教程页未出现旧开发环境隐私链接，正式法律链接存在。
- 预览验证不能代替生产验证。生产域名的 robots/sitemap 仍为 404；上线后需复查实际 HTTP 响应、X-Robots-Tag、站长平台验证与收录状态。
- 窄屏标题修正提交 7abb43a 的 Vercel 预览 dpl_3LWZ6wtmFDmfRvSSsQ5Gpmsg4PNn 已 READY。实际预览中，中英文首页均为 200 并引用新 CSS 版本；styles.css 返回 200/text/css，含英文手机宽度及中文极窄宽度的换行规则；robots.txt、sitemap.xml 仍返回 200 且类型正确。GitHub 当前 SHA 的 Vercel 状态为 success，无检查注释。

## 2026-10-28：商店公开版本核对

- 本机 Edge 无登录访问官方 Chrome 商店商品页，HTTP 200，显示 ArchBuddy 0.6.0、2026-10-05 更新；官方 Edge 商店商品页 HTTP 200，显示 ArchBuddy V4.1、2026-10-16 更新。仓库本地插件清单为 0.6.1，不能把本地版本当作 Chrome 商店已更新版本。
- Chrome 商店公开说明确认网页参考图采集、多文件夹导入、按项目整理、语义检索、最多三张参考图和提示词编辑确认，与本轮教程的主要步骤一致。教程截图标明为 V4 演示、示例文字为手工撰写；未安装两个商店包逐控件或逐像素对照。上线后观察实际用户反馈，若控件差异影响操作，应及时修正文案。

## 2026-10-28：正式域名发布验收

- PR #4 已合并到 `codex/waffo-legal-footer`，合并提交 `8c24f6a95e6ab61873421dc7c716a06f0a182416`。Vercel 生产部署 `dpl_6RHaLLjNdZ5Xpz8PxAt4hFdBD4e4` 为 READY，提交号一致，`www.archbuddy.top`、`archbuddy.top` 与项目正式域名已分配，未报告别名错误。
- 无登录直访 `https://www.archbuddy.top/robots.txt` 返回 200、`text/plain`，包含 `Sitemap: https://www.archbuddy.top/sitemap.xml`；`/sitemap.xml` 返回 200、`application/xml`。其 10 个唯一 URL 均以 `https://www.archbuddy.top/` 开头，逐项返回 200，页面 canonical 与自身 URL 一致，无 `noindex`。中英文首页各有 3 条语言关联链接。
- 正式站 `/guides/`、两篇教程、五页案例、`/index-en.html` 与原 `/legal/privacy/` 均可访问。`/pricing.html` 和 `/film/` 仍返回 200 并含 `noindex`；本次未开放支付页面索引。
- Google 可从 `robots.txt` 发现站点地图；这不等于 Search Console 中已提交或已收录。当前工作环境未提供已验证的 Search Console 站点属性或授权连接，浏览器控制服务也未能启动，因此未声称完成站长平台内的提交、URL Inspection 或索引验证。下一步在已验证的 `archbuddy.top` 站点属性中提交完整 sitemap URL，记录平台回执，再观察索引覆盖和搜索表现。

## 2026-10-29：教程入口可见性本地复核

- 正式站点直访正常，但首页教程链接仅位于页脚；顶部导航缺入口，造成用户在首屏看不到新增内容。中英文首页已本地补充顶部“教程 / Guides”入口，目标均为 `guides/`。
- Edge 本地静态预览在 320、390、480、760、900、1120、1440px 逐一检查两种语言：首页 200、链接可见、文档宽度不超过视口、无脚本错误。320px 与 1440px 截图目视复核导航排布正常。`python cloudbase/scripts/check-showcase-seo.py` PASS，仍为 26 HTML、10 可索引、16 排除、10 sitemap URL；`git diff --check` PASS。生产站是否显示该导航待部署后验证。
- PR #6 合并提交 `1317a5e9193e6cf0ece2b6651fc7770c717e37d2` 的 Vercel 生产部署 `dpl_EngPm3HmBcWPoKNkHT6CKVGpjafi` 为 READY，包含正式域名别名且无别名错误。部署连接器读取 `https://www.archbuddy.top/` 与 `/index-en.html` 均为 200，实际响应含 `nav-guides` 顶栏链接和 `seo-guides-20261029` 样式引用；`/guides/` 为 200。本轮修正已在生产可见，搜索收录状态仍待站长平台核查。

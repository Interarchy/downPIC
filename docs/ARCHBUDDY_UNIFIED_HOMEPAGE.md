# ArchBuddy 统一官网首页：增量调整与发布记录

更新日期：2026-10-22。状态：统一官网已部署到 `www.archbuddy.top`；项目域名归属与持续部署仍待收尾。

## 产品决策

ArchBuddy 是一个完整产品，图词库与 Canvas 是同一设计链路上的两项核心能力。官网只保留一个介绍首页；图词库通过 Chrome 扩展使用，Canvas 通过网页画布入口使用。先前为 Library、Canvas 分别制作独立介绍页的方案不再作为官网信息架构。产品名称沿用现有正式拼写 **ArchBuddy**。

创作链路的表达为：收集参考图 → 理解并沉淀图词 → 在画布组织参考与提示词 → 生成与比较视觉方案 → 继续修改。它描述产品目标，不代表两端数据已自动接通。当前 Library 与 Canvas 仍独立使用，统一账号、额度和跨端素材流转未实现；Canvas 云端创作尚未开放。

## 本轮范围与保留内容

- 以原 CloudBase 展示站的 `opendesign/mockups/archbuddy-showcase/` 为源码，保留原首页所有已确认的正文、案例、图片、下载入口、隐私链接和交互资源。
- 在原首屏后新增统一设计链路总览，说明图词库与 Canvas 在同一创作过程中的职责。
- 在原三大功能展示后新增 Canvas 画布介绍、创作步骤及 `canvas.archbuddy.top` 使用入口。
- 新增内容沿用原站的深绿、暖白、浅绿配色和排版语汇；画布流程图明确标注为结构示意，未冒充真实产品截图。
- 原展示中的“外部生图”只描述扩展单独使用时的历史工作流程，新增说明明确区分 Canvas 的独立画布能力。
- 不修改扩展、CloudBase 后端、匿名额度、用户数据、隐私站或旧展示站的已发布内容。

## 资源与发布边界

| 资源 | 当前状态 | 本轮处理 |
| --- | --- | --- |
| 原 CloudBase 展示站 | 原公网继续服务 | 只读取源码与公开资源，未改动原 CloudBase 应用 |
| GitHub `Interarchy/downPIC` | `direction/plugin` 为插件方向 | 从该分支创建 `feature/archbuddy-unified-home`，仅增量编辑展示页 |
| Vercel `archbuddy-official-site` | 新建静态项目，根目录为原展示站源码目录 | 功能分支生产部署 READY，`www.archbuddy.top` 别名已指向此部署 |
| Vercel `archbuddy-canvas-preview` | 仍持有 `www.archbuddy.top` 的项目域名登记及根域 308 跳转 | `canvas.archbuddy.top` 的阿里云 CNAME 已生效，Vercel 配置正确，部署首页返回 200 |

项目目标为 `www.archbuddy.top` 展示统一官网，`archbuddy.top` 跳转至 `www`，`canvas.archbuddy.top` 指向画布应用。图词库不需要独立公网域名。

## 已做检查

- 新版首页移除两段新增 HTML 后，与原首页逐字节一致；新版样式以原样式为完整前缀追加。
- 新增 HTML 标签成对、页面 ID 无重复，新增样式花括号数量匹配。
- Vercel 功能分支预览部署为 READY；预览首页、样式表与案例首页均返回 HTTP 200。
- 浏览器渲染核对 390 px 手机和 1100 px 桌面新增区域；修正桌面标题孤字问题。360 px 与 1100 px 布局计算均无横向溢出。
- 最新发布验证状态见下文；原站下载包字节哈希尚未在新部署独立复核。

## 2026-10-22 上线核对与待办

- 阿里云 DNS 已添加 canvas CNAME，Vercel 检查为配置正确；Canvas 项目部署首页 HTTP 200。第三方抓取工具仍未成功直连新自定义域名，需用普通浏览器复核 HTTPS。
- 统一官网功能分支生产部署 READY。www.archbuddy.top 的访问别名已切至新官网，首页、样式、品牌图标、脚本均返回 HTTP 200；archbuddy.top 保留到 www 的 308 跳转。
- 访问别名已切换，但 www.archbuddy.top 的**项目域名登记**仍属于旧 Canvas 项目。后续 Canvas 生产部署可能重新分配 www。Vercel 插件缺少项目域名 move 操作，须在 Vercel 控制台执行域名转移，或调用官方项目域名移动 API；完成后复核旧、新两个项目的域名列表。
- 官网项目目前由功能分支手动生产部署。须配置可持续的生产来源，避免从缺少展示目录的 master 自动构建失败。
- 原案例首页在预览部署 HTTP 200。测试集二进制下载的抓取工具传输中断，尚未完成实际下载和包哈希比对。商店入口、隐私说明、Canvas 自定义域名、移动端真实公网仍待人工验收。

官网首页已对外可访问；项目域名归属与持续部署尚未完成，因此不能将访问别名切换视为完整迁移。

# ArchBuddy 统一官网首页：增量调整与发布记录

更新日期：2026-10-22。状态：统一官网已部署到 `www.archbuddy.top`，项目域名正式迁移完成；持续部署来源仍待配置。

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
| Vercel `archbuddy-official-site` | 新建静态项目，根目录为原展示站源码目录 | 功能分支生产部署 READY，`www.archbuddy.top` 与根域项目域名均已正式归属此项目 |
| Vercel `archbuddy-canvas-preview` | 仅保留 `canvas.archbuddy.top` 项目域名，`www` 与根域已正式移至官网项目 | `canvas.archbuddy.top` 的阿里云 CNAME 已生效，Vercel 配置正确，部署首页返回 200 |

项目目标为 `www.archbuddy.top` 展示统一官网，`archbuddy.top` 跳转至 `www`，`canvas.archbuddy.top` 指向画布应用。图词库不需要独立公网域名。

## 已做检查

- 新版首页移除两段新增 HTML 后，与原首页逐字节一致；新版样式以原样式为完整前缀追加。
- 新增 HTML 标签成对、页面 ID 无重复，新增样式花括号数量匹配。
- Vercel 功能分支预览部署为 READY；预览首页、样式表与案例首页均返回 HTTP 200。
- 浏览器渲染核对 390 px 手机和 1100 px 桌面新增区域；修正桌面标题孤字问题。360 px 与 1100 px 布局计算均无横向溢出。
- 最新发布验证状态见下文；原站下载包字节哈希尚未在新部署独立复核。

## 2026-10-22 上线核对与待办

- 阿里云 DNS 的 canvas CNAME 已生效。初次访问因缺少 HTTPS 证书失败，已补签自动续期证书；独立浏览器渲染 `canvas.archbuddy.top` 返回 HTTP 200，识别出 Canvas 限额预览页面。
- 统一官网功能分支生产部署 READY。`www.archbuddy.top` 首页、样式、脚本、品牌图标、案例页和测试集下载地址的 HEAD 请求均返回 HTTP 200；独立浏览器渲染识别出新增的统一设计链路。
- 用户在 Vercel 目标项目完成 Move Domain；复核确认 `www.archbuddy.top` 和 `archbuddy.top` 的项目域名登记均归属 `archbuddy-official-site`。根域仍 308 跳转至 `www`；Canvas 项目仅保留 `canvas.archbuddy.top`。
- 官网项目目前由功能分支手动生产部署。待配置可持续的生产来源，避免默认 `master` 缺少展示目录导致后续自动构建失败。
- 测试集下载地址可达，但尚未完整下载及比对原包哈希；商店入口、隐私说明与移动端真实公网体验仍待人工验收。
- 账号、额度和素材自动流转尚未接通；Canvas 现为限额预览，官网已明确这一边界。

官网与 Canvas 的公网入口及项目域名归属已按单一官网架构落位。后续代码发布应先确定官网项目生产分支，并保持本页内容与线上一致。

# ArchBuddy 统一官网首页：增量调整与发布记录

更新日期：2026-10-22。状态：功能介绍增量稿已在独立预览部署验证；正式域名尚未切换。

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
| Vercel `archbuddy-official-site` | 新建静态项目，根目录为原展示站源码目录 | 在功能分支上生成受保护预览，未绑定正式域名 |
| Vercel `archbuddy-canvas-preview` | 当前绑定 `www.archbuddy.top` 和根域跳转 | 新增 `canvas.archbuddy.top` 项目域名；阿里云 DNS 尚缺少对应 CNAME |

项目目标为 `www.archbuddy.top` 展示统一官网，`archbuddy.top` 跳转至 `www`，`canvas.archbuddy.top` 指向画布应用。图词库不需要独立公网域名。

## 已做检查

- 新版首页移除两段新增 HTML 后，与原首页逐字节一致；新版样式以原样式为完整前缀追加。
- 新增 HTML 标签成对、页面 ID 无重复，新增样式花括号数量匹配。
- Vercel 功能分支预览部署为 READY；预览首页、样式表与案例首页均返回 HTTP 200。
- 浏览器渲染核对 390 px 手机和 1100 px 桌面新增区域；修正桌面标题孤字问题。360 px 与 1100 px 布局计算均无横向溢出。
- 尚未完成真实阿里云 DNS 配置、Canvas 新域名访问、正式域名切换后的 HTTP/资源/下载验证。原站下载包字节哈希未在新预览中独立复核。

## 正式切换顺序

1. 在阿里云 DNS 添加 `canvas` 的 CNAME，指向 Vercel 给出的 `0fc70fa47512bed4.vercel-dns-017.com`，再验证 HTTPS 和 Canvas 的受控预览状态。
2. 将统一官网功能分支作为正式可持续部署源，确保不从缺少展示目录的 `master` 构建。
3. 将 `www.archbuddy.top` 从 Canvas 项目移至官网项目，同时保留根域到 `www` 的 308 跳转。正式切换前复核现有项目域名与回滚目标。
4. 逐项核验首页、样式与图片、案例页、商店入口、测试集下载、隐私说明、Canvas 入口与移动端布局；记录实际公网结果。
5. 只有上述检查完成后，才把本记录状态改为“正式上线”。

当前不能把预览 READY 视为 `www.archbuddy.top` 已迁移完成。
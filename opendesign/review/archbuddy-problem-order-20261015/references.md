# 01 流程图改版：已核实的网络参考

核查日期：2026-10-15。范围：只读浏览公开网页，在本 review 目录保存页面截图和核查记录；不登录、不调用 Figma 写工具、不部署，不涉及云端资源。

方法：通过独立的无登录 Chrome 打开原网页或原 PDF，在浏览器内渲染、截图，再用 view_image 实际查看；未下载远程图片或 PDF 作为绕过展示限制的手段。截图及 HTTP/页面记录位于 `references/`。

## 1. Whimsical User Journey Map — 已看到完整图面

- 原页：https://whimsical.com/templates/user-journey-map
- 证据：`references/whimsical-journey.png`
- 实际所见：五个阶段横向同基线，四条箭头规则衔接；左侧固定 Thoughts、Pain Points、Sentiment、Opportunities 行名；每列内容与阶段对应。痛点采用轻量正文，行间留白区分信息层。
- 可借鉴：主链保持同一阅读方向；断点说明单设一行；同类内容共用字级和基线，减少重复卡片外框。

## 2. Whimsical User Flow — 已看到完整图面

- 原页：https://whimsical.com/templates/user-flow
- 证据：`references/whimsical-user-flow.png`（原页内嵌画布截图）
- 实际所见：多数矩形节点等宽等高，连接线接在边中点；Yes/No 标签贴近对应分支；颜色区分节点类别。实际预览中的判断节点是绿色矩形，不能依据网页介绍误写成菱形。
- 可借鉴：统一节点尺度和文字位置；说明紧邻所属箭头；强调色承担分类或断点意义，不给每一步任意分配颜色。

## 3. Dribbble / Taras Bakusevych — 已看到附件 PDF，shot 主图未加载

- 作品页：https://dribbble.com/shots/14245670
- 原附件：https://cdn.dribbble.com/users/860779/screenshots/14245670/downloads/Customer%20journey%20map%20template.pdf
- 证据：`references/dribbble-taras-pdf.png`、`references/dribbble-taras-shot.png`、`references/dribbble-capture-report.json`
- 核查结果：作品页返回 HTTP 202，标题和作者可见，但主图是灰色占位，不能声称看过 shot 主图。原 PDF 返回 HTTP 200，Chrome PDF 预览器成功显示完整 1 页，已实际查看。
- PDF 实际所见：左侧窄栏容纳 Persona、Scenario and goals 与 As-Is/To-Be；右侧大表划为 Stages、Doing、Thinking & feeling、Touchpoints & tools 四条横向泳道。蓝灰粗体行名统一左缘，细浅边界与大片留白降低噪声。它是空白模板，不能作为具体节点和箭头排版的证据。
- 可借鉴：阶段、行为、感受分别分层；标题比解释清楚但不过度放大；用轻分隔和留白归组信息。

## 4. Figma 官方页 — 仅确认营销插画，不作为完整模板图面依据

- https://www.figma.com/templates/customer-journey-map/
- https://www.figma.com/templates/website-flowchart-example/
- 证据：`references/figma-journey.png`、`references/figma-flow.png`
- 两个官方页均可打开，实际看到首屏插画：体验折线与单行图形连接。未查看到 Figma Community 的完整编辑画布。另尝试官方 sticky-notes 页中的旅程图片，但目标元素不可见，截图失败，不纳入已看过的参考。

## 应用于 ArchBuddy 的设计推导

以下是本项目的设计判断，不是引用模板中的原话：

1. 保留五步主链，五个节点等宽等高；第 4 步以“生成 AI 效果图”为主标题、“多轮优化”为次级说明，其余节点也预留一致标题区域。
2. 四条箭头分别对应“参考难复用 / 意图说不清 / 修改没依据 / 图词难沉淀”。短标签紧贴对应箭头，长解释另放下层，避免文字跨线或游离。
3. 四个断点与三个大痛点不是一一对应关系。下方明确写“归纳为 3 类问题”，呈现收集时被打断、表达与优化困难、成果难以复用；不要强行把三张卡片对齐四条箭头。

## 5. 本轮环形方向的补充（2026-10-15）

- [FigJam 官方 Causal Loop Diagram](https://www.figma.com/templates/causal-loop-diagram/)：页面文字说明因果环形关系与方向箭头。已用独立 Chrome 打开官方图片资源并实际看图，见 `references/figma-causal-loop-overview.png` 与 `references/figma-causal-loop-asset-render.png`；该图是介绍页面的彩色示意画，不是完整可编辑模板画布。
- 实际图面是多个节点环绕、由弧线箭头连接；本项目只借鉴“节点围绕回路、方向明确”的组织方式。三处有意断开的圆环、A/B/C 对应右侧三类痛点和深绿/暖白对照，均为本项目针对 ArchBuddy 的独立设计。
- Dribbble circular-process 搜索页在独立 Chrome 中只显示骨架占位图，见 `references/dribbble-circular-search.png`；不能把搜索缩略图称为已看到的排版依据。

## 6. 用户提供的环形信息图（2026-10-15）

- 用户在本轮对话直接附图：白色背景、中央标题、环上多段扇区与编号、外侧放射状短说明。它是布局参考，不是 ArchBuddy 的最终内容或配色来源。
- 对第三版的取舍：取消图外深色矩形；把五个步骤放进同一个同色系分段环，外围保留完整理想细环；只在三个已确认的衔接处断开并用 A/B/C 对应右侧问题。保留用户要求的左环右说明，而不照搬原图八步骤、彩虹色或占位文案。

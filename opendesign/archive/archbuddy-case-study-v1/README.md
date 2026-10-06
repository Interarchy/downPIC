# ArchBuddy 五页产品案例

## 已确认的展示目标
用于未来个人简历网站，让面试官理解项目所有者的业务梳理与产品判断，同时快速理解产品使用流程。用户已确认五页内容框架及统一、连贯的视觉；沿用现有深绿色品牌，采用建筑参考大图与留白排版。

## 页面与叙事
1. index.html：项目概览；产品价值、职责、形态与真实阶段。
2. problem.html：问题与机会；保存、找回、表达三处断点及 MVP 范围。
3. workflow.html：核心体验；五步真实截图导览、局部材料替换示例。
4. decisions.html：产品判断；人工控制、视觉描述检索、本地 MVP 三项取舍与代价。
5. outcomes.html：迭代与验证；演进、个人贡献、已有证据和未来任务验证。

## 使用
- 直接用浏览器打开 index.html。五页、CSS、JS、Logo、建筑图及截图都在此目录内，不依赖外网、在线字体或模型服务。
- 或在仓库运行 node opendesign/serve.mjs，本地地址 http://127.0.0.1:8766/mockups/archbuddy-case-study/ 。
- 上网站时复制整个 archbuddy-case-study 文件夹即可。链接均为目录内相对路径，可作为项目案例子目录使用。
- 本次没有部署或发布至公网；本地预览仅监听 127.0.0.1。
- assets/tokens.css 是本次设计系统的便携副本；修改颜色时同步 opendesign/design-systems/archbuddy-portfolio/colors_and_type.css。

## 交互
- 顶部五章导航与底部衔接入口串联全篇。
- 核心体验页：步骤切换、截图放大、材料替换。
- 产品判断页：三项决策切换、数据与成本边界展开。
- 迭代页：事实与演示口径展开。
- 支持桌面与窄屏排版，动效仅用于进入内容时的轻微过渡。

## 事实与素材依据
- docs/面试准备素材.md：问题来源、个人贡献、AI 分工与评测边界。
- docs/ARCHBUDDY_PROGRESS.md：截至 2026-10-01 的 V4 本人验收、后端部署与新商店草稿状态。
- docs/ARCHBUDDY_PRODUCT_FORM.md：侧栏、本地图词库与 AI 服务的分工。
- docs/BRAND.md：品牌绿色与 Logo。
- prototype/assets/architecture-board.png：已有建筑演示图板。
- extension/store/assets/v4/01…05 PNG：实际 V4 界面、独立演示数据、手工文本；没有虚构模型输出。

产品示例没有用户私有图库或访问密钥。外部用户效率、检索质量、持续复用和成本提升均未取得完整对照数据，不将机制改善写成效果成绩。本轮不涉及云端资源、生产代码、统计、模型调用或额度变更。

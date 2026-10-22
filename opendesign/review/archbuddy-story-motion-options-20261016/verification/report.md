# 首屏与 01/02 转场三版独立核查

日期：2026-10-16。范围仅本地候选 archbuddy-story-motion-options；未修改实现、正式站或云资源。

结论：三版可供用户比较，无阻断问题。核查使用本机 Chrome 与真实 mouse.wheel 滚动，不用直接设定动画进度。共保存 31 张实际截图（含方案三定向复核两帧）；重点目视三版首屏边界、01/02 完整阅读、中间切换、方案一 03 释放、手机断点图与完整 AI 链路、短屏回退。

- 1440×1000：relay/focus/rail 各采集首屏、分界、01、切换中间、02、03、反向返回七帧。三版均启用 pinned；中间进度约 0.501，02 到 1，反向返回 0。固定栏下方保留间距，完整阅读帧无裁切、文字碰撞。三版首屏与正文底色均有区别。
- 360×800：三版均 natural 纵向阅读，图面无横向溢出。另完整查看方案一 AI 图：外部生图说明可读，生成/迭代双向箭头及复用返回线保留。
- 1366×768：进入 natural 回退，不强行缩小或锁屏；内容可继续往下读。这是当前适配选择，短笔记本视窗不会演示完整横向切换，不能声称所有屏幕动效相同。
- 01 五阶段、三处断点及三条痛点保持。02 两条链路节点数为 3/5，产品标记为 2/4；手工方案创作与外部生图职责完整保留。颜色一致。
- 顶部三个模式按钮均切换正确并返回顶部；从头体验回到顶部；业务链路导航到 02 完整阅读状态；首屏大图弹窗打开/关闭正常；提示词画廊可切至评估偏差。
- 减弱动态偏好：natural，两个章节 opacity=1、transform=none、inert=false，内容不隐藏。
- 31 截图场景无横溢。执行中的 JavaScript 异常 0、资源请求失败 0。代码仅 passive scroll 订阅，无 wheel/touchmove 拦截；链接 click.preventDefault 仅用于章节定位。story-layout 监听存在，切换宽度后流程图重绘。

设计反馈已修复并定向复核：方案三遮罩改为先显示左侧内容，中间帧现能先看见 02 标题及方案创作链路；完整 02 帧依旧无碰撞、无裁切、无横溢。只重查该模式的两帧，未重复全量。最新证据为 rail-transition-revised.png、rail-workflow-revised.png，原两帧保留作修前记录。

证据：results.json、supplement.json、*.png；capture.cjs 与 supplement.cjs 是此次一次性核查脚本，未新增测试框架。代表截图 relay-boundary.png、relay-transition.png、rail-transition.png、rail-workflow.png、relay-mobile-ai.png、relay-short.png。

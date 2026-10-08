# ArchBuddy

建筑、室内与景观设计师的参考图助手。

ArchBuddy 帮助设计师把浏览案例时选中的参考图用于新的设计工作：一键下载并分类保存，或提取图中的色彩、材质、光照与空间特征，生成可复制的中文结构化生图提示词。

## 当前产品：Chrome 插件

- **下载与分类**：网页图片悬浮操作，选择预设或自定义项目类型；保存后可直接在文件夹中定位图片。
- **反推提示词**：选择网页图片，或在侧栏粘贴、拖入参考图；确认发送后由服务端调用多模态模型。
- **结构化输出与效果优化**：将参考图转为可编辑的中文 Prompt，并对照生成图迭代、确认入库。
- **本地图词库**：导入与整理项目图片，保存已确认提示词，在输入时关键词匹配、提交后结合本地向量检索。

整体生成准则要求保持原视角与构图、以 4K 为目标并追求高品质效果图。这些是交给后续生图模型的文字指令；ArchBuddy 本身不生成或放大图片。

## 本地使用

在 Chrome 扩展管理页启用开发者模式，加载本仓库的 `extension/` 文件夹。以后更新代码后，重新加载扩展并刷新测试网页即可。

新图片保存至 `下载/ArchBuddy/项目类型/网页标题/`。更名不会移动此前的下载文件，已有分类和开关设置继续保留。

当前源码为 **V4.1（扩展版本 0.6.1）**。本轮增加图片来源网页回访、修复自动概要描述下载时序，并简化采集浮框、图词库分类管理和侧栏入口。V4.1 仅提交与推送到 GitHub，未部署 CloudBase、未更新 Chrome Web Store；此前登记的商店版本为 0.6.0（V4），后端为 archbuddy-api-014。模型 Key 与签名密钥仅在服务端。完整变更和边界见 [V4.1 版本记录](docs/ARCHBUDDY_V4_1_RELEASE.md)。

## 文档入口

- [插件使用与开发](extension/README.md)
- [商店介绍](extension/store/listing-zh-CN.md)
- [上架检查清单](extension/store/RELEASE_CHECKLIST.md)
- [隐私政策草案](extension/store/privacy-policy.md)
- [完整反推提示词](plugin-prototype/analysis-instructions.md)
- [品牌规范](docs/BRAND.md)
- [插件 vNext PRD 初稿：从 Reference 到 Render](docs/ARCHBUDDY_PLUGIN_VNEXT_PRD.md)
- [CloudBase 上海环境部署](cloudbase/README.md)
- [CloudBase 多项目隔离与每次检查](docs/CLOUDBASE_PROJECT_ISOLATION.md)
- [开发代理长期约束](AGENTS.md)

本分支为 `direction/plugin`。根目录的 PRD、SPEC、UX Flow 等保留桌面素材库原方案作为历史参考；V4 的图词库和自然语言搜索属于插件内本地页面，独立桌面客户端与云端素材同步不属于当前版本。

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

当前源码为 **0.6.0（V4）**，用户已验收本地图词库和云端语义搜索；CloudBase 后端 `archbuddy-api-012` 已全量上线。V3 曾在 Chrome Web Store 上线；用户报告原发布账号失窃、原商品现不可下载。0.6.0 商店 ZIP、填写稿、公开隐私页和五张 V4 截图已准备，按用户决定由新账号创建同名商品提交，当前尚未上传或发布。模型 Key 与签名密钥仅在服务端。

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

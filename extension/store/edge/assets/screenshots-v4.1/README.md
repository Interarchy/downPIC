# Edge V4.1（0.6.1）商品截图

以下五张 PNG 均由最终 Edge 候选 ZIP 在独立 Microsoft Edge 配置中加载实际扩展后截取，规格为 1280×800、RGB 三通道、无透明层。向 Microsoft Partner Center 的“截图”栏逐张上传 PNG，不上传 ZIP。推荐顺序为 01 → 02 → 04 → 05 → 03。

| 文件 | 内容 |
| --- | --- |
| `01-project-library-1280x800.png` | 按项目类型和项目名称浏览参考图片 |
| `02-image-description-1280x800.png` | 图片列表、单图详情与核心视觉特点 |
| `03-prompt-library-1280x800.png` | 已确认提示词、分组和版本历史 |
| `04-prompt-builder-1280x800.png` | 真实侧栏的参考图分析与整体 Prompt 预览并排排版 |
| `05-prompt-optimization-1280x800.png` | 真实侧栏的生成图导入与基本提示词选择并排排版 |

采集依据见 `capture-evidence.json`。固定候选包 SHA-256：`301E23CFEAC0DF4A01BADFA4C89A22F43B3F9D94A54C90A757D0F7B5A4F09561`；截图专用 ZIP：`extension/dist/edge/ArchBuddy-Edge-V4.1-0.6.1-screenshots.zip`，SHA-256 `E3ED00C16339C280C21967DD5873DD09315831F206359D557453E26C049BBC4D`。ZIP 仅含上述五张 PNG，方便解压后逐张上传。

素材采用仓库内 `prototype/assets/architecture-board.png` 及手工演示文字，不含用户私人图库或真实账号。截图期间模型请求数为 0、页面脚本错误数为 0；没有展示虚构评估结果。服务连接状态只通过公开 `/api/status` 获取。04、05 在 1280×800 排版中嵌入实际 Edge 侧栏截图，背景文字是功能说明。Chrome 0.6.0 旧图保留在另一目录，不用于本次 Edge 提交。本次仅处理本地截图文件，不涉及 CloudBase 资源变更。

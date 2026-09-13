# downPIC 下载分类与提示词反推原型

2026-09-13，独立于旧桌面素材库方向的交互验证。当前仅供个人试用，桌面素材库、自动解析和自然语言检索暂停开发。

## 运行

先配一次密钥（不写进源码，用 Windows 当前用户加密存到 `runtime/`）：

```powershell
powershell -ExecutionPolicy Bypass -File plugin-prototype/scripts/configure-deepseek.ps1
```

如果 Windows PowerShell 的隐藏输入框无法粘贴，可先从 DeepSeek 控制台复制 Key，再运行：

```powershell
powershell -ExecutionPolicy Bypass -File plugin-prototype/scripts/configure-deepseek.ps1 -ApiKeyFromClipboard
```

该模式只把 Key 转成当前 Windows 用户可解密的 DPAPI 密文，不会在终端显示或将明文写入文件。

再从仓库根目录启动，访问 http://127.0.0.1:4186/plugin-prototype/ 。不需要安装依赖。启动脚本会在当前 PowerShell 内解密，再只通过进程环境交给 Node；明文仍不落盘。未指定路径时，图片默认保存到 `plugin-prototype/runtime/library/`：

```powershell
powershell -ExecutionPolicy Bypass -File plugin-prototype/scripts/start-prototype.ps1
```

如果 Windows DPAPI 无法解密（常见于受限终端或用户上下文变化），启动脚本会自动停下来，请在此时从 DeepSeek 控制台复制 Key，再回到终端按回车。该次 Key 只进入 Node 子进程环境，关闭服务即失效，不会写入磁盘。也可以显式使用：

```powershell
powershell -ExecutionPolicy Bypass -File plugin-prototype/scripts/start-prototype.ps1 -ApiKeyFromClipboard
```

要改用自己的素材目录，可以传入：

```powershell
powershell -ExecutionPolicy Bypass -File plugin-prototype/scripts/start-prototype.ps1 --library-root="F:\downPIC素材库"
```

也可以直接设置环境变量 `DEEPSEEK_API_KEY` 后运行 `node plugin-prototype/serve.mjs`。

## 本轮范围与边界

- 网页图片上并列展示保存图片、反推提示词两个入口，预设与自定义类型沿用原有业务模型。
- 点击反推会锁定所选图片，在右侧展示预览、分析过程和中文结构化结果。无需先保存。
- 插件图标打开/关闭面板，粘贴图片支持 Ctrl+V 及主动读取剪贴板。仅接收不超过 10 MB 的静态 PNG/JPEG/WebP。
- 关闭、调整宽度或切换功能不会清空本次图片与结果；更换图片时取消前一次分析。刷新页面会重置本次会话。
- 整体生成准则固定置顶并包含在一键复制文本中。四千像素级输出是生图要求，实际尺寸仍需在生图工具设置。
- 侧栏宽度 360–520 像素可调。宽屏采用挤压网页的双栏方式，窄屏使用覆盖式面板；均不改变参考图本身比例。
- **保存会真的写磁盘**：落点是 `素材根目录 / 项目类型 / 网页标题项目名 / 图片`，同项目内按内容 SHA-256 去重，并在图片旁写一份 `.source.json` 来源旁车。
- **反推会真的调用 DeepSeek 视觉模型**，不是预设结果。产品内显示名为 `deepseek-flash`；使用 DeepSeek 官方端点时，服务端映射到 `deepseek-v4-flash-vision-exp`。粘贴的图片同样走真实模型。
- 三张示例图是 `prototype/assets/architecture-board.png` 的 CSS 裁切（`index.html` 里没有 `<img>`），所以浏览器侧要从精灵图裁出 512×512 再上传。
- 未改动旧原型、插件安装配置或注册项。

## 三条边界规则

1. 密钥绝不出现在任何 HTTP 响应体、日志或错误文案里。
2. `/api/analyze` 绝不写磁盘；`/api/capture` 绝不调模型——反推要能独立使用，不必先保存。
3. 落盘只经 `archive.mjs`，外网只经 `vision-analyzer.mjs`。

浏览器侧不持密钥，只与 `127.0.0.1` 通信；所有花钱和写盘的动作都收在本地服务进程里。本地服务仍然防 CSRF：`/api/*` 的 POST 要求自定义头 `x-downpic: 1`（逼出预检，预检一律不批准）并校验 `Origin`。

## 设计决定

采用白色面板与克制的绿色交互提示，图像承担主体表达；结果以连续分项文本呈现，避免把提示词拆成难复制的标签卡片。

颜色：纸面 `#f7f8f7`、面板 `#ffffff`、文字 `#24332d`、次级文字 `#64716a`、交互 `#25634b`、分隔 `#dce3de`。中文使用系统微软雅黑/苹方，正文 13–14px，标题 17px；网页标题 30–48px。

布局：模拟浏览器栏在顶；左侧可独立滚动的案例网页，右侧面板从上至下为功能切换、图片输入、反推、结构化结果；底部固定复制入口。已对照本次任务保留完整参考图，取消营销卡片、历史库及桌面端入口。

## 验收任务

1. 悬浮参考图，保存到预设类型，再重复保存，观察归档和重复提示。
2. 自定义类型输入空格应禁用保存；输入“山地酒店”保存后，新默认在其他工具条和面板同步。
3. 点击图片“反推提示词”，确认预览正确、原图比例不变、固定整体准则排第一。
4. 复制全部，粘贴到文本编辑器核对九个分项与首段准则。
5. 关闭再打开面板，确认结果保留；调节宽度评估网页挤压。
6. 在分析中取消或切换到另一张图，确认旧任务不覆盖新结果。
7. 从任意应用复制图片，打开面板按 Ctrl+V，确认真实预览与真实反推。非图片和超限输入应明确反馈，旧内容保留。
8. 打开 `?scenario=analysis-error`，首次分析演示失败（在发请求前短路，不花钱）；重试应成功。
9. 保存一张示例图后，在资源管理器中打开素材目录，确认两级目录、图片与同名 `.source.json` 都在；再存一次同一张图，确认提示重复且目录文件数不变。

下一阶段：根据原型反馈确定面板布局，再接入真实扩展侧栏与真实网站适配。新方向的模型提示词见 `analysis-instructions.md`。

## 本轮验证记录

### 模型与输出契约（Step 0，2026-09-13 实测）

- 产品内短名称 `deepseek-flash` 在 DeepSeek 官方端点映射到 `deepseek-v4-flash-vision-exp`；普通的 `deepseek-v4-flash` 与 `deepseek-v4-pro` 不接收图片，因此反推链路禁用它们。
- 端点 `https://api.deepseek.com/anthropic/v1/messages`，鉴权同时带 `x-api-key` 和 `authorization: Bearer`。响应是 **Anthropic Messages 格式**，不是 OpenAI 的 `choices[]`。
- 实测响应含 `thinking` 块且排在**第一个**，正文在后面的 `text` 块。提取文本必须跳过 `thinking`，否则会把模型的内部推理当成分析结果返回给用户。
- 真实单次调用耗时 **15.7–23.6s**（无流式输出），所以加载态必须带秒数计时。
- **格式遵从度良好**，因此输出契约采用「文本 + `【】` 解析」而不是 JSON：指令第 33 行本来就要求不要嵌套列表或表格，且被 `max_tokens` 截断时文本还能救回前几项，截断的 JSON 无法部分恢复。
- 模型会自己 echo 一整段【整体生成准则】，还多带一句文档里的补充说明。因此首段**永远取自代码常量** `PRINCIPLE`，不信任模型——否则用户复制走的是未经批准的版本。

### 自动化测试

`node --test plugin-prototype/prompt-model.test.mjs plugin-prototype/tests/*.test.mjs prototype/tests/*.test.mjs`：**131/131 通过**。

| 测试文件 | 覆盖 |
|---|---|
| `prompt-model.test.mjs` | 固定首段、完整复制文本序列化、图片输入边界（原有） |
| `tests/analysis-contract.test.mjs` | 围栏切分、`【】`解析（含真实输出 fixture）、首段覆盖、分项排序与过滤 |
| `tests/archive.test.mjs` | 两级目录、SHA-256 去重、三级消歧、旁车字段与无 BOM、`..` 穿越与保留名、格式校验 |
| `tests/developer-settings.test.mjs` | 密钥解析顺序、provider 校验、损坏配置降级、**真实 DPAPI 往返** |
| `tests/vision-analyzer.test.mjs` | `thinking` 块跳过、请求形状、超时/取消/上游失败的区分、密钥脱敏 |
| `tests/server.test.mjs` | 五条路由、同源守卫、20MB 上限、缓存、"两个 API 互不越界"、客户端断开传播 |
| `tests/crop-geometry.test.mjs` | 裁剪区与 CSS `background-position` 对账、缩放不放大 |
| `tests/api-client.test.mjs` | 错误码到中文提示的完整映射 |
| `tests/ui-wiring.test.mjs` | `app.mjs` 引用的 id 都在 `index.html` 里、假实现已删净、浏览器侧不持密钥 |
| `tests/vision-image.test.mjs` | `drawImage` 的源区与画布落点（错位会静默产出空图，肉眼要等点开才发现） |

### 端到端（真实密钥、真实模型、真实磁盘）

- `curl 127.0.0.1:4199/api/status` 返回 `configured/libraryRoot`，响应体不含密钥。
- 无 `x-downpic` 头的 POST 返回 **403**。
- 用精灵图裁出的真实 512×512 PNG 打 `/api/capture`：第一次 `state: "imported"`，磁盘上出现
  `文化建筑/建筑与自然参考图集/20260913-135246_1a099534.png` 与同名 `.source.json`；第二次 `state: "duplicate"`，目录文件数不变。
- 落盘文件解码后与源裁切**逐像素一致**；旁车首字节为 `7b`，确认无 BOM。
- `/api/analyze` 真实调用：HTTP 200、15.7s、9 个分项、`truncated: false`，首段逐字等于批准版本；同一张图第二次请求 **0.0s 命中缓存**。
- 分析响应与 status 响应均不含密钥。

### 仍待人工确认

- 浏览器里的完整交互（悬浮工具条、粘贴、取消、失败后重试）本轮未做自动化验证。
- 示例图的「网页标题/来源 URL」是 fixture，不是真实抓取。**真实网站适配（gooood / 小红书 / Pinterest）属于 Chrome 扩展阶段，不在本轮。**
- 本轮不做 SSE 流式输出；若实测经常超过 60 秒，再考虑。

# V3 效果优化实现验证记录

> 当前工作树已更新为 0.5.2。最新交互以 [侧栏流程修订](interaction-revision.md) 为准；下方早期 ZIP 哈希和“复制后提交”的记录仅代表历史轮次，不代表当前源码产物。

## 2026-09-24：三图并发、整体编辑与状态色

- 去除全局分析锁，每张图独立请求、计时、报错；完成仅刷新该图，其他图片编辑不被覆盖。
- 服务默认并发容量为 3，本地脚本显式设置该值；并行首请求共用匿名身份与会话初始化。
- 整体 Prompt 按段直接编辑；上方替换只更新同一维度。生成准则通过 principleText 随版本和效果优化工作稿保留。
- 评估状态文字增加绿、黄、红、灰；其他部分保留既有风格。
- 已通过 sidepanel.mjs、shared.mjs、background.mjs、server.mjs 的 node --check、启动脚本 PowerShell 解析、Manifest JSON 解析、52 个唯一 DOM ID 与脚本引用及消息路由检查。
- 本地服务重启后，GET /api/status 返回 configured=true、mode=local-process-test、anonymousSessionsEnabled=true、quotaMode=process-test。
- 本轮没有由 Codex 发起模型调用或新增自动化测试；用户于 2026-09-24 确认本地 V3 人工验收通过。该确认不替代独立的模型服务日志证据。
- 未部署；未操作 CloudBase 及其他项目资源。提交、推送和发布状态以 Git 记录与控制台状态为准。

## 2026-09-22：三参考图与结果直接编辑

- 提示词构建：最多三张图独立分析、就地编辑与选用，已选内容实时同步到底部加高预览；整体确认后才入最近五份提示词库并解锁复制。
- 效果优化：生成图在上方，下拉选择已确认基本提示词，明确发送后评估；结果以符合程度和差异提醒加一份可编辑原文呈现，确认修改后保存版本。
- 不展示重复当前方案、来源图、独立修改草稿、建议编辑区和版本时间线；保存的来源关联及旧版本仍保留。
- 根因修复：新编辑会话不再经过把模块恢复为旧版本快照的 `draft.save`，加入／替换直接更新会话模块并重新编译预览。
- 静态通过：`node --check` 检查 sidepanel.mjs、background.mjs、shared.mjs；52 个 DOM ID 唯一且脚本引用全部存在；所有消息都有后台路由；新侧栏不再调用 intent.add/draft.save/draft.create；Manifest 权限未增加；`git diff --check` 无空白错误。
- 真实 Chrome 视觉布局、三张真实图片调用、确认版本后的真实模型评估尚待用户人工验收，本轮没有调用模型。没有新增或运行自动化测试。
- 仅修改本地扩展代码和文档；未上传、部署或操作 CloudBase 数据和其他项目资源。旧 0.5.0 压缩包不是本轮交付，应直接重新加载仓库 extension/ 目录。

**记录日期**：2026-09-22
**分支**：`direction/plugin`
**范围**：本地代码、静态检查、本地白名单打包和不调用模型的 `process-test` 冒烟验证
**云端结论**：未部署 V3，未创建、读取、列举、修改或删除任何 CloudBase 数据、存储、身份、日志、密钥、统计、预算或其他项目资源。

## 1. 已完成实现

- 顶部一级入口固定为“图片采集、提示词构建、效果优化”。
- V2 草稿可懒规范化为 V3 PromptScheme；首次进入效果优化时建立只读文本基线，旧草稿没有图片字节时显示缺失状态。
- 方案采用的完整来源图按明确 `schemeId` 写入 `archbuddy-local/source-images-v1`；同方案同来源复用，支持明确“补图”，不上传云端。
- 单张生成图只写会话存储；用户再次确认后才调用 `/api/v3/evaluate`。
- 评估只覆盖当前版本中启用的可观察模块，状态限制为 `compliant/partial/deviation/unknown`，缺失、重复或额外模块整次拒绝。
- 用户可选择部分建议、直接编辑和锁定模块；完整 Prompt 成功写入剪贴板后才提交下一只读版本。
- 最近最多 5 份方案、每份最多 5 个版本；历史版本只读，删除和淘汰均限定明确方案。
- 当前 V3 不发送新增行为统计事件；完整网页素材库继续属于后续独立 Spec。

## 2. 已执行并通过

### 2.1 静态代码门槛

以下 9 个文件均执行 `node --check` 并以退出码 0 结束：

- `extension/shared.mjs`
- `extension/source-image-store.mjs`
- `extension/background.mjs`
- `extension/sidepanel.mjs`
- `extension/runtime-config.mjs`
- `plugin-prototype/analysis-contract.mjs`
- `plugin-prototype/vision-analyzer.mjs`
- `cloudbase/server.mjs`
- `cloudbase/start.mjs`

附加静态检查结果：

- `extension/manifest.json` 可解析，`manifest_version=3`。
- 权限仍只有 `activeTab`、`downloads`、`scripting`、`sidePanel`、`storage`；未增加 `unlimitedStorage`。
- 扩展运行代码未发送 `evaluation_started`、`evaluation_succeeded`、`evaluation_failed`、`suggestion_applied`、`prompt_version_created`。
- 侧栏脚本登记的界面元素 ID 均能在 HTML 中找到。
- `git diff --check` 通过；只出现 Git 对 Windows CRLF 转换的提示，没有空白错误。

### 2.2 本地 process-test 冒烟验证

使用合成占位 Key 和本地专用 32 字符以上会话签名值短暂启动 `node cloudbase/start.mjs`；没有发送图片，也没有调用 DeepSeek。

只读/无模型调用结果：

- `configured=true`
- `mode=local-process-test`
- `anonymousSessionsEnabled=true`
- `quotaMode=process-test`
- 匿名短期令牌能够签发；验证输出只记录 `tokenIssued=true`，未打印或保存令牌。

验证后已停止本地 Node 进程。该模式只在当前进程计数，不代表 CloudBase 每日持久额度。

### 2.3 本地白名单打包审计

- 扩展包：`extension/dist/archbuddy-beta-0.5.0.zip`
  - 19 个白名单条目，包含 `source-image-store.mjs`。
  - SHA-256：`9A689B4EC87F864560D07EDEE21B857B504F64159990802444889F656B9D681C`
- 后端包：`cloudbase/dist/archbuddy-api-20260921-225126-359.zip`
  - 15 个白名单条目，包含 `plugin-prototype/evaluation-instructions-v3.md`。
  - SHA-256：`C268F93C65F8F5A57710DFFD5C80B63158D6731F2B71D3AEBCB30EC39E6AB6C7`

两个 ZIP 均未发现 `.env`、`environment.json`、Git、测试目录、规格/文档目录、本地图片、草稿、IndexedDB 数据、生成结果或实际凭据模式。包只在本地生成和检查，没有上传或部署。

## 3. 尚未执行，不得宣称通过

以下项目需要用户在真实 Chrome 加载 `extension/` 后人工完成，本轮没有伪造为已验证：

- 场景 A：三段导航、V2 草稿基线、旧方案缺图和补图。
- 场景 B：两张参考图分别选取模块，确认原图各保存一次且同图不重复。
- 场景 C：真实生成图与真实 DeepSeek 的逐维度评估。
- 场景 D：部分建议、直接编辑、锁定拦截和修改前后预览。
- 场景 E：剪贴板成功后创建下一版本、无变化不重复建版。
- 场景 F：替换生成图或清除评估后，会话数据消失而方案、版本和来源图保留。
- 失败恢复：真实网络断开、模型超时、真实 429、模型异常返回、评估中切换、浏览器 IndexedDB 容量不足。
- 真实本地模型调用：未执行；没有消耗 DeepSeek 额度。
- CloudBase V3 在线契约、日志边界和 V1/V2 回归：未执行，因为本轮明确不部署。

## 4. 人工验证入口

按 [V3 本地验证指南](quickstart.md) 在 Chrome 中加载仓库的 `extension/` 文件夹。需要真实本地模型调用时，只在当前 PowerShell 进程设置密钥，将 `runtime-config.mjs` 临时切到 `local`；完成后恢复 `cloud`。商店包必须继续由脚本在 `BACKEND_MODE=cloud` 下生成。

## 5. CloudBase 多项目隔离证据

- 已复核 `AGENTS.md`、`.specify/memory/constitution.md`、`docs/ARCHBUDDY_PRODUCT_FORM.md`、`docs/CLOUDBASE_PROJECT_ISOLATION.md` 和 `cloudbase/environment.json`。
- 目标项目固定为 `archbuddy`、阶段 `development`、现有服务 `archbuddy-api`；客户端不能选择项目或阶段。
- V3 复用现有匿名会话和额度代码，不新增集合；`archbuddy_dev_events` 仍未创建、未验证、未启用。
- 未触碰 `st-` 或其他项目资源；未执行控制台操作、部署、迁移、清理、通配删除或共享配置修改。

## 6. 结论

V3 MVP 的本地实现和章程要求的静态质量门槛已经完成；真实 Chrome 核心路径和真实模型评估仍是发布前人工验收项。当前可以进入“本地加载扩展并按 A–F 演示”的下一步，但不能描述为已部署或已上线。

## 7. 2026-09-22 本地评估链路修复

- 用户人工验证发现：生成图评估没有访问本地端口。定位结果为开发扩展仍处于 `BACKEND_MODE=cloud`，同时本机 `8080` 没有服务监听，因此 V3 未部署阶段无法产生本地评估请求。
- `direction/plugin` 工作树已切到显式 `local` 模式；既有商店 ZIP 仍是修复前已审计的 `cloud` 模式产物，未覆盖、未上传。发布前仍必须把源码切回 `cloud`，构建脚本会拒绝在 `local` 模式生成商店包。
- `cloudbase/start.mjs` 现在优先使用进程环境变量，并可回落读取当前 Windows 用户的 DPAPI 加密 DeepSeek 配置；云端包没有该本地运行目录，因此不扩大部署凭据范围。
- 新增 `cloudbase/scripts/start-local-v3.ps1`：只在当前进程生成匿名会话密钥，固定 `process-test` 和 `127.0.0.1:8080`，不打印、复制或写入密钥。
- 已执行 `node --check`、PowerShell 解析检查和商店包本地模式拒绝检查，均通过。
- 已实际启动本地服务并只读访问 `/api/status`：`configured=true`、`mode=local-process-test`、`anonymousSessionsEnabled=true`、`quotaMode=process-test`、`model=deepseek-flash`。
- 本次没有发送图片、没有调用模型、没有产生模型费用，也没有读取或修改 CloudBase 及其他项目资源。

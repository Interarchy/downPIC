# Phase 0 研究结论：V3 效果优化闭环

## 研究状态

技术上下文中的关键选择均已确定，没有遗留 `NEEDS CLARIFICATION`。本文件只记录会影响 V3 核心路径、隐私、安全或本地验证方式的结论。

## 决策 1：继续使用原生 Manifest V3，不引入前端框架

**Decision**: 在现有 `sidepanel.html / sidepanel.css / sidepanel.mjs / background.mjs` 上最小扩展三段导航和效果优化工作台。

**Rationale**: 现有 V2 已具备可用的结构化意图、草稿、图片会话和后台消息链。引入 React、构建器或状态库不会提升核心评估闭环的可信度，却会扩大改动、打包和商店复审风险。

**Alternatives considered**:

- React/Vue 重写：拒绝，超出 MVP 且增加回归面。
- 新建独立 Web 应用：拒绝，会割裂浏览器图片工作流。

## 决策 2：结构化文本与完整原图分开保存

**Decision**: 方案、模块和 Prompt 版本继续保存在 `chrome.storage.local`；完整来源原图以 Blob 存入扩展 IndexedDB，版本只保存 `sourceReferenceId`。

**Rationale**: Chrome 官方说明扩展 service worker 可以使用 IndexedDB 和 Cache Storage，而 `chrome.storage.local` 默认配额约 10 MB。完整原图不适合编码为 base64 后塞入结构化存储；IndexedDB 原生支持 Blob，且不会为每个版本复制图片。参考：[Storage and cookies](https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies)、[chrome.storage API](https://developer.chrome.com/docs/extensions/reference/api/storage)。

**Alternatives considered**:

- 原图 base64 存 `chrome.storage.local`：拒绝，体积膨胀且很快触达配额。
- Origin Private File System：拒绝，当前只需按 ID 读写少量 Blob，IndexedDB 更直接。
- 云存储：拒绝，违反用户确定的本地保存和本阶段不部署范围。

## 决策 3：不新增 `unlimitedStorage` 权限

**Decision**: V3 MVP 沿用当前 Manifest 权限，不申请 `unlimitedStorage`；保存失败必须显式区分“已复制”和“版本未完整保存”。

**Rationale**: Chrome 文档说明 `unlimitedStorage` 会影响 `storage.local`、IndexedDB、Cache Storage 和 OPFS，但新增权限会扩大商店审核说明和数据占用范围。当前只有 5 份方案，先按用户可见的容量失败和清理恢复实现更符合最小权限原则。参考：[Permissions list](https://developer.chrome.com/docs/extensions/reference/permissions-list)。

**Alternatives considered**:

- 立即申请 `unlimitedStorage`：拒绝，MVP 尚无实际容量证据证明必要。
- 静默降级为缩略图：拒绝，与“保存完整原图”要求冲突。

**Known risk**: 普通 IndexedDB 数据可能受浏览器配额和存储压力影响；MVP 通过保存结果校验、明确的 `assetState` 和清理重试暴露风险，不宣称永久可靠存档。

## 决策 4：复制是版本提交节点，但先复制、后提交

**Decision**: 只有完整 Prompt 成功进入剪贴板，且工作草稿相对当前版本存在有效变化时，后台才提交下一版本。

**Rationale**: 用户已经把“复制”定义为保存节点。先提交再复制可能产生用户从未成功取走的版本；先复制再提交能使版本语义与用户动作一致。若文本已复制但图片或版本保存失败，界面必须显示分离状态并保留可重试的工作草稿。

**Alternatives considered**:

- 编辑即自动保存版本：拒绝，会制造大量无意义版本并覆盖用户控制权。
- 先保存版本再复制：拒绝，剪贴板失败时版本语义不成立。
- 把复制与保存拆成两个主按钮：拒绝，增加操作并违背已确认场景。

## 决策 5：旧 V2 草稿采用懒迁移，并诚实标记来源缺失

**Decision**: 旧草稿首次在效果优化中打开时，自动生成只读 V1 文本基线；若旧记录没有来源原图字节，则 `SourceReference.assetState` 为 `missing`，不伪造图片。用户可后续重新附加来源图。

**Rationale**: V2 只持久化结构化草稿和来源提示，不保存完整原图。要求旧数据自动恢复原图在技术上不可能；懒迁移避免一次性批量写入和跨版本复制，又满足无需重新录入 Prompt 的要求。

**Alternatives considered**:

- 首次启动批量迁移全部草稿：拒绝，失败恢复和存储写入更复杂。
- 为旧草稿生成占位图：拒绝，会伪造资产和来源关系。
- 要求用户重建整份方案：拒绝，破坏 V2 到 V3 连续性。

## 决策 6：来源图是方案级资产，版本只引用

**Decision**: 当用户第一次把某候选分析的模块加入方案时，保存该候选对应的完整选择图；同一 `analysisId/selectionId` 只写一次。方案删除或被确认移出时删除全部关联 Blob；版本淘汰不单独删图。

**Rationale**: 多个版本通常复用同一组参考图。方案级一次保存可满足溯源，又避免版本上限变化导致复杂的二进制引用计数。最多 5 份方案使该简化可控。

**Alternatives considered**:

- 每版本复制图片：拒绝，浪费空间且违反明确需求。
- 实现跨方案全局去重：拒绝，需要内容哈希和引用计数，属于过度设计。

## 决策 7：新增独立 V3 评估接口，不扩写 V2 分析响应

**Decision**: 新增 `POST /api/v3/evaluate`。请求只包含生成图和当前版本的可评估目标模块，响应按请求模块恰好返回一次逐维度结果。

**Rationale**: V2 是“从参考图提取设计意图”，V3 是“依据既定意图检查生成图”，任务、输入和输出语义不同。独立路由避免破坏已上线 V1/V2，并可单独执行白名单、长度和结果完整性校验。

**Alternatives considered**:

- 在 `/api/v2/analyze` 增加模式参数：拒绝，增加兼容分支并模糊契约。
- 客户端自行拼接模型请求：拒绝，会暴露模型密钥和绕过额度控制。

## 决策 8：评估使用“允许键 + 动态目标”的严格结构化契约

**Decision**: 客户端只发送固定允许模块键、标题和文本值；服务端重新过滤键、截断长度并构建模型输入。模型结果必须映射为四种状态，并验证请求中的每个模块恰好出现一次。

**Rationale**: 这样可以避免模型自行增加目标、遗漏维度或把参考摘要当评分项，也能防止将方案名称、路径和历史正文意外上传。部分解析失败时整次评估失败，不写入本地方案。

**Alternatives considered**:

- 上传完整自由文本 Prompt 后让模型自行拆分：拒绝，难以保证模块一一对应。
- 返回百分制总分：拒绝，没有客观基准且规格明确排除。

## 决策 9：完整评估与生成图只保留当前会话

**Decision**: `GeneratedResult` 和 `EvaluationSession` 存入 `chrome.storage.session`；替换图片、切换当前版本、清除工作或浏览器会话结束时失效。只有用户最终采用的非敏感修改摘要随新版本持久化。

**Rationale**: 该边界符合数据最小化和已确认产品语义，也防止方案库演变为未授权的生成图资产库。

**Alternatives considered**:

- 把完整报告写入每个版本：拒绝，增加敏感正文与存储复杂度。
- 把生成图保存为方案附件：拒绝，超出本阶段且与明确要求冲突。

## 决策 10：本地真实调用复用同一服务，但不把管理员令牌放入扩展

**Decision**: 增加显式 `local` 运行模式：扩展仅指向 `127.0.0.1`；本地服务在 `process-test` 配额模式下，使用进程环境中的本地会话签名密钥签发匿名短期会话，并从环境读取 DeepSeek Key。

**Rationale**: 用户需要在不重复部署 V1 线上服务的前提下真实调用模型。复用同一 HTTP 和匿名会话契约最接近未来部署行为；密钥始终留在本地 Node 进程，扩展和仓库都不保存。进程内配额只用于开发演示，不能宣称为云端持久每日额度。

**Alternatives considered**:

- 在扩展中填 `ARCHBUDDY_TEST_TOKEN`：拒绝，商店包和本地存储都会暴露高权限凭据。
- 每次实现都部署 CloudBase：拒绝，会干扰已上线 V1 并减慢迭代。
- 使用纯 Mock：拒绝，无法验证真实图片评估链路；可作为 UI 演示但不能替代本地真实调用。

## 决策 11：当前不新增 CloudBase 资源或部署动作

**Decision**: 计划和后续实现阶段只修改本地代码、扩展和可本地启动的 API；不创建新集合、对象路径、日志、密钥或部署版本。

**Rationale**: 用户明确要求先在本地继续开发，V1 已上线。V3 评估沿用既有 `archbuddy-api`、匿名会话与 20/200 额度，未来部署前再执行共享环境隔离检查。

**Alternatives considered**:

- 先创建云端评估历史集合：拒绝，完整报告不应长期保存且本阶段无此需求。
- 新建独立云服务：拒绝，增加资源和运维面，MVP 不需要。

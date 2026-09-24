# V3 数据模型

## 1. 存储边界

| 数据 | 存储位置 | 生命周期 | 是否上传云端 |
| --- | --- | --- | --- |
| PromptScheme、PromptVersion | `chrome.storage.local` | 用户删除、方案上限确认移出或扩展数据清除 | 否 |
| SourceImageRecord 完整来源原图 | 扩展 IndexedDB | 与方案同寿命 | 否 |
| WorkingDraft、当前选图、GeneratedResult、EvaluationSession | `chrome.storage.session` | 切换方案、替换/清除或关闭会话 | 生成图仅在明确评估时作为请求发送；均不长期保存 |
| 匿名会话令牌 | 现有扩展本地存储策略 | 现有 7 天会话规则 | 仅用于已登记 ArchBuddy 服务 |
| 配额计数 | 现有 `archbuddy_dev_quotas`、`archbuddy_dev_requests` | 沿用现有策略 | 是；不含图片和 Prompt 正文 |

## 2. PromptScheme（提示词方案）

V2 `IntentDraft` 的 V3 规范化形态。为了最小迁移，现有 `draftId` 可以作为 `schemeId` 沿用。

| 字段 | 类型 | 规则 |
| --- | --- | --- |
| `schemaVersion` | number | V3 固定为 `3` |
| `schemeId` | string | 必填，稳定 UUID；旧草稿沿用 `draftId` |
| `name` | string | 必填，去除首尾空白，使用现有名称长度上限 |
| `modules` | object | V2 兼容镜像，键限于既有 `INTENT_MODULES`；存在当前版本时必须等于其 `modulesSnapshot`，工作草稿编辑不得提前改写 |
| `sourceReferences` | SourceReference[] | 方案级列表；同一来源不得重复 |
| `versions` | PromptVersion[] | 按 `versionNumber` 升序，最多 5 个 |
| `currentVersionId` | string/null | 有版本时必须指向 `versions` 中最大版本号 |
| `createdAt` | ISO datetime | 首次创建时间 |
| `updatedAt` | ISO datetime | 方案内容或版本最后变更时间，用于最近 5 份排序 |
| `migration` | object/null | 旧草稿迁移来源及时间；不含 Prompt 或图片正文 |

### 关系

- 一个方案拥有 0–5 个 PromptVersion。
- 一个方案拥有 0–N 个 SourceReference；所有版本通过 ID 引用这些方案级来源。
- 一个方案同一时刻最多有一个会话期 WorkingDraft 和一个有效 EvaluationSession。

### 校验

- 全局最多 5 份方案。创建第 6 份前必须展示最旧方案并得到确认。
- 删除方案时必须仅删除该 `schemeId` 的 SourceImageRecord。
- `currentVersionId` 不能指向历史已淘汰版本。
- 有当前版本时，当前模块和完整 Prompt 分别以该版本的 `modulesSnapshot` 与 `compiledPrompt` 为唯一事实来源；`PromptScheme.modules` 只是同步兼容镜像。
- 提交新版本时，新 PromptVersion、`currentVersionId`、`PromptScheme.modules` 和 `updatedAt` 必须在同一次 `chrome.storage.local` 写入中更新；失败时保持提交前状态。
- 任一 SourceReference 为 `missing/save-failed`，或 `available` 记录无法读回 Blob 时，允许剪贴板复制，但禁止把新版本提交为完整保存。

## 3. PromptVersion（Prompt 版本）

| 字段 | 类型 | 规则 |
| --- | --- | --- |
| `versionId` | string | 必填 UUID |
| `schemeId` | string | 必须等于父方案 ID |
| `versionNumber` | positive integer | 同方案内单调递增，不因淘汰旧版重排 |
| `createdAt` | ISO datetime | 版本提交时间 |
| `modulesSnapshot` | object | 提交时启用/停用、锁定和有效文本的只读快照 |
| `compiledPrompt` | string | 由 V2 既有编译规则生成；不得包含评估观察、来源和建议正文 |
| `sourceReferenceIds` | string[] | 只引用父方案登记的来源 ID；不复制图片 |
| `changeSummary` | ChangeSummary[] | 可选，仅包含模块键、变更类型和非敏感短摘要 |
| `origin` | enum | `legacy-baseline`、`initial-copy`、`revision-copy` |

### 不变量

- 已提交版本不可改写。
- 仅当前版本可派生评估和 WorkingDraft。
- 历史版本只读，可复制 `compiledPrompt`。
- 最多保留最近 5 份；第 6 份提交后删除最旧历史，当前版和紧邻上一版必须保留。

## 4. SourceReference（来源参考图元数据）

| 字段 | 类型 | 规则 |
| --- | --- | --- |
| `sourceReferenceId` | string | UUID，与 IndexedDB 主键一致 |
| `schemeId` | string | 父方案 ID |
| `analysisId` | string/null | 可用时记录 V2 分析 ID，不用于跨方案全局去重 |
| `selectionId` | string/null | 可用时记录当前选择 ID |
| `displayName` | string | 仅用于本地辨认，不发送到评估 API |
| `mimeType` | enum/null | `image/png`、`image/jpeg`、`image/webp`；旧记录可为空 |
| `byteSize` | integer/null | 1..10 MB；旧记录可为空 |
| `capturedAt` | ISO datetime/null | 实际保存原图时记录 |
| `assetState` | enum | `available`、`missing`、`save-failed` |
| `failureCode` | string/null | 仅限本地固定错误码，不保存路径和异常原文 |

### 去重键

同一方案内优先使用 `analysisId + selectionId`；缺失时使用当前选择会话 ID。MVP 不做跨方案内容哈希。

## 5. SourceImageRecord（来源原图二进制）

IndexedDB database：`archbuddy-local`；object store：`source-images-v1`。

| 字段 | 类型 | 规则 |
| --- | --- | --- |
| `sourceReferenceId` | string | 主键 |
| `schemeId` | string | 建立索引，用于方案删除 |
| `blob` | Blob | 完整原图，不转 base64 长期保存 |
| `mimeType` | string | 必须与 Blob 类型和允许格式一致 |
| `byteSize` | integer | 1..10 MB |
| `createdAt` | ISO datetime | 写入时间 |

写入完成后必须读回元数据确认；元数据写入 `chrome.storage.local` 与 Blob 写入不是跨存储事务，因此失败必须以 `assetState` 暴露，不能静默标记成功。

## 6. WorkingDraft（工作草稿）

| 字段 | 类型 | 规则 |
| --- | --- | --- |
| `schemeId` | string | 当前方案 |
| `baseVersionId` | string | 创建时的当前版本；版本变化后草稿失效 |
| `modules` | object | 从 `modulesSnapshot` 深拷贝，允许用户编辑 |
| `selectedSuggestionIds` | string[] | 会话期选择；不是持久报告 |
| `dirtyModuleKeys` | string[] | 与基线比较得出，不由客户端任意声明 |
| `updatedAt` | ISO datetime | 会话期编辑时间；随 WorkingDraft 保存在 `chrome.storage.session` |

### 状态

`clean` → 用户选择建议或直接编辑 → `dirty` → 复制成功并版本提交 → 新版本成为 current，重新建立 `clean` 草稿。

- 没有有效差异时禁止提交重复版本。
- 锁定模块只有用户先解除锁定后才可被建议改动。
- 切换方案时可丢弃未提交草稿，但必须提示，不得修改已保存版本。

## 7. GeneratedResult（生成结果）

| 字段 | 类型 | 规则 |
| --- | --- | --- |
| `generatedResultId` | string | 会话 UUID |
| `mimeType` | enum | PNG/JPEG/WebP |
| `byteSize` | integer | 1..10 MB |
| `base64` | string | 只在会话存储和发送时使用 |
| `selectedAt` | ISO datetime | 选择时间 |

替换图片、清除工作或会话结束时删除。只选择或预览不得调用服务。

## 8. EvaluationSession（效果评估会话）

| 字段 | 类型 | 规则 |
| --- | --- | --- |
| `evaluationId` | string | 服务端返回或客户端请求 UUID |
| `schemeId` | string | 发起时固定 |
| `baseVersionId` | string | 必须等于发起时 currentVersionId |
| `generatedResultId` | string | 发起时固定 |
| `status` | enum | `idle`、`confirming`、`running`、`succeeded`、`failed` |
| `overallConclusion` | string/null | 成功后必填的简短中文结论 |
| `findings` | DimensionFinding[] | 只包含请求的可评估模块 |
| `errorCategory` | enum/null | `invalid-input`、`network`、`timeout`、`unavailable`、`quota`、`parse` |
| `startedAt` / `completedAt` | ISO datetime/null | 会话期时间 |

### 失效条件

- 所选方案、currentVersionId 或 generatedResultId 任一变化。
- 用户创建下一版本。
- 用户清除评估或会话结束。

失效后旧建议不得应用到新草稿。

## 9. DimensionFinding（维度评估项）

| 字段 | 类型 | 规则 |
| --- | --- | --- |
| `moduleKey` | string | 必须来自请求且恰好一次；不允许 `reference_summary` |
| `status` | enum | `compliant`、`partial`、`deviation`、`unknown` |
| `observation` | string | 只描述图中可见现象 |
| `gap` | string | 与目标的差异；符合时可为空或简短确认 |
| `suggestion` | string/null | 有可执行偏差时给出；不得新增无关设计目标 |
| `reliabilityNote` | string/null | 拼贴、水印、遮挡或证据不足时说明 |

## 10. RevisionSuggestion 与 RevisionPreview

### RevisionSuggestion

| 字段 | 类型 | 规则 |
| --- | --- | --- |
| `suggestionId` | string | 当前 EvaluationSession 内唯一 |
| `evaluationId` | string | 必须等于当前有效评估 |
| `moduleKey` | string | 对应一个 DimensionFinding |
| `proposedValue` | string | 用户可编辑；不能为空且不能等于原值 |
| `selected` | boolean | 默认不自动应用 |

### RevisionPreview

| 字段 | 类型 | 规则 |
| --- | --- | --- |
| `moduleKey` | string | 被修改模块 |
| `before` | string | 当前版本快照值 |
| `after` | string | 拟写入工作草稿的值 |
| `blockedReason` | string/null | 锁定、空值、相同值或冲突时给出 |

预览确认只更新 WorkingDraft，不更新 PromptVersion。

## 11. ChangeSummary（版本变更摘要）

| 字段 | 类型 | 规则 |
| --- | --- | --- |
| `moduleKey` | string | 固定模块键 |
| `changeType` | enum | `suggestion-applied`、`direct-edit`、`lock-changed` |
| `summary` | string | 简短、非敏感，不保存原图、完整建议、Prompt 或路径 |

## 12. 迁移规则

1. 读取本地草稿时先通过 V3 normalizer，不直接原地假设字段完整。
2. V2 草稿保留原 ID、名称、模块和时间，补 `schemaVersion: 3`、空版本数组和来源元数据。
3. 首次在效果优化中打开且无版本时，用现有编译规则创建 `origin=legacy-baseline` 的 V1。
4. 如果 V2 只记录 `analysisId/displayName` 而没有 Blob，则建立 `assetState=missing` 的 SourceReference；不生成 SourceImageRecord。
5. 用户重新选择对应参考图并执行“补图”时，复用 `scheme.source.attach` 写入完整 Blob，并把明确的 `missing/save-failed` SourceReference 更新为 `available`；补图不创建 PromptVersion，也不为历史版本复制图片。
6. 迁移写回只影响该方案。单份失败时保留原数据并显示可恢复错误，不清空全部草稿。

## 13. 删除与清理

- 删除方案：删除方案文本记录、其全部 SourceImageRecord、当前会话中同方案评估；不删除下载目录图片。
- 移出最旧方案：必须在用户确认后执行与删除方案相同的限定清理。
- 淘汰旧版本：只删除 PromptVersion 元数据；方案级来源图保留到方案删除。
- 清除生成图：删除 GeneratedResult 和 EvaluationSession，不影响方案、版本和来源图。
- 所有清理必须按明确 `schemeId`，不得使用无归属通配删除。

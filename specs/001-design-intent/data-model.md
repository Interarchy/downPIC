# Phase 1 数据模型：ArchBuddy V2

## 1. 固定模块目录

所有分析结果和草稿必须包含以下固定顺序的模块键：

| 顺序 | key | 标题 |
|---:|---|---|
| 1 | `reference_summary` | 参考摘要 |
| 2 | `scene_subject` | 场景与主体 |
| 3 | `space_massing` | 空间与体量 |
| 4 | `facade_elements` | 立面与构件 |
| 5 | `materials_surfaces` | 材料与表面 |
| 6 | `landscape_context` | 景观与配景 |
| 7 | `view_composition` | 视角与构图 |
| 8 | `color_tone` | 色彩与明暗 |
| 9 | `lighting_atmosphere` | 光线与氛围 |
| 10 | `image_expression` | 图像表现 |
| 11 | `negative_constraints` | 负向约束 |

标题只用于展示，持久化和合并以稳定的 `key` 为准。

## 2. AnalysisModuleSuggestion（分析建议模块）

```text
key: 固定模块键，必填
title: 固定中文标题，必填
value: AI 建议文本，允许空字符串
basis: observed | inferred | uncertain
evidence: 可见证据说明，允许空字符串
confidence: high | medium | low | unknown
```

该对象由服务端返回，不包含浏览器交互状态。浏览器规范化后再创建 `IntentModule`。`basis` 分别表示可见事实、合理推断和无法确认，必须在界面中明确显示。

## 3. IntentModule（设计意图模块）

```text
key: 固定模块键，必填
title: 固定中文标题，必填
value: 用户最终可编辑文本，允许空字符串
evidence: AI 对视觉证据的简短说明，允许空字符串
basis: observed | inferred | uncertain
confidence: high | medium | low | unknown
source: ai | user
sourceHint: { analysisId, displayName } | null
reviewState: suggested | confirmed | modified
enabled: boolean
locked: boolean
changed: boolean
status: suggested | confirmed | modified | locked | disabled（界面派生值）
```

约束：

- `key` 在一份草稿中唯一，且必须来自固定目录。
- 用户修改 `value` 后，`source=user`、`reviewState=modified`、`basis=uncertain`、`evidence=''`、`confidence=unknown`，避免原 AI 证据错误解释用户的新文本。
- `enabled=false` 时保留模块内容，但编译提示词时排除。
- `sourceHint` 只记录产生当前模块的本地分析标识和非网址展示名，用于解释当前方案的来源；不包含图片或网址。
- `locked=true` 时本地编辑仍需先解锁；后续分析本身不改变任何当前方案模块。
- `status` 按“停用 > 锁定 > `reviewState`”派生，使界面始终显示规格要求的五种状态之一。
- `changed` 只表示最近一次重新分析发现 AI 建议发生变化，用户再次编辑或确认后可清除。
- `basis`、`evidence`、`confidence` 和状态字段仅用于界面，不进入最终提示词。

## 4. AnalysisEnvelope（分析响应）

```text
contractVersion: 2
analysisId: 浏览器为本次分析生成的会话标识
modules: AnalysisModuleSuggestion[11]
model: 模型名称
durationMs: 服务端耗时
truncated: boolean
cached: boolean
referenceHint: { sourceType, displayName }
usage: 现有额度结果（不在用户界面显示）
```

约束：

- 成功响应必须按固定目录返回 11 个模块；模型未提供的模块由服务端补空。
- 服务端分析响应只传 AI 建议字段；浏览器补充 `analysisId/referenceHint` 并把整组结果作为会话期候选保存。`source/reviewState/enabled/locked/changed/status/sourceHint` 均由浏览器创建或派生。

## 5. ReferenceSelection（当前参考图）

```text
selectionId: 本地临时标识
sourceType: page-image | screenshot | paste | file
displayName: 非网址的本地展示名
mimeType: image/png | image/jpeg | image/webp
byteSize: 1..10 MB
imagePayload: 仅会话期使用的图片数据
selectedAt: ISO 时间
```

生命周期：只存在于 `chrome.storage.session`；不进入草稿，不上传到统计集合。分析请求必须由用户主动发起。

## 6. IntentDraft（本地意图草稿）

```text
draftId: UUID
name: 本地生成的草稿名称，不包含来源网址
createdAt: ISO 时间
updatedAt: ISO 时间
lastAnalyzedAt: 最近一次成功分析时间，可空
modules: IntentModule[11]
compiledPrompt: 可由 modules 重建的缓存，可不持久化
overallConfirmedAt: 首次复制完整提示词前的整体确认时间，可空
referenceSelectionId: 本地随机选择标识，可空
referenceHint: { sourceType, displayName }，可空
```

存储规则：

- 保存到 `chrome.storage.local` 的 `intentDraftsV2`。
- 按 `updatedAt` 倒序，仅保留 5 份；写入第 6 份时删除最旧项。
- 不保存图片、缩略图、页面网址、Cookie、令牌或云端身份。
- 恢复后可编辑、启停和复制；重新分析前必须重新选择图片。
- 没有当前草稿时，首次成功分析创建一份包含 11 个空槽位的当前方案；分析结果仍只保留为会话期候选。
- 已有当前草稿时，后续成功分析只更新最近分析信息和候选区，不改动草稿模块；因此可以跨图片持续拼装同一方案。
- “新建草稿”只清空活动草稿 ID 和编辑上下文，不立即写入空草稿；下一次成功分析创建并持久化一份草稿，避免重复空记录。

## 7. PromptCompilation（派生提示词）

```text
fixedPrinciple: 不可编辑的整体生成准则
includedModuleKeys: 当前启用且非空的模块键
text: 最终复制文本
requiresConfirmation: overallConfirmedAt 为空
```

编译顺序：

1. 固定整体生成准则；
2. 按固定模块目录顺序加入 `enabled=true` 且 `value` 非空的模块；
3. 每段只含标题和值；
4. 不含 `evidence`、`confidence`、`source`、状态或模型元数据。

## 8. AnalyticsConsent（本地统计同意）

```text
enabled: boolean，默认 false
updatedAt: ISO 时间
policyVersion: 固定版本字符串
```

规则：该设置与图片处理隐私同意相互独立。关闭后立即停止发送新事件；已写入事件依靠最多 30 天 TTL 到期删除。

## 9. BehaviorEvent（CloudBase 行为事件）

```text
eventId: 客户端 UUID，用于幂等写入
projectId: 服务端固定为 archbuddy
stage: 服务端固定为 development
actorHash: 服务端从匿名身份派生的不可逆摘要
eventName: 白名单枚举
outcome: 白名单结果枚举，可空
clientOccurredAt: 客户端 ISO 时间
receivedAt: CloudBase Date，由服务端生成
expiresAt: CloudBase Date，等于 receivedAt + 30 天
schemaVersion: 1
```

允许的 `eventName`：

- `analysis_started`
- `analysis_succeeded`
- `analysis_failed`
- `module_edited`
- `module_disabled`
- `prompt_confirmed`
- `prompt_copied`

允许的 `outcome` 完整枚举为：

- `success`
- `invalid_input`
- `network_unavailable`
- `timeout`
- `service_unavailable`
- `quota_exceeded`
- `format_invalid`
- `version_mismatch`
- `unknown_error`

其中前七种失败类别与 FR-017 及契约版本检查一一对应，`unknown_error` 仅作为无法安全细分时的兜底。禁止附加任意属性、模块内容、图片信息、来源网址、提示词、自定义文本或原始错误消息。

集合：`archbuddy_dev_events`。状态为“计划中，尚未因本文档自动创建”；权限、TTL 与实际环境证据必须在启用统计前登记。

## 10. 候选加入与同维度替换规则

1. 每次分析生成独立 `analysisId`，候选结果只存在于 `chrome.storage.session`，不会自动进入草稿；
2. 用户点击“加入当前方案”后，浏览器按稳定 `key` 把该候选写入草稿相应槽位，并记录安全的 `sourceHint`；
3. 目标槽位已有内容时，界面显示“替换当前项”，后台只在请求明确携带替换意图时更新该槽位；
4. 加入或替换只改变一个 `key`，其他槽位和用户编辑保持不变；
5. 当前方案发生变化后清空 `overallConfirmedAt`，复制完整 Prompt 前需要重新整体确认；
6. 选择并分析下一张图只替换会话期候选结果，当前方案和最近 5 份草稿继续保留。

## 11. 数据边界

| 数据 | 浏览器会话 | 浏览器本地 | CloudBase |
|---|---:|---:|---:|
| 原图/截图/粘贴图片 | 是 | 否 | 仅分析请求瞬时处理，不持久化 |
| 页面网址 | 当前流程可能瞬时使用 | 否 | 否 |
| 结构化模块和提示词 | 是 | 最多 5 份草稿 | 否 |
| 统计同意 | 否 | 是 | 否 |
| 白名单行为事件 | 否 | 仅待发送瞬时数据 | 选择加入后最多 30 天 |
| DeepSeek/API/测试令牌 | 否 | 否 | 仅服务环境变量，绝不进入事件或响应 |

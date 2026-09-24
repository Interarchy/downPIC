# V3 扩展内部消息契约

## 原则

- 沿用现有 `chrome.runtime.sendMessage` 的请求/响应模式，不引入事件总线或通用 RPC 层。
- 所有写操作由 background 统一修改 `chrome.storage.local/session`；side panel 可通过受限 helper 只读 IndexedDB Blob 并创建临时 object URL。
- 每条消息都返回 `{ ok: true, ... }` 或 `{ ok: false, error: { code, message } }`。
- 错误消息不得带图片 base64、Prompt 正文、密钥、本地路径或原始异常堆栈。

## 方案消息

### `scheme.list`

请求：

```json
{ "type": "scheme.list" }
```

响应返回最近更新时间降序的最多 5 份方案摘要；不返回图片 Blob。

### `scheme.open`

```json
{ "type": "scheme.open", "schemeId": "uuid" }
```

行为：规范化 V3 结构；旧 V2 草稿首次打开时自动建立只读 V1 文本基线。若旧数据没有原图，返回 `assetState=missing`。

### `scheme.delete`

```json
{ "type": "scheme.delete", "schemeId": "uuid", "confirmed": true }
```

仅在 `confirmed=true` 时删除该方案及其 IndexedDB 资产；不得影响下载目录和其他方案。

### `scheme.source.attach`

```json
{
  "type": "scheme.source.attach",
  "schemeId": "uuid",
  "selectionId": "uuid",
  "analysisId": "uuid",
  "displayName": "reference.jpg",
  "replaceSourceReferenceId": "optional-missing-or-save-failed-uuid"
}
```

background 从当前 session 选择图取得字节，校验后写入 IndexedDB；同方案同来源返回既有 `sourceReferenceId`，不得重复写入。`replaceSourceReferenceId` 仅允许指向同方案状态为 `missing/save-failed` 的记录，用于用户明确执行“补图”；成功后原记录更新为 `available`，失败时保留原状态和固定错误码。没有可用当前选择图时拒绝并引导用户返回提示词构建重新选择参考图。

## 版本消息

### `scheme.version.commit`

只有 side panel 已确认剪贴板复制成功后调用。

```json
{
  "type": "scheme.version.commit",
  "schemeId": "uuid",
  "baseVersionId": "uuid",
  "modules": {},
  "compiledPrompt": "完整 Prompt",
  "changeSummary": [
    { "moduleKey": "materials_surfaces", "changeType": "direct-edit", "summary": "调整材料表达" }
  ]
}
```

校验：

- `baseVersionId` 必须仍是方案当前版本，防止把旧评估写到新版本。
- `modules` 由 background 重新规范化并重新编译；客户端 `compiledPrompt` 必须与服务端/共享编译结果一致，否则拒绝。
- 相对基线没有有效变化时返回 `NO_CHANGES`，不创建重复版本。
- 任一 SourceReference 为 `missing/save-failed`，或状态为 `available` 却无法在 IndexedDB 读取时，返回 `VERSION_INCOMPLETE`，同时说明剪贴板复制已经成功；不得新增或更新当前版本。
- 成功时在同一次 `chrome.storage.local` 写入中新增版本，并同步更新 `currentVersionId`、`PromptScheme.modules` 兼容镜像和 `updatedAt`，然后执行最多 5 版本淘汰；写入失败时保持提交前状态。

### `scheme.version.copy-read`

```json
{ "type": "scheme.version.copy-read", "schemeId": "uuid", "versionId": "uuid" }
```

只返回指定历史版本的 `compiledPrompt` 供 side panel 复制，不改变版本，不调用 AI。

## 评估消息

### `evaluation.image.set`

```json
{
  "type": "evaluation.image.set",
  "image": { "mimeType": "image/jpeg", "base64": "...", "byteSize": 12345 }
}
```

只保存到 `chrome.storage.session` 并返回 `generatedResultId`；不得调用 API。

### `evaluation.run`

```json
{
  "type": "evaluation.run",
  "schemeId": "uuid",
  "versionId": "uuid",
  "generatedResultId": "uuid",
  "consentConfirmed": true
}
```

行为：

1. 再次读取 currentVersion，确认 `versionId` 仍为当前版。
2. 过滤出已启用且可评估模块；参考摘要只进入 context。
3. `consentConfirmed` 不为 true 时不得发送。
4. 调用 `/api/v3/evaluate`，结果连同本地归属键只写 session。
5. 返回前再次确认当前上下文；过期结果返回 `STALE_EVALUATION`。

### `evaluation.get`

```json
{ "type": "evaluation.get", "schemeId": "uuid" }
```

只在当前 session 的 `schemeId/versionId/generatedResultId` 全部匹配时返回报告。

### `evaluation.clear`

```json
{ "type": "evaluation.clear", "schemeId": "uuid" }
```

删除生成图、评估报告和建议选择，不改变方案或版本。

## 统计事件

以下名称仅作为未来允许事件的保留契约：

- `evaluation_started`
- `evaluation_succeeded`
- `evaluation_failed`（只含固定 outcome）
- `suggestion_applied`
- `prompt_version_created`

当前本地 V3 MVP 不实现、排队或发送这些事件；核心流程不得依赖统计同意或统计端点。未来若单独启用，必须同时满足用户已同意、服务端统计开关已启用、CloudBase 资源已登记并验证，且消息不得包含任何图片、Prompt、方案名、模块正文、建议正文、路径或 URL。当前云端统计资源仍未创建且开关保持关闭。

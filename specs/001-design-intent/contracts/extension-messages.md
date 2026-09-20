# 契约：扩展内部消息与本地状态

所有消息继续通过 `chrome.runtime.sendMessage` 在侧边栏和后台服务工作线程之间传递。未知 `type` 必须沿用现有错误处理，不能静默执行。

## 1. `state.get`

用途：侧边栏初始化。

V2 返回在现有状态上增加：

```json
{
  "activeDraftId": "uuid-or-null",
  "drafts": [],
  "result": {
    "analysisId": "uuid",
    "modules": [],
    "referenceHint": { "sourceType": "file", "displayName": "参考图.jpg" }
  },
  "analyticsConsent": {
    "enabled": false,
    "updatedAt": "2026-09-20T08:00:00.000Z",
    "policyVersion": "1"
  }
}
```

图片 payload 不得包含在初始化响应的草稿列表中。

## 2. `draft.save`

请求：

```json
{
  "type": "draft.save",
  "draft": {
    "draftId": "uuid",
    "name": "设计意图 2026-09-20 16:00",
    "modules": [],
    "overallConfirmedAt": null
  }
}
```

后台职责：规范化固定模块、更新时间、按更新时间排序、只保留最近 5 份，再写入 `chrome.storage.local`。请求中若含图片、网址、令牌或未知顶层字段则拒绝。

响应：

```json
{
  "ok": true,
  "drafts": [],
  "activeDraftId": "uuid"
}
```

## 3. `draft.create`

请求：`{ "type": "draft.create" }`

用途：显式结束当前编辑上下文。后台只清空 `activeDraftId` 和会话期候选，不立即持久化空草稿；下一次成功分析创建并保存一份新草稿。该操作不删除历史草稿、当前图片选择或已下载图片。

## 4. `draft.restore`

请求：`{ "type": "draft.restore", "draftId": "uuid" }`

响应返回完整草稿，但不返回历史图片。侧边栏必须显示“如需重新分析，请重新选择参考图”的非阻断提示。

## 5. `draft.delete`

请求：`{ "type": "draft.delete", "draftId": "uuid" }`

删除仅影响浏览器本地草稿，不触碰 CloudBase 或其他项目数据。

## 6. `analysis.run`

后台必须把 V2 网络请求发送到 `/api/v2/analyze`；已发布 V1 使用的 `/api/analyze` 服务端契约保持不变。V2 成功响应包含 `modules` 和 `contractVersion`。后台为结果补充 `analysisId` 与安全的 `referenceHint`，把结果保存为会话期候选；已有当前方案时不得自动合并或覆盖其模块。

## 7. `intent.add`

请求：

```json
{
  "type": "intent.add",
  "payload": {
    "analysisId": "uuid",
    "key": "materials_surfaces",
    "replace": false
  }
}
```

后台必须验证 `analysisId` 与当前会话候选一致，并且 `key` 属于固定目录。目标槽位为空时加入；已有不同内容时只有 `replace=true` 才能替换。成功后只更新该槽位、清空 `overallConfirmedAt` 并返回当前草稿与最近草稿列表。

## 8. `analytics.consent.set`

请求：

```json
{
  "type": "analytics.consent.set",
  "enabled": true
}
```

后台只保存布尔值、时间和策略版本。默认值必须为 `false`。

## 9. `analytics.record`

请求：

```json
{
  "type": "analytics.record",
  "eventName": "prompt_copied",
  "outcome": "success",
  "clientOccurredAt": "2026-09-20T08:00:00.000Z"
}
```

后台职责：

1. 检查本地选择加入状态；关闭时直接忽略；
2. 校验事件和结果枚举，丢弃未知字段；
3. 生成 `eventId`，把 `/api/events` 纳入与 `/api/v2/analyze` 相同的 Bearer token 注入和一次 401 刷新路径；
4. 失败时不阻断原操作，不保存敏感重试队列，不记录正文。

侧边栏不得直接访问 CloudBase，也不得自行添加任意统计属性。

## 10. 保持不变的消息

现有图片选择/粘贴、图片下载/显示、分析状态和分类相关消息保持不变。V2 不得借草稿或统计改造改变这些消息的语义。

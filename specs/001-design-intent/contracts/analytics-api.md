# 契约：匿名行为事件 API

## 启用前置条件

以下条件全部满足前，扩展中的统计开关必须保持默认关闭，生产服务不得写入事件：

1. `archbuddy_dev_events` 已登记到 `docs/CLOUDBASE_PROJECT_ISOLATION.md`；
2. 集合权限已验证为仅服务端管理；
3. `archbuddy_dev_events` 的30天与 `archbuddy_dev_activity` 的60天到期清理已配置并用实际记录验证；
4. 服务环境变量 `ARCHBUDDY_ANALYTICS_ENABLED=true`，且变量名已登记；缺失或其他值一律视为关闭；
5. 日志检查确认不记录请求正文和任意用户内容；
6. `start.mjs` 只初始化一次 CloudBase store，并将同一 store 派生的 `quota` 与 `eventWriter` 注入服务。

## POST `/api/events`

使用现有匿名会话 Bearer token。此接口不接收项目名、阶段、用户 ID 或任意属性对象。

### 请求

```json
{
  "eventId": "3f7c0c02-6a78-4fa3-a15f-d9b389d19e5a",
  "eventName": "analysis_succeeded",
  "outcome": "success",
  "clientOccurredAt": "2026-09-20T08:00:00.000Z"
}
```

字段限制：

| 字段 | 要求 |
|---|---|
| `eventId` | UUID，必填；作为幂等文档 ID。 |
| `eventName` | 必须来自数据模型白名单。 |
| `outcome` | 可选，必须来自结果类别白名单。 |
| `clientOccurredAt` | ISO 时间；仅用于漏斗顺序参考，不作为 TTL 基准。 |

出现额外字段、自由文本或超长值时，服务端以 `400 EVENT_INVALID` 拒绝整个事件。

### 服务端补充字段

```json
{
  "projectId": "archbuddy",
  "stage": "development",
  "actorHash": "<server-derived-hash>",
  "receivedAt": "<server-time>",
  "expiresAt": "<server-time-plus-30-days>",
  "schemaVersion": 1
}
```

客户端不能覆盖这些字段。`actorHash` 从已验证匿名会话身份派生，不保存原始 token、安装 ID 或 IP 地址。

## 2026-10-07：schemaVersion=2批量契约（本地实现、未上线）

旧版单事件请求保持兼容，仍仅接收旧字段；新版使用相同POST路径，最多25条、32KiB。先验证全批，再逐事件事务写入；中途写入失败可原ID重试。服务关闭仍返回204；客户端不能将204或关闭状态解释为已经持久化。

```json
{
  "schemaVersion": 2,
  "events": [{
    "schemaVersion": 2,
    "eventId": "3f7c0c02-6a78-4fa3-a15f-d9b389d19e5a",
    "eventName": "task_started",
    "clientOccurredAt": "2026-10-07T08:00:00.000Z",
    "policyVersion": "2026-10-07",
    "consentId": "faac779c-28f8-4551-ab3c-e08b0b358bfc",
    "extensionVersion": "0.7.0",
    "entry": "sidepanel",
    "scope": "task",
    "taskType": "prompt_build",
    "taskId": "4f14b80b-6f51-4a7f-8f6b-4bb1cb9c55c8"
  }]
}
```

九类事件：session_started、image_saved、task_started、task_result、prompt_confirmed、prompt_copied、material_reused、search_started、search_result。精确字段和枚举以[共享白名单](../../../extension/analytics-schema.mjs)为准；禁止任意attributes对象。时间不早于服务器24小时、不晚于服务器5分钟；计数0–100000，耗时0–3600000ms，流程标识必须为UUID。

服务端仅保存按项目/阶段/安装匿名身份/同意周期派生的actorHash，不保存原始consentId。事件幂等主键包含actorHash与eventId，不允许不同主体覆盖同一事件ID。主动行为才更新活跃摘要；scope=ai的后台描述/索引、task_result/search_result等结果返回不算新增主动活跃。到期字段仍需实际删除机制。

GET /api/status 增加analyticsEnabled、analyticsSchemaVersion=2和analyticsPolicyVersion；没有改变AI额度接口。每实例统计接收最多300批/分钟，该保护不改变每日AI额度。

POST /api/events/withdraw 使用同样的匿名凭据，body仅允许consentId和policyVersion。在线撤回为该同意周期写入撤回状态，后续在途事件被丢弃；历史原始事件保持原到期时间。客户端先停止采集、清空队列与流程键，再尽力发送控制请求；离线时不能保证服务端收到，报表如实说明该限制。

### 响应

成功接受：

```http
HTTP/1.1 202 Accepted
Content-Type: application/json

{"accepted":true}
```

统计未启用：

```http
HTTP/1.1 204 No Content
```

无论事件发送成功、超时还是被拒绝，扩展都不得中断分析、编辑、复制、恢复草稿或下载流程，也不做无限重试。

### 隐私禁止项

请求和持久化文档中禁止出现：

- 图片、截图、Base64、图片哈希或文件名；
- 页面网址、域名、标题或访问记录；
- 提示词、模块值、证据、自定义文本或剪贴板内容；
- 邮箱、手机号、账号、Cookie、匿名 token 或 API Key；
- 原始异常消息、堆栈或上游响应正文。

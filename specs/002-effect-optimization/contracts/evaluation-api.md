# V3 效果评估 API 契约

## 端点

`POST /api/v3/evaluate`

- 鉴权：复用现有 ArchBuddy Bearer 匿名会话；管理员测试身份仅用于受控测试。
- 配额：与 V1/V2 共享“匿名安装每日 20 次、ArchBuddy 每日 200 次”。常规响应不返回具体余额。
- 内容类型：`application/json`。
- 行为：只有此请求会调用视觉模型；预览、编辑、查看和复制不调用。
- 兼容：不得改变 `/api/analyze`、`/api/v2/analyze`、`/api/session` 的既有契约。

## 请求

```json
{
  "contractVersion": 3,
  "requestId": "uuid",
  "image": {
    "mimeType": "image/jpeg",
    "base64": "..."
  },
  "target": {
    "versionId": "uuid",
    "modules": [
      {
        "key": "materials_surfaces",
        "title": "材料与表面",
        "value": "浅灰清水混凝土，表面保留细微模板拼缝"
      },
      {
        "key": "view_composition",
        "title": "视角与构图",
        "value": "左前方低视点仰视，主体略偏左"
      }
    ],
    "context": {
      "referenceSummary": "可选的简短整体上下文",
      "negativeConstraints": "可选；禁止出现的明确特征"
    }
  }
}
```

### 请求规则

- `contractVersion` 必须为 `3`。
- `requestId` 必须为 UUID，用于请求去重和归属，不作为用户身份。
- `image.mimeType` 仅允许 `image/png`、`image/jpeg`、`image/webp`。
- 解码后的图片大小必须在 1 字节至 10 MB。
- `target.modules` 至少 1 项，每个键唯一，且必须属于服务端固定允许的可评估模块键。
- `reference_summary` 不得作为 `modules[].key`，只能以可选上下文形式出现。
- 停用模块不得发送；客户端传入的 `title` 仅用于模型可读性，服务端仍按键映射固定标题。
- 每个 `value` 必须为去除首尾空白后的非空文本，并受服务端固定最大长度限制。
- `negativeConstraints` 为空时服务端不得自行构造禁用项。
- 不得发送方案名称、来源原图、历史版本、本地路径、网页地址、邮箱或其他直接身份信息。

## 成功响应

HTTP `200`

```json
{
  "contractVersion": 3,
  "requestId": "uuid",
  "evaluationId": "uuid",
  "overallConclusion": "整体构图接近目标，但材料质感和阴影深度仍有明显偏差。",
  "findings": [
    {
      "key": "materials_surfaces",
      "status": "deviation",
      "observation": "主要墙面呈均匀光滑的白色涂层。",
      "gap": "未体现目标中的浅灰混凝土与模板拼缝。",
      "suggestion": "强化浅灰清水混凝土、细微模板拼缝和低反射哑光表面。",
      "reliabilityNote": null
    },
    {
      "key": "view_composition",
      "status": "compliant",
      "observation": "画面从左前方低视点仰视，主体略偏左。",
      "gap": "",
      "suggestion": null,
      "reliabilityNote": null
    }
  ],
  "model": "provider-model-id",
  "durationMs": 17664,
  "truncated": false
}
```

### 成功响应规则

- `findings` 必须与请求模块一一对应：每个请求键恰好一次，不多不少。
- `status` 仅允许：
  - `compliant` → 界面“符合”
  - `partial` → 界面“部分符合”
  - `deviation` → 界面“偏差”
  - `unknown` → 界面“无法判断”
- `observation` 只描述生成图可见内容。
- `gap` 说明与目标的差异；`compliant` 时可为空。
- `suggestion` 只有存在可执行偏差时提供；不得改写未请求模块。
- 证据不足必须使用 `unknown`，并通过 `reliabilityNote` 说明原因。
- 不返回精确审美总分、来源图片、Prompt 完整正文或额度余额。

## 错误响应

统一形式：

```json
{
  "error": {
    "code": "INVALID_INPUT",
    "message": "请上传 10 MB 以内的 PNG、JPEG 或 WebP 图片。"
  },
  "requestId": "uuid"
}
```

| HTTP | `error.code` | 客户端类别 | 用户动作 |
| --- | --- | --- | --- |
| 400 | `INVALID_INPUT` | 输入无效 | 换图或返回构建方案 |
| 401/403 | `AUTH_REQUIRED` / `AUTH_INVALID` | 服务暂不可用 | 刷新匿名会话后重试 |
| 408/504 | `MODEL_TIMEOUT` | 处理超时 | 稍后重试；不改方案 |
| 429 | `QUOTA_REACHED` | 使用上限已到 | 稍后再试；不显示余额数字 |
| 502 | `MODEL_RESPONSE_INVALID` | 结果无法解析 | 重试；不保存部分结果 |
| 503 | `SERVICE_UNAVAILABLE` | 服务暂不可用 | 稍后重试 |
| 500 | `INTERNAL_ERROR` | 服务暂不可用 | 稍后重试；日志不得包含图片或 Prompt 正文 |

网络层无法取得 HTTP 响应时，扩展映射为 `network`；本地请求超时映射为 `timeout`。

## 并发与归属

- 客户端提交前记录 `schemeId + versionId + generatedResultId + requestId`，但只把必要的 `versionId/requestId` 发给服务。
- 结果返回后，只有四个本地标识仍与当前会话一致时才可展示和应用。
- 用户连续点击时只能有一个当前评估；旧请求结果可被忽略，不得写入新方案。
- 评估失败、取消或过期不得创建 PromptVersion。

## 数据与日志边界

- 请求图片只在内存中完成模型调用，不进入数据库、云存储或行为事件。
- Prompt 模块正文只用于本次评估，不进入产品统计事件。
- 可选统计若以后启用，只允许固定事件名、固定 outcome、不可逆主体和服务端时间；不得含本契约的图片或文本字段。
- 当前计划不授权新增云端集合、日志主题或存储路径。

# 契约：结构化图片分析 API

## 已发布 V1 兼容边界

已发布 V1 继续使用 `POST /api/analyze` 及其既有 `sections` 成功契约。本 V2 功能不得修改、删除或复用该路由的成功响应结构，也不得在其中混入 `modules`。V1 路由的下线不属于本功能范围。

## POST `/api/v2/analyze`

认证、图片大小、MIME 类型、匿名会话和 20/200 每日配额沿用现有实现。

### 请求

请求结构保持现状，以避免扩大数据面。请求正文只包含一张 PNG、JPEG 或 WebP 图片；图片大小为 1 字节至 10 MB，不发送项目类型、草稿或模块正文。

请求头：

```http
Authorization: Bearer <anonymous-session-token>
Content-Type: application/json
x-archbuddy-request-id: <uuid>
```

禁止在服务端日志中记录 Authorization、图片数据或请求正文。

### V2 成功响应

```json
{
  "contractVersion": 2,
  "modules": [
    {
      "key": "reference_summary",
      "title": "参考摘要",
      "value": "浅灰混凝土退台建筑嵌于绿植坡地。",
      "basis": "observed",
      "evidence": "多层水平楼板、混凝土体块与前景坡地清晰可见。",
      "confidence": "high"
    }
  ],
  "model": "deepseek-v4-flash-vision-exp",
  "durationMs": 17664,
  "truncated": false,
  "cached": false
}
```

### 模块要求

- `modules` 始终按数据模型中的固定 11 模块顺序返回。
- 模型缺失某模块时，服务端补充该模块，`value/evidence` 为空、`confidence=unknown`。
- `basis` 只允许 `observed`、`inferred`、`uncertain`，分别对应可见事实、合理推断、无法确认。
- `confidence` 只允许 `high`、`medium`、`low`、`unknown`。
- 来源、审阅状态、启停、锁定和变化标记由浏览器端创建或派生，服务端不得成为第二状态源。
- 配额信息可继续存在于响应供扩展内部处理，但不得在 V2 用户界面显示“个人/公共剩余次数”。

### 错误

沿用 V1 的 HTTP 状态和错误码映射。V2 路由额外允许：

| HTTP | code | 含义 |
|---:|---|---|
| 502 | `ANALYSIS_FORMAT_INVALID` | 模型输出无法恢复出最低有效结构。 |
扩展收到成功 HTTP 响应但缺少 `contractVersion: 2` 或 `modules` 时，必须在本地归类为 `version_mismatch` 并提示“扩展与服务版本暂不匹配，请稍后重试”，不新增服务端 503 分支。其他错误必须转换为简明用户提示，不显示上游原始响应、密钥、内部堆栈或任意服务端错误正文。

## 模型标签协议（服务端内部）

模型按下列形式输出 11 个固定标题块：

```text
【空间与体量】
内容：多层方正体块沿坡地退台展开。
依据类型：可见事实
证据：可见连续水平悬挑楼板及右侧较高竖向体块。
置信度：高
```

解析器允许块顺序异常或末尾截断，但不得接受未知标题为新模块。服务端负责把中文依据类型和置信度规范化为固定英文枚举，并补齐缺失模块。

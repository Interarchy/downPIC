# 统一账户模型执行器（待部署）

日期：2026-10-29。本文件优先于旧匿名测试部署说明。实现仅在独立工作树完成，尚未部署，不代表线上 `archbuddy-api-014` 已关闭匿名访问。官网、Canvas、插件统一账户、积分和权益以 Cloudflare D1 为唯一主源。CloudBase 只接收 Worker 签名的模型执行，不建立另一套正式注册或积分。

## 入口与签名

正式入口：`POST /api/unified/execute`，JSON 为 `{accountId, operation, payload}`。operation 支持 `analyze`、`analyze-v2`、`evaluate`、`describe`、`embed`、`search`。返回值保持对应旧接口 JSON，不套新 envelope；由 Worker/BFF 适配插件 envelope。

查单：`POST /api/unified/result`，JSON 为 `{accountId, requestId}`。请求头的 requestId 必须与正文一致。每次查询可以更新 timestamp 后对原 requestId 重新签名；不会认领执行、调用模型或扣额。

两端仅在服务端注入同名 `PRODUCT_EXECUTOR_SECRET`，32–256 个可打印 ASCII 字符，建议新生成至少 32 随机字节编码值。不复用 Clerk、模型、CloudBase 数据库凭据或旧匿名 Secret。

| 请求头 | 值 |
| --- | --- |
| `Content-Type` | `application/json` |
| `X-ArchBuddy-Timestamp` | 13 位 epoch 毫秒，前后最多 5 分钟 |
| `X-ArchBuddy-Request-Id` | 原任务 UUID |
| `X-ArchBuddy-Signature` | 下述字符串的 HMAC-SHA256，64 位小写十六进制 |

签名串按下列六项用换行连接，不添加末尾换行：

```text
v1
POST
/api/unified/execute
<timestamp>
<requestId>
<sha256(原始 JSON 字节)>
```

查单使用自己的精确路径 `/api/unified/result`。签名绑定真实收到的原始 JSON；不能在签名后重新序列化。最大正文 1 MiB。账号只信任签名正文，不接受浏览器伪造的头或旧匿名 installationId。

## 幂等、计费与未知结果

使用现有 `archbuddy_dev_requests` 集合，文档 ID 为 `unified_<sha256(accountId + 换行 + requestId)>`。保留 `projectId=archbuddy`、`stage=development` 与 `kind=unified-execution`，账号只存项目内摘要；请求只存摘要、操作、状态、时间及完成结果，不存原始输入图片或输入 payload。事务核对归属和摘要，跨实例只能认领一次。账号或参数不匹配不重用旧记录。

- 执行前事务写 pending/reserved，调用供应商前再写 submitted。进程崩溃、网络超时、5xx、成功响应损坏、结算记录失败等不确定状态保留 pending，不能据此退款或重复调用。
- completed 持久化旧接口完整响应（含生成提示词或向量）；重复 execute 仅返回记录，不调用模型。
- 提交前明确失败，或供应商明确返回 400/401/403/404/413/415/422/429 拒绝，持久化 failed。错误响应仅在失败状态保存成功后附 `executionState: failed`；其他已认领异常为 pending。供应商 HTTP 408/5xx 不作为确认未收费。
- 查单只返回 `completed + result`、`failed + errorCode`、`pending` 或 `not_found`。not_found 表示无法查到结果，不能自行推导“从未提交”或退款。
- 统一路径跳过旧 CloudBase 次数/积分预占，防止双重扣费；只有 Worker 的 D1 预占、扣减、退款与全站成本预算生效。CloudBase 并发/分钟速率限制仅用于保护，不增加独立每日预算。
- 浏览器断开不主动取消已提交的统一模型请求，尽量写入可查结果。供应商超时仍按现有适配器上限中断，但不能当作确认失败。

结果保存目标为 30 天，`expiresAt` 已写入，查询拒绝读取过期结果。旧隔离记录明确 TTL 尚未验证，部署前必须核验该集合的 `expiresAt` 自动清理；仅有字段不等于物理删除已经实现。完成结果可能含私人文字或向量，集合必须 ADMINONLY，不能开放给匿名或浏览器客户端。旧历史计数和本地手机号账本不删除。

## 上线配置和成本边界

保留原 `archbuddy-api` 服务、环境及模型配置，只新增执行器 Secret。启动条件：非本地演示必须 `ARCHBUDDY_QUOTA_MODE=cloudbase`、有效 `PRODUCT_EXECUTOR_SECRET`，以及既有 `ARCHBUDDY_CLOUDBASE_ENV_ID` / `ARCHBUDDY_CLOUDBASE_API_KEY` / `ARCHBUDDY_STAGE=development`。保留 `DEEPSEEK_API_KEY`、`DEEPSEEK_MODEL`、`DEEPSEEK_BASE_URL`（如已有）、`ARCHBUDDY_EMBEDDING_API_KEY`、PORT 和服务规模。不要将这些值写入包或聊天。

生产默认拒绝旧 `/api/session`、分析、评估、简析、向量和搜索路径，HTTP 410 `UNIFIED_LOGIN_REQUIRED`；旧管理员 Token 同样不能绕过。保留旧 Secret 不会重新启用旧入口。无需删除旧账号库。local-demo 仅允许明确 NODE_ENV=development/test、回环网络；匿名测试入口只由测试代码显式传 `legacyTestMode: true` 且 NODE_ENV=test，不接受启动环境变量开启。

2026-10-30 用户确认插件反推、语义搜索、向量化不适用美元上限；画布每日 2 USD、单次 1 USD 保护保留。普通下载免费，200 次赠送按简析成功扣次，深度反推保留独立 50 次；所有结算由统一 Worker 完成，CloudBase 不再扣旧匿名或本地积分。输入/输出上限、每分钟频率、并发与持久幂等保留。`PRODUCT_EXECUTION_ENABLED` 由主会话在签名执行器与结果查单验收后启用，不能仅凭插件开关假定已经发布。

## 构建与受控发布准备

本机只读核验 CloudBase CLI 3.8.2。原仓库配置登记 `archbuddy-api`、`ap-shanghai`、development、稳定版本 014；本轮未查询线上资源/版本/余额。工作树没有复制真实 environment.json。CLI 登录配置文件存在，但本轮未读取凭据或验证其有效性。

```powershell
# 仅生成白名单目录与 ZIP，不上传
& cloudbase/scripts/build-deploy-package.ps1

# 将本次输出目录代入；命令已核对本机 help，但本轮未执行
# 仅从白名单目录发布灰度，不能把仓库根目录作为 source
# 先在现有服务的受控版本配置中保留原 env 并增加 PRODUCT_EXECUTOR_SECRET
tcb cloudrun deploy --env-id <已登记环境ID> --service-name archbuddy-api --source <本次白名单目录绝对路径> --port 8080 --traffic
```

不要直接 promote 或复用旧匿名版本回滚：先核验灰度健康、生产旧入口 410、无模型签名查单、集合权限/TTL、Worker Secret一致及调用总预算，再由主会话完成切流。模型实测必须遵守已批准预算，不为验收连续调用上限。当前包不含账户账本、environment.json、开发临时数据或 Secret。

参考：本机 `tcb cloudrun deploy --help`；[CloudBase 官方源代码迁移说明](https://docs.cloudbase.net/quick-start/migration/vercel)。

## 已完成验证

使用模拟供应商与串行事务数据库，27 项 CloudBase 测试通过，其中新增 5 项覆盖：默认关闭旧管理员/匿名入口；方法/路径/时间/正文/账号篡改；双实例并发/重放/跨账户结果；超时与确认失败的结算差异；数据库不可用和 search/embed 共用幂等边界。未发送真实图片或调用模型，未执行数据库变更、发布或切流。

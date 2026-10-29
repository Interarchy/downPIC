# 统一账户模型执行器（015 已发布）

更新：2026-10-30。本文件优先于旧匿名测试部署说明。统一执行器已由主任务部署为 `archbuddy-api-015` 并完成 100% 切流；014 保留为旧版本，不能恢复其匿名访问作为正式回滚。官网、Canvas、插件统一账户、积分和权益以 Cloudflare D1 为唯一主源。CloudBase 只接收 Worker 签名的模型执行，不建立另一套正式注册或积分。

## 当前线上证据：2026-10-30

主任务已在真实切流后确认 `archbuddy-api-015` 为 normal 且在线比例 100%，随后 `verify-unified-executor.mjs --version archbuddy-api-015 --verify` 通过以下四项。读取版本与实际探针结合，未将旧 014 的健康响应误记为新版通过。

| 探针 | 实际结果 |
| --- | --- |
| `GET /api/status` | 200，`accountMode=unified`、`anonymousSessionsEnabled=false` |
| `POST /api/session` | 410，`UNIFIED_LOGIN_REQUIRED` |
| HMAC 签名 `POST /api/unified/result` | 200，合成不存在任务返回 `not_found` |
| 错误签名 `POST /api/unified/result` | 401，`UNIFIED_UNAUTHORIZED` |

该验收 `modelCalls=0`；未提交 execute、未消耗用户权益，不能代表真实模型调用、成功扣次或用户登录 E2E 已验收。通过后，主任务已向实际 `archbuddy-beta-preview` 设置 `PRODUCT_EXECUTION_ENABLED=true`；同名执行器 Secret 已先通过专用 Secret 名称元数据核验存在，未在记录中披露密钥值。

集合 `archbuddy_dev_requests` 为 ADMINONLY，专属 `archbuddy_unified_expiry_v1` TTL 已成功建立并回读确认（`unifiedExpiresAt:1`、`expireAfterSeconds:0`）；旧两个索引保持。TTL 配置生效不等于已经观察了 30 天后的实际清理，应用端到期读取拒绝仍保留。

最初 URL_PARAMS 灰度 API 虽返回成功，实际回读仍 FLOW 且没有定向参数；未声称定向测试成功，也未继续重复配置。主任务保持 Worker 执行关闭，采用显式 015 全流量切换，再完成上述四项探针，最后才开启 Worker。现有脚本默认拒绝未经确认的 canary 写操作。

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
- 统一路径跳过旧 CloudBase 次数/积分预占，防止双重扣费；只有 Worker 的 D1 预占、扣减与退款生效；美元预算仅适用于画布，不适用于用户明确豁免的插件操作。CloudBase 并发/分钟速率限制仅用于保护，不增加独立每日预算。
- 浏览器断开不主动取消已提交的统一模型请求，尽量写入可查结果。供应商超时仍按现有适配器上限中断，但不能当作确认失败。

结果自创建起保存 30 天，`expiresAt` 控制即时读取拒绝，`unifiedExpiresAt` BSON Date 对应已核验的专属 TTL 物理清理；后台删除可能有延迟。旧记录不含专属字段，不受新 TTL 影响。完成结果可能含私人文字或向量，集合必须 ADMINONLY，不能开放给匿名或浏览器客户端。旧历史计数和本地手机号账本不删除。

## 上线配置和成本边界

保留原 `archbuddy-api` 服务、环境及模型配置，只新增执行器 Secret。启动条件：非本地演示必须 `ARCHBUDDY_QUOTA_MODE=cloudbase`、有效 `PRODUCT_EXECUTOR_SECRET`，以及既有 `ARCHBUDDY_CLOUDBASE_ENV_ID` / `ARCHBUDDY_CLOUDBASE_API_KEY` / `ARCHBUDDY_STAGE=development`。保留 `DEEPSEEK_API_KEY`、`DEEPSEEK_MODEL`、`DEEPSEEK_BASE_URL`（如已有）、`ARCHBUDDY_EMBEDDING_API_KEY`、PORT 和服务规模。不要将这些值写入包或聊天。

生产默认拒绝旧 `/api/session`、分析、评估、简析、向量和搜索路径，HTTP 410 `UNIFIED_LOGIN_REQUIRED`；旧管理员 Token 同样不能绕过。保留旧 Secret 不会重新启用旧入口。无需删除旧账号库。local-demo 仅允许明确 NODE_ENV=development/test、回环网络；匿名测试入口只由测试代码显式传 `legacyTestMode: true` 且 NODE_ENV=test，不接受启动环境变量开启。

2026-10-30 用户确认插件反推、语义搜索、向量化不适用美元上限；画布每日 2 USD、单次 1 USD 保护保留。普通下载免费，200 次赠送按简析成功扣次，深度反推保留独立 50 次；所有结算由统一 Worker 完成，CloudBase 不再扣旧匿名或本地积分。输入/输出上限、每分钟频率、并发与持久幂等保留。`PRODUCT_EXECUTION_ENABLED` 已由主任务在签名执行器与结果查单验收通过后启用；实际模型与用户权益验收仍须单独完成。

## 历史发布准备：2026-10-30 切流前快照

以下为切流前的准备记录和当时使用的固定版本命令，不是当前线上状态，不应直接重跑 014 命令。已只读核实 CloudBase CLI 3.8.2 登录与腾讯 API 可用；`dev-mel-d9guu8bpu44029179` / `ap-shanghai` / `archbuddy-api` 当前 014 为 100% 在线版本、8080端口、0–1实例。现有13个环境变量保留，无执行器Secret。`archbuddy_dev_requests` 实际权限 ADMINONLY，仅有 `_id_` 和 `_openid_1` 两索引，尚无TTL；本轮未改变线上配置。

`cloudbase/scripts/publish-unified-executor.mjs` 默认只读。它从已提交 Git 对象读取固定17个部署源文件，在内存构建ZIP，拒绝未提交源码。复用现有 tcb 临时凭据签名 API，只把 `PRODUCT_EXECUTOR_SECRET` 合并到完整旧 EnvParams，环境与源文件不落地，不输出供应商密钥、签名或上传地址。真实发布仅提交 GRAY，保留旧100%版本、不自动切流、不取消其它发布任务；CloudBase接受后再通过Wrangler标准输入写入同一新密钥。root必须先核实线上 Worker 执行开关关闭。

```powershell
# 只读计划与集合权限/索引核对
node cloudbase/scripts/publish-unified-executor.mjs --expect-version archbuddy-api-014 --inspect-database

# 审核后由主任务执行，不在子任务自动运行
node cloudbase/scripts/publish-unified-executor.mjs --execute --expect-version archbuddy-api-014 --worker-config C:/Users/lee/.codex/worktrees/stage5-launch/AIGC_Web/cloud/worker/wrangler.jsonc --wrangler-cli C:/Users/lee/.codex/worktrees/stage5-launch/AIGC_Web/node_modules/wrangler/bin/wrangler.js

# 仅当CloudBase已持久保存原密钥、Worker写入失败时恢复；不会重打包/重发布/轮换
node cloudbase/scripts/publish-unified-executor.mjs --execute --sync-worker-only --expect-version archbuddy-api-014 --worker-config C:/Users/lee/.codex/worktrees/stage5-launch/AIGC_Web/cloud/worker/wrangler.jsonc --wrangler-cli C:/Users/lee/.codex/worktrees/stage5-launch/AIGC_Web/node_modules/wrangler/bin/wrangler.js
```

未知发布结果不自动重试，也不生成另一把密钥；先读版本状态。构建完成后须核验灰度健康、旧入口410、无模型签名查单、权限/保留期、Worker一致，再由主任务显式切流并开启统一执行。不能直接用旧匿名版本回滚到可公开执行：故障先暂停Worker执行，保留旧版本用于受控恢复。

## 统一记录专属30天物理清理

统一记录同时保存 `expiresAt` 与 `unifiedExpiresAt` BSON Date，二者均为创建后30天。新增TTL只索引 `unifiedExpiresAt`，不更改旧匿名记录、不改通用 expiresAt、不删现有索引。`--apply-ttl --execute --expect-version archbuddy-api-014` 是独立操作，不能与发布或密钥恢复组合；仅允许固定集合上创建 `archbuddy_unified_expiry_v1` 单字段索引，`expireAfterSeconds:0`。先检查 ADMINONLY 和现有索引，同名不同配置则停止，完成后用原生listIndexes确认TTL和旧索引均保留。未带专属日期的历史记录不受新TTL影响。TTL物理删除有后台延迟，到期API即时拒绝读取仍保留。

```powershell
# 审核后由主任务执行；这条只处理专属TTL，不部署或配置密钥
node cloudbase/scripts/publish-unified-executor.mjs --execute --apply-ttl --expect-version archbuddy-api-014
```

依据：[CloudBase部署API](https://docs.cloudbase.net/api-reference/manager/node/cloudrun)、本机CLI官方打包实现、[RunCommands](https://cloud.tencent.com/document/product/876/129012)、[MongoDB TTL机制](https://www.mongodb.com/docs/current/core/index-ttl/)。CloudBase公开UpdateTable模式没有TTL字段，脚本通过固定原生createIndexes命令设置，不猜测未公布参数。实际创建及原索引保留已由主任务执行并回读核验，见文首当前证据。

## 已完成验证

2026-10-30 收尾执行 `node --test extension/tests/*.test.mjs cloudbase/tests/*.test.mjs`，共 107 项通过：插件 62 项、CloudBase 45 项。CloudBase 新增发布脚本 12 项、路由 3 项、探针 3 项；原有 27 项使用模拟供应商与串行事务数据库，其中新增 5 项覆盖：默认关闭旧管理员/匿名入口；方法/路径/时间/正文/账号篡改；双实例并发/重放/跨账户结果；超时与确认失败的结算差异；数据库不可用和 search/embed 共用幂等边界。离线测试未发送真实图片或调用模型；实际数据库索引、发布与切流由主任务独立执行，证据见文首。

## 灰度状态与无模型验收

`verify-unified-executor.mjs` 仅读取指定版本状态；加 `--verify` 后只访问 `/api/status`、已关闭的 `/api/session` 与带签名的 `/api/unified/result`。合成账户与随机请求ID仅查不存在的记录，不提交任务、不扣权益、不调用模型。验收目标必须是腾讯API返回的精确URL参数定向版本，或已明确100%在线的目标版本；缺路由时拒绝将旧版测试误记为新版成功。不会输出Secret、签名或定向参数值。

```powershell
node cloudbase/scripts/verify-unified-executor.mjs --version archbuddy-api-015
node cloudbase/scripts/verify-unified-executor.mjs --version archbuddy-api-015 --verify
```

腾讯 schema 列出 `URL_PARAMS`，但本次服务的实际配置未生效；文档支持不等于当前服务已验收。`route-unified-canary.mjs` 现拒绝普通 canary 写操作；`--promote` 仍要求实际路由和四项探针通过。主任务本次在执行关闭的前提下使用 `--execute --promote-direct`，固定 014→015、候选 normal、原版100%，允许已完成的 open/gray 发布单，随后通过 verify 脚本回读015100%并验收。该一次性路由脚本现因线上已015而拒绝重复执行；以后发布须另核对目标，不能复用硬编码旧版本。依据：[腾讯VersionFlowInfo/流量类型](https://cloud.tencent.com/document/api/1243/75713)。

Wrangler写Secret仅传 `--config` 与 `--env preview`，不能再加 `--name archbuddy-beta-preview`，否则Wrangler会重复添加环境后缀。CLI成功只表明命令完成，必须另用Cloudflare专用Secret名称列表核验实际服务；不能根据完成日志推断执行开关或密钥目标已正确。

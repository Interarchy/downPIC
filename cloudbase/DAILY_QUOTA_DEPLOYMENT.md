# 每日额度版本部署与验收

本版交付：数据库事务执行个人 20 / ArchBuddy 总计 200 次每日限额；按北京时间自然日计数；重复请求去重；数值 Token 用量返回与记录；项目独立停用开关。模型只在额度成功预占后调用，数据库不可用时拒绝分析。

状态：真实数据库和云端每日额度已由用户完成一次脚本测试。匿名安装会话已部署，公开状态与通行证签发检查通过；真实浏览器图片反推待验证。产品行为统计仍未实现。

## 1. 登记专属数据库资源

环境：使用服务端配置的 ArchBuddy 开发环境，地域为上海。仅新建下列文档数据库集合；若同名集合已存在，先确认归属、数据结构和权限，不覆盖未知资源。

| 集合 | 用途 | 保存内容 |
| --- | --- | --- |
| `archbuddy_dev_quotas` | 每日项目和个人计数 | 项目、阶段、日期、身份哈希、计数、到期日期 |
| `archbuddy_dev_requests` | 去重与模型用量 | 项目、阶段、日期、身份哈希、请求摘要、结果状态、数值 Token、耗时、到期日期 |

均设置为客户端不可读写，数据由服务端处理。核验当前数据库类型支持 Node SDK 文档事务。API Key 的服务端权限可能覆盖整个环境，客户端安全规则不等同于服务端最小权限；应用代码只允许上述两集合并验证项目与阶段。实际凭据权限必须核验、登记，不要为了使调用成功而给匿名客户端开放数据库。

记录已包含 `expiresAt` 日期字段，目标保留 30 天；单有字段不会自动删除，需要在这两个集合分别配置并验证到期清理机制（支持 TTL 时使用该字段）。每日重置按日期键实现，不依赖删除时间，不允许清空整个数据库。请求去重范围为记录保留期；每次新调用使用新 UUID，不复用过期请求 ID。

## 2. 服务端凭据与配置

为 ArchBuddy 建立专用 CloudBase 服务端 API Key 并只注入 `archbuddy-api` 服务。它用于访问数据库，与 DeepSeek Key、测试 Token 是三种不同凭据。不要把任何服务端 Key 写进代码包、插件或聊天记录。核验 Key 所属环境和权限，不能复用其他项目的 Key。

在该服务环境变量中增加：

| 名称 | 值 |
| --- | --- |
| `ARCHBUDDY_QUOTA_MODE` | `cloudbase` |
| `ARCHBUDDY_CLOUDBASE_ENV_ID` | 实际 CloudBase 环境 ID；仅配置在部署环境与本地未跟踪配置中 |
| `ARCHBUDDY_STAGE` | `development` |
| `ARCHBUDDY_CLOUDBASE_API_KEY` | 为 ArchBuddy 新建的 CloudBase 服务端 Key |
| `ARCHBUDDY_ANALYSIS_ENABLED` | `true`；紧急暂停改为 `false` 并使新配置生效 |
| `ARCHBUDDY_SESSION_SECRET` | 新生成的 ArchBuddy 开发阶段匿名会话签名密钥，32–256 个可打印 ASCII 字符；不得复用模型 Key、数据库 Key 或管理员 Token |

保留原有 `DEEPSEEK_API_KEY`、`DEEPSEEK_MODEL=deepseek-flash`、`ARCHBUDDY_TEST_TOKEN`、`PORT=8080`。在 daily 模式下不再使用每进程总次数限额；并发 1 和每分钟 3 次仍保留作测试期限制。

目前仅允许已登记的 development 环境。新增阶段不能直接改名字部署，应先实现多个阶段共享项目总额的设计，防止每阶段各增加 200 次。

## 3. 打包、上传

从仓库根目录执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File cloudbase/scripts/build-deploy-package.ps1
```

上传本次输出 ZIP 到现有 `archbuddy-api` 的“更新服务”。Dockerfile 位于包根目录，服务端口 8080；保留旧版部署用于排查。镜像构建新增 `npm ci` 安装锁定版本 `@cloudbase/node-sdk@3.18.3`，因此构建平台需要能够下载依赖。安装脚本已禁用。

未配置 `ARCHBUDDY_QUOTA_MODE` 时仍为原有管理员进程测试模式，仅供兼容排查，不能声称每日配额已经启用。无效模式、错误环境或缺少数据库凭据会阻止新版启动。

## 4. 真实验收

1. `/healthz` 正常，`/api/status` 返回 `quotaMode: daily`、20 / 200、`Asia/Shanghai`；这只证明模式配置，不证明数据库可访问。
2. 使用本地 `test-cloud-analysis.ps1` 发送一张允许上传的图片。脚本自动生成请求 UUID，成功时显示供应商 Token、`Usage saved to quota database: True` 和剩余额度。
3. 在上述两个集合确认对应日期、`projectId=archbuddy`、`stage=development`、计数与用量；确认无图片、提示词正文、网址或密钥。
4. 重启/部署同服务新实例后，再检查同日累计数没有归零。记录每次真实测试可能消耗的模型费用，不为测限额连续调用 200 次模型。
5. 从扩展调用 `/api/session`，确认无需用户 Key 即可分析；两个全新安装身份第一次调用均显示个人剩余 19，项目剩余连续递减。
6. 检查集合权限和保留期，确认其他项目资源未变化。完成后补充隔离文档的云端验收记录。

本地已用合成数据验证边界、并发、重复请求、跨日、数据库错误与跨项目阻断；这些测试不代替腾讯云数据库的实际事务及权限验收。

## 故障与语义

- `QUOTA_UNAVAILABLE`：数据库不可用，本次模型未调用；检查集合、服务 Key 权限和环境，不用改 DeepSeek Key。
- `USER_DAILY_LIMIT` / `PROJECT_DAILY_LIMIT`：对应每日额度达到上限，北京时间零点恢复。
- `DUPLICATE_REQUEST`：该请求已受理，返回 409，不再次调用模型。图片和结果不落库，因此不会重放上次结果。
- 模型调用前已知取消会退回预占；调用后失败不退次数。进程在预占与调用之间崩溃时无法确定是否已计费，保守保留额度，不自动退回或重试；状态 `reserved` 表示结果未知。
- 模型成功后用量记录失败仍返回成功结果和 `usageRecorded: false`，避免诱导重复付费；额度保留，日志只记录固定错误事件，不输出原始数据库或模型错误。
- 缺失的 Token 显示未知，不能按零处理；缓存字段单独展示，不推算不确定的总 Token 或人民币金额。
- 暂停或切换版本不删除配额数据。公开使用后不能用旧的无每日配额版本回滚，否则会绕过保护；应先暂停分析，再修复并保持数据库限额。

参考：[CloudBase 事务说明](https://docs.cloudbase.net/database/transaction)、[Node SDK 初始化](https://docs.cloudbase.net/api-reference/server/node-sdk/initialization)。接口细节已同时核对锁定 SDK 的 `transaction/index.js` 与 `document.js`：事务 get 返回对象或 null，set 直接传对象，runTransaction 返回回调值。

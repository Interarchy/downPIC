# CloudBase 多项目隔离约定

生效日期：2026-09-15。来源：用户明确要求，CloudBase 同时承载 ArchBuddy 和未来其他小项目或 demo，各项目数据必须清晰区分，后续工作每次检查。

## 目标与边界

Chrome 扩展安装在用户浏览器；部署到 CloudBase 的是 ArchBuddy 后端。共享 CloudBase 环境可用于现阶段开发，但每个项目有独立业务资源和数据边界。前缀和字段用于识别归属，访问控制用于约束权限，两者都要检查。

此约定先沿用现有环境和服务，不创建新收费资源，也不迁移现有服务。需要更强隔离时，评估独立环境及其成本后执行；不能把同一环境内的命名分区描述成物理隔离。账号管理员或环境级凭据仍可能访问多项目资源，需要核验实际权限。

## 已登记资源与现状

| 项目 | 当前值 | 状态或限制 |
| --- | --- | --- |
| 产品 / 固定项目标识 | ArchBuddy / `archbuddy` | 其他项目不得复用 |
| CloudBase 环境 | 真实 ID 仅保存在本地配置与部署环境中 | 按可多项目共享环境管理，不归 ArchBuddy 独占 |
| 地域 / 阶段 | `ap-shanghai` / `development` | 命名中的阶段简称为 `dev`；未来 `staging`、`production` 分别使用 `stg`、`prod` |
| 云托管服务 | `archbuddy-api` | 已有开发测试服务，保留名称；未来其他阶段另建服务 |
| 后端地址 | `cloudbase/environment.json` 中的 `backendUrl` | 仅对应已登记服务；不得覆盖其他项目路由 |
| 数据库集合或表 | `archbuddy_dev_quotas`、`archbuddy_dev_requests` | 用户已确认按 ADMINONLY 创建，并报告每日额度脚本测试成功；TTL 自动清理仍待配置和验证 |
| 云存储对象 / 静态托管 | ArchBuddy 独立静态站已部署并公开验证；URL 见 `cloudbase/environment.json` | 隐私政策公开页面；当前图片和结果只在请求内存处理，不落盘 |
| 业务身份与使用统计 | 匿名安装会话已部署；计划集合 `archbuddy_dev_events` 尚未创建、尚未验证、不得启用 | 原始安装 ID 只在浏览器；可选统计默认关闭，只处理不可逆项目内主体和白名单事件 |
| 调用额度 | 当前个人每日50 / 项目共享500；环境变量配置 | 用户2026-10-06指定；014版本及服务配置核对50/500，normal与100%流量已验证；未配置时兼容默认20/200，普通用户不取得具体余额，金额预算尚未设定 |
| 日志 | 服务输出已有就绪和启动失败事件 | 腾讯云日志主题、访问日志、保留期和权限尚未在本次检查中核验 |
| 服务凭据 | `DEEPSEEK_API_KEY`、`ARCHBUDDY_TEST_TOKEN`、`ARCHBUDDY_SESSION_SECRET` 等 | 仅登记变量名，不登记值；其他项目不得默认复用本项目令牌 |

以上现状来自仓库实现及此前部署记录，不代表已完成云端全资源或权限审计。

## 后续资源命名与访问规则

以下是预留规则，不表示资源已经创建。

| 资源 | ArchBuddy 开发阶段示例 | 必须同时满足 |
| --- | --- | --- |
| 新服务、云函数、定时任务 | `archbuddy-dev-<用途>` | 仅操作登记的本项目资源；已有 `archbuddy-api` 为开发阶段兼容例外 |
| 数据库集合或表 | `archbuddy_dev_installations`、`archbuddy_dev_events`、`archbuddy_dev_quotas` | 不使用通用 `users`、`events`、`logs` 存放多项目混合数据；数据库入口集中管理并限定允许的集合 |
| 云存储路径 | `archbuddy/dev/<用途>/…` | 上传、读取、列举、清理和临时访问凭据均限此范围；拒绝跨前缀和路径穿越 |
| 缓存、队列和幂等键 | `archbuddy:dev:<用途>:<标识>` | 不跨项目去重、刷新额度或清理缓存 |
| 业务身份 | 项目与阶段范围内的安装 ID / 用户映射 | 即使将来共用认证设施，业务账户和授权仍独立，其他项目令牌不可直接授权 ArchBuddy |
| 日志和统计 | `projectId=archbuddy`、`stage=development`、服务名 | 写入和查询均限定项目、阶段；支持时使用专属主题，否则在权限允许范围内明确过滤并记录剩余风险 |
| 凭据 | 仅注入对应服务与阶段 | 采用项目独立密钥或令牌；申请实际平台支持的最小权限；禁止把管理员或模型密钥放入扩展 |
| 配额、预算和告警 | `archbuddy:dev` 范围 | 业务扣次、重置、统计和停用只影响本项目；共享账号总账或平台费用需要单独识别 |
| 备份、导出与回滚 | `archbuddy/dev/<日期或版本>/…` | 明确包含的集合和路径；只恢复本项目目标，不覆盖整个环境 |

新增持久化业务记录应带 `projectId` 和 `stage`，在服务端按已部署配置写入并核验。客户端无法通过篡改字段、集合名称或对象路径选择其他项目资源。若供应商接口格式或权限机制不支持某项规则，先记录替代设计与实际边界，再实施，不能仅加字段后宣称隔离成立。

业务统计仅记录经过同意的功能事件及必要元数据，不记录图片、提示词正文、网址、文件路径或自定义分类文字；必要防滥用数据与可选产品统计分别确定用途、保留期和访问权限。

## 每次涉及云端变更的检查

1. 核对项目 `archbuddy`、阶段、环境 ID、地域、服务名和目标地址，不依赖控制台当前默认选项。
2. 列出本次读写、新建、更新、迁移和删除的资源；为新增资源补充具体名称、用途、数据类型、保留期、权限和状态。未使用项标记“不适用”。
3. 核对集合、文件前缀、缓存键、任务、身份、日志、密钥和预算均在本项目及阶段范围内。
4. 检查运行凭据、存储和数据库规则的实际权限；环境范围的高权限仍应记录为限制，不能用资源前缀代替此检查。
5. 验证其他项目或阶段的标识、令牌、对象路径不能访问本项目数据，反向也不可；涉及持久化实现时加入有针对性的隔离测试，使用合成数据。
6. 检查部署、迁移、导出、清理、定时任务和回滚不使用环境级清空或无归属通配操作；修改共享网关、认证、权限或日志配置前分析其他项目影响。
7. 确认预算和停用范围：ArchBuddy 超额不会主动停用其他项目，其他项目用量不扣减 ArchBuddy 业务额度；共享平台资源竞争或账号余额影响另行记录。
8. 发布前记录检查结果、尚未验证项和对应证据；未验证项涉及本次变更的数据边界时，不能按已通过发布。

检查记录格式：日期、任务/版本、项目/阶段/环境/服务、变更资源、权限边界、测试证据、未验证项、结论。只记录必要的配置元数据，不写密钥或用户数据。

## 检查记录

### 2026-09-15：首次登记（仅文档变更）

- 目标：ArchBuddy / development / 已登记的本地 CloudBase 环境 / `archbuddy-api`。
- 证据：已读取 `cloudbase/environment.json`、`cloudbase/server.mjs`、`cloudbase/start.mjs` 和部署打包脚本；代码未接入数据库或云存储，图片与结果不落盘；构建使用明确的文件白名单。
- 本次变更：新增仓库长期规则、资源登记和检查清单；没有更改云端服务、数据或权限。
- 未验证：账号内其他项目资源、实际运行角色权限、平台日志隔离与保留期；后续首次涉及这些配置时核验。
- 结论：项目边界已登记；当前不涉及新增持久化数据。数据库、统计、免登录身份和持久化预算的隔离尚待对应功能实现与验证。

### 2026-09-15 额度规则登记补充

本次仅更新文档，目标仍为 `archbuddy` / development / `archbuddy-api`。个人每日 20 次、项目每日总计 200 次已写入 `ARCHBUDDY_QUOTA_POLICY.md`；未创建数据库或修改云端配置，隔离权限和持久化计数待实现时核验。项目总额不得因增加实例或版本而倍增。

### 2026-09-15 每日额度实现（云端待部署）

- 目标环境、阶段和服务不变。本地数据库适配器固定环境 ID、阶段及两集合白名单；字段归属不匹配时拒绝分析。
- 登记 `archbuddy_dev_quotas`（每日计数）和 `archbuddy_dev_requests`（去重、用量），均仅供服务端访问。身份只保存项目内哈希，不保存参考图、结果正文或可选行为统计。
- 使用专属环境变量 `ARCHBUDDY_CLOUDBASE_API_KEY` 显式注入数据库凭据，不读取或修改其他项目 Key；凭据实际权限仍可能为环境级，尚待云端核验。
- 数据带 `expiresAt`，目标 30 天保留；尚未配置实际到期清理，不能声称已自动删除。
- 模拟数据库验证并发计数、事务回滚、重复请求、跨日、数据归属和失败计次。云端权限、实际事务冲突及服务重启仍待验收；没有修改其他项目云资源。
- 详细字段、配置和验收步骤见 `cloudbase/DAILY_QUOTA_DEPLOYMENT.md`。新增其他阶段前必须先设计统一项目预算。

用户确认补充：两个集合已按 ADMINONLY 创建（依据创建界面截图及随后“好了”的反馈）；尚未远程读取权限配置，数据库凭据、真实事务和到期清理仍待核验。

2026-09-15 在线检查补充：用户确认新部署成功，当前 `/healthz` 与 `/api/status` 实测 HTTP 200，`quotaMode=daily`、个人 20、项目 200、时区 `Asia/Shanghai`，仍为管理员测试模式。新部署序号未知，状态文件不再把当前版本标为 002；真实数据库事务、权限与 Token 落库仍待单次图片测试验证。本次仅 GET 两个公开状态接口，没有读取密钥、发送图片或操作其他项目数据。

用户随后报告每日额度图片测试成功，因此将真实额度事务标为已验证；未收到终端完整输出，`usageRecorded`、服务重启后累计延续和 TTL 清理仍分别保留为未验证项。

### 2026-09-15 匿名安装会话实现与部署验证

- 目标仍为 `archbuddy` / development / 已登记的本地 CloudBase 环境 / `archbuddy-api`，没有新增集合、存储路径或跨项目配置。
- 扩展本地生成 UUID；服务端用 `ARCHBUDDY_SESSION_SECRET` 生成项目和阶段固定的不可逆主体并签发 7 天令牌。原始安装 ID 不写数据库，令牌不能指定集合、项目或阶段。
- 每次分析仍由已登记的 `archbuddy_dev_quotas` 与 `archbuddy_dev_requests` 扣次；管理员测试和匿名请求共同受项目 200 次总额约束。
- 本地测试覆盖不同安装分别计数、伪造与篡改拒绝、过期拒绝和非法安装 ID。CloudBase 部署、签名密钥注入和浏览器链路已验证；服务日志边界仍待核验。
- 可选行为统计未实现，也未创建 `archbuddy_dev_events`；不因匿名鉴权自动扩大数据收集范围。

部署验证补充：用户确认更新服务完成。随后只读取 ArchBuddy 已登记地址的 `/healthz` 与 `/api/status`，均返回 HTTP 200；状态明确为 `anonymous-beta`、`anonymousSessionsEnabled=true`、`quotaMode=daily`、20 / 200、`Asia/Shanghai`。另使用合成 UUID 调用一次 `/api/session`，成功取得 7 天短期令牌，令牌内容未输出或保存；未上传图片、未调用 DeepSeek、未扣额度、未操作数据库或其他项目资源。真实浏览器反推、服务日志边界、TTL 清理和服务重启后额度延续仍待验证。

用户体验决策补充：额度规则继续在服务端执行，但匿名用户的分析响应和插件界面不返回具体剩余次数；仅管理员测试身份可读取单次响应中的剩余额度。此调整不新增或修改数据库资源，不影响其他项目。

重新部署验证补充：仅 GET 已登记服务的 `/healthz` 与 `/api/status`，均返回 HTTP 200；匿名会话与 `quotaMode=daily` 仍启用，状态响应已不包含个人或项目额度数字。未发送图片、未调用模型、未读写数据库或其他项目资源。匿名成功响应不含余额由本地服务测试覆盖；用户随后确认重新加载后的 Chrome 界面正常且不显示具体额度。

### 2026-09-15 隐私政策静态页面准备

- 新增本地目录 `cloudbase/hosting/archbuddy/privacy/`，登记云端目标为 `/archbuddy/privacy/`；仅包含公开的静态 `index.html`，无脚本、表单、Cookie、数据库或模型调用。
- 联系邮箱已由用户提供并同步到扩展内说明与公开政策。未新增密钥、身份、日志或业务数据。
- 构建和部署必须限定上述子路径，禁止覆盖静态托管根目录或其他项目目录。当前状态仅为待上传，不宣称已获得公开 URL。
- 官方文档确认静态目录可部署至指定子路径；默认域名适合开发测试，正式长期使用建议备案自定义域名。公开可访问性和最终 URL 待上传后验证。

用户随后确认 `archbuddy-privacy` 网站托管部署成功；未对静态托管根目录或其他项目路径执行覆盖或删除。公开 HTTPS 地址 `https://archbuddy-privacy-dev-mel-d9guu8bpu44029179.webapps.tcloudbase.com/` 已由用户在浏览器中确认可访问。本次只记录 URL 和验证状态，不修改云端资源、权限、数据、密钥、日志或预算。

2026-09-19 隐私政策更新验证：用户更新既有 `archbuddy-privacy` 静态站，加入 Chrome Web Store Limited Use（有限使用）声明。只读请求验证公开地址返回 HTTP 200，同时包含 `Limited Use` 与登记的联系邮箱。本次未新建静态站、未覆盖共享托管根目录，也未修改数据库、身份、密钥、日志或预算；其他项目资源未触及。

### 2026-09-20：V2 可选匿名统计计划登记（仅本地代码准备）

- 固定边界：项目 `archbuddy`、阶段 `development`、地域 `ap-shanghai`、本地登记环境 `dev-mel-d9guu8bpu44029179`、服务 `archbuddy-api`。
- 计划资源：`archbuddy_dev_events`，用途仅为经用户主动选择加入后的最小产品漏斗；目标权限为 `ADMINONLY`，目标保留期为 30 天。状态为**尚未创建、尚未验证、不得启用**。
- 计划字段只包括服务端固定的 `projectId`、`stage`、服务端派生的 `actorHash`、UUID `eventId`、白名单 `eventName`、可选白名单 `outcome`、客户端事件时间、服务端接收时间、30 天到期时间和 `schemaVersion=1`。
- 明确排除：图片、缩略图、网址、Prompt、模块正文、证据、自定义分类、文件路径、Cookie、令牌、原始安装 ID、邮箱、手机号及其他直接身份。
- 开关：服务环境变量 `ARCHBUDDY_ANALYTICS_ENABLED` 默认且当前必须为 `false`。集合、ADMINONLY 权限、30 天 TTL、V1/V2 路由兼容、日志边界和合成越界拒绝均在 CloudBase 实际验证前，不得设为 `true`。
- 本次工作只修改仓库内实现与披露草稿，不创建集合、不更改 CloudBase 环境变量、不部署服务、不读取或列举任何 `st-` 或其他项目数据。
- 未验证：集合实际权限、TTL、生效地域、服务运行角色、事件写入、日志正文边界和跨项目拒绝。结论：可进入本地实现；线上统计继续关闭。

### 2026-09-24：V3 并发和整体编辑（仅本地）

- 已复核本地登记的 ArchBuddy / development / ap-shanghai / archbuddy-api 归属；不创建资源。
- 本地服务默认并发容量由 1 调整为 3，本地启动脚本显式覆盖为 3；未修改云端环境变量。发布时须核对该服务原有 ARCHBUDDY_MAX_CONCURRENT 是否显式为 1。
- 继续沿用已有额度和频率约束、匿名身份与集合范围；手动编辑 Prompt 及生成准则只在扩展本地存储。
- 证据：静态检查通过，重启本地服务后只读 GET /api/status 返回已配置和 process-test 模式；未发送模型请求，未查询或修改云端及其他项目数据。

### 2026-09-25：V3 灰度部署与全量切流

- 目标：ArchBuddy / development / `dev-mel-d9guu8bpu44029179` / `archbuddy-api`，更新资源仅为已登记服务的新源代码版本 `008`。
- 使用白名单构建包并通过 CloudBase CLI 灰度提交；Dockerfile、端口 8080 与项目根目录构建目录保持已登记配置。未传入、记录或复制任何密钥值。
- 用户明确确认后，流量已从 `007` 全量切换到 `008`。只读记录显示 `008` 状态 normal、流量 100%，`007` 状态 normal、流量 0%。未执行删除、迁移、集合访问、存储操作或共享配置修改。
- 既有服务未显式设置 `ARCHBUDDY_MAX_CONCURRENT`，V3 代码默认值为 3；未新增环境变量。随后仅 GET 已登记服务 `/healthz` 与 `/api/status`，确认服务启动、匿名会话和 daily 额度模式正常；未上传图片、调用模型或扣减额度。

## 用于其他新项目

新项目建立自己的 `AGENTS.md` 和资源登记文件，选择唯一项目标识，并在用户维护的 CloudBase 项目清单中登记。共享环境 ID 可以相同；服务、业务集合、对象路径、凭据和业务预算不能直接复用 ArchBuddy 的配置。本仓库规则不会自动覆盖未来其他仓库，应在创建新项目时显式加入。


### 2026-09-28 本地服务代码影响登记

新增语义检索和短描述接口只在本地运行；未来发布仍属于 archbuddy / development / archbuddy-api，复用 archbuddy_dev_quotas 与 archbuddy_dev_requests，不新增集合、对象存储、身份或统计空间。请求正文包含用户主动开启的图片预览或检索文字，禁止写入日志与额度记录。共用原个人 20 / 项目 200 次每日限制，不改变现有预算。此次未访问或修改共享云端资源，云端接口及隔离运行证据须在独立部署阶段补充。

### 2026-09-28：B 方向本地向量索引与 TokenHub 计算登记（仅源码）

- 项目/阶段/环境/服务：`archbuddy` / `development` / 已登记共享环境 / `archbuddy-api`。新增接口 `/api/library/embed` 仅在本项目服务内；不新建 CloudBase 向量库、数据库集合、存储路径、身份、日志主题或缓存。
- 新外部处理方：腾讯云 TokenHub 文本 Embedding；仅在用户单独同意后传入图库名称、分类、视觉描述、提示词文本或单次查询。图片字节、原文件路径、来源网址和本地索引不传。向量只存插件 IndexedDB；请求正文不写服务日志或额度集合。
- 新服务端凭据名 `ARCHBUDDY_EMBEDDING_API_KEY`，计划仅配置在 `archbuddy-api` 的 development 环境，当前未配置、未验证；不得复用其他项目密钥。额度仍走已登记 `archbuddy_dev_quotas`、`archbuddy_dev_requests`，个人每日 20 / 项目每日 200，批量建索引和查询各按实际模型调用计次；另设默认每分钟 20 次向量接口速率保护。TokenHub 账户级支出与共享账号预算尚未核验。
- 本轮只修改本地源码及隐私文案，没有创建或访问云端资源、没有部署。部署前核对专属密钥作用域、TokenHub 开通与费用、公开隐私站更新、真实匿名调用、已有项目额度不串用、其他项目无法通过本接口访问本地索引。未完成这些检查前不得标为云端隔离验收通过。

### 2026-09-28：本地 TokenHub 凭据验证补充

- 用户已开通 TokenHub 并创建项目专用 Key，本地已用真实 API 核验 1024 维响应；只发送合成文字，未发送用户图片、路径或素材库。
- 凭据以当前 Windows 用户 DPAPI 密文保存于已忽略的 plugin-prototype/runtime/embedding-settings.json，归属 archbuddy/development/tokenhub。仅本地启动脚本读取到本进程环境；不进入扩展、Git 或部署包。
- 服务端源码仍沿用已登记额度，没有增加额度上限或创建新预算资源。本地 process-test 只计当前进程，首次批量索引仍可能用完测试调用额度；线上预算拆分待单独决定。
- CloudBase 中 ARCHBUDDY_EMBEDDING_API_KEY 仍未配置，云端接口未部署；费用、云端 Key 权限范围和共享账号预算未独立核验。本轮没有修改其他项目或共享云配置。

### 2026-10-01：V4 专属隐私站同步

- 项目/阶段/环境/资源：ArchBuddy / development / dev-mel-d9guu8bpu44029179 / 已登记 archbuddy-privacy，固定文件前缀 archbuddy/privacy/index.html。只有公开政策 HTML，无图片、用户记录、密钥或执行脚本。
- 从源目录作为 shell 工作目录执行命名应用的纯静态部署，保持原 /archbuddy/privacy 路径；明确只上传 1 个文件。没有创建新站、修改域名/网关/权限、覆盖共享根目录或操作其他项目。首次 --cwd 扫描范围异常被立即中止，随后查询该固定前缀确认仍只有 index.html。
- 公开 HTTPS 返回 200，含 DeepSeek 和 TokenHub 的 V4 数据流说明，正文 SHA-256 与本地 HTML 一致。CLI 应用记录仍保留原 metadata，本次是现有静态文件更新，不宣称新建构建版本。
- 未涉及集合、对象素材、身份、日志、密钥、额度、预算或运行角色调整；既有角色和日志/TTL 的未核验项仍保留。生成的本地环境配置已移除，模型请求未发生。

### 2026-10-05：公网展示站资源预登记（尚未创建）

- 用户授权：为 ArchBuddy 建立临时公开展示网页，提供已交付插件 ZIP 下载、既有五页项目案例及三条工作链路说明；优先使用 CloudBase。
- 计划资源：静态应用 archbuddy-dev-showcase；项目 archbuddy，阶段 development，地域 ap-shanghai，环境沿用 cloudbase/environment.json 已登记值。唯一云端文件前缀 archbuddy/dev/showcase/；预期域名采用该静态应用的独立 webapps.tcloudbase.com 子域名。状态：尚未查询、尚未创建、尚未部署、尚未验证。
- 数据类型与权限：公开中文 HTML/CSS/JS、现有演示截图/Logo、ArchBuddy 0.6.0 白名单 ZIP。公众仅读取网页和下载；发布凭据只供已有本地 CLI 使用，不写入源码或站点。不收集表单、账号、用户图库、Prompt、行为事件或 Cookie，不提供模型接口。
- 资源范围：不新增或修改数据库集合、业务身份、模型密钥、后端、额度、日志主题、权限或预算配置；不覆盖静态托管根目录、archbuddy/privacy 或其他项目路径。平台既有访问日志、发布角色可能具有环境级权限，实际日志留存与账户级带宽费用仍为既有未核验项；应用名称与路径不等于权限隔离。
- 保留与回滚：用于近期展示，后续保留时间由用户决定；回滚仅重新发布本静态应用的白名单站点副本，不清空共享托管。下载只使用 2026-10-05 已核验的 ArchBuddy ZIP，模型调用和既有 20/200 日额度不受网站访问影响。
- 发布前完成本地引用、语法、敏感内容与实际浏览器检查；创建/发布后只查询该应用与固定前缀，并核验 HTTPS、五页案例、ZIP 字节哈希和原隐私页未改变。最终状态与证据另行追加。

### 2026-10-05：展示站发布与资源隔离核验

- 已创建并发布登记静态应用 archbuddy-dev-showcase，项目 archbuddy / development / ap-shanghai / 已登记共享环境；应用登记 DeployType=static-hosting、LatestStatus=SUCCESS、LatestVersionName=archbuddy-dev-showcase-001、AppPath=/archbuddy/dev/showcase/。独立域名 https://archbuddy-dev-showcase-dev-mel-d9guu8bpu44029179.webapps.tcloudbase.com/ 。CurrentVersion为空，纯静态发布不宣称为后端构建版本。
- 写入资源仅本站静态文件与该应用登记，固定前缀 archbuddy/dev/showcase/。发布从实际仅含18个白名单文件的工作目录执行，16个普通文件和2个入口文件全部上传成功；没有从仓库根目录扫描、没有覆盖根路由或其他前缀。限定查询前缀得到18文件，无用户图库、凭据、环境配置或审阅资料。
- 两种公开入口（独立域名与默认域名的本站子路径）下全部18个文件均 HTTP 200且SHA-256与本地白名单一致；下载ZIP为179857字节，与用户已核验的0.6.0安装包完全一致。独立浏览器在平台首次访问提示中等待3秒并点击“确定访问”后，实际渲染本站首页，资源均200，未出现HTML下载或循环提醒；后续具体交互与下载结果见展示站复核记录。
- 原 archbuddy-privacy 在发布前后均 HTTP 200且正文SHA-256相同：D01C5E2B44C55F6C64CB1647749B2C307326255CAA1259304B45E5B169A05DA8。没有修改后端、集合、模型凭据、业务身份、统计、AI日额度、日志主题、共享网关配置或其他项目资源。站点不调用模型，访问与下载不扣AI额度。
- CloudBase 默认测试域名对新访客显示平台风险提醒，是本次演示的实际访问限制；没有绕过该平台机制或更改共享设置。CLI生成的本地cloudbaserc.json未上传且已移除，真实环境文件仍由Git忽略。平台访问日志、发布角色的环境级权限及账号级带宽费用仍未独立审计，不宣称物理环境隔离。
- 证据：docs/ARCHBUDDY_SHOWCASE_SITE.md、opendesign/review/archbuddy-showcase/verification.md，以及忽略目录cloudbase/dist/showcase-20261005的发布日志/白名单/两种公网哈希/原隐私页哈希。本站回滚或清理仅限该具体应用与前缀，保留时长待用户决定，不清空共享托管。


### 2026-10-05：单页改版与图片测试集资源预登记

- 用户明确授权修改既有展示站为连续滚动单页，并公开下载所提供的 ArchBuddy测试集.7z。只更新 archbuddy / development / archbuddy-dev-showcase 的 archbuddy/dev/showcase/ 前缀。新增下载对象为 archbuddy/dev/showcase/downloads/ArchBuddy-test-images.7z，状态：已本地核对，尚未上传或验证公网。
- 数据类型：用户主动提供的建筑参考图片测试集原压缩包，12020913字节，SHA-256 18E01EDB67EDCF5A1AC32CB6545DAED6C064D0AFA3C3DD3B2EBFA7BF91D7D8AD。公众读取和下载，不收集访客资料，不把文件内容作为指令或执行其中内容；只读列举归档路径，未提取或运行。与访客本机图库、业务身份、模型调用和每日20/200额度分离。
- 既有0.6.0安装包、历史五页路径保留；旧版本站源码和发布清单留存供限定回滚。本次发布前后核对原隐私站哈希，只从19文件白名单目录发布，不改变根路由、共享权限、后端、密钥、集合、统计或预算。平台既有日志与账号带宽费用仍未独立核验。


### 2026-10-05：单页改版与测试集发布核验完成

- 已在原archbuddy-dev-showcase应用与archbuddy/dev/showcase/前缀发布第二版，新增测试集对象仅为预登记的downloads/ArchBuddy-test-images.7z。固定前缀精确19文件、15938286字节；应用LatestStatus=SUCCESS、LatestVersionName=archbuddy-dev-showcase-002，不把静态应用记录表述为后端版本。
- 主域名19资源HTTP200、逐文件SHA-256与白名单一致；备用路径首页和双下载一致。原隐私站哈希发布前后未变。独立真实浏览器正常确认平台提示后渲染新单页，插件ZIP和用户测试集7z实际下载的字节数和SHA-256匹配；页面错误0，没有执行归档或调用模型。
- 上传只从19文件白名单工作目录，CLI临时cloudbaserc.json未上传且已移除；环境登记仅更新showcaseSite状态和下载记录，后端012、集合、模型凭据、身份、额度、日志主题、网关、预算及其他项目均未改。平台日志留存、环境级发布角色和账号带宽成本仍未独立审计。
- 回滚素材保留首版源码归档和旧18文件发布清单，不执行整个环境删除或重置。最终证据见docs/ARCHBUDDY_SHOWCASE_SITE.md、opendesign/review/archbuddy-showcase-scroll和忽略的cloudbase/dist/showcase-revision-20261005。


### 2026-10-05：两条业务链路与Lucide视觉改版预登记

- 用户授权继续更新原公网展示页：两条业务场景链路、三大功能支撑、分析图、章节标题、白底绿字品牌和透明渐变固定导航；以Lucide官方图标替换小图标。只更新archbuddy / development / archbuddy-dev-showcase / archbuddy/dev/showcase/，不新建应用。
- 新增公开静态资源预登记：assets/lucide.svg（仅所用官方图标的SVG sprite）、assets/lucide-LICENSE.txt（许可原文）、assets/favicon.svg（官方drafting-compass图标，仅品牌色设置）。项目archbuddy、阶段development，数据为公开图形/许可证，公众只读，无身份、业务数据、模型调用、密钥或统计。当前尚未上传或验证公网。
- 既有插件ZIP和图片测试集原字节保持；旧19文件发布产物和站点源码留存回滚。发布前核验官方来源、引用/语法/双下载哈希、真实浏览器布局与滚动导航；发布后限定列举该前缀、核验全部22文件与原隐私页哈希。不存在根托管或跨项目配置变更；既有平台日志、角色权限和账号带宽费用仍未独立审计。

### 2026-10-05：两条业务链路与Lucide改版发布核验完成

- 预登记的assets/lucide.svg、assets/lucide-LICENSE.txt、assets/favicon.svg已随第三版发布并验证，只写入archbuddy / development / archbuddy-dev-showcase / archbuddy/dev/showcase/。固定前缀精确22文件、15967942字节；应用LatestStatus=SUCCESS、LatestVersionName=archbuddy-dev-showcase-003，不表述为后端版本。临时配置未上传且已移除，无根路由或跨项目配置修改。
- 主域名全部22文件HTTP200且SHA-256与白名单一致；备用本站路径首页及双下载一致。原archbuddy-privacy发布前后HTTP200、6364字节与SHA-256 D01C5E2B44C55F6C64CB1647749B2C307326255CAA1259304B45E5B169A05DA8保持一致。
- 公网独立浏览器50项检查全通过，正常平台确认后渲染HTML200，无附件下载或循环提醒；桌面与手机无溢出，站点错误0。两个实际下载的字节数和SHA-256均匹配插件与用户测试集原件，未执行归档或发送模型请求。
- 环境文件仅更新showcaseSite部署/验收状态；后端012、集合、模型凭据、身份、业务日志、额度20/200、共享网关、预算及其他项目未修改。既有平台日志留存、环境级发布角色与账号带宽费用仍未独立审计。前两版源码与发布产物保留供限定回滚，未提交或推送Git。
- 最终证据：docs/ARCHBUDDY_SHOWCASE_SITE.md、opendesign/review/archbuddy-showcase-two-workflows/review.md及public-check-summary.json；忽略目录cloudbase/dist/showcase-two-workflows-20261005的部署白名单、日志、资源范围及公网/隐私哈希记录。

### 2026-10-05：第四版闭环图与品牌修订预登记

- 用户授权更新现有展示页的问题路径、产品词语、两条完整闭环、Logo、章节数字、导航与冗余说明。仅archbuddy/development/archbuddy-dev-showcase及archbuddy/dev/showcase/，不新建应用，不修改后端、其他项目或共享配置。
- 新增assets/brand-mark.svg：从extension/icons/logo.svg复用既有A形路径，仅将底色设置为白色、字形设为主题深绿；公开品牌图形，无用户数据、身份、模型、密钥或统计。当前仅登记、未发布。其余22公开文件继续白名单管理，插件与测试集原字节保持。
- 第三版源码与22文件发布产物保留；本轮发布目录showcase-closed-loops-20261005，仅23公开文件。上线前独立检查流程位置与大小环、桌面/手机排版及图标交互；上线后只查询固定应用/前缀并核验23资源、双下载与原隐私站哈希。平台默认域名提示和既有日志/角色/带宽边界不变。

### 2026-10-05：第四版闭环与品牌修订发布核验完成

- 预登记assets/brand-mark.svg已随本轮23文件发布并核验，复用原A字形路径，仅白底深绿配色。只更新archbuddy/development/archbuddy-dev-showcase及archbuddy/dev/showcase/，21普通文件+2入口、15969494字节，LatestStatus=SUCCESS、LatestVersionName=archbuddy-dev-showcase-004，不宣称后端版本。固定前缀精确白名单，CLI临时配置未上传且已移除。
- 23主域名资源逐一HTTP200/SHA-256匹配，备用本站路径首页与双下载匹配；原隐私站发布前后200/6364字节及SHA-256 D01C5E2B44C55F6C64CB1647749B2C307326255CAA1259304B45E5B169A05DA8不变。本轮独立公网72项全部通过，实际下载字节/哈希与原件一致，网页异常0，正常平台确认后实际HTML渲染。
- 环境登记仅更新showcaseSite版本/23文件/metadata004/浏览器下载通过状态；后端012、集合、密钥、身份、用户数据、业务日志/统计、每日20与200额度、预算、共享网关及其他项目未改，无模型调用、Git提交或推送。既有平台日志、环境级发布角色与账号带宽费用未独立审计，不宣称物理环境隔离。
- 第三版源码与22文件发布产物单独保留，前三版均可在本站限定范围回滚。最终证据为docs/ARCHBUDDY_SHOWCASE_SITE.md、opendesign/review/archbuddy-showcase-closed-loops及忽略目录cloudbase/dist/showcase-closed-loops-20261005。

### 2026-10-05：第五版产品机会展示修订登记

- 用户授权重排章节、标注两条链路的产品机会并简化AI图和功能标题。仅更新archbuddy/development/archbuddy-dev-showcase及archbuddy/dev/showcase/，复用现有A标志与Lucide资源，不新增云端资源、数据、身份或统计；23公开文件白名单不变。当前第五版尚未发布。
- 第四版源码归档archbuddy-showcase-v4，旧23文件发布产物保留；本轮输出showcase-product-opportunities-20261005。上线前核验章节顺序/机会标注/外部生图边界/两闭环/手机排版；上线后限定前缀和逐项HTTP哈希、双下载、原隐私站保护。后端012、每日20/200、密钥、共享配置及其他项目不变，不调用模型。

### 2026-10-05：第五版产品机会展示发布核验完成

- 只更新现有archbuddy/development/archbuddy-dev-showcase及archbuddy/dev/showcase/，复用原A与Lucide资源，无新增云端资源。21普通+2入口、23文件15971456字节，LatestStatus=SUCCESS、LatestVersionName=archbuddy-dev-showcase-005，不表述为服务012版本。固定前缀精确白名单，临时配置未上传且已移除。
- 23主域名资源逐项HTTP200/SHA-256匹配，备用本站首页/双下载匹配，原隐私页发布前后200/6364字节及SHA-256 D01C5E2B44C55F6C64CB1647749B2C307326255CAA1259304B45E5B169A05DA8不变。独立本轮公网65项全通过、网站异常0，正常平台确认后实际HTML与双下载基准一致。
- 环境登记只更新showcaseSite第五版/23文件/metadata005/浏览器下载完成；插件、服务012、数据库/身份/用户数据/密钥/业务日志/统计/每日20与200额度/预算/共享网关与其他项目未改，没有模型调用或Git提交推送。平台日志、环境级角色和账号带宽成本仍未独立审计，前四版素材保留供本站限定回滚。
- 证据：docs/ARCHBUDDY_SHOWCASE_SITE.md、opendesign/review/archbuddy-showcase-product-opportunities，以及忽略目录cloudbase/dist/showcase-product-opportunities-20261005的发布/白名单/资源范围/逐项哈希及原隐私保护记录。

### 2026-10-05：第六版并排链路与外部完整步骤修订登记

- 用户授权优化02两链路版式、品牌机会色块与完整外部生图框。只更新archbuddy/development/archbuddy-dev-showcase和archbuddy/dev/showcase/，既有23公开文件白名单不变，不新建应用或资源。模型调用、插件、服务012、数据/身份/密钥/共享配置/统计/预算和其他项目不变。
- 第五版源文件与23文件发布产物保留；当前第六版本地输出showcase-parallel-workflows-20261005，未发布。上线前独立核验桌面并排/手机重排、参考3步/AI5步、2+4品牌高亮与外部未介入、大环/小环与实际交互；上线后限定应用/前缀、23资源HTTP哈希、双下载与原隐私站保护。

### 第六版发布阶段核验

- 2026-10-05T11:15:47.238Z仅原archbuddy-dev-showcase应用与archbuddy/dev/showcase/前缀发布21普通+2入口，共23文件15971645字节。LatestStatus=SUCCESS，LatestVersionName=archbuddy-dev-showcase-006。23主域名资源与备用首页/双下载HTTP200且逐项SHA-256匹配；固定前缀精确白名单，无临时配置上传，CLI生成的本地精确cloudbaserc.json已移除。
- 发布前后原隐私页均HTTP200/6364字节，原SHA-256不变。双归档保持原件；本轮无模型调用、插件/后端012/身份/数据库/存储数据/密钥/每日20与200额度/共享配置/其他项目改变。
- showcaseSite只更新本站第六版登记，状态为HTTP通过、浏览器待复核。本轮真实公网独立复核正在进行，不能将第五版结果当作第六版证据。日志、白名单、公网哈希与范围证据在cloudbase/dist/showcase-parallel-workflows-20261005；独立浏览器证据在opendesign/review/archbuddy-showcase-parallel-workflows。

### 第六版最终验收

- 独立公网71项检查全部通过、16张证据截图，1440/390/360px无横向溢出，站点页面/控制台/网络异常0。已核对parallel-workflows-20261005当前版本；本地1440/1024/390/360px的44项布局与61项交互/实际下载通过，未沿用第五版验收。
- 桌面两面板并排等宽等高，手机依次展示。8真实步骤框等高；方案链3框2机会，AI链5框4机会；外部生图是五环节的第三个完整框，明确“外部工具完成 / ArchBuddy 未介入”，人工创作无品牌机会。六个玫红块与01断点同色，A与ArchBuddy品牌在上、具体贡献在下、完整处于大步骤框内，未拥挤/交叠/孤字。参考/AI大环及生成↔迭代小环清晰，04单句、原章序/导航/截图/复制保持。
- 三个全新浏览器context正常等待CloudBase3秒后确认，正式Document均200/text-html/无附件头，HTML下载0、无循环提醒；平台初始404单列。ZIP实际179857字节与测试集12020913字节均原SHA-256匹配，未执行归档或调用模型。
- 发布于2026-10-05T11:15:47.238Z，原固定应用/前缀23文件15971645字节，元数据archbuddy-dev-showcase-006、SUCCESS。主域23文件与备用首页/双下载3文件HTTP200且SHA-256一致，固定前缀精确白名单，无临时配置；原隐私页200/6364字节/原哈希不变。
- 最终证据：opendesign/review/archbuddy-showcase-parallel-workflows/review.md、local-browser-summary.json、interaction-download-summary.json、public-check-summary.json；忽略目录cloudbase/dist/showcase-parallel-workflows-20261005保留发布清单/日志/公网哈希/限定范围/隐私保护。showcaseSite登记为006/23文件/浏览器及下载通过，OpenDesign完整索引重建，静态语法/构建/引用检查通过。
- 仅修改静态展示站。插件0.6.0、后端012、用户图词数据、身份、模型/密钥、每日20与200额度、共享配置和其他项目保持；前五版源码/发布清单与历史五页保留。本次无Git提交或推送。原网址可刷新展示，平台默认域名首次提示仍适用。

## 2026-10-05 第七版：首页价值表达与Chrome商店入口（开始，未发布）

用户选择Slogan“打通创作断点，让设计思路一路向前。”，提供已上架ArchBuddy商品链接https://chromewebstore.google.com/detail/archbuddy/hkbnjlapflleibeodhghbephgpacbhle?authuser=0&hl=zh-CN。仅替换首页大标题与顶部/下载区两处“下载 Chrome 插件”的链接，按钮名称不变；移除download属性使其普通导航到商店，测试集不变。按用户“只替换链接”保留安装说明。已授权发布原展示站，不涉及插件安装或商店设置操作。

只写既有archbuddy/development/archbuddy-dev-showcase及archbuddy/dev/showcase/，23公开文件不变，旧ZIP保留但不是主页面两按钮目标。第六版发布清单/产物留存，第七版输出cloudbase/dist/showcase-store-entry-20261005。新标识store-entry-20261005，独立布局/入口及公网验证待完成；后端、数据、密钥、AI额度、共享配置和其他项目保持。

### 第七版发布阶段核验

2026-10-05T15:58:13.380Z固定原应用/前缀发布21普通+2入口，共23文件15971700字节，CLI退出0。元数据archbuddy-dev-showcase-007、SUCCESS；23主域资源及备用首页/历史ZIP/测试集HTTP200且逐项SHA-256一致，固定前缀精确白名单、无临时配置。原隐私页200/6364字节/原哈希不变；环境只更新本站第七版与商店入口登记，浏览器最终复核待完成。独立商店单次访问已成功HTTP200，标题ArchBuddy - Chrome应用商店，商品版本0.6.0并显示添加至Chrome；未登录或安装，证据opendesign/review/archbuddy-showcase-store-entry/store-check-summary.json。

### 第七版最终验收（2026-10-06北京时间）

- 新Slogan为“打通创作断点，让设计思路一路向前。”，沿用三行首屏与原绿色/字号。顶部及下载区两处“下载 Chrome 插件”保持名称，精确跳转用户提供的Chrome商店商品URL（保留authuser=0与hl=zh-CN），移除download属性。测试集两入口和安装说明按用户限定保持，旧ZIP资源仅留存历史，未删除共享云端对象。
- 本地1440/390/360px独立首屏目视及19项定向检查通过；本轮真实公网23项全部通过、6张截图、站点异常0，新版store-entry-20261005已核对，标题无孤字/裁切/横向溢出，两商店按钮/两测试集链接正确。全新浏览器正常平台3秒确认后实际Document200/text-html/无附件头，不用旧版结果替代；未复跑无改动的画廊/复杂流程或安装归档。
- 商店单次独立浏览器访问HTTP200，用户精确URL保持，标题“ArchBuddy - Chrome 应用商店”，显示0.6.0及添加至Chrome；未登录/安装。此前web/Node网络读取失败以此真实浏览器结果补齐，不称商店包与本地ZIP字节相等。
- 2026-10-05T15:58:13.380Z在原archbuddy-dev-showcase与archbuddy/dev/showcase/发布23文件15971700字节，CLI退出0、archbuddy-dev-showcase-007/SUCCESS。23主域资源与备用首页/历史ZIP/测试集HTTP200且逐项哈希一致，限定前缀精确白名单、无临时配置。原隐私页200/6364字节与原哈希不变；23文件中仅index.html字节变化，CSS/JS/图解/下载原字节保持。
- 静态构建/引用/语法、精确改动范围与git diff --check通过。最终证据opendesign/review/archbuddy-showcase-store-entry/review.md、local-check-summary.json、public-check-summary.json、store-check-summary.json；发布/清单/范围/公网哈希/隐私基线留存在忽略目录cloudbase/dist/showcase-store-entry-20261005。OpenDesign完整索引已重建。
- 环境仅showcaseSite更新第七版/007/商店入口及验收状态。仅静态介绍与链接变化，插件/后端012/用户数据/身份/密钥/每日20与200额度/共享配置/其他项目未改，模型调用0，未提交或推送Git。第六版发布23文件与本轮改前index.html留存可限定回滚。商店安装不在本轮授权范围内，未执行。

### 2026-10-06 第八版：02机会色块柔化（已实现，未发布）

用户认为02两链路红色过重，要求与绿色更协调。6个产品机会块改为浅暖粉#EEDFD9、柔和边框#D9C4BC、深绿品牌字#153B2D与说明#4F6557；01断点原红保持。仅CSS颜色与HTML缓存版本变化，布局/流程/文案/Slogan/商店链接/测试集不变，23公开文件白名单保持。沿用OpenDesign与ArchBuddy视觉规范，独立定向目视待完成。发布仅archbuddy/development/archbuddy-dev-showcase及archbuddy/dev/showcase/，无新资源/数据/身份/统计/密钥/模型/额度或共享配置改变。第七版产物保留，本轮输出cloudbase/dist/showcase-soft-opportunities-20261006，版本soft-opportunities-20261006。

第八版发布阶段：2026-10-05T16:12:27.410Z（北京时间10月6日）仅原应用/前缀上传23文件15971718字节，CLI退出0，archbuddy-dev-showcase-008/SUCCESS。23主域资源及备用3文件逐项HTTP200/哈希通过，限定前缀精确白名单，无临时配置，原隐私页200/6364字节/哈希不变。环境仅本站版本/元数据/状态更新，真实公网颜色定向验收待完成。

### 第八版最终验收（2026-10-06）

- 02六处产品机会块为浅暖粉#EEDFD9、柔和边框#D9C4BC、深绿品牌#153B2D与说明#4F6557；独立目视1440/390/360px确认色彩减重、与浅绿步骤协调、品牌与说明清楚、无溢出。01断点原红、版式/流程/Slogan/商店与测试集入口保持。
- 本地25项、公网29项定向检查全过，各9张证据截图，站点异常0，当前soft-opportunities-20261006已核对。三个全新context正常平台确认后实际Document200/text-html/无附件，完整DOM/CSS/品牌图就绪后核验。首轮过早读取的默认样式记录单独保留，不是网站修复；最终以本轮就绪后结果为准，不用旧版代替。
- 固定原应用/前缀23文件15971718字节，元数据archbuddy-dev-showcase-008/SUCCESS，23主域资源与备用3资源哈希匹配，精确白名单、无临时配置，原隐私页哈希不变。构建/引用/语法/精确颜色改动及git diff --check通过；本轮只CSS颜色与HTML缓存标识变化，未改插件/后端/数据/密钥/AI额度/共享配置或其他项目，无模型调用与Git提交推送。
- 最终证据opendesign/review/archbuddy-showcase-soft-opportunities/review.md、local-check-summary.json、public-check-summary.json；发布/范围/哈希/隐私保护留存在忽略的cloudbase/dist/showcase-soft-opportunities-20261006，第七版产物及改前CSS保留。环境仅更新本站第八版/008/浏览器验收状态；现有商店登记保持，没有再登录/访问商店/安装或执行归档。

### 2026-10-06 第九版：05改商店安装说明（已实现，未发布）

用户要求05采用线上商店版本说明。改为打开商品页→添加至Chrome并确认→固定ArchBuddy图标，从功能菜单进入图库/提示词工具；官方Chrome帮助与当前插件manifest/popup核对。删除ZIP/开发者模式/加载目录/扩展地址复制及相应JS监听，更新下载附注和联网FAQ，保留本机数据说明与测试集导入。两商店按钮名称/URL、Slogan、02浅暖粉配色不变，旧ZIP只留历史。

沿用OpenDesign与ArchBuddy视觉规范，23公开文件白名单不变，本轮输出cloudbase/dist/showcase-store-install-20261006，版本store-install-20261006。仅原archbuddy/development/archbuddy-dev-showcase及archbuddy/dev/showcase/；不实际安装扩展、不调用模型，不改插件/后端/数据/身份/密钥/额度/共享配置/其他项目。第八版发布产物及改前HTML/JS保留，独立目视和公网核验待完成。

第九版发布阶段：2026-10-05T16:43:46.392Z（北京时间10月6日）仅原应用/前缀23文件15970932字节，CLI退出0、archbuddy-dev-showcase-009/SUCCESS。23主域资源与备用3文件HTTP200且逐项哈希一致，固定前缀精确白名单、无临时配置，原隐私页200/6364字节/原哈希保持。环境只更新本站第九版状态，公网真实浏览器定向复核待完成。

### 第九版最终验收（2026-10-06）

- 05改为打开商店商品页→添加至Chrome并确认添加扩展程序→固定图标，从功能菜单进入图词库/提示词工具；依据Chrome官方帮助和当前插件入口核对。移除旧ZIP/开发者模式/加载目录/扩展地址复制说明，删除无元素的JS监听；附注改商店安装与桌面Chrome，FAQ改AI联网/本机数据说明。测试集下载、解压导入以及两商店按钮名称/精确URL保持，Slogan/02配色/其余流程不变。
- 独立本地37项、公网41项全部通过，各6张定向截图，1440/390/360px完整05及展开FAQ清楚无溢出，站点异常0。新版本store-install-20261006已核对；两画廊切换往返、放大关闭正常，无删除监听后的pageerror。正常平台3秒确认并等待完整DOM/CSS/必要图与字体后，三个正式Document200/text-html/无附件，不使用旧结果替代。
- 固定原应用/前缀23文件15970932字节，archbuddy-dev-showcase-009/SUCCESS；23主域资源与备用3资源逐项HTTP200/哈希一致，精确白名单、无临时配置，原隐私页200/6364字节/原哈希不变。构建/语法/引用/精确范围及git diff --check通过，23资源中仅index.html与app.js变化，CSS/品牌/图解/归档保持原字节。
- 最终证据opendesign/review/archbuddy-showcase-store-install/review.md、local-check-summary.json、public-check-summary.json；发布/清单/范围/HTTP哈希/隐私保护在忽略的cloudbase/dist/showcase-store-install-20261006，第八版及改前HTML/JS留存。OpenDesign完整索引已重建，环境只更新本站第九版/009/浏览器验收状态。未实际安装扩展、登录/修改商店、执行归档或调用模型；插件/后端012/用户数据/密钥/身份/20与200日额度/共享配置/其他项目保持，未提交或推送Git。

### 2026-10-06 第十版：01核心痛点总结（已上线并验收）

用户要求在01流程图下用大字红色总结三条痛点。文案为机械保存图片，打断创作思路；提示词从零编写，难以完整表达设计意图；过程素材不断堆积，却难以再次复用。原节点小提示归拢到图下，真实五步骤与四断点不变。桌面三列、手机竖排，沿用#A55442。仅静态HTML/CSS变化，其余章节/入口/下载资源保持。

仅原archbuddy/development/archbuddy-dev-showcase与archbuddy/dev/showcase/的23公开白名单；输出cloudbase/dist/showcase-pain-summary-20261006。第九版保留；独立定向本地及公网验收待完成。无插件/后端/数据/身份/密钥/额度/模型/共享配置/其他项目变化。

第十版发布阶段：2026-10-05T17:06:15.229Z（北京时间10月6日）固定原应用/前缀发布23文件15971923字节，CLI退出0、archbuddy-dev-showcase-010/SUCCESS。主域23资源与备用3资源HTTP200且逐项哈希一致，限定前缀精确白名单、无临时配置；原隐私页200/6364字节/原哈希保持。独立本地33项及8张截图通过，1440/1024/390/360px文字与布局无问题，异常0；本轮真实公网浏览器复核待完成，环境仅本站版本/元数据/验收状态更新。

### 第十版最终验收（2026-10-06）

- 01流程图下归拢三条核心痛点：机械保存图片，打断创作思路；提示词从零编写，难以完整表达设计意图；过程素材不断堆积，却难以再次复用。桌面三列27px（1024px为22px）、手机竖排24px，统一断点红#A55442，以细线连接视觉层级；原节点三处小提示移入总结，五步四断点与多轮优化保持。
- 独立本地33项、公网38项全通过，各8张本版截图。1440/1024/390/360px无孤字、重叠、裁切或横向溢出，异常0。四个全新context正常平台3秒确认并等待DOM/CSS/必要图与字体就绪，正式Document均200/text-html/无附件；平台初始提醒响应单列。02浅暖粉、Slogan、商店/测试集入口和05线上安装快速断言通过。
- 2026-10-05T17:06:15.229Z固定原应用/前缀发布23文件15971923字节，CLI退出0，archbuddy-dev-showcase-010/SUCCESS。主域23资源/备用3资源HTTP200且逐项哈希一致，限定前缀精确白名单/无临时配置，原隐私页200/6364字节/原哈希不变。仅index.html与styles.css公开字节变化，01外仅缓存标识变化；构建/引用/语法与改动范围检查通过。
- 最终证据opendesign/review/archbuddy-showcase-pain-summary/review.md、local-check-summary.json、public-check-summary.json；发布清单/日志/HTTP哈希/范围/隐私基线在忽略目录cloudbase/dist/showcase-pain-summary-20261006。第九版产物和改前HTML/CSS留存，OpenDesign完整索引重建，环境仅更新本站010/第十版/验收状态。未改插件、后端012、用户数据、身份、密钥、20与200日额度、共享配置或其他项目，模型调用0，无安装归档/登录或Git提交推送。

### 2026-10-06 第十一版：01对应分区暖白一体图（已上线并验收）

用户三轮预览后选定对应分区结构/暖白统一配色，明确方框不描边并授权同步公网。首句为逐张机械保存，打断创作思路；其余两痛点与五步四断点/多轮优化保持，括线按保存-方案、提示词-生图、成果复用对应。上下一致#F4F2EC，流程深绿、痛点原红，去外框/分区/节点边框，保留功能性括线和箭头；手机按关联阶段依次穿插结论。

仅01 HTML/作用域CSS与缓存标识，原23公开白名单。输出cloudbase/dist/showcase-unified-pains-20261006，只发布登记的archbuddy/development/archbuddy-dev-showcase及archbuddy/dev/showcase/；前十版保留。独立定向本地/公网检查待完成。无插件/后端/数据/身份/密钥/模型/20与200日额度/共享配置或其他项目改变。

第十一版发布阶段：独立本地1440/390/360px选中版25项/3截图通过，首句/无框线/统一暖白/括线对应与手机顺序正确，异常0。2026-10-05T18:02:00.633Z固定原应用/前缀23文件15974878字节，CLI退出0、archbuddy-dev-showcase-011/SUCCESS。主域23资源与备用3资源HTTP200且逐项哈希一致，精确白名单、无临时配置，原隐私页200/6364字节/原哈希不变。环境仅更新本站011/版本/验收状态，本轮公网真实浏览器复核待完成。

### 第十一版最终验收（2026-10-06）

- 用户三轮预览后选择对应分区/暖白统一，明确去框线并授权同步公网。01流程、断点与三痛点共用#F4F2EC底色，深绿步骤/原红痛点；无整体、节点和痛点区描边，保留功能性括线与Lucide断点箭头。首句为逐张机械保存，打断创作思路；另两句意图表达/素材复用含义保持，桌面按区段对应、手机按关联阶段穿插，五步四断点与多轮优化完整。
- 最终选中版独立本地25项/公网29项全通过，各3张新截图已目视。1440/390/360px无孤字、重叠、裁切或横向溢出，异常0；三个新context正常平台3秒确认并等待DOM/CSS/图字体就绪，正式Document均200/text-html/无附件下载，平台初始提醒单列。02配色/Slogan/商店与测试集/05安装快检保持。三色比较73项/9截图是选择前证据，未替代本版新验收。
- 2026-10-05T18:02:00.633Z固定原应用/前缀发布23文件15974878字节，CLI退出0、archbuddy-dev-showcase-011/SUCCESS。主域23资源与备用3资源HTTP200且逐项哈希一致，精确白名单/无临时配置，原隐私页200/6364字节/原哈希不变。公开只index.html/styles.css变化，01外仅缓存标识，旧CSS前缀保持；构建/相对引用/语法/改动范围与diff格式检查通过。
- 证据opendesign/review/archbuddy-showcase-unified-pains/review.md及local/public-check-summary.json；发布/范围/HTTP哈希/隐私基线留存在忽略目录cloudbase/dist/showcase-unified-pains-20261006。第十版与改前HTML/CSS及两轮本地候选完整留存，OpenDesign索引重建，环境仅更新本站011/本版/验收状态。无插件/后端012/用户数据/身份/密钥/模型/20与200日额度/共享配置或其他项目改变，无Git提交推送。

### 2026-10-06：每日限额环境变量登记（本地已实现，云端待发布）

- 用户授权将每日上限改为可配置参数；目标仅为 archbuddy / development / 已登记环境 / archbuddy-api。新增两个非敏感服务变量 ARCHBUDDY_USER_DAILY_LIMIT=20、ARCHBUDDY_PROJECT_DAILY_LIMIT=200，保留既有每日预算，不创建其他资源。
- 参数由启动入口传给额度服务，只允许正整数，错误值阻止启动；不接受客户端指定额度、项目、阶段或集合。所有服务版本继续共享 archbuddy_dev_quotas / archbuddy_dev_requests；修改配置不重置当日计数。
- 部署只更新本项目既有服务与白名单后端代码包，在内存中合并两个变量，保留其他变量和全部资源/访问配置。不得输出或保存密钥、令牌及签名上传地址。插件0.6.0、静态站、其他项目资源保持；不触发真实模型验收或清理数据库。
- 本地 quota.mjs / start.mjs 语法检查、既有 10 项额度回归和白名单 ZIP 路径/哈希检查已通过；未新增测试文件或框架。本轮云端版本及配置尚未发布，实际配置和切流证据完成后另行追加。
- 平台角色权限、日志留存及 TTL 仍为已有未核验项；此次不扩大权限或数据范围。环境变量版本绑定参考官方 https://docs.cloudbase.net/run/deploy/configuring/environment/envs 。

### 2026-10-06：每日限额环境变量发布完成

- 范围为archbuddy / development / archbuddy-api；后端013 normal、100%流量，发布任务2292869 finished。新增的两个非敏感服务变量显式20/200，沿用现有预算，不新增集合、身份、日志、存储、资源规格或其他项目配置。
- 发布只发送EnvParam差异和已核验16文件白名单包；所有原变量内容摘要一致，服务其他配置内容摘要一致（OpenAccessTypes按集合语义核对）。签名上传/下载地址和凭据仅在调用进程内存，不落盘或输出。
- 云端013源码ZIP哈希与45927字节本地包一致（0B1A3F3FA90CD4D0ACD016A0E2E87D10048406B7773C4B381AD77B08685B433D）。全量服务/healthz和/api/status均200，daily/Asia-Shanghai、匿名及向量配置正常；未触发模型、未读写用户数据库或其他项目。
- 默认20/200保留、参数正整数验证和额度事务/请求去重保持，未改变匿名余额隐藏。后续改配置保留当日计数，降低上限须先暂停AI再完成全量生效；同一服务新旧版本不分配独立项目预算。
- 证据在cloudbase/dist/quota-env-20261006/；角色最小权限、TTL、日志留存仍为原未核验项。没有清空数据、放宽共享权限或操作展示/隐私站。

### 2026-10-06：每日额度调高到50/500（配置发布登记）

- 用户最新指定个人每日50次、ArchBuddy项目每日共享500次。仅调整已登记的archbuddy / development / archbuddy-api两个非敏感环境变量ARCHBUDDY_USER_DAILY_LIMIT与ARCHBUDDY_PROJECT_DAILY_LIMIT，兼容代码默认20/200保留。
- 复用已核验的013镜像，保留其他环境变量、服务规格、访问控制及原数据库集合；不创建资源、不重置计数，不为其他版本或实例分配独立预算。该调整只扩大ArchBuddy既定每日次数预算，不改变其他项目的配额或共享环境配置。
- 先灰度发布新配置，核对目标版本与其他配置一致后全量切流；发布结果另行追加。模型调用0，无真实用户计数读取。


### 2026-10-06：50/500配置发布完成核验

- 限定archbuddy / development / archbuddy-api，仅两个已登记非敏感额度变量由20/200改为50/500。任务2292889 finished、archbuddy-api-014 normal、流量100%，目标版本与服务配置值一致；复用013镜像，其他变量与服务资源配置摘要保持。
- 没有操作共享权限、其他项目、展示/隐私站、数据库集合或业务身份；不清空计数、不新增实例独立预算。模型调用0，不读取用户计数。公开健康与状态HTTP200，daily与Asia/Shanghai正常，匿名额度数字继续隐藏。
- 安全证据保存在忽略目录cloudbase/dist/quota-env-20261006/的50-500发布/验证文件；本地登记更新后端014和当前额度，其他站点字段保留。角色最小权限、TTL及日志留存仍为原未审计项。

### 2026-10-06 第十二版：首屏图片右边缘对齐（实现及验收中）

用户要求图片右侧与顶部导航/下载体验右边界对齐。1500px以上取消右侧负margin70px，使图片外框回到内容区内；仅这条CSS和缓存标识改变。23文件白名单、原应用archbuddy-dev-showcase及前缀archbuddy/dev/showcase/不变。三种章节滚动动效另行本地预览，未选定前不加入正式站。保留后端014及50/500配置，本轮不改变后端/数据/身份/密钥/模型/额度/共享配置或其他项目。独立定向本地/公网验收待完成。


第十二版最终验收（2026-10-06）：2026-10-06T12:15:58.144Z固定原应用/前缀发布23文件15974840字节，CLI退出0，archbuddy-dev-showcase-012/SUCCESS。主域23资源与备用3资源HTTP200且逐项哈希一致，限定前缀精确白名单、无临时配置；原隐私页200/6364字节/原哈希保持。仅index.html缓存标识和styles.css宽屏负margin改变，其余21资源字节不变。

独立本地1920/1600/1440/390px的27项/4截图及公网1920/1440/390px的22项/3截图通过，7图均实际目视，站点异常0；图片外框与顶部下载体验/内容区右边界误差0px，修前宽屏70px已收回。放大关闭可用，无溢出碰撞。公网三个全新context正常3秒确认后正式Document200/text-html/无附件，平台初始404单列。最终证据opendesign/review/archbuddy-showcase-hero-align/review.md及local/public-check-summary.json；发布与23清单/哈希/范围/隐私基线在cloudbase/dist/showcase-hero-align-20261006，前版与改前源留存。

环境只更新showcaseSite，后端014及50/500每日额度保持。三种章节动效只在本地候选，未发布；本轮无用户数据/身份/密钥/模型/共享配置/其他项目修改，无Git提交推送。


## 2026-10-06 第十三版：方案1轻量进入（实现与验收中）

用户已选方案1。01–05标题与正文首次进入视口依次淡入并轻微上移，沿用已验收预览的参数；回滚已出现内容不重播，保留正常滚轮、导航与原图解/图库/下载。正式版不带比较控制，仅补03锚点与原生JS/CSS及缓存标识。23公开文件白名单、原应用和前缀保持，输出cloudbase/dist/showcase-scroll-reveal-20261006。独立本地/公网验收待完成；后端014和50/500配置不变，无插件/数据/身份/密钥/模型/共享配置/其他项目变化，无Git提交。


第十三版发布阶段：2026-10-06T12:39:10.123Z原应用/前缀发布23文件15977184字节，CLI退出0，archbuddy-dev-showcase-013/SUCCESS。主域23资源与备用3资源均HTTP200且逐项哈希一致，精确白名单、无临时配置；原隐私页200/6364字节/原哈希保持。本地1440/390px两场景独立验收通过：10包装/五章、首次淡入轻移与回滚不重播、自然滚动/导航/图库/弹图、首屏右缘0px、无比较控制/缩放/停驻、脚本异常0。真实公网定向复核进行中；仅showcaseSite更新，其他环境字段摘要一致，后端014及50/500配置保持。


### 第十三版最终验收（2026-10-06）

- 用户已选择方案1。01–05标题与正文首次进入视口依次浮现，标题/正文淡入0.68s/移动0.78s，正文错开80ms；桌面26px、手机14px上移，回滚保持可见不重播。原生IntersectionObserver，正式站无方案比较控制、缩放或标题停驻，正常滚轮/导航、原图解/字号/配色和首屏对齐保持。03补concept锚点，公开仅HTML/JS/CSS变化，其余20资源原哈希保持，无新依赖或测试框架。
- 独立本地与公网各1440/390px两场景、共8关键截图及目视通过，五章/10包装完整，异常0、横溢出0。首次淡入/回滚不重播、导航/图库切换/弹图、精确商店链接/测试集属性、首屏右缘误差0px通过。公网两个全新context正常3.2秒确认后正式Document200/text-html/无附件；平台初始404单列。证据opendesign/review/archbuddy-showcase-scroll-reveal/review.md、local/public-check-summary.json、static-check-summary.json。
- 2026-10-06T12:39:10.123Z固定原应用/前缀23文件15977184字节，CLI退出0、archbuddy-dev-showcase-013/SUCCESS。主域23及备用3资源HTTP200/逐项哈希一致、前缀精确白名单/无临时配置、原隐私站200/6364字节/原哈希保持。构建/语法/引用/源码范围与diff格式检查通过；发布证据在cloudbase/dist/showcase-scroll-reveal-20261006，012产物和改前源留存。
- 只更新环境showcaseSite，其余环境字段摘要一致，后端014及每日50/500保持；本轮无插件/数据/身份/密钥/模型/共享配置/其他项目变化，无Git提交或推送。OpenDesign完整清单重建；已选轻量进入正式上线，其余候选留在本地比较。

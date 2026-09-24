# ArchBuddy｜CloudBase 开发测试部署

目标环境由本地 `environment.json` 与服务端环境变量指定，地域为上海 `ap-shanghai`。建议服务名：`archbuddy-api`，容器端口：`8080`。真实环境配置不提交到公开仓库；字段模板见 `environment.example.json`。

## 多项目隔离：每次云端变更前检查

该 CloudBase 环境将同时承载其他项目和 demo，ArchBuddy 只占用自己的资源。开始工作先读根目录 `AGENTS.md` 和 [CloudBase 多项目隔离约定](../docs/CLOUDBASE_PROJECT_ISOLATION.md)，按其中的资源登记和检查清单执行，并记录结果。数据库、存储、身份、统计、日志、凭据与业务预算均按项目和阶段区分；命名前缀不能代替实际访问权限检查。现有后端只读写已登记的 ArchBuddy 额度与请求集合；计划事件集合在实际创建和验证前保持禁用。

## 当前进度与边界

2026-09-15：公网 `/healthz`、`/api/status`、真实模型调用和 CloudBase 每日额度事务均已由用户测试成功。已验证模型为 `deepseek-v4-flash-vision-exp`；额度版测试脚本随后成功返回。本地 `environment.json` 记录部署证据且不包含密钥值，但仍不提交到公开仓库。

当前代码保留管理员测试令牌用于维护，同时新增免登录匿名安装会话。插件先调用 `POST /api/session` 换取短期匿名凭据；已发布 V1 继续调用 `POST /api/analyze`，V2 调用新增的 `POST /api/v2/analyze`。用户无需输入 DeepSeek Key 或测试 Token。签名密钥只存在服务环境变量中。

V2 代码还准备了默认关闭的可选匿名事件接口 `POST /api/events`。`ARCHBUDDY_ANALYTICS_ENABLED` 必须保持 `false`，直到 `archbuddy_dev_events` 已在 ArchBuddy development 范围内按 ADMINONLY 创建，并完成 30 天 TTL、隔离、日志和公开隐私披露验证。关闭时不写入事件；不得复用其他项目集合。

V3 新增 `POST /api/v3/evaluate`，复用同一匿名会话、请求去重和 20/200 日额度，只接收一张生成图与当前版本中启用的可观察模块。它不接收方案名、来源原图、历史版本、路径或 URL。2026-09-25 已部署为 `archbuddy-api` 版本 `008` 并完成全量切流；只验证公开健康与状态接口，未创建任何新数据库集合、存储路径、身份配置、日志主题或预算，也未在本轮发送图片调用模型。

2026-09-15 用户已确定每日额度：个人 20 次、整个 ArchBuddy 200 次；详见 [反推额度规则](../docs/ARCHBUDDY_QUOTA_POLICY.md)。CloudBase 事务计数已部署并完成一次真实测试。匿名会话版也已部署，`/api/status` 与一次不调用模型的 `/api/session` 签发检查通过，用户随后确认真实 Chrome 免登录反推可用。

用户完成真实浏览器反推后决定不向普通用户展示或返回具体剩余额度。隐私收紧版本已重新部署，公开状态检查确认不再包含个人或项目限额字段；用户也确认重新加载后的插件界面正常。仅管理员测试身份可在分析响应中取得剩余数字，额度后台规则本身不变。

## 构建可上传文件夹

在仓库根目录运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File cloudbase/scripts/build-deploy-package.ps1
```

脚本输出 `cloudbase/dist/archbuddy-api-时间戳/` 及同名 ZIP。只打包代码白名单，不包含 Git、图片素材、Windows 加密凭据、`.env` 或本地归档目录。Dockerfile 在输出文件夹根目录。ZIP 条目统一使用 Linux 兼容的 `/` 分隔符，并核对归档内每个文件的 SHA-256。不要直接上传整个仓库。

## 本地 process-test 启动（V3 开发）

本地真实调用仍由服务端读取环境变量或当前 Windows 用户的 DPAPI 加密配置；扩展中不得放入任何密钥。V3 开发时可直接运行下方脚本：它会确认扩展处于 `local` 模式，生成仅在当前进程存在的匿名会话密钥，并启动 `127.0.0.1:8080`。该模式只在当前 Node 进程内计数，服务状态明确返回 `quotaMode=process-test`，不冒充 CloudBase 持久每日额度；重启进程会清空本地计数。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File cloudbase/scripts/start-local-v3.ps1
```

在 Chrome 扩展管理页重新加载 `extension/` 后即可联调。脚本不打印、保存或复制密钥；如果既没有当前进程的 `DEEPSEEK_API_KEY`，也没有既有 DPAPI 加密配置，会明确停止并提示先运行 `plugin-prototype/scripts/configure-deepseek.ps1`。完成本地开发后必须把 `BACKEND_MODE` 改回 `cloud`；商店包在非 `cloud` 模式下会直接拒绝生成。

## 控制台部署

1. 登录 CloudBase，选择上述上海环境，进入「云托管」。先确认套餐已包含需要的能力；遇到购买或升级提示时停下确认费用。
2. 新建 `archbuddy-api`，选择本地源代码部署，上传构建脚本输出的文件夹。其他电脑可先传输并解压 ZIP。
3. Dockerfile 使用根目录 `Dockerfile`；端口 `8080`。程序监听 `0.0.0.0`，不依赖本地 Windows 服务。测试阶段将最大实例数设为 1。
4. 在云端环境变量中配置下表；密钥不要放入 Dockerfile、代码包或聊天记录。
5. 部署后使用控制台实际分配的 HTTPS 地址，先访问 `/healthz`。返回 `status: ok` 只代表进程已启动，不代表模型已调通。
6. 管理员先用测试凭据验证一次；匿名会话版部署后，再从加载已解压的插件验证自动鉴权。具体额度仅供管理员测试接口核对，不返回匿名用户。

| 环境变量 | 配置 |
| --- | --- |
| `PORT` | `8080` |
| `DEEPSEEK_API_KEY` | 在云端配置现有 DeepSeek Key |
| `DEEPSEEK_MODEL` | `deepseek-flash` |
| `ARCHBUDDY_TEST_TOKEN` | 管理员生成的独立随机令牌，至少 32 个可打印 ASCII 字符；不能复用 DeepSeek Key |
| `ARCHBUDDY_SESSION_SECRET` | 匿名会话签名密钥，独立随机值，至少 32 个可打印 ASCII 字符；只放服务环境变量，不能复用其他 Key |
| `ARCHBUDDY_ANALYTICS_ENABLED` | `false`；完成集合权限、30 天 TTL、隔离、日志与公开披露验证前不得改为 `true` |
| `ARCHBUDDY_MAX_CALLS_PER_PROCESS` | `20` |
| `ARCHBUDDY_MAX_CONCURRENT` | `3`（支持三张参考图同时分析；已有云端显式配置须在发布时核对） |
| `ARCHBUDDY_CALLS_PER_MINUTE` | `3` |
| `ARCHBUDDY_TIMEOUT_MS` | `60000` |

可在本机生成签名密钥并只复制到剪贴板（不会打印或写入文件）：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "F:\MelyAI-CODEX\downPIC-plugin\cloudbase\scripts\generate-session-secret.ps1"
```

在 `archbuddy-api` 服务环境变量中新增 `ARCHBUDDY_SESSION_SECRET` 后立即粘贴。部署完成后清除剪贴板历史；后续不要随意更换，否则已有短期匿名会话会失效并自动重新签发。

如本地采用自定义模型兼容服务，需核实并在云端配置 `DEEPSEEK_BASE_URL`；默认沿用已有适配器的 DeepSeek 官方地址与模型别名映射。没有为本次部署重新验证供应商模型可用性。

管理员测试请求使用 `Authorization: Bearer <测试令牌>`。普通插件不包含该令牌：它提交本地随机安装 ID 到 `/api/session`，获得短期匿名 Bearer 凭据。服务端只将不可逆匿名主体用于本项目额度；不能把会话签名密钥写入插件或 URL。

## 数据处理

服务只接收上传图片的 Base64，不接收图片 URL，不提供静态文件或本地归档接口。图片及结果只在请求内存中处理，不缓存、不落盘，不在应用日志记录请求正文、提示词或模型错误原文。图片格式校验检查文件签名，不代替完整的解码校验。模型供应商的数据处理按其政策执行。

云托管平台可能另行记录访问日志；正式发布前需结合控制台日志配置更新隐私披露。

## 验证

真实云端测试（会发送一张你选定的图片，并可能消耗模型额度）：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "F:\MelyAI-CODEX\downPIC-plugin\cloudbase\scripts\test-cloud-analysis.ps1"
```

按提示先填图片完整路径，再输入 `ARCHBUDDY_TEST_TOKEN`（隐藏输入）。使用本地保存的测试令牌，不是 DeepSeek Key。脚本只请求一次，不自动重试、不保存令牌或图片，结果直接显示在终端。出现 `SUCCESS` 且输出有效中文分项后，才能确认云端模型链路通过。

如果隐藏输入未完整接收粘贴，可使用剪贴板模式：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "F:\MelyAI-CODEX\downPIC-plugin\cloudbase\scripts\test-cloud-analysis.ps1" -ImagePath "F:\MelyAI-CODEX\downPIC-plugin\pic-test\reference\2\1.jpeg" -TokenFromClipboard
```

先执行命令，等出现 `Copy the actual ARCHBUDDY_TEST_TOKEN value now` 提示后，再复制云端已配置的测试令牌真实值，回到终端只按回车，不要粘贴。脚本此时才读取一次剪贴板；不会显示或保存令牌，也不会修改剪贴板。测试后可自行清理剪贴板及其历史。不要复制变量名、遮罩星号或 DeepSeek Key。令牌必须与云端完全一致，不能只在本地临时换一个值；首尾空白会清理，内部空白或不足 32 个字符则在发送请求前拒绝。

本阶段按项目章程只执行静态代码检查与人工核心路径验收，不新增或运行自动化测试。当前电脑未安装 Docker；云端 002 版本的历史部署证据不代表 V3 已部署。

## 官方资料

构建失败排查：`check_build_image: fail` 只表示构建步骤失败，不说明具体原因。需要完整构建日志中的 Docker 错误或平台 `FailReason`。日志出现 `zip appears to use backslashes as path separators` 表示旧版 Windows 压缩包的路径兼容警告；即使后续文件已经解压，也应使用新版打包脚本，但不能据此断定它就是构建失败的根因。镜像拉取、构建目录和平台权限问题应按实际错误分别处理，不要因为构建失败就重填模型密钥。

- [云托管源代码部署](https://docs.cloudbase.net/run/deploy/deploy/deploying-source-code)：文件夹、Dockerfile 与端口配置。
- [HTTP 访问云托管](https://docs.cloudbase.net/service/access-cloudrun)：网关路径与服务绑定。
- [云托管与身份认证](https://docs.cloudbase.net/faq/knowledge/cloudrun-authentication-integration)：后续采用用户令牌；管理员 API Key 不得进入客户端。
- [默认域名限制](https://docs.cloudbase.net/service/alias)：默认域名仅用于开发测试，正式使用准备已备案的自定义域名。

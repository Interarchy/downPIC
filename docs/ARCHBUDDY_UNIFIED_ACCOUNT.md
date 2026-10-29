# ArchBuddy 插件统一账号接入

日期：2026-10-29。分支：`fix/unified-product-account`，基于完整快照 `452ee7e`。本轮直接依据用户“官网、Canvas、plugin 同一个产品，共用账户、注册和数据，未完成请完成”的指令实施；覆盖旧本地演示阶段的手机号优先、200 积分独立账本、账号间共用图库与不做云同步的范围约定。旧本地演示保留为开发专用模块，不是正式产品账户。

## 唯一身份与服务主源

- 固定正式服务域名：`https://canvas.archbuddy.top`。官网邮箱/Google 注册仍由同一 Clerk 实例负责，插件不建立手机号注册接口。
- 浏览器 `identity.launchWebAuthFlow` 从 `/connect-plugin` 发起授权，S256 PKCE 校验码与 state 均采用 32 字节密码学随机数；回调严格校验扩展回调来源、路径、state 与单个 code。
- 授权码经 `POST /api/beta/plugin/token` 交换专用插件会话。令牌仅保存在扩展后台 IndexedDB，不进入内容脚本、URL、页面消息或公开账户缓存。
- 统一账户、BuddyCoin、权益与云素材以 Cloudflare D1/R2 的现有 ArchBuddy 业务账户为主源，由 Canvas BFF 代理。1 availableUnit = 1 BuddyCoin。
- 反推、评估、简析及向量操作由 `/api/beta/plugin/v1/execute` 统一鉴权和计量，data 保留现有插件响应结构。原匿名 CloudBase 会话不再用于此正式构建。
- 单个 execute JSON 不得超过 900 KiB。发送前尝试压缩分析图片；仍超限时保留本地编辑并提示缩小图片，不截断数据、不发模型调用。素材图片采用 R2 直传，最大 10 MiB。

## 账户隔离与资产流转

- 新本地元数据按 accountId 分区，图片与向量 IndexedDB 按账号分库。切号立即清理临时状态、界面和旧队列；运行中操作先完成后才允许主动切换账户。
- 升级前的全局本机素材，以及新版本未登录时的本机采集，均为“本机历史素材”。登录不会自动把它们归属于第一个账号，也不会自动上传。
- 云素材页提供当前账号素材和本机历史的显式选择。点击保存只同步所选素材；图片须另行勾选。只有 640px 预览的旧下载图片标注“预览副本”，不会声称原图已上传。
- 云端元数据通过 revision 乐观锁更新。图片上传依次创建上传意向、使用限定 PUT 地址直传、服务端完成校验，再绑定 assetId。
- 在 Canvas 使用先请求素材的 `/canvas` 动作，由服务端首次创建节点，随后打开 `/studio?project=<id>`；不直接覆盖已有画布。
- 本地文件删除与云素材移出分开；不存在未经选择的历史全库迁移。

## 已确认的统一权益

2026-10-30 用户确认：普通文件下载免费；新注册的 200 次是成功简析权益，每成功生成一份描述扣 1 次，失败不扣，结果未知时查询同一个任务而不重复提交。深度反推保留独立 50 次赠送；画布使用同账户 BuddyCoin 账本。兼容接口字段 `entitlements.downloads` 目前承载简析次数，界面必须写“简析”。

`METER_FILE_DOWNLOADS=false` 保持不变，`ENABLE_UNIFIED_DESCRIBE=true` 开启统一简析请求。简析和深度反推额度耗尽返回 `CREDIT_INSUFFICIENT`；批量简析持久暂停，用户确认权益后手动继续。反推、语义搜索与向量化不参与画布美元预算，反滥用频率、并发和幂等仍生效；语义搜索与向量化不消耗简析、深度反推或 BuddyCoin。画布每日 2 USD、单次 1 USD 成本保护不受影响。

## 候选包与待验收

- 版本：0.7.0 / V5 统一账号；新增最小必需 `identity` 权限，保留既有扩展功能。
- 候选 ZIP 通过现有白名单脚本生成，源码中的测试、账本、环境文件与密钥不入包。固定连接上述 Canvas 正式域，后端协议为本文件列出的 plugin API；本地代码检查不证明这些 API 已部署。
- 商店 ZIP不含 manifest key；固定测试ZIP为 `archbuddy-unified-test-0.7.0.zip`，其公开key只为固定测试ID，不包含私钥。测试ID `ikkmbpahejfapgnngdckocmfbcbnjedo`，后端仅允许此前批准的A/B账号。回调 `https://ikkmbpahejfapgnngdckocmfbcbnjedo.chromiumapp.org/archbuddy`，R2 CORS 精确 origin `chrome-extension://ikkmbpahejfapgnngdckocmfbcbnjedo`。
- 商店 Chrome ID 为 `hkbnjlapflleibeodhghbephgpacbhle`，Edge ID 为 `bdbnnnababglblekgnfpdcmeihjhflok`。测试请使用固定ID包，真实联调按这三个精确ID校验，不能放宽任意扩展授权。
- 本轮只生成待验收包，不提交 Chrome/Edge 商店、不部署 CloudBase、不调用付费模型。旧商店插件不会因官网后端部署自动升级。
- 已运行离线语法、账户安全/隔离与既有后端回归。尚待已部署后端的真实邮箱/Google 登录、A/B 两账户切换、云图片在 Canvas 使用与统一权益验收。

## 前一轮候选包摘要（不包含 2026-10-30 政策与会话修复）

固定正式后端 `https://canvas.archbuddy.top`，API 协议版本为 `/api/beta/plugin` 的统一账号接口；CloudBase 执行升级准备见 [统一执行器](../cloudbase/UNIFIED_EXECUTOR.md)。后端上线版本须由主会话另行登记，不以本地打包代表已部署。

| 包 | 字节 | SHA-256 |
| --- | --- | --- |
| archbuddy-beta-0.7.0.zip（商店候选，无key） | 213632 | 660651131418786F798E989FD05660D2B6A8C7ED236DCAF3B9E838A0D3391802 |
| archbuddy-unified-test-0.7.0.zip（固定ID测试） | 214017 | 9360A2D7705944E75EED43AD74786056E0ED4A0F846D2C7406AD14364BAB2216 |

打包：`& extension/scripts/build-store-package.ps1`；测试包另加 `-FixedIdentityTest`。两包都在Git忽略的 `extension/dist/`，不包含测试、账号账本、环境文件、私钥或API密钥。

## 当前测试包：2026-10-30 登录修复

源码 `fb0d5c2`，已推送 PR #9。固定测试版仍为 0.7.0，同一测试ID；原解压目录已经更新，已加载的用户只需在 Chrome 扩展管理页重新加载。

| 包 | 字节 | 当前 SHA-256 |
| --- | --- | --- |
| archbuddy-beta-0.7.0.zip | 216742 | 7750DC4508CEABC0D470182B268D8D07E3CE07AEC0353D1AE3E1E0D563CB47CD |
| archbuddy-unified-test-0.7.0.zip | 217127 | 520C8AB0E8A2CEFD2026B12DA26B93A73A64804C49C710C63ACE909D4E1A485D |

62 项插件、27 项 CloudBase 测试通过。独立插件会话复核包内40个条目、39个运行文件与源码一致（允许文本换行不同），manifest仅加入固定测试公开key与标识，不含私钥。隔离 Chromium 实际加载正确ID，点击登录打开正式邮箱/Google界面，关闭窗口后恢复按钮；另验证规则页往返保留授权地址。真实用户登录与A/B素材往返尚未完成，商店尚未发布。

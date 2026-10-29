## 2026-10-30：0.7.3 图词库顶部收紧与 Canvas 入口

- 图词库桌面端将账户名称、云素材和三项额度收进顶部工具区，与品牌、搜索、操作并排，取消原账户独占的整行。中窄屏按可用宽度重排，账户保持无外框，完整名称仍可在账户面板查看。
- 侧栏品牌右侧、图词库顶部操作区新增同款深绿色“打开 Canvas / Open Canvas”按钮，统一指向 `https://canvas.archbuddy.top/studio`，在新标签页打开；语言切换同步按钮、提示和辅助标签，不传递账户令牌或余额数据。
- 保留 0.7.2 工具栏浮框的 360px 固定宽度。此次仅改插件 HTML/CSS 和版本，不修改鉴权、额度、计费或云端资源；代码继续位于原 Interarchy/downPIC 插件仓库的 `fix/unified-product-account` 分支。

- 验证：图词库 1366/1440/1024/768/390px 中英文共 10 组检查通过，实际品牌文字无越界；侧栏 320/360/380/440px 中英文无重叠，三项额度保持。隔离点击确认 Canvas 新标签页地址准确，原侧栏和输入不跳转、不丢失；浮框仍固定 360px。14 项相关检查与差异检查通过，无真实模型调用。
- 0.7.3 已原地更新既有测试安装目录，42 个运行文件逐项 SHA-256 匹配。测试包 SHA-256：244143911FC9117C2D64F56A3F00017AC5B5F1F3CEC58EC506DE1C989BEAE740；商店候选：DD50A49777504676A5F09803C7117A5A5932A01562E1C04AA15B56D7B5E09845。固定扩展 ID 保留，Chrome/Edge 商店尚未提交。

## 2026-10-30：0.7.2 恢复工具栏浮框原比例

- 用户反馈 0.7.1 工具栏浮框变成长窄列。复现发现 `body { max-width: 100vw }` 将原 360px 宽度限制为初始小视口，导致品牌重叠、额度标签断行。移除该规则与浮框专用窄屏缩字，html/body 明确保留原 360px 固定宽度；保留账户、云素材、三额度的分区及一键语言切换。
- 隔离 Chromium 前后对照：初始视口 228px 时，修前文档宽 228px，修后宽 360px；360px 下中英文品牌/服务状态/语言按钮无重叠，三项额度标签单行，中文内容高 445px。此次只改尺寸样式和版本号，不改计费、登录或其他页面布局。
- 0.7.2 已覆盖原测试安装目录，42 个文件与测试 ZIP 逐项匹配。测试包 SHA-256 `3252DCD9E95DF3DE406CD29C1F37476D8EDAEEF15E47F4685A30AE5D347A1C9C`；商店候选 SHA-256 `58BA0D49FAF8E3B8C6B5E61B9D4EE392D5E9511B993CBA1F6A621AA792C94387`。固定 ID 不变，重新加载插件并重开浮框即可；未提交商店。

## 2026-10-30：0.7.1 三项额度与全插件双语界面

- 弹窗、侧栏、图词库和云素材页统一拆分品牌/语言、账户/云素材、三项额度，不再把邮箱和余额挤在品牌一行。邮箱长时缩略，账户面板保留完整名称；窄屏三列显示 BuddyCoin、简析剩余、深度反推剩余。
- 额度直接读取统一账户返回的 `credits.availableUnits`、`entitlements.downloads.remaining`、`entitlements.deepReverse.remaining`。其中 downloads 是兼容字段，界面只称简析；未知值显示破折号，不伪造为 0 或注册赠送额。模型执行后的原有账户刷新链路继续发布最新额度。
- 新增全插件 EN/中偏好 `archbuddyUiLanguageV1`：弹窗、侧栏、图词库、云素材、账户面板、网页图片浮框和隐私页同步更新。默认分类只翻译显示，不迁移分类值；输入草稿、选中项、上传图片和用户内容不因切换而重置或翻译。网页浮框只改自身文字，不改宿主网页语言。
- 本轮只更新插件界面与打包清单，不修改计费或认证协议、不重新部署后端、不进行真实模型调用。原 GET 来源修复保留，用户此前已明确确认真实登录后显示账户和余额。
- 验证：69/69 插件测试、运行文件语法与差异检查通过。隔离 Chromium 检查 320/360/440px 弹窗、320/380px 侧栏和窄屏素材库；三项模拟额度、未知值、打开面板后的语言同步、后台错误翻译、草稿/选择保留与无刷新均通过，无页面异常。真实模型扣次与跨端素材完整验收仍另行进行。

- 0.7.1 已打包并原地覆盖既有 `archbuddy-unified-test-0.7.0` 解压目录，固定测试 ID 不变；安装路径中的旧版本号仅为保留 Chrome 加载路径。42 个包内文件与安装文件逐项 SHA-256 一致，49 处相对模块引用完整。重新加载扩展后重开侧栏/图词库；已打开网页刷新一次加载新浮框，此后语言切换自动同步。
- 商店候选 242354 字节，SHA-256 `D15E5725AA8AB2E7691BF0ED60636C822BB59B6346A4DD51B46C44A0B91B5716`；固定 ID 测试包 242732 字节，SHA-256 `2E59A28F5743BD7F677E1C7821BBF81DE6A92AA1A2FE67B9F6B46191C062060E`。Chrome/Edge 商店尚未提交；本机原地更新不代表商店用户已升级。

## 2026-10-30：连接成功后仍未登录的 GET 来源修复

- 用户实测已到“连接此账户”，返回侧栏后仍显示登录/注册。独立隔离 Chromium 复现：MV3 Service Worker 的 POST `/token` 自动携带扩展 Origin；带 host permissions 的 GET `/v1/account` 默认没有 Origin，正式 BFF 因此返回 403。线上仅查会话数量已确认出现有效 PluginSession，未读取用户令牌或内容。
- 仅修改插件统一 transport，显式设置真实 `chrome-extension://${browser.runtime.id}`，继续使用固定官网地址与 `credentials: omit`。BFF 精确来源白名单、PKCE、会话绑定、Cookie 禁止和跨账户校验全部保留，无须改 Clerk 或云端。
- 验证范围：隔离浏览器已验证真实请求来源差异；完整合成 UI 探针在初始化阶段遇到 ACCOUNT_BUSY，未进入授权阶段，未记为通过。随后用户本人已完成真实授权并确认账户和余额正常。
- 新回归覆盖连接换取→账户 GET→公开视图发布→客户端重建刷新。修前确定失败 FORBIDDEN，修后插件 63/63 检查通过；独立复核账户测试 39/39，通过语法与差异检查。隔离 Chrome 对正式接口的无效令牌请求在正确 Origin 下返回预期 401，而非原来的 403；没有真实模型调用。
- 原固定 ID 解压目录已原地更新。测试 ZIP SHA256：`36BF816672F68D4C329215F3C2A82EEF3BD9B7C4F9F4FC1FB38A89B98A50CA05`；商店候选 ZIP：`8D88351C8A047A4BB25B55EFD1ED75B686C4C32663CB1D3B7E6D32433855A6B2`。商店未提交；用户重新加载既有测试扩展并完成连接后，已明确确认右上角显示账户和余额。真实双账号切换与跨端素材往返仍需独立验收。

# ArchBuddy 插件统一账号接入

日期：2026-10-29。分支：`fix/unified-product-account`，基于完整快照 `452ee7e`。本轮直接依据用户“官网、Canvas、plugin 同一个产品，共用账户、注册和数据，未完成请完成”的指令实施；覆盖旧本地演示阶段的手机号优先、200 积分独立账本、账号间共用图库与不做云同步的范围约定。旧本地演示保留为开发专用模块，不是正式产品账户。

## 当前发布状态：2026-10-30

统一后端已发布，用户已确认真实授权返回后显示账户和余额；其余跨账户/素材/计量验收及商店发布仍待完成。以下线上结论来自主任务在切流后回读的实际状态与探针结果；不把本地测试或打包当作线上完成证明。

- CloudBase `archbuddy-api-015` 已为 normal，承接 100% 流量；正式 Worker `archbuddy-beta-preview` 已核验存在 `PRODUCT_EXECUTOR_SECRET`，并已成功设置 `PRODUCT_EXECUTION_ENABLED=true`。旧匿名 `/api/session` 返回 410，不再绕过统一账户。
- 015 四项无模型验收通过：`/api/status` 返回统一账户模式且匿名会话关闭；旧 session 返回 `410 / UNIFIED_LOGIN_REQUIRED`；签名结果查询返回 `200 / not_found`；错误签名返回 `401 / UNIFIED_UNAUTHORIZED`。真实模型调用为 0，不代表真实生成及扣次流程已完成端到端验收。
- `archbuddy_dev_requests` 已核验 ADMINONLY；专属 TTL `archbuddy_unified_expiry_v1` 对 `unifiedExpiresAt` 使用 `expireAfterSeconds:0`，原 `_id_`、`_openid_1` 索引保留。统一结果自创建起保留 30 天，旧记录无该字段而不受新 TTL 影响。
- 2026-10-30 收尾完整回归：插件 62 项、CloudBase 45 项，共 107 项全部通过；45 项包含发布脚本 12 项、固定版本路由 3 项、无模型探针 3 项。
- 真实授权返回插件已获用户确认；仍待 A/B 账户切换与缓存隔离、所选图片/提示词进入云素材并在 Canvas 使用、实际成功简析扣 1 次及深度反推额度结算。当前不宣称完整 E2E 通过。

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

- 版本：0.7.1 / V5.1 Unified account；沿用统一账号所需的 `identity` 权限，保留既有扩展功能。
- 候选 ZIP 通过现有白名单脚本生成，源码中的测试、账本、环境文件与密钥不入包。固定连接上述 Canvas 正式域，后端协议为本文件列出的 plugin API；本地代码检查不证明这些 API 已部署。
- 商店 ZIP不含 manifest key；固定测试ZIP为 `archbuddy-unified-test-0.7.1.zip`，其公开key只为固定测试ID，不包含私钥。测试ID `ikkmbpahejfapgnngdckocmfbcbnjedo`，后端仅允许此前批准的A/B账号。回调 `https://ikkmbpahejfapgnngdckocmfbcbnjedo.chromiumapp.org/archbuddy`，R2 CORS 精确 origin `chrome-extension://ikkmbpahejfapgnngdckocmfbcbnjedo`。
- 商店 Chrome ID 为 `hkbnjlapflleibeodhghbephgpacbhle`，Edge ID 为 `bdbnnnababglblekgnfpdcmeihjhflok`。测试请使用固定ID包，真实联调按这三个精确ID校验，不能放宽任意扩展授权。
- 本轮插件仅生成待验收包，尚未提交 Chrome/Edge 商店；CloudBase 发布状态见上节，本轮无真实模型调用。旧商店插件不会因官网后端部署自动升级。
- 已运行离线语法、账户安全/隔离与既有后端回归。后端已部署，真实登录已获用户确认；尚待 A/B 两账户切换、云图片在 Canvas 使用与统一权益验收。

## 前一轮候选包摘要（不包含 2026-10-30 政策与会话修复）

固定正式后端 `https://canvas.archbuddy.top`，API 协议版本为 `/api/beta/plugin` 的统一账号接口；CloudBase 执行升级准备见 [统一执行器](../cloudbase/UNIFIED_EXECUTOR.md)。该表仅保留历史包摘要，不代表当前插件包或后端版本；当前状态见文首。

| 包 | 字节 | SHA-256 |
| --- | --- | --- |
| archbuddy-beta-0.7.0.zip（商店候选，无key） | 213632 | 660651131418786F798E989FD05660D2B6A8C7ED236DCAF3B9E838A0D3391802 |
| archbuddy-unified-test-0.7.0.zip（固定ID测试） | 214017 | 9360A2D7705944E75EED43AD74786056E0ED4A0F846D2C7406AD14364BAB2216 |

打包：`& extension/scripts/build-store-package.ps1`；测试包另加 `-FixedIdentityTest`。两包都在Git忽略的 `extension/dist/`，不包含测试、账号账本、环境文件、私钥或API密钥。

## 历史测试包：2026-10-30 早期登录修复（已由 0.7.1 替代）

源码 `fb0d5c2`，已推送 PR #9。固定测试版仍为 0.7.0，同一测试ID；原解压目录已经更新，已加载的用户只需在 Chrome 扩展管理页重新加载。

| 包 | 字节 | 当前 SHA-256 |
| --- | --- | --- |
| archbuddy-beta-0.7.0.zip | 216742 | 7750DC4508CEABC0D470182B268D8D07E3CE07AEC0353D1AE3E1E0D563CB47CD |
| archbuddy-unified-test-0.7.0.zip | 217127 | 520C8AB0E8A2CEFD2026B12DA26B93A73A64804C49C710C63ACE909D4E1A485D |

此包构建时 62 项插件、27 项 CloudBase 测试通过；本次最终回归为 62 + 45 = 107 项。独立插件会话复核包内40个条目、39个运行文件与源码一致（允许文本换行不同），manifest仅加入固定测试公开key与标识，不含私钥。隔离 Chromium 实际加载正确ID，点击登录打开正式邮箱/Google界面，关闭窗口后恢复按钮；另验证规则页往返保留授权地址。真实用户登录与A/B素材往返尚未完成，商店尚未发布。

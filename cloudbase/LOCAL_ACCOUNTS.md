# 本地手机号账号与积分演示

本轮只在本机验证「登录 → 获赠积分 → 消耗提醒 → 扣分/退回 → 反馈赠送申请 → 人工审核 → 积分包订单」闭环。不连接 CloudBase，不发送短信，不提供真实支付，也不请求真实模型。默认商店和云端运行方式保持原状。

## 启动

在仓库根目录运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File cloudbase/scripts/start-local-accounts.ps1
```

脚本调用 `extension/scripts/prepare-local-account.ps1`，在忽略目录 `extension/dist/local-account` 生成本地开发副本。Chrome「加载已解压的扩展程序」选择这个目录。脚本不修改源码的云端地址。保持终端运行，关闭时按 Ctrl+C。

后端只监听 `http://127.0.0.1:8080`。已有服务占用端口时会停止启动，请先确认并停止原本地服务。接口状态 `/api/status` 返回 `accountMode=local-demo`、`localDemo=true`、`mockAI=true`。

验证码由安全随机数生成，有效期 5 分钟，同一手机号 60 秒可重发，每小时最多 10 次，每个验证码最多尝试 5 次；新验证码使旧验证码失效。验证码仅在本地演示响应和登录界面显示，不写入服务日志或明文账本。这不能证明手机号归属，不可用于真实用户注册。会话令牌只在本地服务持久化哈希，7 天过期，退出登录立即撤销当前令牌。

模拟模型返回明确标注「本地演示」的提示词、效果评估与描述，不代表对真实图片的分析。向量和语义检索在调用前拒绝，继续使用关键词搜索，避免合成向量污染真实索引。

## 积分与保护

- 注册同一手机号首次赠送 200 积分；重登、重启不重新赠送。
- 反推提示词与优化迭代：每张图 1 积分；核心视觉特点：每张图 0.1 积分。
- 账本内部以 0.1 积分为整数单位，避免浮点扣费误差。
- 每个账号每天最多 50 次模型尝试，整个本地演示每天最多 500 次；北京时间零点恢复次数，积分不清零。
- 失败退回积分，但已经开始的调用仍占用保护次数；请求在模型开始前取消会退回积分和次数。每个请求 ID 只能受理一次，跨账号也不能重用。
- 本地 500 次只是演示保护，不与线上共享计数。为避免产生独立真实预算，本轮启动程序拒绝 local-demo 的真实模型模式。接入真实短信、真实模型和支付之前，必须另行设计共享预算与生产身份、隔离、隐私和支付核验。
- 积分包为 100/500/1000 积分，价格暂占位 ¥1/¥2/¥3。订单为 `payment_unavailable`，没有收款入口，不会增加积分；不存在“模拟已支付”按钮。
- 每个账号一生仅可申请一次 +200 积分的反馈赠送；需 5 至 1000 字的使用反馈，由维护者审核。通过后增加 200，拒绝后不能再次申请。此活动不与评分、评价或评价内容挂钩。

## 维护者审核

**先停止本地账号服务，再执行管理命令，完成后重新启动。**管理员工具与服务共用独占锁，不允许并发改写。仅在本机执行，无公开管理员接口。

```powershell
node cloudbase/scripts/account-admin.mjs list
node cloudbase/scripts/account-admin.mjs orders
node cloudbase/scripts/account-admin.mjs approve <账号ID> "已核对该账号的使用反馈"
node cloudbase/scripts/account-admin.mjs reject <账号ID> "申请说明未包含实际使用反馈"
node cloudbase/scripts/account-admin.mjs topup <账号ID> <积分数> <新的UUID请求ID> "本次人工赠送的具体原因"
node cloudbase/scripts/account-admin.mjs disable <账号ID>
node cloudbase/scripts/account-admin.mjs enable <账号ID>
```

`list` 显示脱敏手机号、积分、申请内容与审核状态；重复批准不重复加分。`topup` 是独立人工赠送，不代表订单已支付；相同请求 ID 重试不重复赠送，最多一次 1000 积分。停用账号会撤销其全部会话。

## 数据、异常与限制

固定归属 `archbuddy/local`，只写 `cloudbase/dist/local-accounts/accounts.json`，独占锁为同目录 `writer.lock`；这两个文件被 Git 忽略，不得纳入部署包。账本保存手机号派生哈希及脱敏展示、令牌哈希、积分流水、使用日计数、订单、用户主动提交的反馈及审核记录。不保存原始手机号、验证码明文、图片、Prompt 或模型输出。账本不提供自动备份或到期删除，不是生产数据库；同一操作系统用户能访问本地文件。删除账本会丢失所有演示账号及积分记录，不能用删除数据代替维护。

写入在进程内串行，并使用同目录临时文件、同步和重命名提交，失败不发布内存修改。重启时发现未完成的预占，标记为 `uncertain`，保留积分预占和保护次数，不自动重试或自动退款。维护者核对后可以退回积分，调用次数仍保留：

```powershell
node cloudbase/scripts/account-admin.mjs uncertain
node cloudbase/scripts/account-admin.mjs refund-uncertain <账号ID> <请求ID> "核对后未获得有效结果，退回积分"
```

异常终止可能留下 `writer.lock`。仅在对应进程确实已退出时运行：

```powershell
node cloudbase/scripts/account-admin.mjs unlock-stale
```

正常运行中的服务不会被此命令解锁。若锁内容异常或进程状态无法确认，程序拒绝自动清除。

## 本轮验证记录（2026-10-09）

- 5 个新增/修改 Node 模块语法通过；启动 PowerShell 解析通过；后端差异格式检查通过。
- 20 项仓库既有后端检查通过：session、server、quota、daily-server；没有新增测试文件或框架。
- 使用独立忽略目录和合成手机号执行 8 组即时行为验收：账号鉴权及匿名/管理员拒绝；验证码节流与首次赠送；1/0.1 积分扣退、并发与去重；一次反馈批准幂等及订单不加分；跨账号拒绝与退出；重启持久化与独占锁；50/500保护、免费计算计次、北京时间跨日与调用前取消；崩溃预占和人工退回。
- 验证过程中没有请求 CloudBase、真实短信、真实模型或支付。验证账本位于 `cloudbase/dist/account-verification-1791477083780`，与用户本地演示账号目录分开；未把这份合成数据作为正式用户数据。
- 补充 6 项即时验证通过：验证码 5 次错误后锁定、验证码到期失效、同账号同积分包订单合并、订单按账号隔离、重启恢复订单且不加分、本轮拒绝本地账号真实模型启动。数据位于独立忽略目录 `cloudbase/dist/account-edge-verification-1791477387258`。账号返回最近 10 条自己的订单，维护者订单列表也按订单 ID 去重。

- 独立浏览器最终 29 项核对通过，页面异常 0；账号、积分包、1/0.1 扣费、跨页余额和切换账号隔离通过。桌面 1440/1024 与侧栏 360 费用提示完整；报告在 `extension/dist/account-points-20261009-review/verified-summary.json`。仅两个合成账号已归档至该目录的 `synthetic-accounts`，服务已用空账本重启。
- 复核补齐旧 V1 `/api/analyze` 模拟结果标题兼容；既有 `assembleSections` 直接验证通过，含 4 项模型分项及固定准则。

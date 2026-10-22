# Edge Add-ons 上架清单（V4.1 / 0.6.1）

状态：**Edge 专用隐私页已公开部署，商店尚未提交**。用户已反馈 Edge 本地测试版可以使用；提交前仍需复核最终候选包。官方流程：[Microsoft Learn](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension)。

## 文件边界

- Chrome 商店文案与截图仍位于 `extension/store/` 原位；现有 Chrome 商品及代码未改。
- Edge 专用文案、政策和图标在本目录；Edge ZIP 在 `extension/dist/edge/`。运行 `pwsh -File extension/store/edge/build-edge-candidate.ps1` 从固定哈希的测试 ZIP 生成候选包。两个商店的商品 ID、后台草稿、隐私 URL、截图和审核状态分别记录。
- 本版仅采用已提交的 `c01e14a:extension` 中 0.6.1 匿名云端链路；工作区未提交的账号积分、本地验证码、模拟支付不进入 ZIP。

## 上传资料

1. 在 Microsoft Partner Center 注册/进入 Edge 扩展开发者账户，创建新扩展。
2. 上传 `extension/dist/edge/ArchBuddy-Edge-V4.1-0.6.1-store-candidate.zip`；核查根目录 `manifest.json`、版本 0.6.1、权限和图标。此包与用户测试版的业务文件一致，只有 `privacy.html` 的 Edge 专用说明不同。
3. 选择可见性与市场；类别用“生产力工具”，支持联系用 `19822692515@163.com`。填写 [商品描述](LISTING_ZH_CN.md)；名称和简短描述受 ZIP 内 manifest 控制，后台显示不一致时先修订 Edge 包并重传。
4. 按 [权限与数据稿](PRIVACY_AND_PERMISSIONS.md)填写单一用途、各权限理由、远程代码“否”和数据使用；以后台出现的真实选项为准。
5. **已完成**：将 [Edge 隐私 HTML](privacy.html) 单文件部署到既有 ArchBuddy 隐私静态应用的 `archbuddy/privacy/edge/index.html`。后台填写 `https://archbuddy-privacy-dev-mel-d9guu8bpu44029179.webapps.tcloudbase.com/edge/`；2026-10-17 已核对 HTTP 200、`text/html`、3907 字节及与本地一致的 SHA-256 `392FC25C2EC5C6FC44D0E4A7C110414E17C79998653D52EB4409903DE66C3F96`。当前工作区仍无 `cloudbase/environment.json`，本次通过既有资源登记、CLI 只读环境/应用/前缀核对后实施；原 Chrome 页面哈希未变。
6. 上传 `assets/icon-128.png`。Edge V4.1 截图已从最终候选包在独立 Edge 配置中截取并核验：从 [`assets/screenshots-v4.1/`](assets/screenshots-v4.1/README.md) 按 `01 → 02 → 04 → 05 → 03` 逐张上传 PNG；截图 ZIP 仅供下载解压，不上传到图片栏。小宣传图 440×280、大宣传图 1400×560 可暂留空；如复用 Chrome 图片，先核对界面/文案仍与 V4.1 一致。
7. 粘贴商品稿中的审核员步骤，完成最终 ZIP 在全新 Edge 配置的人工检查，尤其核对下载、来源回访、侧栏、图库本地路径以及需要同意的 AI 路径；再按 Partner Center 的错误提示处理并提交审核。

## 尚待完成

- [x] Edge 专用文件夹、商品文案、权限披露、图标与候选 ZIP 分离。
- [x] 用户反馈此前的 Edge `local-test` 包可使用。
- [x] Edge 隐私页发布到独立 HTTPS 地址并核验；后台 URL 已可填写，尚未代用户写入 Partner Center。
- [x] 最终候选 ZIP 在独立 Edge 测试配置中加载，并截取五张 V4.1 商品图；截图流程未调用模型，页面无脚本错误。
- [ ] 提交前由所有者在日常 Edge 中人工复核最终 ZIP 的保存、侧栏、图库和 AI 同意流程。
- [ ] 开发者账户、商品可见性/市场与实际后台数据选项由所有者确认。
- [ ] 提交 Microsoft Edge Add-ons 审核并记录商品 ID、提交时间与结果。

本次仅在既有 ArchBuddy 隐私静态应用下新增 `edge/index.html`，没有更改 Chrome 根页面、展示站、CloudBase 服务、业务数据、身份、日志配置、密钥、额度、预算或商店后台。资源边界与验证证据见 `docs/CLOUDBASE_PROJECT_ISOLATION.md`。

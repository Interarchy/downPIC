# ArchBuddy Edge 版资料

目标版本：V4.1 / manifest `0.6.1`，基础源码固定为已提交的 `c01e14a`。用户已在 Edge 本地试用此前的 `local-test` 包并反馈可以使用。此目录的文案与隐私页专供 Microsoft Edge Add-ons，**不代表已提交或通过审核**。

已公开核验的 Edge 隐私政策：<https://archbuddy-privacy-dev-mel-d9guu8bpu44029179.webapps.tcloudbase.com/edge/>。Chrome 原隐私政策仍位于同站根路径，内容未变。

| 文件 | 用途 |
| --- | --- |
| [LISTING_ZH_CN.md](LISTING_ZH_CN.md) | Partner Center 商品页文字、审核说明 |
| [PRIVACY_AND_PERMISSIONS.md](PRIVACY_AND_PERMISSIONS.md) | 单一用途、权限、远程代码和数据使用填写依据 |
| [privacy.html](privacy.html) | Edge 专用的可公开部署隐私页，也是 Edge 候选 ZIP 内 `privacy.html` 的来源 |
| [SUBMISSION_CHECKLIST.md](SUBMISSION_CHECKLIST.md) | 操作顺序、资产和发布关口 |
| [build-edge-candidate.ps1](build-edge-candidate.ps1) | 从已校验的 Edge 本地测试 ZIP 生成仅替换隐私页的候选 ZIP |
| `assets/icon-128.png` | Edge 商品页图标，复制自扩展品牌图标；不改变 Chrome 资产 |
| [assets/screenshots-v4.1/](assets/screenshots-v4.1/README.md) | Edge V4.1 / 0.6.1 五张独立 1280×800 商品截图与采集证据；逐张上传 PNG |

插件功能脚本与 Chrome 版本一致；只在 Edge ZIP 中替换浏览器相关隐私措辞。账号、积分、验证码和占位付费仍在本地开发阶段，不进入本版 Edge 商品描述或安装包。

官方依据：[发布步骤](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension)、[开发者政策](https://learn.microsoft.com/en-us/legal/microsoft-edge/extensions/developer-policies)。

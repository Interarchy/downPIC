# ArchBuddy 静态托管

本目录只登记 ArchBuddy 的公开静态文件，不代表整个 CloudBase 环境归本项目独占。

| 本地目录 | 云端目标路径 | 用途 | 数据写入 |
| --- | --- | --- | --- |
| `cloudbase/hosting/archbuddy/privacy/` | `/archbuddy/privacy/` | Chrome 商店公开隐私政策 | 无 |
| `extension/store/edge/privacy.html` | `/archbuddy/privacy/edge/index.html` | Edge 商店公开隐私政策；独立于 Chrome 文件 | 无 |

已验证的公开地址：<https://archbuddy-privacy-dev-mel-d9guu8bpu44029179.webapps.tcloudbase.com/>

Edge 专用地址（2026-10-17 已验证）：<https://archbuddy-privacy-dev-mel-d9guu8bpu44029179.webapps.tcloudbase.com/edge/>。它映射到同一 ArchBuddy 隐私静态应用下的独立 `edge/index.html`；Chrome 根页面保持原样。

只允许把上述本地文件或目录上传到对应子路径，禁止部署到静态托管根目录、清空根目录或覆盖其他项目路径。Edge 页只上传单文件，不能用 Chrome 隐私目录的整目录命令来更新 Edge 页面。

CloudBase CLI 示例：

```powershell
tcb hosting deploy cloudbase/hosting/archbuddy/privacy /archbuddy/privacy -e <your-cloudbase-environment-id>
tcb hosting deploy extension/store/edge/privacy.html /archbuddy/privacy/edge/index.html -e <your-cloudbase-environment-id>
```

也可以在 CloudBase 控制台的「静态网站托管」中创建或选择 `archbuddy/privacy` 目录，再上传 `index.html`。当前独立静态站已部署并由用户确认可公开访问；后续更新仍须限定该 ArchBuddy 部署，不得覆盖共享环境中的其他项目。

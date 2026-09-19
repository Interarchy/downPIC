# ArchBuddy 静态托管

本目录只登记 ArchBuddy 的公开静态文件，不代表整个 CloudBase 环境归本项目独占。

| 本地目录 | 云端目标路径 | 用途 | 数据写入 |
| --- | --- | --- | --- |
| `cloudbase/hosting/archbuddy/privacy/` | `/archbuddy/privacy/` | Chrome 商店公开隐私政策 | 无 |

已验证的公开地址：<https://archbuddy-privacy-dev-mel-d9guu8bpu44029179.webapps.tcloudbase.com/>

只允许把上述本地目录上传到对应子路径，禁止部署到静态托管根目录、清空根目录或覆盖其他项目路径。

CloudBase CLI 示例：

```powershell
tcb hosting deploy cloudbase/hosting/archbuddy/privacy /archbuddy/privacy -e <your-cloudbase-environment-id>
```

也可以在 CloudBase 控制台的「静态网站托管」中创建或选择 `archbuddy/privacy` 目录，再上传 `index.html`。当前独立静态站已部署并由用户确认可公开访问；后续更新仍须限定该 ArchBuddy 部署，不得覆盖共享环境中的其他项目。

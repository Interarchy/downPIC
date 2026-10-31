# ArchBuddy 浏览器插件

当前版本 **V5.1 / 0.7.5**，Chrome 与 Edge 共用同一份 Manifest V3 生产源码。官网、Canvas 与插件共用邮箱/Google账户、BuddyCoin、简析和深度反推权益。0.7.5 在0.7.4功能基线上同步隐私与发布材料、统一两店打包，不调整模型、费用或界面布局。

- [用户说明书](store/releases/0.7.5/用户说明书.md)
- [本次发布与审核清单](store/releases/0.7.5/审核与发布清单.md)
- [Chrome商店文案](store/releases/0.7.5/Chrome商店文案.md)
- [Edge商店文案](store/releases/0.7.5/Edge商店文案.md)
- [权限与数据披露](store/releases/0.7.5/权限与数据披露.md)
- [随包隐私说明](privacy.html)

## 构建

```powershell
powershell -ExecutionPolicy Bypass -File extension/scripts/build-store-package.ps1 -Browser chrome
powershell -ExecutionPolicy Bypass -File extension/scripts/build-store-package.ps1 -Browser edge
```

两个商店ZIP包含相同运行文件，分别命名archbuddy-chrome-0.7.5.zip与archbuddy-edge-0.7.5.zip；不包含测试身份key、私密数据、后台源码或供应商密钥。请在已有商店条目中更新以保留正式扩展ID；随机解压安装的ID可能不在生产登录允许列表中，不能当作正式授权验收。固定ID内测另使用-FixedIdentityTest，其产物不得上传商店。

## 当前能力与数据边界

网页图片浮框、360px工具栏弹窗、提示词生成/优化侧栏、本地图词库、专业版云图词库和Canvas入口共用EN/中语言设置。普通下载免费，简析成功扣次；三项额度以服务器为准。非专业版图词库素材仅保存在本机，不跨设备同步；专业版云图词库可同步，容量5GB、单图20MiB，有效期内保留，到期后30天只读下载/续购。Canvas生成结果在账户存续期间不自动到期，上传原图仍保留30天。历史本机素材须主动选择上传，不自动全量同步。

BACKEND_MODE=cloud，生产入口为https://canvas.archbuddy.top；模型密钥仅在服务端。用户卸载前应备份本地素材；升级同一商店条目不等于迁移到另一扩展ID或另一浏览器。历史V4/V4.1资料留存于仓库，但不能用作0.7.5提交材料。

本轮仅更新插件包和交付材料，不部署云资源或提交商店。商店审核、真实Edge外壳和普通新账户端到端验收以发布清单记录为准。

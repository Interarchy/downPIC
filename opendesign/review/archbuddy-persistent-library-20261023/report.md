# ArchBuddy 展示站第023版验收

用户反馈：03「沉淀图词资产」悬停展开后，继续向下滚动会触发自动收起，影响阅读。本轮仅移除桌面鼠标移出时的自动收起；触屏轻点操作保留。

- 本地与公网Chrome 1440×1000、390×844：展开后移开鼠标并向下滚动，图库持续展开；`aria-expanded=true`，无横向溢出或脚本错误。公网结果见`public-browser.json`。
- CloudBase应用限定为`archbuddy-dev-showcase`，项目`archbuddy`、阶段`development`、路径`archbuddy/dev/showcase/`；未触及数据库、身份、后端、密钥、日志、额度、预算、共享配置或其他项目。静态托管凭据仍为环境级权限；本次用明确应用名和路径限定操作，未更改权限配置。
- 发布前应用022/SUCCESS、固定前缀33文件；发布后023/SUCCESS、前缀33文件，均属本项目固定路径。白名单构建33文件、10105994字节，原插件ZIP哈希不变；主域33/33文件SHA256与清单一致，独立隐私页200/6364字节、原SHA256不变。结果见`public-hashes.json`。CLI临时`cloudbaserc.json`已清理。
- 未提交或推送Git。

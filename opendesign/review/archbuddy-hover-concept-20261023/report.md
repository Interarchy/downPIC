# ArchBuddy 展示站第022版验收

- 03 三张创作卡与图词资产底座在桌面均由悬停触发；效果图翻面后自动从左至右拉帘至 78%。移动端轻点可操作，两个连接圆标位于卡片最上层。
- 图库展开区删除辅助文案，只展示插件实际图库截图；05 下载与安装和顶部对应入口已移除。
- 本地与公网 Chrome 1440×1000、390×844：自动拉帘、图库展开和界面布局通过；无横向溢出或脚本错误。详见 `local-results.json`、`public-browser.json` 与截图。
- CloudBase 范围限 `archbuddy-dev-showcase` / `archbuddy/dev/showcase/`，部署元数据 `archbuddy-dev-showcase-022` / SUCCESS。白名单 33 文件共 10106068 字节，公网 33/33 与清单 SHA256 一致；独立隐私页 200 / 6364 字节，SHA256 `D01C5E2B44C55F6C64CB1647749B2C307326255CAA1259304B45E5B169A05DA8` 未变。详见 `public-hashes.json`。
- 本轮仅更新展示站；未修改插件、后端、账号积分、其他云端资源或共享配置，未提交或推送 Git。

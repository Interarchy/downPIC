# Phase 1 快速验证：ArchBuddy V2

本文档前半用于实现完成后的强制静态验收，后半提供非阻断的人工产品演示建议，不是自动化测试方案。本阶段不新增或运行测试。

## 1. 前置条件

- 当前仓库分支为 `direction/plugin`。
- `cloudbase/environment.json` 的项目归属仍为 `archbuddy` / `development`。
- 真实 API Key、匿名测试令牌和服务环境变量只存在于 CloudBase 环境或本机安全位置，不进入仓库、扩展包或截图。
- 如要验证匿名统计，`archbuddy_dev_events` 与 `ARCHBUDDY_ANALYTICS_ENABLED` 必须已登记，集合权限和 30 天 TTL 已验证，并显式设置 `ARCHBUDDY_ANALYTICS_ENABLED=true`；否则保持统计关闭。
- 发布带统计开关的版本前，扩展隐私页、商店隐私文本、权限/数据使用说明、公开隐私站和 Chrome Web Store 隐私披露必须全部更新并核对一致。

## 2. 静态检查

在仓库根目录执行变更文件的语法检查：

```powershell
node --check extension/shared.mjs
node --check extension/background.mjs
node --check extension/sidepanel.mjs
node --check plugin-prototype/analysis-contract.mjs
node --check plugin-prototype/vision-analyzer.mjs
node --check cloudbase/server.mjs
node --check cloudbase/cloudbase-store.mjs
node --check cloudbase/quota.mjs
node --check cloudbase/start.mjs
```

检查 Manifest 可解析且未新增权限：

```powershell
node -e "const fs=require('fs'); const m=JSON.parse(fs.readFileSync('extension/manifest.json','utf8')); console.log({manifest_version:m.manifest_version,permissions:m.permissions,host_permissions:m.host_permissions})"
```

通过标准：

- 所有 `node --check` 退出码为 0；
- Manifest 仍为 V3；
- 权限列表没有因 V2 增加新项；
- 代码中不存在硬编码 API Key、测试 token、邮箱、手机号或 CloudBase 凭据。

## 3. 本地加载

1. 打开 `chrome://extensions`。
2. 开启开发者模式。
3. 点击“加载已解压的扩展程序”，选择仓库中的 `extension` 文件夹。
4. 刷新已有 ArchBuddy 测试页面并打开侧边栏。

## 4. 可选：核心路径人工演示

### 场景 A：分析并形成可控提示词

1. 选择一张有效建筑参考图并发起分析。
2. 确认 1 秒内出现进行中状态。
3. 确认成功后显示固定 11 个模块，即使某模块内容为空也不消失。
4. 确认可见事实、推断或无法确认的依据类型，以及证据和置信度均可见，但提示词预览中不出现这些元数据。
5. 编辑一个模块、停用一个模块并锁定一个模块。
6. 确认编辑后的用户文本不再沿用原 AI 证据，依据变为不确定、证据清空、置信度变为未知；提示词立即在本地更新且没有额外模型请求。
7. 单独复制一个启用模块，确认只得到模块正文。
8. 新草稿首次复制完整提示词时完成一次全局确认；复制内容只含固定准则和启用模块。
9. 同时粘贴或拖入多张图，确认系统拒绝并要求只选择一张，不会静默使用第一张。

### 场景 B：重新分析保护用户意图

1. 保持上一场景的编辑、停用和锁定状态，再次分析同一张图。
2. 确认编辑、停用和锁定模块未被覆盖。
3. 确认未修改 AI 建议已刷新，变化项有明确标识。
4. 确认新建议回到“建议”状态，但该草稿已完成的首次整体确认不会被重复要求。

### 场景 C：最近 5 份草稿

1. 创建并更新 6 份不同草稿。
2. 关闭并重新打开浏览器侧边栏。
3. 确认只保留最近 5 份，且每份模块值、开关和锁定状态可恢复。
4. 确认草稿不恢复原图；重新分析前界面要求重新选择参考图。
5. 点击“新建草稿”后确认历史中不会立即出现空记录；下一次成功分析只新增一份草稿。

### 场景 D：下载和分类回归

1. 在不发起分析的情况下执行现有下载/分类流程。
2. 保存成功后点击“继续分析此图”，确认进入同一分析确认流程，且保存动作本身没有触发 AI。
3. 确认下载/分类结果和错误提示与 V2 前一致。
4. 确认草稿、提示词和统计失败不会阻断下载。

### 场景 E：匿名统计边界

1. 默认关闭统计，完成一次分析和复制，确认没有 `/api/events` 请求。
2. 主动开启统计，再完成核心路径，确认只发送契约白名单字段。
3. 检查 CloudBase 记录只位于 `archbuddy_dev_events`，项目/阶段由服务端固定。
4. 确认记录不含图片、网址、提示词、模块文本、邮箱、手机号、token 或原始错误消息。
5. 关闭统计，确认后续不再发送事件。

## 5. 商店包检查

使用仓库现有商店包构建脚本生成待上传包后，至少核对：

- 包根目录直接包含 `manifest.json`，没有额外嵌套目录；
- 包中不含 `.git`、`.env`、`cloudbase/environment.json`、测试脚本、测试 token、部署压缩包或用户草稿；
- `manifest.json` 的名称仍为 ArchBuddy，版本号按发布规则递增；
- 隐私政策网址和支持邮箱与商店草稿一致；
- 用户界面不显示“个人/公共剩余次数”。

## 6. 完成判定

核心代码完成、静态检查全部通过、商店包未包含敏感或无关文件、文档与实际行为同步，即达到本阶段强制完成标准。人工演示用于产品判断，不是阻断门槛。CloudBase 统计资源未完成隔离登记或 TTL 验证时，只能以统计默认关闭的版本完成本地功能，不能宣称云端统计已上线。

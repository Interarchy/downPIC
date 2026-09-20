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
- 源码和运行配置中不存在硬编码 API Key、测试 token、未经批准的邮箱、手机号或 CloudBase 凭据；隐私政策、商店资料和公开支持页面可以保留已批准的公开支持邮箱，但不得把它复制到无关源码或配置中。

## 3. 本地加载

1. 打开 `chrome://extensions`。
2. 开启开发者模式。
3. 点击“加载已解压的扩展程序”，选择仓库中的 `extension` 文件夹。
4. 刷新已有 ArchBuddy 测试页面并打开侧边栏。

## 4. 可选：核心路径人工演示

### 场景 A：分析并形成可控提示词

1. 选择一张有效建筑参考图并发起分析。
2. 确认 1 秒内出现进行中状态。
3. 确认成功后在“本图候选意图”显示固定 11 个模块，即使某模块内容为空也不消失；此时当前方案仍为空。
4. 确认可见事实、推断或无法确认的依据类型，以及证据和置信度均可见，但提示词预览中不出现这些元数据。
5. 选择两到三个非空候选并点击“加入当前方案”，确认 Prompt 只出现已加入的维度。
6. 编辑一个已加入模块、停用一个模块并锁定一个模块。
7. 确认编辑后的用户文本不再沿用原 AI 证据，依据变为不确定、证据清空、置信度变为未知；提示词立即在本地更新且没有额外模型请求。
8. 单独复制一个启用模块，确认只得到模块正文。
9. 首次复制完整提示词时完成一次全局确认；复制内容只含固定准则和当前方案中的启用模块。
10. 同时粘贴或拖入多张图，确认系统拒绝并要求只选择一张，不会静默使用第一张。
11. 确认核心按钮均为四字以内；候选卡片主区域不显示依据、置信度和证据，正文默认三行且点击可展开；底部“详细说明”默认收起，展开后仍能查看分析依据、方案来源、整体准则和匿名统计设置。

### 场景 B：从第二张图继续拼装

1. 保持上一场景的当前方案，选择并分析第二张图。
2. 确认当前方案中的所有内容未被覆盖，新结果只出现在“本图候选意图”。
3. 加入一个此前为空的维度，确认原方案内容保留且 Prompt 增加对应段落。
4. 对一个已有维度点击“替换当前项”，确认只替换该维度，其他维度不变。
5. 确认方案变化后需要重新整体确认，候选的证据、置信度和来源提示仍不进入 Prompt。

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

以下产品指标仍需实际证据，均为非阻断验证项，当前不得标记达成：SC-001 需 5–8 名目标用户完成主任务；SC-002 需 20–30 张离线样本评估固定模块；SC-007 需离线评估无证据确定性错误；SC-008 需目标用户比较模块化结果与长文本的可理解性。

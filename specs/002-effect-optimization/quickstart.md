# V3 本地验证指南

> 2026-09-22：下方旧 A–F 演示中的“复制后保存”“来源补图”“独立修改草稿”已由 [侧栏流程修订及验收重点](interaction-revision.md) 替代。启动与本地隔离步骤继续有效。

## 目标

在不部署、不覆盖已上线 V1、也不接触其他 CloudBase 项目数据的前提下，验证“图片采集 → 提示词构建 → 效果优化 → 复制形成下一版本”的核心路径。

本指南用于实现完成后的人工演示和静态检查，不是自动化测试方案。

## 前置条件

- Windows + Chrome 116 或更高版本。
- Node.js 24 可用。
- 当前 Git 分支为 `direction/plugin`。
- 已通读 `spec.md`、`plan.md`、`data-model.md` 和 `contracts/`。
- 如需真实模型调用，仅在当前 PowerShell 进程安全设置本地 DeepSeek Key 和本地会话签名密钥；不要写入文件、命令历史截图、扩展或 Git。
- 不修改 CloudBase 控制台环境变量，不部署 `archbuddy-api`，不创建集合或存储目录。

## 1. 静态检查

在仓库根目录执行与改动相关的检查：

```powershell
node --check extension/shared.mjs
node --check extension/source-image-store.mjs
node --check extension/background.mjs
node --check extension/sidepanel.mjs
node --check extension/runtime-config.mjs
node --check plugin-prototype/analysis-contract.mjs
node --check plugin-prototype/vision-analyzer.mjs
node --check cloudbase/server.mjs
node --check cloudbase/start.mjs
Get-Content extension/manifest.json -Raw | ConvertFrom-Json | Out-Null
```

预期：所有命令退出码为 0，Manifest 权限没有新增 `unlimitedStorage` 或与本功能无关的权限。

执行现有后端包和扩展商店包静态检查：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File cloudbase/scripts/build-deploy-package.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File extension/scripts/build-store-package.ps1
```

预期：

- 后端评估提示文件和扩展新增运行文件分别进入对应包的明确白名单。
- 扩展运行模式未切回 `cloud` 时，商店包构建必须拒绝继续。
- 打包内容不含 `.env`、密钥、测试令牌、本地图片、草稿、IndexedDB 数据或生成结果。

## 2. 启动本地真实服务

仅在需要真实调用时使用。仓库已有 DPAPI 加密配置时，直接运行一键脚本：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File cloudbase/scripts/start-local-v3.ps1
```

脚本生成的签名密钥只存在于当前进程，不打印、不复制、不写入文件。没有 DPAPI 加密配置时，先运行 `plugin-prototype/scripts/configure-deepseek.ps1`；也可以在当前 PowerShell 进程显式设置 `DEEPSEEK_API_KEY`。本地 `process-test` 模式计数只在当前进程内，不能描述为 CloudBase 每日持久配额。

预期终端只显示启动和错误类别，不输出密钥、图片 base64、Prompt 正文或匿名令牌。

## 3. 让开发扩展连接本地服务

1. 按实现后的 `runtime-config.mjs` 说明把显式模式切为 `local`，本地地址固定为 `http://127.0.0.1:8080`。
2. 打开 `chrome://extensions`。
3. 开启开发者模式，选择“加载已解压的扩展程序”，目录为仓库的 `extension/`。
4. 每次修改扩展脚本后点击该扩展的“重新加载”，再刷新目标网页或重新打开侧栏。

禁止把 DeepSeek Key、`ARCHBUDDY_TEST_TOKEN` 或会话签名密钥填入扩展运行配置。

## 4. 核心路径人工演示

### 场景 A：三段导航和 V2 连续性

1. 打开侧栏，确认顶部只显示“图片采集、提示词构建、效果优化”，顺序一致。
2. 在“提示词构建”打开一份已有 V2 草稿。
3. 进入“效果优化”，确认同一草稿作为方案出现，并自动拥有只读 V1 文本基线。
4. 如果旧草稿没有原图字节，界面必须显示“原图缺失”或同义明确状态，不显示伪造图片。
5. 回到提示词构建重新选择对应参考图，再在来源图区域点击“补图”；确认状态变为可用且没有创建新的 PromptVersion。

预期：V2 模块内容和 Prompt 不被改写，历史基线只读；补图只恢复方案级来源资产，后续版本复用同一来源 ID。

### 场景 B：多图构建与来源图

1. 分析参考图 A，只把 2–3 个模块加入当前方案。
2. 分析参考图 B，把其他模块加入同一方案。
3. 打开效果优化中的方案来源图区域。

预期：A、B 的完整原图各保存一次；同一图加入多个模块不重复；多个 Prompt 版本复用这些来源 ID。

### 场景 C：单图效果评估

1. 选择当前方案和当前 Prompt 版本。
2. 导入一张 PNG/JPEG/WebP 生成图，确认预览不会自动发请求。
3. 点击“开始评估”，在发送确认后继续。
4. 观察 1 秒内出现处理中状态，正常条件下等待最多 60 秒。

预期：

- 只返回当前版本中启用且可评估的维度，每个恰好一次。
- 状态只使用“符合、部分符合、偏差、无法判断”。
- 参考摘要不单独评分；空的负向约束不产生禁用项。
- 常规界面不显示“个人剩余/公共剩余”等具体数字。

### 场景 D：建议、直接编辑与锁定

1. 选择其中一条建议，查看修改前/后预览。
2. 保留另一条建议未选，并直接编辑第三个模块。
3. 尝试向锁定模块应用建议。
4. 确认预览写入工作草稿。

预期：只改选中建议和用户直接编辑的模块；未选模块不变；锁定模块在解除锁定前不变；当前已保存版本仍不可变。

### 场景 E：复制形成下一版本

1. 从发生有效变化的工作草稿复制完整 Prompt。
2. 返回版本列表。

预期：剪贴板成功后才在同一方案生成下一版本；上一版仍可查看；新版本保持来源图关联；再次复制无变化文本不创建重复版本。

### 场景 F：会话数据清理

1. 完成一次评估。
2. 替换生成图或清除当前评估。
3. 重新打开对应方案。

预期：旧生成图和完整报告不再出现；方案、版本、来源图以及随版本保存的非敏感变更摘要仍在。

## 5. 失败恢复验收

逐项人工模拟，不要求自动化脚本：

| 场景 | 预期 |
| --- | --- |
| 非图片、空文件、超过 10 MB | 请求前拦截，说明允许格式和大小 |
| 本地服务未启动 | 显示网络不可用，方案和版本不变 |
| 模型超时/服务错误 | 显示可重试错误，不保存部分报告或空版本 |
| 使用上限 | 只说明今日暂不可用，不展示具体余额 |
| 返回模块缺失或重复 | 按结果无法解析处理，不允许应用建议 |
| 评估中切换方案或换图 | 旧结果丢弃，不写入新方案 |
| IndexedDB 空间不足 | Prompt 可复制，但明确提示版本未完整保存；清理方案后可重试 |
| 保存第 6 份方案 | 先说明将移出的最旧方案，用户确认后仅清理该方案 |
| 创建第 6 个版本 | 移出最旧历史，当前版和紧邻上一版仍在 |

## 6. 隔离检查

- 浏览器本地数据库名称固定为 ArchBuddy 范围，不读取目标网页 IndexedDB，也不读其他扩展数据。
- 所有 IndexedDB 删除都有明确 `schemeId`，没有全库通配清理。
- V3 请求不包含项目可选字段；服务端固定 `projectId=archbuddy` 和阶段配置。
- 当前阶段不读取、列举、修改或删除任何 `st-` 前缀或其他项目资源。
- 没有新 CloudBase 集合、存储路径、日志主题、密钥或部署版本。
- 不发送 `evaluation_started/evaluation_succeeded/evaluation_failed/suggestion_applied/prompt_version_created` 等新增 V3 行为统计事件。

## 7. 结束本地验证

1. 停止本地 Node 进程。
2. 清除当前 PowerShell 进程中的本地敏感环境变量，或直接关闭该终端。
3. 把扩展运行模式恢复为 `cloud`，但本阶段不要执行部署。
4. 再次运行静态检查和发布包保护检查。

## 完成证据

实施交付时记录：

- 修改的核心文件。
- 实际执行并通过的静态检查命令。
- 人工演示了哪些场景，哪些未验证。
- 本地真实模型调用是否执行；若未执行，不得声称 API 链路已验证。
- 明确写出“未部署 V3，未修改 CloudBase 或其他项目资源”。

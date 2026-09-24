# Implementation Plan: V3 效果优化闭环

> 最新实现调整见 [侧栏流程修订](interaction-revision.md)：编辑会话与确认库分离，确认时保存版本，复制只读取已确认文本。

**Branch**: `direction/plugin` | **Feature ID**: `002-effect-optimization` | **Date**: 2026-09-21 | **Spec**: [spec.md](./spec.md)

**Input**: `specs/002-effect-optimization/spec.md`

## Summary

V3 将现有两项独立能力重组为“图片采集 → 提示词构建 → 效果优化”三段连续工作流，并补上“外部生成图对照当前 Prompt → 选择建议或直接编辑 → 再次复制并形成同一方案下一版本”的核心闭环。

实施采用现有 Manifest V3 原生 JavaScript 架构，不引入前端框架或新运行依赖。V2 草稿原位升级为本地 Prompt 方案；结构化方案和版本元数据继续使用 `chrome.storage.local`，方案级完整来源原图使用扩展自己的 IndexedDB 仅保存一份，工作草稿、生成结果图和完整评估报告只进入 `chrome.storage.session`。服务端新增独立 `/api/v3/evaluate` 路由并复用现有匿名会话、20/200 日额度、DeepSeek 适配和错误映射；V1/V2 路由保持不变。当前阶段只完成本地运行与静态检查，不发送新的 V3 行为统计事件，也不部署 CloudBase。

## Technical Context

**Language/Version**: Chrome 扩展原生 JavaScript ES Modules（Manifest V3，Chrome 116+）；Node.js 24 ES Modules 后端

**Primary Dependencies**: Chrome `storage`、`sidePanel`、`scripting`、`downloads` API；浏览器 IndexedDB；现有 CloudBase Node SDK 与 DeepSeek OpenAI 兼容接口；不新增 npm 运行依赖

**Storage**: `chrome.storage.local` 保存最多 5 份方案及每份最多 5 个 Prompt 版本；IndexedDB 保存方案级完整来源原图 Blob；`chrome.storage.session` 保存工作草稿、当前选择图、生成结果图和评估会话；云端继续只使用已登记的 `archbuddy_dev_quotas`、`archbuddy_dev_requests`，本阶段不新增云端持久化资源

**Testing**: 仅运行与改动相关的 `node --check`、Manifest/JSON 解析、现有打包白名单与静态代码检查；不新增或运行单元、集成、端到端测试

**Target Platform**: Windows 上的 Chrome 桌面扩展；本地 Node 服务；CloudBase 仅作为后续部署目标

**Project Type**: 浏览器扩展 + 单体 Node API 服务

**Performance Goals**: 用户发起评估后 1 秒内进入明确处理中状态；正常网络和模型服务下 90% 的有效评估在 60 秒内返回；纯本地方案、版本和编辑操作即时响应且不调用 AI

**Constraints**: 单张分析/评估图片为 PNG、JPEG 或 WebP，1 字节至 10 MB；来源完整原图不上传云端；工作草稿、生成结果和完整评估不长期保存；当前 V3 MVP 不发送新增行为统计事件；不新增扩展权限；常规界面不显示具体剩余额度；不改变 V1/V2 已上线行为；不把密钥写入扩展、文档或仓库；CloudBase 为多项目共享环境

**Scale/Scope**: 单浏览器配置文件、最多 5 份方案、每份最多 5 个线性 Prompt 版本、每次仅评估 1 张生成图；匿名安装每天 20 次、整个 ArchBuddy 每天 200 次分析与评估共享额度

## Constitution Check

*GATE: Phase 0 前检查，并在 Phase 1 后复核。*

### Phase 0 前

| 章程门槛 | 结论 | 计划证据 |
| --- | --- | --- |
| 核心路径优先 | PASS | 只实现方案选择、单图评估、工作草稿修改、复制生成下一版本；多图、云同步、自动生成与自动循环均排除。 |
| 最小改动实现 | PASS | 复用现有原生扩展、V2 草稿结构、编译规则、匿名会话、额度和模型适配；仅新增必要的本地图像存储与 V3 路由。 |
| 拒绝过度设计 | PASS | 不引入框架、通用仓储层、版本树、复杂迁移平台或跨行业 Schema；仅为当前 5×5 本地 MVP 建模。 |
| 静态检查即质量门槛 | PASS | 计划只要求现有静态语法、JSON、Manifest 和打包检查，不新增测试代码或测试框架。 |
| 中文文档与可追溯 | PASS | 规格、计划、研究、模型、契约和验证指南全部使用中文，并记录用户确认的版本语义与本地图片策略。 |
| 安全与隐私 | PASS | 来源图只保存本地；生成图和报告只保存会话；密钥仅由本地/云端服务环境注入；统计继续最小化且默认关闭。 |
| CloudBase 多项目隔离 | PASS | 本阶段不创建、修改或部署云资源；后端代码仍固定 `archbuddy/development` 归属并复用登记资源，部署另行验收。 |

无未获确认的章程例外，无 `NEEDS CLARIFICATION`。

## Project Structure

### Documentation (this feature)

```text
specs/002-effect-optimization/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── evaluation-api.md
│   ├── extension-messages.md
│   └── local-image-store.md
└── tasks.md                 # 后续由 speckit-tasks 生成
```

### Source Code (repository root)

```text
extension/
├── manifest.json
├── runtime-config.mjs
├── shared.mjs
├── source-image-store.mjs   # 新增：方案级来源原图 IndexedDB 访问
├── background.mjs
├── sidepanel.html
├── sidepanel.css
└── sidepanel.mjs

plugin-prototype/
├── analysis-contract.mjs    # 扩展 V3 评估结果解析与校验
├── vision-analyzer.mjs      # 增加单图对照当前版本的评估入口
└── evaluation-instructions-v3.md

cloudbase/
├── server.mjs               # 新增 /api/v3/evaluate，保留 V1/V2
├── start.mjs
├── README.md                # 仅在需要时补充本地运行说明
└── scripts/
    └── build-deploy-package.ps1 # 后端包纳入 V3 评估提示文件

extension/scripts/
└── build-store-package.ps1  # 扩展包纳入新文件，并拒绝本地模式进入商店包
```

**Structure Decision**: 保留现有“原生扩展 + 单体 API”目录，不新增应用层或通用框架。方案文本与二进制图片采用浏览器原生能力分开保存；服务端只增加与 V3 契约对应的端点和模型提示，不建立新数据库或云端素材库。

## Design Overview

### 1. 本地方案与图片

- V2 `intentDraftsV2` 在首次读取时原位规范化为 `schemaVersion: 3` 的 Prompt 方案，不批量复制旧数据。
- 方案和版本的结构化文本保存在 `chrome.storage.local`；来源原图 Blob 通过 `sourceReferenceId` 存入 IndexedDB，同一方案的全部版本只引用同一份方案级资产。
- 从候选图首次加入任一模块时，保存该候选对应的完整选择图；同一分析来源再次加入其他模块不重复写图。
- 旧 V2 草稿没有原图字节时，自动建立 V1 文本基线，同时将来源状态明确标记为“原图缺失”；不得伪造来源图。用户可重新选择对应参考图，并通过来源图区域的“补图”动作复用 `scheme.source.attach` 恢复方案级资产；补图不创建 Prompt 版本。
- 删除或移出一份方案时，只删除该方案登记的 IndexedDB 图片，不触及浏览器下载目录、其他方案或任何云端数据。
- 不申请 `unlimitedStorage`。空间不足时保持剪贴板复制结果，并明确提示“版本未完整保存”，允许用户清理方案后重试。

### 2. 版本与复制节点

- 当前版本是不可变基线；建议和用户编辑只作用于从当前版本派生的 `WorkingDraft`。
- 有版本时，`PromptVersion.modulesSnapshot` 与 `compiledPrompt` 是当前内容的唯一事实来源；`PromptScheme.modules` 只作为 V2 兼容镜像，不得在工作草稿编辑时提前改写。
- 完整 Prompt 复制成功且工作草稿确有有效变化后，才提交下一版本；剪贴板失败不创建版本。
- 旧方案仍有 `missing/save-failed` 来源，或可用来源无法读回 Blob 时，剪贴板复制可以完成，但版本提交返回 `VERSION_INCOMPLETE`；用户补图或清理后重试，不能把不完整版本设为 current。
- 版本提交成功时，在同一次 `chrome.storage.local` 写入中更新新 PromptVersion、`currentVersionId`、`PromptScheme.modules` 兼容镜像和 `updatedAt`；任一步失败都不得暴露半提交的当前版本。
- 版本提交沿用 V2 编译规则，最多保留最近 5 个线性版本；第 6 个版本移出最旧历史，同时保留当前版和紧邻上一版。
- 历史版本只能查看和复制，不能发起评估、改写或成为新分支。

### 3. V3 效果评估

- `POST /api/v3/evaluate` 只接收一张生成图和当前版本中已启用、可观察的目标模块；不上传来源图、历史版本、方案名称或本地路径。
- 服务端固定允许的模块键和值长度，复用匿名会话和每日额度。一次明确点击“开始评估”计为一次调用，其他本地动作不计次。
- 模型按请求中的目标模块逐项返回 `符合 / 部分符合 / 偏差 / 无法判断`、可见观察、差异和可选建议；参考摘要只作为上下文，负向约束仅在非空时参与检查。
- 完整报告绑定发起时的 `schemeId + versionId + generatedResultId` 并只保存在会话；方案或图片切换后旧结果失效，不允许应用到新上下文。
- 评估路由与解析失败不得修改任何方案或版本；V1 `/api/analyze` 和 V2 `/api/v2/analyze` 契约保持不变。

### 4. 三段界面

- 顶部导航固定为“图片采集、提示词构建、效果优化”。
- “图片采集”承接现有下载分类面板；“提示词构建”承接现有分析、候选意图、当前方案与 Prompt 预览；“效果优化”新增方案库、来源图、当前/历史版本、生成图、评估结果和工作草稿。来源状态为 `missing/save-failed` 时提供“补图”，没有可用当前选择图时引导用户返回提示词构建重新选择对应参考图。
- 界面延续已确认的墨绿色和现有信息密度；按钮文字优先不超过四个汉字。
- 方案库展示最近 5 份；来源图展示完整本地资产或明确的“原图缺失”；完整报告不进入历史。

### 5. 本地真实调用

- 新增明确的本地后端模式，扩展只保存公开的 `http://127.0.0.1:<port>` 地址，不保存模型 Key、管理员 Token 或会话密钥。
- 本地 Node 服务在 `process-test` 配额模式下可使用由环境变量提供的本地会话签名密钥签发匿名短期会话；额度只在当前进程内，用于开发演示，不冒充云端每日持久额度。
- 发布打包必须检测并拒绝本地模式，避免商店包误连开发地址。切回云模式后才允许构建发布包。

## Implementation Sequence

1. **方案数据升级**：定义 V3 规范化结构、V2 懒迁移、版本提交规则和 5×5 上限。
2. **来源图本地资产**：实现 IndexedDB 最小读写删除接口，接入候选加入、方案查看和删除清理。
3. **三段导航与方案库**：重排现有两个面板，新增效果优化空态、方案/版本/来源图读取。
4. **V3 评估契约**：实现服务端请求校验、模型提示、结果解析、错误映射和独立路由。
5. **本地调用链**：补充安全的本地匿名会话模式、扩展本地 URL 切换与发布包保护。
6. **优化工作台**：接入单图选择、明确发送确认、逐维度结果、建议选择、直接编辑和锁定保护。
7. **复制形成版本**：先完成剪贴板复制，再原子写入同一方案下一版本；处理保存不完整提示。
8. **静态门槛与文档**：运行语法、JSON、Manifest、打包白名单检查，按 `quickstart.md` 人工演示核心路径；不部署。

## Phase 1 Post-Design Constitution Check

| 章程门槛 | 复核结论 | 设计约束 |
| --- | --- | --- |
| 核心路径与最小改动 | PASS | 设计没有引入插件内生成、多图比较、云素材库或账户系统；复用现有路径并按依赖顺序实现。 |
| 反过度设计 | PASS | IndexedDB helper 只暴露本功能需要的 put/get/list/delete；无仓储框架、同步层或迁移引擎。 |
| 静态质量门槛 | PASS | quickstart 只列静态检查和人工验收，不要求新增测试。 |
| 中文与追溯 | PASS | Phase 0/1 产物记录所有技术取舍、旧草稿限制和部署边界。 |
| 安全、隐私与隔离 | PASS | 无新云资源；图片发送仅限用户明确评估动作；本地密钥仅在进程环境；发布包拒绝本地配置。 |

## Complexity Tracking

无章程违规项，本节不需要例外说明。

## CloudBase Isolation Record

- **任务**: V3 规划与本地 MVP 设计
- **项目/阶段/服务**: `archbuddy` / `development` / `archbuddy-api`
- **变更资源**: 仅本仓库文档；不创建集合、对象路径、日志主题、凭据、任务或部署版本
- **权限边界**: 计划中的后端继续服务端固定项目与阶段；不允许客户端选择项目归属
- **本地持久化**: 方案、版本及来源图仅属于当前浏览器 ArchBuddy 扩展空间，与 CloudBase 及其他项目无关
- **未验证项**: V3 接口、真实模型评估、本地匿名会话和 CloudBase 部署均尚未实现或验证
- **结论**: 可进入本地实现；任何后续部署必须另行执行隔离清单并记录证据

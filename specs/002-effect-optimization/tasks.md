# Tasks: V3 效果优化闭环

> T001–T043 为首轮实现记录；与 [2026-09-22 流程修订](interaction-revision.md) 冲突的交互规则已被替代，追加任务见文末。

**Input**: `specs/002-effect-optimization/` 下的 `spec.md`、`plan.md`、`research.md`、`data-model.md`、`contracts/` 与 `quickstart.md`

**Tests**: 本项目章程明确禁止本阶段新增或运行单元、集成、端到端测试和测试框架；任务只包含静态检查与人工核心路径验收。

**Organization**: 按五个用户故事组织；完整本地网页素材库属于后续独立 Spec，本任务清单只保证 V3 本地数据模型可被未来素材库复用。

## Format: `[ID] [P?] [Story] Description`

- **[P]**：可在不同文件中并行完成，且不依赖尚未完成的同阶段任务
- **[Story]**：对应 `spec.md` 中的用户故事
- 每项任务均包含明确文件路径

## Phase 1: Setup（共享配置）

**Purpose**: 准备本地真实调用与两个独立发布包的安全边界，不新增框架、权限或云资源。

- [X] T001 [P] 在 `extension/runtime-config.mjs` 增加显式 `cloud/local` 模式和固定 `http://127.0.0.1:8080` 本地地址，默认保持 `cloud`，仅导出公开 URL，禁止加入 DeepSeek Key、管理员 Token 或会话签名密钥
- [X] T002 [P] 在 `extension/scripts/build-store-package.ps1` 登记 `source-image-store.mjs` 等 V3 扩展运行文件，并在 `BACKEND_MODE` 不是 `cloud` 时拒绝生成商店包，继续排除密钥、草稿、图片和本地配置
- [X] T003 [P] 在 `cloudbase/scripts/build-deploy-package.ps1` 登记 `plugin-prototype/evaluation-instructions-v3.md` 等 V3 后端运行文件，保持显式白名单且不新增部署动作

**Checkpoint**: 本地模式有明确入口，扩展包和后端包边界准确，尚未修改或部署 CloudBase。

---

## Phase 2: Foundational（阻塞性基础）

**Purpose**: 建立所有用户故事共用的 V3 本地实体、迁移和会话边界。

**⚠️ CRITICAL**: 完成本阶段后才能开始任何用户故事。

- [X] T004 [P] 在 `extension/shared.mjs` 增加 V3 `STORAGE` 键、固定允许模块和 PromptScheme/PromptVersion normalizer：`schemaVersion` 固定为 `3`，`schemeId` 必填稳定 UUID 且旧草稿沿用 `draftId`，`name` 必填并去除首尾空白，`modules` 键限既有 `INTENT_MODULES`，`versions` 按 `versionNumber` 升序且最多 5 个，`currentVersionId` 必须指向最大版本号；有当前版本时 `modules` 必须规范化为当前 `modulesSnapshot` 的兼容镜像，当前 Prompt 只读取当前版本 `compiledPrompt`；PromptVersion 的 `versionId` 必填 UUID、`schemeId` 必须等于父方案、`versionNumber` 单调递增不重排、`origin` 仅允许 `legacy-baseline/initial-copy/revision-copy`
- [X] T005 [P] 新建 `extension/source-image-store.mjs`，实现 `archbuddy-local/source-images-v1` 的 `putSourceImage/getSourceImage/listSourceImageMeta/deleteSourceImage/deleteSourceImagesByScheme`：`sourceReferenceId` 为主键，`schemeId` 建非唯一索引，Blob 仅允许 PNG/JPEG/WebP 且 1 字节至 10 MB，写后读回核对 `byteSize/mimeType/schemeId`，删除必须同时限定明确 `schemeId`，固定错误码仅为 `INVALID_IMAGE/QUOTA_EXCEEDED/NOT_FOUND/OWNERSHIP_MISMATCH/TRANSACTION_FAILED`
- [X] T006 在 `extension/background.mjs` 实现 V2 草稿到 PromptScheme 的单份懒规范化：保留旧 ID、名称、模块和时间；首次打开无版本草稿时按既有编译规则建立只读 V1 `legacy-baseline`；旧数据没有图片字节时只建立 `assetState=missing` 元数据且不得伪造 Blob；单份失败不得清空其他草稿
- [X] T007 在 `extension/background.mjs` 接入 `extension/source-image-store.mjs`，实现方案级来源图附加和同方案去重：优先使用 `analysisId + selectionId`，缺失时使用选择会话 ID；同一来源只存一次完整原图，元数据状态严格使用 `available/missing/save-failed`，不得跨方案全局去重或上传云端
- [X] T008 在 `extension/shared.mjs` 与 `extension/background.mjs` 建立会话期 WorkingDraft/GeneratedResult/EvaluationSession 基础结构并统一写入 `chrome.storage.session`：WorkingDraft 绑定 `schemeId + baseVersionId`；GeneratedResult 的 `generatedResultId` 为 UUID、格式仅 PNG/JPEG/WebP、`byteSize` 为 1 字节至 10 MB；EvaluationSession 的状态仅 `idle/confirming/running/succeeded/failed`，错误类别仅 `invalid-input/network/timeout/unavailable/quota/parse`，且绑定 `schemeId + baseVersionId + generatedResultId`
- [X] T009 在 `extension/sidepanel.html` 与 `extension/sidepanel.mjs` 将“候选意图加入当前方案”接到 `scheme.source.attach`，并在当前方案来源状态处提供最小“补图”入口：首次采用某分析的任一模块时保存完整当前选择图，后续采用同图其他模块复用同一 `sourceReferenceId`；对旧方案 `missing/save-failed` 记录支持用户重新选择对应参考图后执行“补图”，通过 `replaceSourceReferenceId` 恢复方案级资产且不创建 PromptVersion；保存失败不得静默声称来源已完整保存

**Checkpoint**: V2 草稿可安全进入 V3，新方案能够保存完整来源原图，旧方案能够明确缺失并补图；方案文本、来源原图、工作草稿和评估会话拥有明确且互不混淆的本地边界。没有新增 CloudBase 数据资源。

---

## Phase 3: User Story 1 - 对照方案检查生成效果（Priority: P1）🎯

**Goal**: 用户选择当前方案、导入一张生成图并明确发起评估后，得到逐维度状态、可见观察、差异和建议。

**Independent Test**: 选择至少启用三个可观察维度的当前方案，导入一张有效生成图并确认发送；结果中每个启用维度恰好出现一次，停用维度和参考摘要不被评分，证据不足显示“无法判断”，仅预览图片不产生调用。

- [X] T010 [P] [US1] 新建 `plugin-prototype/evaluation-instructions-v3.md`，约束模型仅按请求模块返回中文的 `compliant/partial/deviation/unknown`、可见 `observation`、`gap`、可选 `suggestion/reliabilityNote`，禁止百分制总分、不可见事实、额外模块和把 `reference_summary` 当评分项
- [X] T011 [P] [US1] 在 `plugin-prototype/analysis-contract.mjs` 增加 V3 评估请求/响应解析：`contractVersion` 必须为 3，`requestId/evaluationId` 为 UUID，`findings[].key` 必须来自请求且恰好一次、不允许 `reference_summary`，`status` 仅允许 `compliant/partial/deviation/unknown`，缺失、重复或额外模块整次返回解析失败而不保留部分结果
- [X] T012 [US1] 在 `plugin-prototype/vision-analyzer.mjs` 增加单图 `evaluate` 调用，加载 `plugin-prototype/evaluation-instructions-v3.md`，只发送服务端过滤后的目标模块、可选参考摘要和非空负向约束，并返回契约解析结果
- [X] T013 [US1] 在 `cloudbase/server.mjs` 新增 `POST /api/v3/evaluate`：复用现有 Bearer 匿名会话、请求去重和 20/200 共享日额度；图片只允许 PNG/JPEG/WebP 且解码后 1 字节至 10 MB；`target.modules` 至少 1 项、键唯一且在固定允许表、值去除首尾空白后非空并受固定长度上限；请求不得接受客户端项目归属、方案名、来源图、历史版本、路径或 URL；保持 `/api/analyze`、`/api/v2/analyze` 和 `/api/session` 行为不变
- [X] T014 [US1] 在 `cloudbase/server.mjs` 与 `cloudbase/start.mjs` 支持本地 `process-test` 模式使用环境变量中的 32 字符以上会话签名密钥签发匿名短期会话，计数仅限当前进程且状态文案不得冒充 CloudBase 持久每日额度
- [X] T015 [US1] 在 `extension/background.mjs` 把 `/api/v3/evaluate` 加入认证请求路径，实现 `evaluation.image.set/run/get/clear` 消息：选图只写 `chrome.storage.session` 不发请求；`run` 必须再次验证当前版本、至少一个可评估模块和 `consentConfirmed=true`；结果只在本地四个归属标识仍一致时写入会话
- [X] T016 [P] [US1] 在 `extension/sidepanel.html` 增加“效果优化”中的当前方案摘要、单张生成图选择/预览、明确发送确认、“开始评估”、处理中状态、整体结论和逐维度结果容器，核心按钮文案控制在四个汉字以内
- [X] T017 [P] [US1] 在 `extension/sidepanel.css` 按现有墨绿色风格实现生成图预览、处理中状态和四种评估状态的清晰层级，不引入额外品牌色或压缩逐维度正文
- [X] T018 [US1] 在 `extension/sidepanel.mjs` 实现生成图 PNG/JPEG/WebP 与 1 字节至 10 MB 前置校验、只预览不请求、确认后发起评估、1 秒内显示处理中、按请求模块顺序渲染整体结论与 findings，并确保普通界面不显示个人或项目具体剩余额度

**Checkpoint**: 单图“选择方案 → 导入图片 → 开始评估”链路可独立演示，尚未修改已保存 Prompt。

---

## Phase 4: User Story 2 - 选择建议并生成下一版 Prompt（Priority: P1）🎯

**Goal**: 用户选择部分建议或直接编辑工作草稿，预览变化，并在完整 Prompt 成功复制后形成同一方案的下一只读版本。

**Independent Test**: 从含多个偏差项的评估中只采用部分建议并直接编辑另一模块；复制后产生同一方案下一版本，上一版和未改模块不变，锁定模块未被自动修改，来源图关联继续存在。

- [X] T019 [US2] 在 `extension/shared.mjs` 实现 WorkingDraft、RevisionSuggestion、RevisionPreview 与差异计算：WorkingDraft 必须绑定当前 `schemeId + baseVersionId`、写入 `chrome.storage.session` 并从只读 `modulesSnapshot` 深拷贝；`dirtyModuleKeys` 必须通过比较得出；建议 `proposedValue` 去除首尾空白后不能为空且不能等于原值，`selected` 默认 false；预览必须包含 `moduleKey/before/after/blockedReason`，锁定、空值、相同值或冲突不得写入草稿
- [X] T020 [US2] 在 `extension/background.mjs` 实现 `scheme.version.commit` 与 `scheme.version.copy-read`：提交前重新规范化模块并用 V2 规则重新编译，校验 `baseVersionId` 仍为 current 和客户端 Prompt 一致；无变化返回 `NO_CHANGES`；任一来源为 `missing/save-failed`，或 `assetState=available` 却无法读取 Blob 时，均返回 `VERSION_INCOMPLETE`，不得把版本标记为完整保存；成功时在同一次 `chrome.storage.local` 写入中新增只含 `modulesSnapshot/compiledPrompt/sourceReferenceIds/changeSummary` 的 PromptVersion，并同步更新 `currentVersionId`、`PromptScheme.modules` 兼容镜像和 `updatedAt`，任一步失败保持提交前状态；`changeSummary.changeType` 仅 `suggestion-applied/direct-edit/lock-changed` 且不得保存完整 Prompt、完整建议、图片或路径
- [X] T021 [P] [US2] 在 `extension/sidepanel.html` 增加建议选择、修改前后预览、工作草稿直接编辑、模块锁定提示、当前/历史版本和“复制”区域，不为历史版本提供评估或编辑操作
- [X] T022 [P] [US2] 在 `extension/sidepanel.css` 实现建议选中态、前后对照、锁定态、工作草稿和版本列表样式，保持正文可完整阅读并沿用现有墨绿色视觉
- [X] T023 [US2] 在 `extension/sidepanel.mjs` 实现建议逐条选择/取消、建议文本可编辑、直接编辑工作草稿、变更预览和锁定拦截；未选建议和未涉及模块保持不变，切换方案或版本时不得把旧评估建议应用到新草稿
- [X] T024 [US2] 在 `extension/sidepanel.mjs` 重构完整 Prompt 复制流程为“剪贴板成功 → 调用 `scheme.version.commit`”：剪贴板失败不得创建版本；文本已复制但版本保存失败时明确区分两种结果并保留草稿供清理后重试；无有效变化不得创建重复版本
- [X] T025 [US2] 在 `extension/sidepanel.mjs` 实现历史版本只读查看和复制、当前版本明确标识、创建新版本后旧 EvaluationSession 立即失效，并保证第 6 个版本仅移出最旧历史且始终保留当前版和紧邻上一版

**Checkpoint**: “评估 → 选择/编辑 → 预览 → 复制 → 同方案下一版本”形成完整 V3 MVP 闭环。

---

## Phase 5: User Story 3 - 从方案库继续工作（Priority: P2）

**Goal**: 用户在效果优化中打开最近 5 份本地方案，查看当前/历史版本与方案级完整来源图，并安全删除或确认移出方案。

**Independent Test**: 准备五份名称和更新时间不同的方案；打开、切换、查看版本和来源图均不混淆；创建第六份前明确提示最旧方案；删除只清理指定方案，不触及下载图片或其他方案。

- [X] T026 [US3] 在 `extension/background.mjs` 实现 `scheme.list/open/delete` 消息：列表按 `updatedAt` 降序且最多 5 份；`open` 返回规范化方案并按需建立 V1 基线；`delete` 必须要求 `confirmed=true`，按明确 `schemeId` 删除本地方案、其 IndexedDB 图片和同方案会话状态，不删除下载目录或其他方案
- [X] T027 [P] [US3] 在 `extension/sidepanel.html` 增加效果优化方案列表、方案名称/更新时间、当前版本、历史版本和来源图区域，并在“原图缺失/保存失败”状态中复用 Foundational 已建立的“补图”操作；这里仅为 V3 轻量方案库，不新增 `library.html` 完整素材库页面
- [X] T028 [P] [US3] 在 `extension/sidepanel.css` 实现最近方案列表、版本时间线和来源图缩略区，来源图与 Prompt 版本关系清晰且不会把侧栏变成完整宽屏素材管理界面
- [X] T029 [US3] 在 `extension/sidepanel.mjs` 实现方案打开、切换、删除和第六份方案确认：超出 5 份前展示将移出的最旧方案，用户取消时不得改变任何数据；切换含未提交工作草稿时提示丢弃，不改写已保存版本
- [X] T030 [US3] 在 `extension/sidepanel.mjs` 读取 `extension/source-image-store.mjs` 中属于当前方案的 Blob，创建来源图 Object URL，并在切换方案、重新渲染和关闭面板时逐一 `URL.revokeObjectURL`；`missing/save-failed` 状态不生成占位原图，“补图”使用当前重新选择的参考图调用 `scheme.source.attach` 并传入明确 `replaceSourceReferenceId`，没有可用选择图时引导返回提示词构建

**Checkpoint**: V2 草稿可自然进入 V3 方案库，文本与来源图均保持本地且不同方案不混淆。

---

## Phase 6: User Story 4 - 在三个清晰阶段间连续操作（Priority: P2）

**Goal**: 顶部只用“图片采集、提示词构建、效果优化”表达推荐流程，同时三个阶段保持可独立进入。

**Independent Test**: 从任意网页打开侧栏，三个入口名称和顺序准确；图片采集不触发 AI，提示词构建不要求先下载，效果优化能继续当前已保存方案。

- [X] T031 [P] [US4] 在 `extension/sidepanel.html` 将顶部一级入口固定重排为“图片采集”“提示词构建”“效果优化”，把现有下载/分类内容放入图片采集、现有分析/候选/当前方案内容放入提示词构建、V3 内容放入效果优化；“素材库”仅保留为后续独立页面决策，不增加第四个阶段
- [X] T032 [US4] 在 `extension/sidepanel.mjs` 更新 tab 映射与初始化恢复逻辑，保证三个阶段可直接进入、切换不触发分析或评估、从提示词构建进入效果优化时只选择已保存方案而不自动纳入未确认候选
- [X] T033 [P] [US4] 在 `extension/sidepanel.css` 更新三段导航的选中、未选和窄侧栏布局，保留已确认墨绿色体系和当前信息密度

**Checkpoint**: 信息架构能够完整表达产品链路，但不强制用户按顺序使用。

---

## Phase 7: User Story 5 - 从失败中安全恢复（Priority: P2）

**Goal**: 输入、网络、超时、服务、额度、解析、并发和本地存储失败均不破坏方案、版本或其他项目数据。

**Independent Test**: 分别模拟无效图片、服务未启动、超时、429、异常结果、评估中换方案和 IndexedDB 容量失败；每种情况都有明确恢复动作，既有方案与版本丢失或被覆盖次数为 0。

- [X] T034 [US5] 在 `extension/background.mjs` 将 V3 HTTP/网络错误严格映射为 `invalid-input/network/timeout/unavailable/quota/parse`，重试只重新发起明确评估，不在失败或取消时创建空 PromptVersion、覆盖当前版本或返回具体余额数字
- [X] T035 [US5] 在 `extension/background.mjs` 为评估请求保存 `requestId + schemeId + baseVersionId + generatedResultId`，连续点击时只允许一个当前请求；返回后重新核对四个标识，方案、版本或图片已变化则返回 `STALE_EVALUATION` 并丢弃旧结果
- [X] T036 [P] [US5] 在 `cloudbase/server.mjs` 完成 V3 错误响应和日志最小化：400/401/403/408/429/500/502/503/504 映射到契约固定错误码；日志不得包含图片 base64、Prompt/模块正文、匿名令牌、密钥、路径或原始用户文字
- [X] T037 [US5] 在 `extension/sidepanel.mjs` 为输入无效、网络不可用、处理超时、服务暂不可用、使用上限、结果无法解析、旧结果失效和版本未完整保存提供具体中文提示与“换图/重试/清理方案”动作，错误发生时保留当前方案、历史版本和用户工作草稿
- [X] T038 [US5] 在 `extension/background.mjs` 与 `extension/source-image-store.mjs` 完成限定清理：替换/清除生成图只删除 GeneratedResult 和 EvaluationSession；删除/移出方案只按明确 `schemeId` 清理其文本与 Blob；淘汰版本只删版本元数据并保留方案级来源图；禁止空 ID、通配或全库清空

**Checkpoint**: 所有核心失败都可恢复，V1/V2、下载功能、其他方案和其他 CloudBase 项目不受影响。

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: 完成文档、静态质量门槛、打包安全检查和人工演示证据；不部署。

- [X] T039 [P] 更新 `extension/README.md` 与 `cloudbase/README.md`，说明 V3 三段流程、本地完整来源图、会话期生成图/报告、本地 `process-test` 启动方式、不得在扩展放密钥，以及本地素材库页面属于后续独立 Spec
- [X] T040 [P] 在 `extension/store/privacy-policy.md`、`extension/store/permission-justifications.md` 与 `extension/store/RELEASE_CHECKLIST.md` 同步本地来源图处理、单图评估发送确认、当前 V3 不发送新增行为统计事件、无新增权限、无远程代码和暂不部署边界，不把未来素材库、V3 统计或云同步描述为已实现
- [X] T041 对 `extension/shared.mjs`、`extension/source-image-store.mjs`、`extension/background.mjs`、`extension/sidepanel.mjs`、`extension/runtime-config.mjs`、`plugin-prototype/analysis-contract.mjs`、`plugin-prototype/vision-analyzer.mjs`、`cloudbase/server.mjs`、`cloudbase/start.mjs` 执行 `node --check`，解析 `extension/manifest.json`，确认未新增 `unlimitedStorage` 或无关权限，并静态确认没有发送 `evaluation_started/evaluation_succeeded/evaluation_failed/suggestion_applied/prompt_version_created` 等新增 V3 统计事件；只修复静态错误，不新增或运行测试
- [X] T042 在 `BACKEND_MODE=cloud` 下分别运行 `cloudbase/scripts/build-deploy-package.ps1` 和 `extension/scripts/build-store-package.ps1` 的静态打包检查，核对 V3 白名单、远程代码、密钥、`.env`、本地图片、草稿、IndexedDB 数据和生成结果均未泄露；不得上传或部署任何包
- [X] T043 按 `specs/002-effect-optimization/quickstart.md` 人工演示场景 A–F 与失败恢复，把实际执行项、未执行项、本地真实模型调用状态、未部署说明和 CloudBase 零资源变更证据记录到 `specs/002-effect-optimization/verification.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 Setup**：无依赖，可立即开始。
- **Phase 2 Foundational**：依赖 Phase 1，阻塞全部用户故事。
- **US1（Phase 3）**：依赖 Foundational，建立效果评估能力。
- **US2（Phase 4）**：依赖 US1 的有效评估结果，完成 V3 核心闭环。
- **US3（Phase 5）**：依赖 Foundational；若有多人可与 US1 并行，但单人实施建议在 US2 后完成以减少 `background.mjs/sidepanel.mjs` 冲突。
- **US4（Phase 6）**：依赖 Foundational；最终接线依赖 US1 与 US3 已存在对应面板。
- **US5（Phase 7）**：依赖 US1–US4 的核心路径，统一补齐恢复和限定清理。
- **Polish（Phase 8）**：依赖计划纳入本轮的所有用户故事完成。

### User Story Dependency Graph

```text
Setup
  ↓
Foundational
  ├────────→ US3 方案库 ───────┐
  ├────────→ US4 三段导航 ─────┤
  └────────→ US1 效果评估 → US2 Prompt 下一版本
                                      ↓
                         US5 失败恢复（汇总加固）
                                      ↓
                                  Polish
```

### User Story Independence

- **US1**：可用一份规范化当前方案单独验证单图评估，不需要先实现完整方案库 UI。
- **US2**：需要 US1 findings，但版本提交只作用于一个当前方案，可独立验证建议、编辑和复制节点。
- **US3**：只使用本地方案和来源图，可在不调用 AI 的情况下独立验证迁移、列表、切换和删除。
- **US4**：只重组现有和已实现面板，切换本身不调用 AI，可独立验证信息架构。
- **US5**：使用前述路径制造失败，验证所有持久数据保持不变。

## Parallel Opportunities

### Setup

- T001、T002、T003 修改不同配置/打包文件，可并行。

### Foundational

- T004（结构化数据）与 T005（IndexedDB Blob）修改不同文件，可并行；T006–T009 在两者完成后顺序接线，来源图保存与补图在进入用户故事前可用。

### User Story 1

- T010（模型指令）、T011（契约解析）、T016（HTML）和 T017（CSS）可并行；随后按 T012 → T013/T014 → T015 → T018 接线。

### User Story 2

- T019（共享草稿逻辑）、T021（HTML）和 T022（CSS）可并行；T020 完成版本消息后，T023–T025 顺序接线。

### User Story 3

- T026（background）、T027（HTML）和 T028（CSS）可并行；T029、T030 再接入 side panel。

### User Story 4

- T031（HTML）与 T033（CSS）可并行；T032 最后接线。

### User Story 5

- T034/T035（扩展后台）、T036（服务端）可在不同文件并行；T037、T038 在错误契约稳定后完成。

## Parallel Execution Examples

### US1

```text
Task T010: 编写 V3 评估模型指令
Task T011: 实现 V3 结果解析契约
Task T016: 搭建效果优化评估 HTML
Task T017: 实现评估视觉样式
```

### US2

```text
Task T019: 实现 WorkingDraft 与差异逻辑
Task T021: 搭建建议、预览和版本 HTML
Task T022: 实现建议和版本样式
```

### US3

```text
Task T026: 实现方案 list/open/delete 后台消息
Task T027: 搭建轻量方案库 HTML
Task T028: 实现方案库和来源图样式
```

### US4

```text
Task T031: 重排三段导航 HTML
Task T033: 更新三段导航 CSS
```

## Implementation Strategy

### V3 Core MVP First

V3 的最小可信闭环不是只完成 US1，而是 **US1 + US2**：

1. 完成 Phase 1 Setup。
2. 完成 Phase 2 Foundational，包括新方案来源图保存和旧方案“补图”接线。
3. 完成 US1，让用户获得可解释的逐维度评估。
4. 完成 US2，让用户把选择和编辑转化为同方案下一 Prompt 版本。
5. 停止并按独立标准验证“来源图关联 → 评估 → 修改 → 复制 → 下一版本”。

### Incremental Delivery

1. **Setup + Foundation**：V2 数据可进入 V3，本地原图与会话边界可用。
2. **US1 + US2**：形成 V3 核心闭环。
3. **US3**：补齐最近 5 份方案、来源图和版本连续性。
4. **US4**：完成三个清晰阶段的信息架构。
5. **US5**：统一加固失败恢复和限定清理。
6. **Polish**：完成静态检查、包检查和人工证据；继续不部署。

### Scope Guard

- 不创建 `library.html`、云端素材库、账户、同步、团队协作或桌面客户端；这些属于 `docs/ARCHBUDDY_PRODUCT_FORM.md` 记录的后续独立阶段。
- 不接入图像生成模型，不实现多结果排名、A/B、自动循环和分支版本树。
- 不新增或运行任何自动化测试，不增加测试框架、无障碍任务、性能压测或生产级监控。
- 当前 V3 MVP 不发送新增行为统计事件；保留事件名称不等于实现或启用统计。
- 不创建、读取、列举、修改或删除任何 `st-` 或其他项目 CloudBase 资源；不部署 V3。

## Notes

- `[P]` 只标记没有未完成依赖且修改不同文件的任务。
- 用户故事任务都带 `[USn]` 标签，Setup、Foundational 和 Polish 不带故事标签。
- 新流程在整体确认／确认修改时保存版本，保存成功后才解锁复制；失败状态不得伪装为成功保存。
- 所有图片、Prompt 和自定义正文都不得进入行为统计或日志。
- 完成本清单后先运行 `$speckit-analyze`，再进入 `$speckit-implement`。

## 2026-09-22 用户体验修订

- [X] T044 将构建中的图片和候选内容与已确认版本分离，修复加入／替换被旧快照覆盖。
- [X] T045 支持最多三张参考图分别选择、分析、编辑与选用，实时联动唯一整体预览。
- [X] T046 整体确认后入“最近确认的提示词库”并解锁复制，编辑后重新要求确认。
- [X] T047 效果优化按生成图、已确认提示词选择、发送评估、结果直接编辑排序，移除来源图和重复草稿编辑区。
- [X] T048 确认修改时保存版本，复制仅读取已确认文本，旧版本和来源缺失记录保持兼容。
- [X] T049 同步规格修订、隐私说明及本地验收记录，执行语法与静态引用检查；真实 Chrome 操作由用户继续验收。

## 2026-09-24 用户体验修复

- [X] T050 每张参考图独立并发请求与状态提示；后端并发容量设为 3，并共用匿名会话初始化。
- [X] T051 整体 Prompt 按维度直接编辑，加入／替换只更新对应段落，手动正文与生成准则随确认版本保留。
- [X] T052 评估状态文字使用绿／黄／红／灰区分符合、部分符合、明显偏差及无法判断。
- [X] T053 更新交接和交互文档，通过相关静态检查并重启本地服务；真实浏览器与模型调用待人工复验。

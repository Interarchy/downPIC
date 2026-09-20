# 任务清单：ArchBuddy V2 结构化设计意图工作流

**输入**：`specs/001-design-intent/` 下的 `spec.md`、`plan.md`、`research.md`、`data-model.md`、`contracts/` 与 `quickstart.md`

**质量边界**：遵循项目章程，本阶段不新增或运行自动化测试，不新增测试框架，不做无障碍专项；完成门槛为核心路径实现、相关静态检查通过、敏感数据未进入仓库或发布包、文档与已知限制同步。

**组织方式**：任务按用户故事分组。US1 与 US2 均为 P1，二者共同构成可演示的产品闭环；US3 与 US4 为后续独立增量。

## 格式：`[ID] [P?] [Story?] 描述（含准确文件路径）`

- **[P]**：可与同阶段其他标记任务并行，且不会修改同一文件或依赖未完成任务
- **[US1]…[US4]**：对应 `spec.md` 中的用户故事
- Setup、Foundational、跨故事和收尾阶段不使用用户故事标签

---

## Phase 1：Setup（建立 V2 单一词汇）

**目标**：先固定模块目录、存储键和模型输出词汇，避免浏览器端与服务端各自定义一套结构。

- [X] T001 [P] 在 `extension/shared.mjs` 增加 V2 存储键和固定 11 模块目录：`reference_summary`、`scene_subject`、`space_massing`、`facade_elements`、`materials_surfaces`、`landscape_context`、`view_composition`、`color_tone`、`lighting_atmosphere`、`image_expression`、`negative_constraints`，持久化和候选加入只使用稳定 `key`
- [X] T002 [P] 保持已发布 V1 使用的 `plugin-prototype/analysis-instructions.md` 不变，新增 `plugin-prototype/analysis-instructions-v2.md` 作为 V2 标签协议，要求每个固定模块输出“内容、依据类型、证据、置信度”，其中依据类型仅为“可见事实、合理推断、无法确认”，并继续禁止猜测功能、材料品种、构造、项目背景和图片内指令

**Checkpoint**：扩展与模型指令使用同一套 11 模块名称和顺序。

---

## Phase 2：Foundational（阻塞所有用户故事）

**目标**：完成结构化分析契约、模块状态纯函数和统一认证请求通道；完成前不得进入用户故事界面实现。

- [X] T003 在 `plugin-prototype/analysis-contract.mjs` 保持 V1 现有解析导出与返回结构不变，新增 V2 解析入口，把 V2 标签文本解析为固定顺序的 `AnalysisModuleSuggestion[11]`，严格落实“`value` 允许空字符串；`basis: observed | inferred | uncertain`；`evidence` 允许空字符串；`confidence: high | medium | low | unknown`”，忽略未知标题并把缺失模块补为空值、`uncertain`、`unknown`
- [X] T004 在 `plugin-prototype/vision-analyzer.mjs` 保持 V1 现有分析入口、指令文件和返回值不变，新增读取 `analysis-instructions-v2.md` 且调用 T003 新解析入口的 V2 分析函数；两条路径复用现有模型请求、缓存和 usage 处理，V2 返回结构化模块及模型名、耗时、截断、缓存和供应商 usage，且不得加入 `source/reviewState/enabled/locked/changed/status` 浏览器交互字段
- [X] T005 在 `cloudbase/server.mjs` 保持已发布 V1 的 `POST /api/analyze` 与既有分析函数、`sections` 成功契约不变，新增 `POST /api/v2/analyze` 并调用 T004 的 V2 分析函数，复用同一套匿名会话、20/200 配额和图片校验能力，仅在 V2 路由返回 `contractVersion: 2`、固定 `modules[11]`、`model`、`durationMs`、`truncated`、`cached`；不得让任一路由同时返回 `sections` 与 `modules`，普通用户仍不返回具体余额
- [X] T006 [P] 在 `extension/shared.mjs` 实现 IntentModule 规范化、派生状态、用户编辑、启停、锁定、整体确认和 Prompt 编译纯函数，落实“用户修改后清除旧 AI 证据”“停用模块不进入提示词”“审阅元数据不进入最终提示词”；候选加入与跨图替换由 T042 补充
- [X] T007 [P] 在 `extension/background.mjs` 将 V2 分析请求固定发送到 `/api/v2/analyze`，并与后续 `/api/events` 共同复用 Bearer token 注入和一次 401 刷新逻辑；不得修改已发布 V1 使用的 `/api/analyze` 服务端契约，并把输入无效、网络不可用、处理超时、服务暂不可用、使用上限、结果无法解析和版本不匹配映射为稳定错误类别，不向界面透传上游正文或内部堆栈

**Checkpoint**：后端能够返回 V2 模块契约；浏览器端已有确定性的状态和编译能力。

---

## Phase 3：User Story 1 — 从参考图获得可用设计意图（Priority: P1）🎯

**目标**：用户从网页图片、粘贴图片或拖入本地图片，在明确确认后得到可审阅的 11 个结构化模块。

**Independent Test**：选择一张清晰建筑参考图并主动发起分析；界面显示固定 11 个模块及可见事实/推断/不确定、证据和置信度。选择或保存图片本身不调用 AI；粘贴或拖入多张图时明确要求只选一张。

- [X] T008 [US1] 在 `extension/background.mjs` 将网页原图、可见区域截图、粘贴和文件入口统一规范为 ReferenceSelection，并落实“`sourceType: page-image | screenshot | paste | file`”“`displayName` 为非网址的本地展示名”“`mimeType: image/png | image/jpeg | image/webp`”“`byteSize: 1..10 MB`”“`imagePayload` 仅会话期使用”，不得把图片、缩略图或页面网址写入本地草稿
- [X] T009 [US1] 在 `extension/background.mjs` 更新 `analysis.run`：只在收到明确分析动作后发送当前单图，校验 `contractVersion === 2` 和固定模块集合，把成功结果规范化为 IntentModule；契约缺失时归类为 `version_mismatch`，失败时不得写入空结果
- [X] T010 [P] [US1] 在 `extension/sidepanel.html` 把旧只读分项容器替换为结构化意图工作台骨架，包含参考图确认、11 模块列表、依据/证据/置信度区域和明确的“开始分析”动作，不在选择、粘贴、拖入或保存时自动触发 AI
- [X] T011 [P] [US1] 在 `extension/sidepanel.css` 增加模块卡片、依据类型、置信度、空值/不确定、分析中和错误状态的最小样式，保持现有下载与分类面板布局可用
- [X] T012 [US1] 在 `extension/sidepanel.mjs` 统一处理网页图片、单张粘贴和单张拖入入口，拒绝多张输入且不静默选第一张；移除选择变化、侧边栏初始化和隐私确认后的全部 `autoRun` 路径，只有用户点击并确认“开始分析”后才调用 `analysis.run`；1 秒内显示进度，并按固定顺序渲染所有 11 模块
- [X] T013 [US1] 在 `extension/sidepanel.mjs` 为输入无效、网络不可用、处理超时、服务暂不可用、使用上限、结果无法解析和版本不匹配显示简明恢复动作，达到额度时不得展示个人或公共剩余额度数字，并保持下载/分类入口可操作

**Checkpoint**：US1 可独立演示“单图 → 明确确认 → 结构化理解”，不依赖编辑、草稿历史或统计。

---

## Phase 4：User Story 2 — 局部调整并生成可控 Prompt（Priority: P1）🎯

**目标**：用户能逐项编辑、启停、锁定和确认模块，本地确定性编译并复制最终 Prompt，编辑过程不产生新 AI 请求。

**Independent Test**：修改材料模块、停用景观模块、锁定视角模块并填写负向约束；Prompt 只发生对应变化。首次复制完整 Prompt 要求一次整体确认，复制结果不含来源、证据、置信度或状态。

- [X] T014 [P] [US2] 在 `extension/sidepanel.html` 增加模块编辑框、启用/恢复、锁定、单模块复制、Prompt 预览、完整复制和首次整体确认界面，固定整体生成准则只读且始终位于预览首段
- [X] T015 [P] [US2] 在 `extension/sidepanel.css` 增加“建议、已确认、已修改、已锁定、已停用、已变化”状态和 Prompt 预览/确认层的最小视觉区分
- [X] T016 [US2] 在 `extension/sidepanel.mjs` 接入 `extension/shared.mjs` 的模块编辑、启停、恢复和锁定函数；每次本地操作立即重编译预览并只更新对应模块，且不得发送 `analysis.run`
- [X] T017 [US2] 在 `extension/sidepanel.mjs` 实现单模块复制与完整 Prompt 复制：单模块只复制启用模块正文；新草稿首次完整复制先整体确认，调用 T006 的确认函数把当前启用且未修改的 AI 建议标为 `confirmed`、清除相应 `changed`，再写入 `overallConfirmedAt`；最终文本仅含固定准则和启用非空模块的标题与值
- [X] T018 [US2] 在 `extension/sidepanel.mjs` 为剪贴板失败提供可选中文本和手动复制反馈，复制成功后只更新界面状态，不改变模块正文，也不发起模型调用
- [X] T019 [US2] 曾实现重新分析自动合并的 V2 基线；该行为已由用户后续确认的 T043“候选与方案分离、禁止自动合并”完整取代，不再作为当前发布行为

**Checkpoint**：US1 + US2 形成 V2 MVP 核心闭环“分析 → 候选选择 → 局部控制 → 确认 → 复制”。

---

## Phase 5：User Story 3 — 中断后继续并从失败中恢复（Priority: P2）

**目标**：最近 5 份文本草稿可跨侧边栏/浏览器会话恢复，分析失败不覆盖已有工作。

**Independent Test**：创建并编辑 6 份草稿后重新打开侧边栏，只保留最近 5 份且状态可恢复；模拟分析失败时原草稿不变，仍可编辑、复制和使用下载分类。

- [X] T020 [P] [US3] 在 `extension/shared.mjs` 实现 IntentDraft 规范化，字段为 `draftId`、不含来源网址的 `name`、`createdAt`、`updatedAt`、可空 `lastAnalyzedAt`、固定 `modules[11]`、可空 `overallConfirmedAt`、可空 `referenceSelectionId` 和仅含 `sourceType/displayName` 的可空 `referenceHint`，不得持久化图片、缩略图、页面网址、Cookie、令牌或云端身份
- [X] T021 [US3] 在 `extension/background.mjs` 增加 `intentDraftsV2` 存储读写辅助逻辑，按 `updatedAt` 倒序只保留 5 份，第 6 份写入时仅移出最旧项；`compiledPrompt` 可由模块重建，不得成为第二状态源
- [X] T022 [US3] 在 `extension/background.mjs` 实现 `draft.save`、`draft.create`、`draft.restore`、`draft.delete` 和扩展后的 `state.get` 消息；“新建草稿”只清空活动草稿 ID 和编辑上下文，不立即写入空草稿，删除草稿不得触碰已下载图片或 CloudBase
- [X] T023 [P] [US3] 在 `extension/sidepanel.html` 与 `extension/sidepanel.css` 增加最近草稿列表、新建、打开、删除、当前草稿名称和“重新分析需重新选择参考图”的提示区域
- [X] T024 [US3] 在 `extension/sidepanel.mjs` 接入草稿创建、自动保存、恢复和删除；初版的按参考选择创建或合并行为已由 T043 调整为“活动方案持续保留、分析只刷新候选”
- [X] T025 [US3] 在 `extension/background.mjs` 与 `extension/sidepanel.mjs` 保证分析失败、面板关闭、标签切换或服务冷启动不会以空结果覆盖当前草稿；恢复后无需原图即可编辑和复制，重新分析前必须重新选择参考图

**Checkpoint**：US3 可在不依赖云端草稿存储的情况下独立验证 5 份历史、恢复和失败保护。

---

## Phase 6：User Story 4 — 在保存与理解之间自主衔接（Priority: P2）

**目标**：保留“只保存”“只分析”“保存后继续分析”三条路径，任何付费分析都必须由用户再次确认。

**Independent Test**：分别执行只保存、只分析、保存后点击继续分析；保存动作本身不触发 AI，继续分析复用同一选择和统一确认流程。

- [X] T026 [P] [US4] 在 `extension/sidepanel.html` 与 `extension/sidepanel.css` 的下载成功区域增加“继续分析此图”入口和必要状态，入口默认不执行分析
- [X] T027 [US4] 在 `extension/sidepanel.mjs` 将下载成功后的“继续分析此图”接入 T012 已建立的统一分析确认流程，入口只打开确认状态而不直接调用 AI；确保下载、分类、自定义类型和定位文件在 AI 不可用时仍独立工作

**Checkpoint**：四个用户故事均已实现，现有下载路径未被 V2 状态或 AI 故障阻断。

---

## Phase 7：匿名行为统计与隐私边界（跨故事）

**目标**：先登记边界，再实现默认关闭的最小事件漏斗；本阶段只准备代码和本地披露文件，不自动创建或启用云端资源。

- [X] T028 在开始任何统计代码前，将计划资源 `archbuddy_dev_events`、默认关闭的 `ARCHBUDDY_ANALYTICS_ENABLED`、用途、数据类型、ADMINONLY 目标权限、30 天保留期和“尚未创建/尚未验证/不得启用”状态登记到 `docs/CLOUDBASE_PROJECT_ISOLATION.md`，同时核对项目 `archbuddy`、阶段 `development`、地域 `ap-shanghai`、服务 `archbuddy-api` 和本地环境 ID
- [X] T029 [P] 在 `cloudbase/quota.mjs` 为白名单资源增加 `events: 'archbuddy_dev_events'`，并在 `cloudbase/README.md` 与 `cloudbase/DAILY_QUOTA_DEPLOYMENT.md` 登记服务环境变量 `ARCHBUDDY_ANALYTICS_ENABLED` 的默认关闭语义和启用前置条件，不改变 `cloudbase/environment.example.json`、`archbuddy_dev_quotas`、`archbuddy_dev_requests` 或每日 20/200 配额
- [X] T030 在 `cloudbase/cloudbase-store.mjs` 基于现有单一 SDK 实例增加事件写入器：`projectId` 服务端固定为 `archbuddy`、`stage` 固定为 `development`、`actorHash` 从已验证匿名身份派生，`receivedAt` 使用服务端时间、`expiresAt` 等于服务端时间加 30 天、`schemaVersion=1`；只接受契约字段并以 `eventId` UUID 作为幂等文档 ID
- [X] T031 在 `cloudbase/server.mjs` 增加 `POST /api/events`：复用匿名 Bearer 鉴权，严格只接受 `eventId`、`eventName`、可选 `outcome`、`clientOccurredAt`，事件仅允许 `analysis_started`、`analysis_succeeded`、`analysis_failed`、`module_edited`、`module_disabled`、`prompt_confirmed`、`prompt_copied`，结果仅允许 `success`、`invalid_input`、`network_unavailable`、`timeout`、`service_unavailable`、`quota_exceeded`、`format_invalid`、`version_mismatch`、`unknown_error`；多余字段以 `400 EVENT_INVALID` 拒绝，关闭时返回 204，接受时返回 202
- [X] T032 在 `cloudbase/start.mjs` 只初始化一次 `cloudbase/cloudbase-store.mjs`，从同一 store 派生并向 `createAnalysisServer` 注入 quota 与 eventWriter；统计写入失败不得影响分析响应或配额，且日志不得包含请求正文、图片、Prompt、模块文本、令牌或上游错误正文
- [X] T033 在 `extension/background.mjs` 实现 `analytics.consent.set` 与 `analytics.record`，并让 `state.get` 返回当前 AnalyticsConsent：统计同意默认 `false`，只保存 `enabled`、`updatedAt`、`policyVersion`；关闭时直接忽略，开启时丢弃未知字段、生成 `eventId` 并复用 T007 的 Bearer 与一次 401 刷新路径，失败时不保存敏感重试队列且不阻断任何核心操作
- [X] T034 在 `extension/sidepanel.html`、`extension/sidepanel.css` 与 `extension/sidepanel.mjs` 增加独立的匿名统计选择加入/撤回入口，说明用途与 30 天保留期并链接隐私政策；只在同意有效时为分析开始/成功/失败、模块编辑/停用、整体确认和 Prompt 复制发送白名单事件，事件不得携带图片、网址、Prompt、模块正文、自定义分类、文件路径或直接身份
- [X] T035 [P] 同步更新 `extension/privacy.html`、`extension/store/privacy-policy.md`、`extension/store/permission-justifications.md`、`extension/store/RELEASE_CHECKLIST.md` 与 `cloudbase/hosting/archbuddy/privacy/index.html`，准确披露统计默认关闭、字段范围、30 天保留、撤回方式和“不记录图片、网址、Prompt 或自定义文字”，并保持各处说法一致

**Checkpoint**：统计代码与本地披露文件已准备，但 CloudBase 事件集合和统计开关仍保持未创建或关闭状态。

---

## Phase 8：Polish、静态验收与发布包

**目标**：同步说明、完成章程要求的静态质量门槛并生成不含敏感内容的发布包。

- [X] T036 [P] 根据最终实现同步 `extension/README.md`、`cloudbase/README.md` 与 `specs/001-design-intent/quickstart.md`，用中文记录 V2 核心路径、统计默认关闭、已知限制、CloudBase 未验证项和恢复动作，并把 SC-001、SC-002、SC-007、SC-008 明确标记为尚需实际证据的非阻断产品验证指标，不把未部署资源或未执行指标描述为已完成
- [X] T037 在 `extension/manifest.json` 更新 V2 发布版本和中文描述，确认仍为 Manifest V3 且 `permissions`、`host_permissions` 未因 V2 增加项目；不得加入身份、历史、无限存储或后台常驻权限
- [X] T038 对 `extension/shared.mjs`、`extension/background.mjs`、`extension/sidepanel.mjs`、`plugin-prototype/analysis-contract.mjs`、`plugin-prototype/vision-analyzer.mjs`、`cloudbase/server.mjs`、`cloudbase/cloudbase-store.mjs`、`cloudbase/quota.mjs`、`cloudbase/start.mjs` 执行 `node --check`，解析 `extension/manifest.json`，运行 `git diff --check`，并按 `specs/001-design-intent/quickstart.md` 静态扫描硬编码密钥、测试 token、未经批准的邮箱、手机号和 CloudBase 凭据；仅允许已批准的公开支持邮箱出现在隐私、商店和公开支持文档中
- [X] T039 运行 `cloudbase/scripts/build-deploy-package.ps1` 与 `extension/scripts/build-store-package.ps1` 的现有打包校验，确认 CloudBase ZIP 同时包含未改动的 `analysis-instructions.md` 与新增的 `analysis-instructions-v2.md`、使用正斜杠且文件哈希一致；检查商店 ZIP 根目录直接含 `manifest.json` 且不含 `.git`、`.env`、`cloudbase/environment.json`、测试脚本、测试 token、部署压缩包或用户草稿，并把核对结果写入 `extension/store/RELEASE_CHECKLIST.md`

## Phase 8A：多参考图候选意图拼装（发布前本地增量）

**目标**：把单次分析结果与最终方案分离，让用户从多次单图分析中逐项选取不同维度，形成不中断的整体 Prompt。

- [X] T042 在 `extension/shared.mjs` 为当前方案建立空模块槽位、候选加入和安全 `sourceHint` 规范化；同一维度只保留一个值，加入或替换不得影响其他维度
- [X] T043 在 `extension/background.mjs` 把分析结果改为会话期候选，已有方案时禁止自动合并；新增 `intent.add`，只允许显式加入或替换单个固定维度，并在方案变化后撤销整体确认
- [X] T044 在 `extension/sidepanel.html`、`extension/sidepanel.css` 与 `extension/sidepanel.mjs` 增加“本图候选意图 → 加入当前方案 → 已加入 / 替换当前项 → Prompt 预览”完整链路，换图分析时保留当前方案
- [X] T045 同步更新 `spec.md`、`data-model.md`、内部消息契约和 `extension/README.md`，明确每次模型调用仍只处理一张图，多图仅通过用户逐项选择组合，不实现自动角色识别或冲突消解
- [X] T046 重新执行 T038 的静态检查，并检查候选结果不进入本地草稿、草稿不保存图片或网址、分析下一张图不修改当前方案
- [X] T047 重新生成并核对 V2 商店包，更新 `extension/store/RELEASE_CHECKLIST.md`；旧的 T039 扩展包视为已被本次本地增量取代，不得上传

## Phase 8B：侧栏减法与短文案（发布前本地增量）

**目标**：只在主流程保留候选选择、当前方案和 Prompt 预览，降低 11 个模块造成的纵向长度与认知负担。

- [X] T048 在 `extension/sidepanel.html` 与 `extension/sidepanel.mjs` 把核心按钮改为四字以内，候选动作固定为“加入 / 已加入 / 替换”，删除重复的二次分析按钮
- [X] T049 在 `extension/sidepanel.css` 与 `extension/sidepanel.mjs` 移除候选和当前方案卡片中的依据、置信度、证据和来源行，候选正文默认三行并可点击展开；把上述信息、整体准则和匿名统计移动到页面底部默认折叠的“详细说明”
- [X] T050 同步更新规格、计划、快速验收与 README，重新执行静态检查并生成新的 V2 商店包；不得部署 CloudBase 或影响线上 V1

---

## Phase 9：受控发布与 CloudBase 隔离验证

**目标**：先以新增路由方式部署并验证 V2 后端且保持 V1 可用，再完成公开披露和 V2 商店包上传；任一前置条件未通过时统计继续关闭。

- [ ] T040 使用 T039 生成的后端包更新已登记的 `archbuddy-api`，保持 `ARCHBUDDY_ANALYTICS_ENABLED=false`；确认已发布 V1 的 `POST /api/analyze` 仍返回既有 `sections` 契约，确认新增 `POST /api/v2/analyze` 返回 `contractVersion: 2` 与固定 `modules[11]`，两者继续共用匿名会话和 20/200 配额；仅在 ArchBuddy development 创建 `archbuddy_dev_events`，核验 ADMINONLY 权限并配置 `expiresAt` 30 天 TTL；使用合成的错误项目、阶段和集合标识验证越界请求被拒绝并核验日志不含请求正文或用户内容，不读取、写入或列举任何真实 `st-` 或其他项目数据，并将证据与未验证项写入 `docs/CLOUDBASE_PROJECT_ISOLATION.md`
- [ ] T041 在 T040 的 V1/V2 路由、权限、TTL、隔离和日志验证全部通过后，将 `cloudbase/hosting/archbuddy/privacy/index.html` 重新部署到已登记的 `archbuddy-privacy` 站点并验证公开页面内容，在 Chrome Web Store 更新隐私披露后上传 T047 生成且只调用 `/api/v2/analyze` 的 V2 扩展包；把公开网址、披露状态和未完成项记录到 `extension/store/RELEASE_CHECKLIST.md` 与 `docs/CLOUDBASE_PROJECT_ISOLATION.md`，不得覆盖共享静态托管根目录或其他项目路径；只有上述证据全部通过后才可将 `ARCHBUDDY_ANALYTICS_ENABLED` 设为 `true`，否则继续关闭

---

## 依赖关系与执行顺序

### 阶段依赖

- **Phase 1（Setup）**：无依赖，可立即开始。
- **Phase 2（Foundational）**：依赖 Phase 1，阻塞全部用户故事。
- **Phase 3（US1）**：依赖 Phase 2；先建立可独立演示的结构化分析。
- **Phase 4（US2）**：依赖 US1 的模块工作台，完成真正的 V2 MVP。
- **Phase 5（US3）**：依赖 US2 的模块与 Prompt 状态；完成后增加跨会话恢复，不改变核心契约。
- **Phase 6（US4）**：依赖 US1 的统一分析确认流程；功能上可在 US2/US3 后实现以避免同时修改 `sidepanel.*`。
- **Phase 7（统计与隐私）**：依赖所有需要记录的核心动作；T028 的计划资源登记必须先完成，才可执行 T029–T035；本阶段不得创建或启用云端统计资源。
- **Phase 8（收尾）**：依赖计划实现的代码阶段，完成本地静态检查和发布包构建。
- **Phase 8A（多图拼装）**：依赖 Phase 8 已完成的 V2 基线；T046、T047 完成后才可进入发布。
- **Phase 8B（界面减法）**：依赖 Phase 8A；完成后重新执行静态检查与扩展打包，不改变云端契约。
- **Phase 9（受控发布）**：依赖 Phase 8B；必须先完成 T040 的后端新增路由部署、V1/V2 契约及 CloudBase 隔离验证，再执行 T041 的公开披露和 V2 商店包上传。

### 用户故事依赖图

```text
Setup
  ↓
Foundational
  ↓
US1 结构化理解
  ├──→ US2 可控 Prompt（V2 MVP）
  │       ↓
  │     US3 草稿与恢复
  └──→ US4 保存后继续分析
             ↓
      匿名统计与隐私（默认关闭）
             ↓
        静态验收与打包
             ↓
       受控发布与隔离验证
```

### 用户故事独立性

- **US1（P1）**：完成 Foundational 后即可独立验收，不需要草稿历史或统计。
- **US2（P1）**：复用 US1 的模块，但编辑、编译和复制完全在本地完成，不依赖 CloudBase 统计。
- **US3（P2）**：依赖已存在的模块/Prompt 状态，只使用浏览器本地存储，不依赖账号或云同步。
- **US4（P2）**：只复用 US1 的选择和确认入口，不依赖草稿历史或统计。

---

## 并行执行示例

### Setup

```text
并行：T001 extension/shared.mjs
并行：T002 plugin-prototype/analysis-instructions.md
```

### User Story 1

```text
在 T008、T009 完成后：
并行：T010 extension/sidepanel.html
并行：T011 extension/sidepanel.css
随后：T012 → T013 extension/sidepanel.mjs
```

### User Story 2

```text
并行：T014 extension/sidepanel.html
并行：T015 extension/sidepanel.css
随后：T016 → T017 → T018 extension/sidepanel.mjs
并行准备：T019 extension/background.mjs
```

### 匿名统计

```text
先完成：T028 docs/CLOUDBASE_PROJECT_ISOLATION.md 计划资源登记
然后并行：T029 资源常量与部署说明
然后并行：T035 隐私与商店文档
代码主线：T029 → T030 → T031 → T032 → T033 → T034
发布主线：T038 → T039 → T040 → T041
```

---

## 实施策略

### MVP First（两项 P1）

1. 完成 Phase 1：统一模块目录和模型协议。
2. 完成 Phase 2：打通 V2 契约、纯函数和请求通道。
3. 完成 Phase 3：交付 US1 的结构化图片理解。
4. 完成 Phase 4：交付 US2 的编辑、确定性 Prompt、整体确认和复制。
5. **停止并验证**：执行 T038 中与 T001–T019 改动相关的静态检查；按需人工演示，但不新增或运行自动化测试。

### 增量交付

1. **MVP**：Setup + Foundational + US1 + US2。
2. **可靠性增量**：增加 US3 的最近 5 份草稿和失败恢复。
3. **流程增量**：增加 US4 的保存后主动继续分析。
4. **验证增量**：先执行 T028 登记，再完成匿名统计代码和本地隐私文件；此时统计仍保持关闭。
5. **本地发布准备**：完成 Phase 8 的静态检查和双发布包检查。
6. **受控发布**：按 T040 → T041 先完成不破坏 V1 的后端新增路由部署与权限、TTL、合成隔离、日志验证，再完成公开披露和 V2 商店包上传；任一条件未通过时统计继续关闭。

---

## 说明

- 所有任务均遵循 `- [ ] Txxx [P?] [US?] 描述 + 文件路径` 格式。
- 本阶段没有自动化测试任务；人工演示是产品验证建议，不是强制质量门槛。
- `[P]` 只表示文件与依赖允许并行，不表示必须使用多个执行者。
- 任何任务若需要扩大浏览器权限、上传新的用户内容字段、修改 20/200 配额或访问其他 CloudBase 项目，必须先停止并回到规格澄清。
- CloudBase 统计未验证时，最小可发布版本必须保持 `ARCHBUDDY_ANALYTICS_ENABLED` 关闭。

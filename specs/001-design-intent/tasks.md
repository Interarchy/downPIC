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

- [ ] T001 [P] 在 `extension/shared.mjs` 增加 V2 存储键和固定 11 模块目录：`reference_summary`、`scene_subject`、`space_massing`、`facade_elements`、`materials_surfaces`、`landscape_context`、`view_composition`、`color_tone`、`lighting_atmosphere`、`image_expression`、`negative_constraints`，持久化和合并只使用稳定 `key`
- [ ] T002 [P] 将 `plugin-prototype/analysis-instructions.md` 更新为 V2 标签协议，要求每个固定模块输出“内容、依据类型、证据、置信度”，其中依据类型仅为“可见事实、合理推断、无法确认”，并继续禁止猜测功能、材料品种、构造、项目背景和图片内指令

**Checkpoint**：扩展与模型指令使用同一套 11 模块名称和顺序。

---

## Phase 2：Foundational（阻塞所有用户故事）

**目标**：完成结构化分析契约、模块状态纯函数和统一认证请求通道；完成前不得进入用户故事界面实现。

- [ ] T003 在 `plugin-prototype/analysis-contract.mjs` 把标签文本解析为固定顺序的 `AnalysisModuleSuggestion[11]`，严格落实“`value` 允许空字符串；`basis: observed | inferred | uncertain`；`evidence` 允许空字符串；`confidence: high | medium | low | unknown`”，忽略未知标题并把缺失模块补为空值、`uncertain`、`unknown`
- [ ] T004 在 `plugin-prototype/vision-analyzer.mjs` 将分析器返回值切换为 T003 的结构化模块结果，保留模型名、耗时、截断、缓存和供应商 usage，且不得在服务端建议中加入 `source/reviewState/enabled/locked/changed/status` 浏览器交互字段
- [ ] T005 在 `cloudbase/server.mjs` 将 `POST /api/analyze` 切换为单一 V2 响应 `contractVersion: 2`、固定 `modules[11]`、`model`、`durationMs`、`truncated`、`cached`，移除旧 `sections` 成功契约并保持匿名会话、20/200 配额和普通用户不返回具体余额的现状
- [ ] T006 [P] 在 `extension/shared.mjs` 实现 IntentModule 规范化、派生状态、用户编辑、启停、锁定、重新分析合并和 Prompt 编译纯函数，逐字落实约束：“用户修改 `value` 后，`source=user`、`reviewState=modified`、`basis=uncertain`、`evidence=''`、`confidence=unknown`”“`enabled=false` 时保留模块内容，但编译提示词时排除”“`locked=true` 时重新分析不得覆盖该模块”“`status` 按‘停用 > 锁定 > `reviewState`’派生”“`basis`、`evidence`、`confidence` 和状态字段仅用于界面，不进入最终提示词”
- [ ] T007 [P] 在 `extension/background.mjs` 将后端请求通道整理为 `/api/analyze` 与后续 `/api/events` 可共同复用的 Bearer token 注入和一次 401 刷新逻辑，并把输入无效、网络不可用、处理超时、服务暂不可用、使用上限、结果无法解析和版本不匹配映射为稳定错误类别，不向界面透传上游正文或内部堆栈

**Checkpoint**：后端能够返回 V2 模块契约；浏览器端已有确定性的状态、合并和编译能力。

---

## Phase 3：User Story 1 — 从参考图获得可用设计意图（Priority: P1）🎯

**目标**：用户从网页图片、粘贴图片或拖入本地图片，在明确确认后得到可审阅的 11 个结构化模块。

**Independent Test**：选择一张清晰建筑参考图并主动发起分析；界面显示固定 11 个模块及可见事实/推断/不确定、证据和置信度。选择或保存图片本身不调用 AI；粘贴或拖入多张图时明确要求只选一张。

- [ ] T008 [US1] 在 `extension/background.mjs` 将网页原图、可见区域截图、粘贴和文件入口统一规范为 ReferenceSelection，并落实“`sourceType: page-image | screenshot | paste | file`”“`displayName` 为非网址的本地展示名”“`mimeType: image/png | image/jpeg | image/webp`”“`byteSize: 1..10 MB`”“`imagePayload` 仅会话期使用”，不得把图片、缩略图或页面网址写入本地草稿
- [ ] T009 [US1] 在 `extension/background.mjs` 更新 `analysis.run`：只在收到明确分析动作后发送当前单图，校验 `contractVersion === 2` 和固定模块集合，把成功结果规范化为 IntentModule；契约缺失时归类为 `version_mismatch`，失败时不得写入空结果
- [ ] T010 [P] [US1] 在 `extension/sidepanel.html` 把旧只读分项容器替换为结构化意图工作台骨架，包含参考图确认、11 模块列表、依据/证据/置信度区域和明确的“开始分析”动作，不在选择、粘贴、拖入或保存时自动触发 AI
- [ ] T011 [P] [US1] 在 `extension/sidepanel.css` 增加模块卡片、依据类型、置信度、空值/不确定、分析中和错误状态的最小样式，保持现有下载与分类面板布局可用
- [ ] T012 [US1] 在 `extension/sidepanel.mjs` 统一处理网页图片、单张粘贴和单张拖入入口，拒绝多张输入且不静默选第一张；在用户确认后调用 `analysis.run`，1 秒内显示进度，并按固定顺序渲染所有 11 模块
- [ ] T013 [US1] 在 `extension/sidepanel.mjs` 为输入无效、网络不可用、处理超时、服务暂不可用、使用上限、结果无法解析和版本不匹配显示简明恢复动作，达到额度时不得展示个人或公共剩余额度数字，并保持下载/分类入口可操作

**Checkpoint**：US1 可独立演示“单图 → 明确确认 → 结构化理解”，不依赖编辑、草稿历史或统计。

---

## Phase 4：User Story 2 — 局部调整并生成可控 Prompt（Priority: P1）🎯

**目标**：用户能逐项编辑、启停、锁定和确认模块，本地确定性编译并复制最终 Prompt，编辑过程不产生新 AI 请求。

**Independent Test**：修改材料模块、停用景观模块、锁定视角模块并填写负向约束；Prompt 只发生对应变化。首次复制完整 Prompt 要求一次整体确认，复制结果不含来源、证据、置信度或状态。

- [ ] T014 [P] [US2] 在 `extension/sidepanel.html` 增加模块编辑框、启用/恢复、锁定、单模块复制、Prompt 预览、完整复制和首次整体确认界面，固定整体生成准则只读且始终位于预览首段
- [ ] T015 [P] [US2] 在 `extension/sidepanel.css` 增加“建议、已确认、已修改、已锁定、已停用、已变化”状态和 Prompt 预览/确认层的最小视觉区分
- [ ] T016 [US2] 在 `extension/sidepanel.mjs` 接入 `extension/shared.mjs` 的模块编辑、启停、恢复和锁定函数；每次本地操作立即重编译预览并只更新对应模块，且不得发送 `analysis.run`
- [ ] T017 [US2] 在 `extension/sidepanel.mjs` 实现单模块复制与完整 Prompt 复制：单模块只复制启用模块正文；新草稿首次完整复制先整体确认并写入 `overallConfirmedAt`，最终文本仅含固定准则和启用非空模块的标题与值
- [ ] T018 [US2] 在 `extension/sidepanel.mjs` 为剪贴板失败提供可选中文本和手动复制反馈，复制成功后只更新界面状态，不改变模块正文，也不发起模型调用
- [ ] T019 [US2] 在 `extension/background.mjs` 使用 `extension/shared.mjs` 的重新分析合并规则：旧模块 `reviewState=modified`、`locked=true` 或 `enabled=false` 时完整保留；其余采用新建议并设为 `suggested`，只在 AI 建议变化时设 `changed=true`，同时保留草稿 `overallConfirmedAt`

**Checkpoint**：US1 + US2 形成 V2 MVP 核心闭环“分析 → 审阅/局部控制 → 确认 → 复制 → 重新分析保护用户意图”。

---

## Phase 5：User Story 3 — 中断后继续并从失败中恢复（Priority: P2）

**目标**：最近 5 份文本草稿可跨侧边栏/浏览器会话恢复，分析失败不覆盖已有工作。

**Independent Test**：创建并编辑 6 份草稿后重新打开侧边栏，只保留最近 5 份且状态可恢复；模拟分析失败时原草稿不变，仍可编辑、复制和使用下载分类。

- [ ] T020 [P] [US3] 在 `extension/shared.mjs` 实现 IntentDraft 规范化，字段为 `draftId`、不含来源网址的 `name`、`createdAt`、`updatedAt`、可空 `lastAnalyzedAt`、固定 `modules[11]`、可空 `overallConfirmedAt`、可空 `referenceSelectionId` 和仅含 `sourceType/displayName` 的可空 `referenceHint`，不得持久化图片、缩略图、页面网址、Cookie、令牌或云端身份
- [ ] T021 [US3] 在 `extension/background.mjs` 增加 `intentDraftsV2` 存储读写辅助逻辑，按 `updatedAt` 倒序只保留 5 份，第 6 份写入时仅移出最旧项；`compiledPrompt` 可由模块重建，不得成为第二状态源
- [ ] T022 [US3] 在 `extension/background.mjs` 实现 `draft.save`、`draft.create`、`draft.restore`、`draft.delete` 和扩展后的 `state.get` 消息；“新建草稿”只清空活动草稿 ID 和编辑上下文，不立即写入空草稿，删除草稿不得触碰已下载图片或 CloudBase
- [ ] T023 [P] [US3] 在 `extension/sidepanel.html` 与 `extension/sidepanel.css` 增加最近草稿列表、新建、打开、删除、当前草稿名称和“重新分析需重新选择参考图”的提示区域
- [ ] T024 [US3] 在 `extension/sidepanel.mjs` 接入草稿创建、自动保存、恢复和删除；无活动草稿或当前 `selectionId` 与草稿 `referenceSelectionId` 不同时，首次成功分析创建新草稿，只有明确“重新分析当前草稿”才合并
- [ ] T025 [US3] 在 `extension/background.mjs` 与 `extension/sidepanel.mjs` 保证分析失败、面板关闭、标签切换或服务冷启动不会以空结果覆盖当前草稿；恢复后无需原图即可编辑和复制，重新分析前必须重新选择参考图

**Checkpoint**：US3 可在不依赖云端草稿存储的情况下独立验证 5 份历史、恢复和失败保护。

---

## Phase 6：User Story 4 — 在保存与理解之间自主衔接（Priority: P2）

**目标**：保留“只保存”“只分析”“保存后继续分析”三条路径，任何付费分析都必须由用户再次确认。

**Independent Test**：分别执行只保存、只分析、保存后点击继续分析；保存动作本身不触发 AI，继续分析复用同一选择和统一确认流程。

- [ ] T026 [P] [US4] 在 `extension/sidepanel.html` 与 `extension/sidepanel.css` 的下载成功区域增加“继续分析此图”入口和必要状态，入口默认不执行分析
- [ ] T027 [US4] 在 `extension/sidepanel.mjs` 将下载成功后的“继续分析此图”接入与网页、粘贴和拖入相同的分析确认流程，并移除选择变化或侧边栏初始化时的自动分析行为，确保下载、分类、自定义类型和定位文件在 AI 不可用时仍独立工作

**Checkpoint**：四个用户故事均已实现，现有下载路径未被 V2 状态或 AI 故障阻断。

---

## Phase 7：匿名行为统计与隐私边界（跨故事）

**目标**：仅在用户主动选择加入后记录最小事件漏斗；未完成 CloudBase 隔离、权限和 TTL 验证前必须保持关闭。

- [ ] T028 [P] 在 `cloudbase/quota.mjs` 为白名单资源增加 `events: 'archbuddy_dev_events'`，并在 `cloudbase/environment.example.json` 登记默认关闭的 `ARCHBUDDY_ANALYTICS_ENABLED` 配置说明，不改变 `archbuddy_dev_quotas`、`archbuddy_dev_requests` 或每日 20/200 配额
- [ ] T029 在 `cloudbase/cloudbase-store.mjs` 基于现有单一 SDK 实例增加事件写入器：`projectId` 服务端固定为 `archbuddy`、`stage` 固定为 `development`、`actorHash` 从已验证匿名身份派生，`receivedAt` 使用服务端时间、`expiresAt` 等于服务端时间加 30 天、`schemaVersion=1`；只接受契约字段并以 `eventId` UUID 作为幂等文档 ID
- [ ] T030 在 `cloudbase/server.mjs` 增加 `POST /api/events`：复用匿名 Bearer 鉴权，严格只接受 `eventId`、`eventName`、可选 `outcome`、`clientOccurredAt`，事件仅允许 `analysis_started`、`analysis_succeeded`、`analysis_failed`、`module_edited`、`module_disabled`、`prompt_confirmed`、`prompt_copied`，结果仅允许 `success`、`invalid_input`、`network_unavailable`、`timeout`、`service_unavailable`、`quota_exceeded`、`format_invalid`、`version_mismatch`、`unknown_error`；多余字段以 `400 EVENT_INVALID` 拒绝，关闭时返回 204，接受时返回 202
- [ ] T031 在 `cloudbase/start.mjs` 只初始化一次 `cloudbase/cloudbase-store.mjs`，从同一 store 派生并向 `createAnalysisServer` 注入 quota 与 eventWriter；统计写入失败不得影响分析响应或配额，且日志不得包含请求正文、图片、Prompt、模块文本、令牌或上游错误正文
- [ ] T032 在 `extension/background.mjs` 实现 `analytics.consent.set` 与 `analytics.record`：统计同意默认 `false`，只保存 `enabled`、`updatedAt`、`policyVersion`；关闭时直接忽略，开启时丢弃未知字段、生成 `eventId` 并复用 T007 的 Bearer 与一次 401 刷新路径，失败时不保存敏感重试队列且不阻断任何核心操作
- [ ] T033 在 `extension/sidepanel.html`、`extension/sidepanel.css` 与 `extension/sidepanel.mjs` 增加独立的匿名统计选择加入/撤回入口，说明用途与 30 天保留期并链接隐私政策；只在同意有效时为分析开始/成功/失败、模块编辑/停用、整体确认和 Prompt 复制发送白名单事件，事件不得携带图片、网址、Prompt、模块正文、自定义分类、文件路径或直接身份
- [ ] T034 [P] 同步更新 `extension/privacy.html`、`extension/store/privacy-policy.md`、`extension/store/permission-justifications.md`、`extension/store/RELEASE_CHECKLIST.md` 与 `cloudbase/hosting/archbuddy/privacy/index.html`，准确披露统计默认关闭、字段范围、30 天保留、撤回方式和“不记录图片、网址、Prompt 或自定义文字”，并保持各处说法一致
- [ ] T035 在 CloudBase 中仅为 ArchBuddy development 创建并核验 `archbuddy_dev_events` 的 ADMINONLY 权限、`expiresAt` 30 天 TTL 与 `ARCHBUDDY_ANALYTICS_ENABLED`；在实际权限、TTL 和日志边界验证前保持变量关闭，并把资源归属、证据、未验证项和结论记录到 `docs/CLOUDBASE_PROJECT_ISOLATION.md`，不得读取、覆盖或清理任何 `st-` 或其他项目资源

**Checkpoint**：未同意时零事件；同意后仅产生白名单事件；撤回后立即停止；未完成云端前置条件时核心 V2 仍可在统计关闭状态发布。

---

## Phase 8：Polish、静态验收与发布包

**目标**：同步说明、完成章程要求的静态质量门槛并生成不含敏感内容的发布包。

- [ ] T036 [P] 根据最终实现同步 `extension/README.md`、`cloudbase/README.md` 与 `specs/001-design-intent/quickstart.md`，用中文记录 V2 核心路径、统计默认关闭、已知限制、CloudBase 未验证项和恢复动作，不把未部署资源描述为已上线
- [ ] T037 在 `extension/manifest.json` 更新 V2 发布版本和中文描述，确认仍为 Manifest V3 且 `permissions`、`host_permissions` 未因 V2 增加项目；不得加入身份、历史、无限存储或后台常驻权限
- [ ] T038 对 `extension/shared.mjs`、`extension/background.mjs`、`extension/sidepanel.mjs`、`plugin-prototype/analysis-contract.mjs`、`plugin-prototype/vision-analyzer.mjs`、`cloudbase/server.mjs`、`cloudbase/cloudbase-store.mjs`、`cloudbase/quota.mjs`、`cloudbase/start.mjs` 执行 `node --check`，解析 `extension/manifest.json`，运行 `git diff --check`，并按 `specs/001-design-intent/quickstart.md` 静态扫描硬编码密钥、测试 token、邮箱、手机号和 CloudBase 凭据
- [ ] T039 运行 `cloudbase/scripts/build-deploy-package.ps1` 与 `extension/scripts/build-store-package.ps1` 的现有打包校验，检查 CloudBase ZIP 使用正斜杠且文件哈希一致，检查商店 ZIP 根目录直接含 `manifest.json` 且不含 `.git`、`.env`、`cloudbase/environment.json`、测试脚本、测试 token、部署压缩包或用户草稿，并把核对结果写入 `extension/store/RELEASE_CHECKLIST.md`

---

## 依赖关系与执行顺序

### 阶段依赖

- **Phase 1（Setup）**：无依赖，可立即开始。
- **Phase 2（Foundational）**：依赖 Phase 1，阻塞全部用户故事。
- **Phase 3（US1）**：依赖 Phase 2；先建立可独立演示的结构化分析。
- **Phase 4（US2）**：依赖 US1 的模块工作台，完成真正的 V2 MVP。
- **Phase 5（US3）**：依赖 US2 的模块与 Prompt 状态；完成后增加跨会话恢复，不改变核心契约。
- **Phase 6（US4）**：依赖 US1 的统一分析确认流程；功能上可在 US2/US3 后实现以避免同时修改 `sidepanel.*`。
- **Phase 7（统计与隐私）**：依赖所有需要记录的核心动作；云端资源、隐私披露和 TTL 未验证前必须保持关闭。
- **Phase 8（收尾）**：依赖计划发布的全部阶段。

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
并行：T028 cloudbase/quota.mjs + cloudbase/environment.example.json
并行：T034 隐私与商店文档
随后：T029 → T030 → T031 → T032 → T033 → T035
```

---

## 实施策略

### MVP First（两项 P1）

1. 完成 Phase 1：统一模块目录和模型协议。
2. 完成 Phase 2：打通 V2 契约、纯函数和请求通道。
3. 完成 Phase 3：交付 US1 的结构化图片理解。
4. 完成 Phase 4：交付 US2 的编辑、确定性 Prompt、整体确认和复制。
5. **停止并验证**：执行 Phase 8 的静态检查；按需人工演示，但不新增或运行自动化测试。

### 增量交付

1. **MVP**：Setup + Foundational + US1 + US2。
2. **可靠性增量**：增加 US3 的最近 5 份草稿和失败恢复。
3. **流程增量**：增加 US4 的保存后主动继续分析。
4. **验证增量**：完成匿名统计代码；只有云端隔离、TTL、隐私披露全部验证后才启用。
5. **发布**：静态检查、权限核对和双发布包检查全部通过后再部署/提交商店。

---

## 说明

- 所有任务均遵循 `- [ ] Txxx [P?] [US?] 描述 + 文件路径` 格式。
- 本阶段没有自动化测试任务；人工演示是产品验证建议，不是强制质量门槛。
- `[P]` 只表示文件与依赖允许并行，不表示必须使用多个执行者。
- 任何任务若需要扩大浏览器权限、上传新的用户内容字段、修改 20/200 配额或访问其他 CloudBase 项目，必须先停止并回到规格澄清。
- CloudBase 统计未验证时，最小可发布版本必须保持 `ARCHBUDDY_ANALYTICS_ENABLED` 关闭。

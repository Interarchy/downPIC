# ArchBuddy 项目进度交接

> **用途**：这是 ArchBuddy 的跨会话交接文件。每次在本仓库开启新的 Codex 窗口或新任务时，必须先阅读本文件，再读取 AGENTS.md 指定的章程、产品形态和 CloudBase 隔离文档。
>
> **更新时间**：2026-09-25
> **当前分支**：direction/plugin
> **当前工作区状态**：V3 0.5.2 已完成人工本地验收并推送至 `direction/plugin`（`ff756b5`）；CloudBase 版本 `008` 已全量切流并通过公开健康检查。源码保持云端默认配置；Chrome Web Store 仍未提交 V3 新版本。

## 1. 产品目标与当前形态

ArchBuddy 是面向建筑设计师的 Chrome 侧栏插件，帮助用户将参考图转化为可编辑、可组合、可迭代的图像生成 Prompt。项目同时是用户转向 AI 产品经理的 MVP 作品，应持续按完整工作流而非零散工具来设计。

已确认的长期产品形态：

    Chrome 侧栏（即时任务）
    ├─ 图片采集
    ├─ 提示词构建
    └─ 效果优化
            ↓
    插件内本地网页素材库（后续阶段，尚未开发）
            ↓
    ArchBuddy AI 服务（图片理解与效果评估）

完整决策见 [ARCHBUDDY_PRODUCT_FORM.md](ARCHBUDDY_PRODUCT_FORM.md)。

## 2. 已发布与当前开发状态

| 阶段 | 状态 | 说明 |
| --- | --- | --- |
| V1 | 已发布 | CloudBase 服务、匿名会话和每日额度链路已由用户验证。 |
| V2 | 已提交 | 提交 3ad4905，实现单图结构化意图构建。 |
| V3 / 效果优化 | 已部署并全量切流 | 当前工作区版本为 0.5.2；提交 `ff756b5`；CloudBase 部署 `008` 正常、100% 流量。 |
| 本地网页素材库 | 未开始 | 已确定为下一大阶段，不应混入当前 V3。 |

V3 的规格、计划、任务、交互修订和验证记录集中在 [specs/002-effect-optimization](../specs/002-effect-optimization/)。

## 3. 当前 V3 已实现内容

### 3.1 提示词构建

1. 最多支持 3 张参考图，各自上传、粘贴或拖放后可同时发起分析，各有独立进度和错误提示。
2. 每张参考图下方展示可直接编辑的结构化设计维度。
3. 每个维度可“加入”“替换”“移除”；操作同步到整体 Prompt 大框。框内每段正文可直接编辑，标题保留用于定位；替换只更新对应段落，保留其他手动修改。
4. 移除了重复的“当前方案”统一编辑区。
5. 整体 Prompt 只有在点击“整体确认”后才会保存为确认方案并允许复制。
6. 修改已选维度或名称会使确认状态失效，避免复制未确认版本。
7. 确认方案库在侧栏中命名为“最近确认的提示词库”，最多保留 5 份。

### 3.2 效果优化

1. 先输入用户自行生成的效果图，再从“最近确认的提示词库”选择基础 Prompt。
2. 不再显示来源参考图，也不再展示冗长的当前方案正文。
3. 用户明确点击“开始评估”后，才将生成图和选择的 Prompt 发往服务。
4. 结果以各维度“符合／部分符合／明显偏差／无法判断”和简短偏差说明展示；状态文字分别使用绿色、黄色、红色、灰色。
5. 用户直接在每个结果卡片编辑原 Prompt；不再有重复的独立草稿编辑器。
6. 点击“确认修改”形成新的确认版本，之后才可复制。

### 3.3 本地数据边界

- 方案、Prompt 版本和轻量元数据：chrome.storage.local。
- 当前构建状态、当前生成图和评估工作稿：chrome.storage.session。
- 参考图 Blob：扩展 IndexedDB。
- 确认 Prompt 最多 5 份；单次构建最多 3 张来源参考图。
- 不在前端、扩展包或本文件保存模型密钥、服务端令牌或真实环境变量值。

## 4. 本地运行与验证现状

开发配置当前指向本地服务：

- 扩展配置：[runtime-config.mjs](../extension/runtime-config.mjs)
- 本地启动脚本：[start-local-v3.ps1](../cloudbase/scripts/start-local-v3.ps1)
- 预期本地地址：http://127.0.0.1:8080

已完成的证据：

- node --check extension/sidepanel.mjs
- node --check extension/background.mjs
- node --check extension/shared.mjs
- HTML 元素 ID、后台消息路由、清单权限的静态对应检查
- git diff --check
- 本地 /api/status 曾返回服务已配置且可用

2026-09-24 修复记录：

- 用户报告三图只能串行分析、整体 Prompt 无法编辑、偏差状态没有颜色区分，已按此修复。
- 前端改为每张参考图独立请求状态，后端默认并发容量为 3；本地启动脚本显式设置为 3。每分钟请求限制与每日额度规则继续由原有服务逻辑执行。
- 整体生成准则与维度正文均可在最终大框编辑；生成准则随确认版本和效果优化工作稿保留。编辑后必须重新整体确认才能复制。
- 已执行四个修改模块的 Node 语法检查、PowerShell 解析检查、52 个 DOM ID 和消息路由的静态检查。
- 已重启本地 8080 服务，并只读确认 configured=true、mode=local-process-test、anonymousSessionsEnabled=true。新窗口仍须检查服务是否正在运行。
- 用户已于 2026-09-24 确认 V3 本地体验验收通过；本轮此前的静态检查与本地服务状态检查仍为可追溯证据。

尚未完成或不得误称为已完成：

- 用户已确认本地 V3 核心体验可用；此前未由 Codex 记录独立的真实模型请求日志，不能把静态检查替代为模型服务证据。
- V3 尚未部署到 CloudBase，也未提交 Chrome Web Store 新版本。
- Chrome Web Store 的已发布版本仍不是这份 V3 工作区代码。

人工验证时先在 chrome://extensions 重新加载扩展；如需真实 AI 调用，再启动本地服务，并确认本机安全配置中的凭据已经存在。不得在终端输出、聊天记录或提交中暴露凭据。

## 5. 云端边界与额度

CloudBase 为多个项目共享的环境，ArchBuddy 固定标识为 archbuddy。其他项目可能使用 st- 前缀；本项目不得读取、写入、删除或覆盖其资源。

- 已登记服务：archbuddy-api（开发环境）。
- 已登记集合：archbuddy_dev_quotas、archbuddy_dev_requests。
- 已确定额度：每个匿名安装每日 20 次；整个 ArchBuddy 每日 200 次。
- 普通用户界面不得显示具体余额。
- 新增云资源、统计、存储、日志或部署前，必须先阅读并执行 [CLOUDBASE_PROJECT_ISOLATION.md](CLOUDBASE_PROJECT_ISOLATION.md) 的检查要求。

### 2026-09-25：V3 灰度部署与全量切流

- 目标固定为 ArchBuddy / development / `dev-mel-d9guu8bpu44029179` / `archbuddy-api`；本次仅更新既有云托管服务的源代码版本，不新建或修改数据库集合、存储路径、身份、统计、日志配置、预算或其他服务。
- 使用 `cloudbase/scripts/build-deploy-package.ps1` 生成白名单源码包，CLI 提交为灰度部署 `008`；打包脚本确认根目录 Dockerfile、Linux 路径及文件哈希一致。
- 灰度记录确认后，用户明确授权全量切换；只读部署记录显示：`008` 状态 `normal`、流量 100%，既有 `007` 状态 `normal`、流量 0%。未执行删除、回滚或跨项目操作。
- `ARCHBUDDY_MAX_CONCURRENT` 未在既有云端变量中显式配置，V3 服务代码将使用默认值 3；其余已有服务变量不在本记录中展示或复制。
- 只读访问已登记公网 `/healthz` 与 `/api/status` 均成功：服务已配置、匿名会话启用、额度模式为 daily、时区为 Asia/Shanghai。未发送图片、未调用模型、未扣额度；V3 的真实模型响应仍待用户决定是否单独验证。

## 6. 下一步建议

按顺序进行，避免提前扩展范围：

1. 由用户在 Chrome 中重新加载扩展并完成一次 V3 真实核心路径验证；是否发送真实图片并消耗模型额度由用户单独决定。
2. 打包并提交 Chrome Web Store 的 V3 扩展版本；不要把本地联调配置放进商店包。
3. V3 稳定后，另立 Spec 开发“插件内本地网页素材库”，复用现有本地数据模型。

## 7. 新窗口工作清单

新窗口开始任何工作时：

1. 读取本文件、AGENTS.md、.specify/memory/constitution.md。
2. 执行 git status --short --branch，保护现有未提交 V3 工作。
3. 涉及信息架构或素材库时读取 ARCHBUDDY_PRODUCT_FORM.md。
4. 涉及云端、数据、身份、日志、密钥、统计、额度或部署时读取 CLOUDBASE_PROJECT_ISOLATION.md，并核对 cloudbase/environment.json。
5. 在完成一轮有意义的开发、验证、提交或部署后，更新本文件的日期、状态、证据和未完成项。

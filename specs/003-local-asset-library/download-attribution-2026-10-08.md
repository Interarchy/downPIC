# 2026-10-08 下载自动概要描述归属错误诊断

## 目标与边界

用户反馈：本地加载版保存图片后会自动生成概要描述，商店安装版出现类似“不属于 ArchBuddy 下载”的提示，概要描述不生成。

本轮仅本地诊断和最小修复，不部署 CloudBase、不更新 Chrome Web Store、不读取真实浏览记录、下载记录或用户图库。遵循章程，不新增测试文件或测试框架；通过临时内存 harness 运行真实业务函数，并运行已有检查。与上一轮来源网页功能并存，不覆盖其未提交修改。

## 已确定的事实

1. 原始错误来自 `background.mjs` 的 `captureRecord`，同一句“图片已不存在，或不属于 ArchBuddy 下载”同时覆盖记录不存在、扩展 ID 不符、下载未完成和目录不符，无法据提示区分原因。
2. 新下载建立索引与压缩预览后立即唤醒自动描述。Chrome 下载原图与保存预览各自异步进行，预览就绪不代表原图已经 `complete`。
3. 已通过真实 `captureRecord`、`patchCaptureStatus`、`drainCaptureDescriptions` 与下载完成监听器复现：同一扩展、正确 ArchBuddy 路径、已开启图库 AI，唯一变量为原图仍处于 `in_progress`，原逻辑就将描述写为 `failed` 并显示用户所述原错误。随后下载完成，队列仅选取 `pending/preview-missing`，该图片不再自动处理。
4. 若下载已完成才准备好预览，相同原代码可以生成描述。因此“本地成功、商店失败”可由下载时序不同解释，但本轮未取得用户商店环境的下载状态，不能断言用户现场只存在这一原因。
5. 额外复现：第一张图片仍在生成时，新增第二张图片并收到其完成事件，原队列因正在运行直接返回，第二张图片停留 `pending`，需等后续唤醒。补丁一并保留这次唤醒。
6. 本地已登记商店包 `extension/dist/v4-store-20260930/archbuddy-beta-0.6.0.zip`（27 条目、Manifest 0.6.0、SHA-256 `0A06FCE7955ABBB15FDE160A00FBC40D747BAED5B21C7E7CEF514E4784D0160F`）的归属检查与自动描述队列，和本轮修前源码对应段逐字一致（仅统一换行后比较）。商店包已包含自动概要描述，并非缺少这项功能。本次未重新下载商店包或检查用户当前安装内容。

## 假设与检验

在复现出原始错误后，按以下顺序核验：

| 假设 | 可证伪的预测 | 本轮结果 |
| --- | --- | --- |
| 预览先于原图完成，下载状态被误当作归属失败 | 仅把同一下载的 state 从 complete 改成 in_progress 就失败 | 已证实；复现原文，模型桩调用 0 次 |
| 队列忙时丢失完成唤醒 | 第二张图在第一张生成中完成，队列结束后第二张仍 pending | 已证实；修复后第二张立即继续 |
| 商店版与本地版同时安装，扩展 ID 混用 | 仅改变 byExtensionId 应触发真正的归属拒绝 | 拒绝已验证并保留；没有读取用户安装状态，是否并存待核对 |
| 发布包未包含本地自动描述代码 | 发布包关键函数应与本地不同或缺失 | 本地登记的 0.6.0 包关键函数一致，该假设不支持当前证据 |

当前修复不会把另一个扩展 ID、缺少归属标识或目录外的下载当作本扩展图片。图库枚举本来就按当前 ID 筛选，不能通过放宽身份条件掩盖本次时序错误。

## 实现范围

仅修改 `extension/background.mjs`：

- `captureRecord` 区分缺下载记录、非当前安装、下载中、下载中断、目录不符。下载中返回 `DOWNLOAD_PENDING`。
- 自动队列遇到 `DOWNLOAD_PENDING` 保持原 `pending`，不写失败、不累加失败项、不调用模型，等待完成事件或已有恢复闹钟。
- 增加一个内存唤醒标志：队列运行中再次被唤醒，则本轮结束后重新检查一次，避免完成事件丢失。
- 严格扩展 ID、ArchBuddy 目录、隐藏图片检查、图库 AI 同意、模型调用与重试上限保持。未修改 UI、权限、清单版本、后端或额度。

上一轮 `normalizeSourcePageUrl` 引入与 `sourcePageUrl` 入库代码保留。

## 验证证据

### 确定性反馈环

使用 PowerShell here-string 经 `node --input-type=commonjs` 执行临时内存 harness；从源码提取上述真实函数，模拟 Chrome 下载和 storage API，使用合成预览标识和概要描述桩。没有生成测试文件，也没有调用真实模型。

首轮在补丁前执行的断言是“下载完成后 descriptionStatus 应为 ready”；实际输出：

```text
before completion: {"descriptionStatus":"failed","descriptionError":"图片已不存在，或不属于 ArchBuddy 下载"}
after completion: {"descriptionStatus":"failed","descriptionError":"图片已不存在，或不属于 ArchBuddy 下载"} AI calls: 0
AssertionError: download completion must generate summary, rather than keep wrong ownership error
'failed' !== 'ready'
```

随后用同一命令入口，将 Git HEAD 修前代码与当前修后代码在独立内存上下文中逐项对比：

| 场景 | 修前 | 修后 |
| --- | --- | --- |
| 预览先就绪、原图仍下载 | failed，显示错误归属 | pending，无模型调用 |
| 此后收到 complete | 仍 failed，模型桩 0 次 | ready，模型桩恰好 1 次 |
| 原图先完成 | ready | ready |
| 第一图生成中收到第二图完成事件 | 第二图仍 pending，共 1 次 | 两图 ready，共 2 次 |
| 其他扩展 ID | 拒绝 | 拒绝，无模型调用 |
| 缺少 byExtensionId | 拒绝 | 拒绝，无模型调用 |
| 下载中断 | 泛化归属错误 | 明确“图片下载已中断，请重新保存图片” |
| 完成但不在 ArchBuddy 路径 | 拒绝 | 拒绝，无模型调用 |
| 下载中尚无最终 filename | failed | pending |
| 图库 AI 同意关闭 | pending，无模型调用 | pending，无模型调用 |

以上验证覆盖真实队列调用边界，但 Chrome 事件与模型返回为合成桩，不等于商店浏览器或真实模型端到端验收。

### 静态与已有检查

- `node --check extension/background.mjs`：通过。
- `node --test extension/tests/*.test.mjs`：既有 19 项全部通过。
- `git diff --check`：通过；Git 对其他既有文件输出换行规范提醒，无格式错误。
- 源码 diff 审阅：仅新增状态分流及唤醒标志，来源网址改动完整保留。
- 无临时调试日志、无新增依赖或永久测试脚本。
- 真实模型、云端、真实用户数据请求均为 0。

## 本地验收与尚未验证项

重新加载本地 `extension/`，刷新采集网页，开启图库 AI 后保存一张新图片。新保存图片应在原图完成后自动生成；网络较慢时应等待，不再误报“不属于 ArchBuddy 下载”。可连续保存两张，确认第二张也能继续。

此前已被写为 failed 的旧图不会因修复而批量重新上传；重新加载修复版本后，在对应安装的图库里手动点击“生成概要描述”可重新尝试，也可重新保存该图片。商店安装与本地安装的数据空间按各自扩展 ID 隔离，本地修复不会自动更新商店安装或迁移其旧图；新商店版本需后续另行打包、发布和验收。

仍待核对用户当前商店版本、是否同时启用两个 ArchBuddy、问题图片是否已完成下载，以及在真实商店环境应用新扩展版本后的结果。没有取得这些证据前，只能报告“已复现并修复同症状本地缺陷”，不能宣称线上故障已经消失。

## 官方 API 依据

已按项目要求使用 Context7：先 resolve-library-id 选择 `/websites/developer_chrome_extensions_reference_api`，再 query-docs 获取 Chrome downloads 文档。官方说明 `byExtensionId` 表示发起下载的扩展，下载状态区分 in_progress / interrupted / complete，下载状态变化通过 onChanged 通知。

[Chrome downloads API 官方文档](https://developer.chrome.com/docs/extensions/reference/api/downloads)

本轮不涉及 CloudBase 资源、数据、身份、日志、密钥、统计、预算或每日 50/500 配置；未提交、未推送、未部署、未上架。

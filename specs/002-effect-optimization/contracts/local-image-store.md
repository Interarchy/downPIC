# 来源原图本地存储契约

## 目标

以最小的 IndexedDB helper 保存方案级完整来源原图，使多个 Prompt 版本复用同一份图片，并保证删除范围只落在明确方案内。

## 数据库

- Database：`archbuddy-local`
- Version：`1`
- Object store：`source-images-v1`
- Primary key：`sourceReferenceId`
- Index：`schemeId`（非唯一）

不建立跨方案内容哈希、缩略图表、迁移框架或同步队列。

## API

### `putSourceImage(record)`

输入必须满足 `data-model.md` 的 SourceImageRecord。行为：

1. 校验 `sourceReferenceId`、`schemeId`、格式和 1..10 MB。
2. 对同主键执行幂等覆盖；不得覆盖不同 `schemeId` 的记录。
3. 事务完成后按主键读回并核对 `byteSize/mimeType/schemeId`。
4. 成功返回不含 Blob 的元数据；配额或事务失败返回固定错误码。

### `getSourceImage(sourceReferenceId, schemeId)`

- 必须同时核对主键和 `schemeId`。
- 成功返回 Blob 与元数据；不存在返回 `NOT_FOUND`，不得回退读取其他方案。

### `listSourceImageMeta(schemeId)`

- 使用 `schemeId` 索引。
- 只返回元数据，不返回 Blob；用于完整性检查和清理预览。

### `deleteSourceImagesByScheme(schemeId)`

- 先通过索引取得明确主键集合，再在单个读写事务中删除。
- 禁止无参数、空 ID、通配或整个 database 清空。
- 返回删除数量，用于与方案 `sourceReferences` 核对。

### `deleteSourceImage(sourceReferenceId, schemeId)`

- 仅用于重新附加失败恢复。
- 同时核对 `schemeId`，不得只凭外部传入 ID 删除。

## 错误码

| code | 含义 | UI 动作 |
| --- | --- | --- |
| `INVALID_IMAGE` | 格式、大小或 Blob 不合法 | 提示换图 |
| `QUOTA_EXCEEDED` | 浏览器本地空间不足 | 提示清理方案后重试 |
| `NOT_FOUND` | 元数据存在但 Blob 缺失 | 显示“原图缺失”，允许重新附加 |
| `OWNERSHIP_MISMATCH` | 图片不属于给定方案 | 拒绝操作并保留数据 |
| `TRANSACTION_FAILED` | IndexedDB 事务失败 | 保持 `save-failed`，允许重试 |

## Object URL 生命周期

- side panel 读取 Blob 后用 `URL.createObjectURL` 展示。
- 切换方案、重新渲染、关闭面板前调用 `URL.revokeObjectURL`。
- Object URL 不写入任何持久存储，也不进入统计或服务请求。

## 与 Prompt 版本提交的关系

- 保存来源图与写方案元数据无法形成跨存储原子事务。
- 版本提交前 background 必须确认不存在 `missing/save-failed` 引用，并检查所有 `assetState=available` 的引用都能读到 Blob。
- 若任一来源缺失、保存失败或无法读回：剪贴板复制仍可成功，但版本返回 `VERSION_INCOMPLETE`，不得把版本标记为完整保存。
- 用户清理空间并重试后才提交版本；不得创建多个内容相同的失败版本。

## 隐私与隔离

- 来源图绝不由该 helper 发送网络请求。
- 所有记录只能由 ArchBuddy 扩展 origin 访问，与同一 CloudBase 环境的 `st-` 或其他项目无关。
- 删除操作必须带明确 `schemeId`，不提供全库清空 API。

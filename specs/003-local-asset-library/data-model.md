# V4 本地数据模型

## PromptScheme（延续 V3）

- schemeId：既有 UUID，不变。
- name：既有提示词方案名，最多 80 字。
- projectName：V4 可选项目名称，最多 80 字；旧值缺省为空。
- category：V4 可选分类，最多 40 字；旧值缺省为空。
- sourceReferences：单次构建最多采用 3 张，已确认历史引用继续保留。
- versions：全部已确认版本，不再截断至五条；网页端只读历史，侧栏最近五份是展示约束。
- 删除：以 schemeId 为唯一边界删除方案、关联图片和会话工作稿。

## SourceReference（延续 V3）

- sourceReferenceId、schemeId：既有归属标识，不变。
- displayName、assetState、byteSize、createdAt：既有字段。
- tags：V4 可选，最多 5 个；每个最多 24 字；去空、去重。
- Blob：仍保存在现有 IndexedDB source-images-v1，以 sourceReferenceId 查找；不另建副本。

## PromptVersion（延续 V3）

- versionId、versionNumber、createdAt、compiledPrompt、modulesSnapshot、sourceReferenceIds：不变。
- 在素材库只读，复制不创建新版本。

## 状态边界

- 整理元数据只在用户点击保存后更新对应方案。
- 缺图时 assetState 和实际读取结果分别提示，不删除文本或版本。
- 会话生成图、评估工作稿不进入素材库。

## CapturedDownload（V4 新增，和方案分离）

- downloadId：Chrome downloads API 的 ID，用于与已完成的下载记录匹配及在文件夹中定位。
- category：下载路径第一级“项目类型”；project：第二级“项目名称”，继续沿用既有下载命名规则。
- name、filename、createdAt：采集时记录的展示名、相对保存路径与时间；旧下载可从同一扩展的下载记录路径解析。
- captureCatalogV4：chrome.storage.local 中的轻量下载索引；不包含图片字节。
- capturePreviewsV4：downloadId 到预览 UUID 的本地映射。新下载可在现有 IndexedDB 图片仓库存一份最长边 640px 的 WebP 预览；电脑下载目录保存原图。
- 旧记录没有扩展内预览时显示占位，仍可用 downloads.show 定位文件；不扫描系统下载目录，也不把浏览器下载记录当作完整图片备份。
- 浏览器下载记录被清除时，本项目对应的索引和预览一并清理；不会删除电脑下载的原图。
## PromptGroup（V4 本地整理）

- promptGroupsV4 存放 groups（分组 UUID、最多 40 字名称）和 assignments（图片卡稳定键到分组 UUID）。
- 图片卡稳定键由 schemeId 与 sourceReferenceId 组成；无来源图的方案也有单独的卡片键。
- 每张卡只归属一个用户分组；没有映射时归“未分组”。左侧计数等于该组右侧卡片数。
- 分组是本地整理元数据，不改写已确认方案、来源图或 Prompt 版本。删组时移除映射，卡片回未分组。

## 旧下载预览补齐

- chrome.downloads 记录只提供路径和元数据，不能直接读取电脑原图。
- 用户在图词库主动选择 ArchBuddy 下载目录后，按 ArchBuddy/项目类型/项目名称/文件名匹配尚无预览的下载记录。
- 匹配图片只生成限宽 WebP 预览，沿用 capturePreviewsV4 与 IndexedDB；不复制完整原图或上传云端。

## 第四轮本地元数据

- captureCatalogV4[downloadId].description：最多 4000 字的用户可编辑视觉描述；生成时提取既有分析的参考摘要，最多 1000 字。descriptionUpdatedAt 记录保存时间；previousDescription 乐观检查避免覆盖其他窗口改动。
- captureHiddenV4：主动移出图库的下载 ID 集合，防止保留的下载记录刷新后重新出现。相关预览与描述会清理；勾选删除原图后先调用 downloads.removeFile，失败条目保留。
- projectTypeOrderV4：项目类型名称的有序数组；未登记的新类型追加到末尾。
- projectTypeAliasesV4：旧类型名称到新名称的映射，历史文件路径保持原样；分类恢复改名时解除目标旧映射，避免环路。
- 全部确认方案及版本沿用既有集合，不做自动淘汰。空间不足时提示保存失败，不清理旧记录。
- 搜索在本地即时读取名称、描述和 Prompt，分词与建筑同义词匹配后按覆盖率排序；不新增向量库、网络请求或查询日志。

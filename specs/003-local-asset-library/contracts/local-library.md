# V4 扩展内消息契约

## library.metadata.save

输入：schemeId、projectName、category、sourceReferenceId、tags。schemeId 必须指向现有已确认方案；sourceReferenceId 必须属于该方案。项目名称最多 80 字、分类最多 40 字、标签最多 5 个且每个最多 24 字。

结果：返回更新后的规范化方案。不更新其他方案、不修改图片 Blob、不发网络请求。无效归属或不存在时拒绝。

## library.resume

输入：schemeId、mode（builder 或 optimize）。只接受已确认方案。结果：建立显式侧栏交接状态，返回对应方案信息；不发起分析或评估。

## scheme.delete

沿用 V3：输入 schemeId 与 confirmed=true，二次确认在页面完成。删除目标方案、其来源图和相关会话状态；其他方案保持不变。

## 只读读取

素材库页面直接读取现有本地方案集合，经共享规范化函数处理；图片按来源图 ID 从现有 IndexedDB 读取。版本复制只读取本地正文。

## V4 修订：采集图片目录

- 侧栏的“图资库”首栏通过 chrome.tabs.create 打开 library.html，再用 chrome.sidePanel.close 关闭当前窗口侧栏；Chrome 最低版本为 141。
- download.image 继续下载到 ArchBuddy/项目类型/项目名称/图片文件，不改变电脑文件位置；另把 downloadId、类型、项目、名称和时间写入 captureCatalogV4。
- 可读取的 PNG、JPEG、WebP 新下载生成最长边 640px 的 WebP 本地预览，预览 ID 写入 capturePreviewsV4；预览失败不使原下载失败。
- 全页从 chrome.downloads.search 获取同一扩展的已完成下载，优先以 captureCatalogV4 分组，旧记录按 ArchBuddy 路径解析；文件夹定位使用 chrome.downloads.show。
- 清除下载记录时仅清理对应本地索引和预览，不删除电脑原图；仅下载历史无预览的图片仍列出但不伪造缩略图。
## 2026-09-26 交互与分类状态

- Logo 弹窗以 requestedStageV4 会话消息指明侧栏打开“提示词构建”或“效果优化”；图词库入口打开完整标签页。
- 项目类型仍以 custom_project_types 保存新增类型，以 hiddenProjectTypesV4 记录从可选列表移除的预设类型；默认类型仍为 default_project_type。删除不修改下载文件、下载记录或旧索引；重新输入同名预设类型可恢复。
- 侧栏不再承载图片采集预览；网页图片工具仍按当前可选类型保存原图。
- 全页仅展示来源图片、下载预览和对应 Prompt；页底不呈现容量估计，本地数据边界见隐私说明。

## 2026-09-26 第三轮交互

- 左侧下载项目树仅列项目类型和项目文件夹名称，并独立滚动；右侧进入项目文件夹后展示图片卡。
- 旧下载预览通过用户主动选择 ArchBuddy 下载目录补齐；页面只接受 PNG、JPEG、WebP，并以下载记录的完整相对路径匹配，不扫描未授权目录。
- promptGroupsV4 为本地 UI 分组元数据，不通过后台消息改写 PromptScheme；删组只取消图片卡的分组归属。

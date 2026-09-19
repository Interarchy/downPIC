# ArchBuddy 品牌规范

## 名称与定位

- 产品名统一写作 **ArchBuddy**，保持 A、B 大写，不拆写。
- 中文定位：**建筑、室内与景观设计师的参考图助手**。
- 简短介绍：一键下载分类参考图，提取视觉特征，生成中文结构化生图提示词。
- 当前版本：0.2.3 Beta；Beta 是版本状态，不属于正式产品名。

## Logo 与视觉

Logo 以几何字母 A 表达 Architecture，字母内部的拱门负形呼应建筑空间。沿用插件深绿色，以保持已建立的视觉识别。图形不依赖字体，可用于小尺寸工具栏。

- 主色 `#25634B`，深色 `#194A38`，正文 `#24332D`，底色 `#F7F8F7`，浅绿 `#E8F0EC`。
- 品牌文字使用 Segoe UI 粗体；中文界面沿用 Microsoft YaHei UI / PingFang SC。
- 弹窗与侧栏左对齐，保留既有控件尺寸与间距，Logo 与名称作为一组。
- [SVG 源文件](../extension/icons/logo.svg)，PNG 输出为 16、32、48、128 像素。
- `extension/scripts/generate-icons.ps1` 可重建 PNG；`generate-store-assets.ps1` 可重建商店宣传图。

## 更名兼容

此前品牌为 downPIC。界面、商店资料、当前原型与下载目录统一为 ArchBuddy。历史设计材料补充品牌与阶段说明，保留原方案便于追溯。

CSS/DOM 中的 `downpic-*`、本地请求头 `x-downpic`、环境变量 `DOWNPIC_*` 及原型内部标识暂时保留兼容；它们不是对外品牌名称。既有本地设置、接口校验与加载目录不因更名失效。

本次不迁移磁盘上的旧图片，也不更名仓库目录或远程仓库。`extension/` 仍是固定本地加载目录，上架包命名为 `archbuddy-beta-版本号.zip`。

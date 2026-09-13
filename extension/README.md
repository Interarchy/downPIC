# downPIC Beta Chrome Extension

这是 `direction/plugin` 方向的可上架最小版本。它保留网页参考图下载与分类，并增加中文结构化提示词反推；桌面素材库、自动入库解析和自然语言检索不在本版本范围内。

## 固定本地测试目录

仓库中的 `extension/` 就是可直接加载的解压版扩展，也是后续开发唯一更新的本地测试目录。不要把 `dist` 中的 ZIP 当作日常开发版本反复解压；ZIP 只用于最终提交 Chrome Web Store。

首次加载后，后续代码更新只需要：

1. 在 `chrome://extensions/` 找到 downPIC，点击卡片上的“重新加载”图标。
2. 刷新正在测试的网页。

不需要删除扩展，也不需要重新选择文件夹。Chrome 出于安全原因不会仅靠普通网页刷新自动重载扩展后台代码，因此“重新加载扩展 + 刷新网页”这两步仍然需要保留。

## 本地安装

1. 打开 `chrome://extensions/`。
2. 开启右上角“开发者模式”。
3. 点击“加载已解压的扩展程序”，选择本目录 `extension/`。
4. 打开一个包含建筑参考图的普通 HTTPS 网页，点击工具栏里的 downPIC 图标。
5. 在弹窗中开启“网页图片工具”，再将鼠标移到网页图片上测试“保存”和“反推提示词”；也可点击“打开反推提示词”进入右侧面板粘贴图片。

扩展不保存、接收或暴露 DeepSeek API Key。本地测试时，扩展调用 `http://127.0.0.1:4186`，Key 由 `plugin-prototype` 本地服务持有；上线时改为调用腾讯云上的 downPIC HTTPS API，Key 仍只在服务端保存。

## 首版测试链路

- 点击 Logo 打开功能弹窗；开关开启后，网页内容图片出现悬浮工具条，关闭后立即停止显示。
- 浮栏可直接切换预设项目类型，也可新增自定义类型；“保存”将图片写入 `下载/downPIC/项目类型/网页标题/`。
- 下载成功后，浮栏会保持显示；浮栏和侧栏都可点击“在文件夹中显示”定位最近下载的图片。
- “反推提示词”优先读取网页原图；原图不可直接访问时，先隐藏 downPIC 浮栏，再截取图片当前可见区域。
- 用户确认处理说明后，通过 downPIC 服务调用 DeepSeek 视觉模型。
- 返回内容为中文结构化提示词，且“整体生成准则”始终位于最前。
- 侧栏可粘贴、拖入图片，可复制完整结果，可新增自定义项目类型。

## 自动检查与打包

```powershell
node --test extension/tests/*.test.mjs
powershell -ExecutionPolicy Bypass -File extension/scripts/build-store-package.ps1
```

商店提交包输出到 `extension/dist/`。提交前还必须完成真实 Chrome 手测、真实 DeepSeek 调用、隐私政策公开部署和商店截图制作，详见 `store/RELEASE_CHECKLIST.md`。

## 后端切换

本地与生产后端地址位于 `runtime-config.mjs`。该文件只能包含公开地址，严禁放入任何 API Key。腾讯云部署完成后，还需要同步更新 `manifest.json` 的 `host_permissions`，并在服务端实现用户鉴权、配额、限流和 HTTPS。

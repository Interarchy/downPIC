# Phase 0 Capture Spike

此目录最初用于验证四个高风险假设；Chrome 实机验证通过后，扩展界面已升级为可用插件 MVP v0.1，并复用同一套真实下载能力：

1. Chrome 扩展可以把用户主动点击的图片真正下载到 `Downloads/索引室待导入/年月/`。
2. 桌面端未运行时，扩展能保留待导入清单并显示“已暂存”。
3. Native Messaging Host 能在桌面端可用时接管暂存文件。
4. 导入过程具备路径限制、幂等处理和同项目 SHA-256 完全重复去重。

当前仍属于 MVP 验证代码。暂存导入后写入 Spike 自己的 `runtime/library`，不会写入正式素材库；但弹窗、版权确认、项目类型和网页悬浮工具条已经采用已确认的正式产品交互。

## 目录

- `extension/`：可在 Chrome 中加载的 Manifest V3 扩展。
- `native-host/`：无第三方依赖的 Windows Native Messaging Host。
- `scripts/`：编译、注册和取消注册脚本。
- `tests/`：纯逻辑与主机端到端测试。
- `test-page/`：包含真实 `<img>` 的本地验收页。

## 自动化验证

在项目根目录执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\spikes\phase0-capture\scripts\build-host.ps1
node --test .\spikes\phase0-capture\tests\*.test.mjs
```

测试覆盖：

- 项目类型空白校验。
- JPEG/PNG/WebP 格式判断。
- 固定暂存相对路径。
- Native Messaging 四字节消息帧。
- 路径越界拒绝。
- 首次导入、消息重发幂等和同项目完全重复。
- 来源元数据旁车记录。

## Chrome 手动验收

### 1. 编译 Native Host

```powershell
powershell -ExecutionPolicy Bypass -File .\spikes\phase0-capture\scripts\build-host.ps1
```

### 2. 加载扩展

1. Chrome 打开 `chrome://extensions`。
2. 开启开发者模式。
3. 选择“加载已解压的扩展程序”。
4. 选择绝对目录 `F:\MelyAI-CODEX\downPIC\spikes\phase0-capture\extension`。
5. 复制浏览器显示的 32 位扩展 ID。

### 3. 注册 Native Host

该操作会写入当前 Windows 用户的 Chrome Native Messaging 注册项：

```powershell
powershell -ExecutionPolicy Bypass -File .\spikes\phase0-capture\scripts\register-host.ps1 -ExtensionId <Chrome扩展ID>
```

取消注册：

```powershell
powershell -ExecutionPolicy Bypass -File .\spikes\phase0-capture\scripts\unregister-host.ps1
```

### 4. 启动测试页

从项目根目录执行：

```powershell
python -m http.server 4180
```

打开：

```text
http://127.0.0.1:4180/spikes/phase0-capture/test-page/
```

### 5. 验收在线导入

1. 点击扩展图标，开启图片保存功能并保存设置。
2. 鼠标移入测试图片，点击 Save。
3. 工具条应显示“已下载并保存到文化建筑”。
4. `spikes/phase0-capture/runtime/library/文化建筑/沿山艺术中心 Capture Spike/` 应出现图片和 `.source.json`。
5. 再次保存同一图片，应显示“当前项目已保存”，不产生第二张图片。

### 6. 验收离线暂存

1. 先运行取消注册脚本，模拟桌面端完全退出且 Native Host 不可达。
2. 刷新测试页并再次保存。
3. 工具条应显示“已下载并暂存，打开桌面端后自动整理”。
4. 图片应实际存在于浏览器下载目录的 `索引室待导入/年月/`。
5. 重新注册 Native Host，然后完全退出并重新打开浏览器。
6. 插件启动后应自动重发待导入记录并完成归档。

## 当前结论边界

自动化测试能证明本地协议、路径安全、幂等和去重逻辑；Chrome 的真实下载、Host 连接、重复判断和重启恢复已于 2026-08-11 完成实机验证。

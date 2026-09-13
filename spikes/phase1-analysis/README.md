# Phase 1：真实素材索引与 AI 分析边界

这一阶段把插件采集结果接入桌面端，不再依赖演示图片。

## 已完成

- 扫描插件管理的两级目录与 `.source.json` 来源元数据
- 用稳定 ID 写入本地 SQLite，保存素材与 AI 任务状态
- 输出浏览器原型可读的 JSON 投影
- 桌面端显示真实图片、真实项目树和统一的未解析数量
- 本地服务在每次打开页面时重新扫描，新保存图片刷新后即可出现
- 定义可替换的建筑图片分析接口；Mock 仅验证队列，不冒充真实识图

## 启动

~~~powershell
node spikes/phase1-analysis/server.mjs
~~~

打开 `http://127.0.0.1:4174/desktop-prototype/`。

如只需重新生成静态索引：

~~~powershell
node spikes/phase1-analysis/scripts/sync-library.mjs
~~~

## 千问分析适配器

已按阿里云百炼 OpenAI 兼容接口建立千问视觉适配器。质量验证阶段默认使用 `qwen3.7-plus`，模型输出 JSON 描述、预设标签和自主新增标签。AI 优先选择预设；预设不足时单张图片最多新增 5 个短标签。新增词经过本地归一化与去重后写入当前图片，并在桌面端进入“其他”分类。

### 当前开发环境

当前阶段只有开发者自己的测试电脑需要配置百炼凭据。普通用户不需要 API Key，也不承担单次调用费用。密钥不进入浏览器插件、网页代码、SQLite 或 JSON 索引。

不要将 Key 发送到对话、写入源码或普通用户设置页。开发者在本机运行以下脚本，并按提示输入百炼控制台提供的 API Host 与新 Key：

~~~powershell
powershell -ExecutionPolicy Bypass -File spikes/phase1-analysis/scripts/configure-qwen.ps1
~~~

在普通 Windows PowerShell 中使用加密凭据启动本地服务：

~~~powershell
powershell -ExecutionPolicy Bypass -File spikes/phase1-analysis/scripts/start-local-service.ps1
~~~

该脚本默认使用 `4175` 端口，避免与原型开发服务的 `4174` 端口冲突。

Key 使用 Windows 当前用户凭据加密，保存文件已加入 `.gitignore`。配置完成后重启服务：

~~~powershell
node spikes/phase1-analysis/server.mjs
~~~

可选配置：

~~~powershell
$env:ARCHIVE_AI_AUTO_ANALYZE="1"
node spikes/phase1-analysis/server.mjs
~~~

未开启自动解析时，可在“未解析”页面逐张触发，便于 MVP 阶段观察质量与费用。不要把真实密钥提交到仓库或发送到对话中。

### 面向用户发布

发布版不把开发者百炼密钥放进桌面安装包。桌面端将图片代理图发送到“索引室云端 AI 网关”，网关完成用户鉴权、免费额度、限流、成本记录和千问调用。普通用户只看到 AI 服务状态及剩余额度。

建议测试期先用 `qwen3.7-plus` 建立准确率基线，再用同一批人工标注样本评测 `qwen3.7-flash`；质量达到门槛后再切换低成本模型。

下一阶段需要将人工描述和人工标签作为独立覆盖层持久化，保证普通重新解析不会覆盖人工修正。

# Chrome Web Store 图片资源

- `small-promo-440x280.png`：小型宣传图块。
- `screenshot-1-reverse-prompt-1280x800.png`：参考图反推与中文结构化结果。
- `screenshot-2-download-classify-1280x800.png`：下载、预设分类和自定义分类。

两张截图均由 `extension/scripts/capture-store-screenshots.mjs` 使用当前真实原型界面生成。生成时只替换模型适配器为仓库内已审核的结构化样例，不读取 DeepSeek 密钥、不调用公网模型、不消耗 CloudBase 或模型额度。截图内不包含个人信息、密钥或真实本地路径。

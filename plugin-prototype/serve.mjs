import { defaultRuntimeRoot, loadDeepSeekEnvironment } from './developer-settings.mjs';
import { createPrototypeServer } from './server.mjs';

// 只做「解析参数 → 装载凭据 → 起来」。所有请求处理都在 server.mjs，
// 这样路由和守卫可以脱离命令行参数被测试。

const options = new Map(
  process.argv.slice(2)
    .filter(arg => arg.startsWith('--'))
    .map(arg => {
      const [key, ...rest] = arg.slice(2).split('=');
      return [key, rest.join('=')];
    }),
);

const port = Number(options.get('port') || process.env.DOWNPIC_PORT || 4186);
const libraryRoot = options.get('library-root') || process.env.DOWNPIC_LIBRARY_ROOT || '';
const environment = await loadDeepSeekEnvironment(defaultRuntimeRoot());

if (!libraryRoot) {
  console.warn('未指定 --library-root，保存图片会失败。例如：--library-root="F:\\downPIC素材库"');
}
if (!environment.DEEPSEEK_API_KEY) {
  console.warn('未配置 DeepSeek 凭据，反推提示词不可用。运行 scripts/configure-deepseek.ps1 或设置 DEEPSEEK_API_KEY。');
}

createPrototypeServer({ libraryRoot, environment })
  .listen(port, '127.0.0.1', () => {
    console.log(`Prototype ready: http://127.0.0.1:${port}/plugin-prototype/`);
    console.log(`素材根目录：${libraryRoot || '(未设置)'}`);
  });

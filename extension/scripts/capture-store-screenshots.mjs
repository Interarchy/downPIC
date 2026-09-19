import { createRequire } from 'node:module';
import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPrototypeServer } from '../../plugin-prototype/server.mjs';
import { REFERENCES, sectionsFor } from '../../plugin-prototype/prompt-model.mjs';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  throw new Error('缺少 Playwright。请设置 NODE_PATH 指向工作区依赖中的 node_modules 后重试。');
}

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outputDirectory = path.join(repositoryRoot, 'extension', 'store', 'assets');
await mkdir(outputDirectory, { recursive: true });

const browserCandidates = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
let executablePath;
for (const candidate of browserCandidates) {
  try {
    await access(candidate);
    executablePath = candidate;
    break;
  } catch {
    // Continue to the next installed browser candidate.
  }
}
if (!executablePath) throw new Error('未找到可用于本地截图的 Chrome 或 Edge。');

// 商店截图必须展示真实产品界面，但生成素材不应消耗模型额度。
// 这里复用当前原型的完整前端和图片裁切链路，只把模型适配器替换为仓库内的
// 已审核结构化样例；不会读取开发者密钥、访问公网或写入素材库。
const modelSections = sectionsFor(REFERENCES[0]).slice(1);
const server = createPrototypeServer({
  libraryRoot: '下载 / ArchBuddy',
  environment: {
    DEEPSEEK_API_KEY: 'screenshot-fixture-only',
    DEEPSEEK_MODEL: 'deepseek-flash',
  },
  systemPrompt: 'Store screenshot fixture; no external model call.',
  analyzerFactory: () => ({
    analyze: async () => ({
      sections: modelSections,
      model: 'deepseek-flash',
      durationMs: 17664,
      truncated: false,
    }),
  }),
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});

const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}/plugin-prototype/`;
const browser = await chromium.launch({ headless: true, executablePath });

try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    colorScheme: 'light',
  });

  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    document.querySelector('.address').textContent = '参考图工作流 · 下载分类 · 提取提示词';
    document.querySelector('.article-footer').textContent = 'ArchBuddy · 建筑、室内与景观设计师的参考图助手';
  });

  await page.click('#try-example');
  await page.waitForSelector('#results:not([hidden])');
  await page.evaluate(() => {
    document.querySelector('#reference-page').scrollTop = 150;
    document.querySelector('#server-note').hidden = true;
    document.querySelector('#prototype-note').textContent = '已提取参考图的结构化视觉特征，可直接复制用于后续生图。';
  });
  await page.screenshot({
    path: path.join(outputDirectory, 'screenshot-1-reverse-prompt-1280x800.png'),
    fullPage: false,
  });

  await page.click('#save-tab');
  await page.evaluate(() => {
    document.querySelector('#reference-page').scrollTop = 150;
    document.querySelector('#library-path').textContent = '下载 / ArchBuddy';
  });
  await page.screenshot({
    path: path.join(outputDirectory, 'screenshot-2-download-classify-1280x800.png'),
    fullPage: false,
  });
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}

console.log(`Created store screenshots in ${outputDirectory}`);

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// 浏览器侧的接线错误在这一轮无法靠自动化跑出来（没有浏览器），
// 但「引用了不存在的 id」是纯静态的，查得出来而且一犯就白屏。
// 这几条断言就是替浏览器把关。

const appUrl = new URL('../app.mjs', import.meta.url);
const htmlUrl = new URL('../index.html', import.meta.url);

function literalIds(source) {
  return [...source.matchAll(/\$\(\s*['"]#([A-Za-z][\w-]*)['"]\s*\)/g)].map(match => match[1]);
}

function htmlIds(html) {
  return new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]));
}

test('app.mjs 引用的每个 id 都存在于 index.html', async () => {
  const [app, html] = await Promise.all([readFile(appUrl, 'utf8'), readFile(htmlUrl, 'utf8')]);
  const present = htmlIds(html);
  const referenced = [...new Set(literalIds(app))];

  assert.ok(referenced.length > 20, `只解析出 ${referenced.length} 个 id，正则可能没跟上`);
  const missing = referenced.filter(id => !present.has(id));
  assert.deepEqual(missing, [], `这些 id 在 index.html 里不存在：${missing.join('、')}`);
});

test('switchTab 用模板拼出来的两个 tab 面板也真实存在', async () => {
  const html = await readFile(htmlUrl, 'utf8');
  const present = htmlIds(html);
  for (const name of ['prompt', 'save']) {
    assert.ok(present.has(`${name}-tab`), `缺少 #${name}-tab`);
    assert.ok(present.has(`${name}-view`), `缺少 #${name}-view`);
  }
});

test('app.mjs 不再引用旧的假实现或只读示例数据', async () => {
  const app = await readFile(appUrl, 'utf8');

  assert.ok(!app.includes('setTimeout(resolve, 1500)'), '假分析的延时必须删干净');
  assert.ok(!app.includes('sectionsFor'), '示例结果改由模型返回，不该再读 fixtures');
  assert.ok(!/演示：/.test(app), '面向用户的文案里不该剩下「演示：」前缀');
  assert.ok(app.includes('AbortController'), '取消必须真的断流');
});

test('index.html 不再声称不下载文件、不调用模型', async () => {
  const html = await readFile(htmlUrl, 'utf8');

  for (const stale of ['不下载文件', '均为演示', '未接入模型', '预设内容', '不会上传']) {
    assert.ok(!html.includes(stale), `「${stale}」已经是假话了，必须改掉`);
  }
  assert.ok(html.includes('reveal-library'), '保存面板需要打开素材目录的入口');
  assert.ok(html.includes('library-path'), '保存面板需要显示真实素材根目录');
});

test('浏览器侧不出现密钥值，也不发送任何鉴权头', async () => {
  // 提到 DEEPSEEK_API_KEY 这个名字是允许的——错误提示里要告诉用户怎么配。
  // 真正的不变量是：浏览器侧既不持有密钥值，也不自己带鉴权头（那是服务端的事）。
  for (const name of ['app.mjs', 'api-client.mjs', 'vision-image.mjs', 'index.html']) {
    const source = await readFile(new URL(`../${name}`, import.meta.url), 'utf8');
    assert.ok(!/\bsk-[A-Za-z0-9_-]{8,}/.test(source), `${name} 里出现了疑似密钥的串`);
    assert.ok(!/x-api-key|anthropic-version/i.test(source), `${name} 不该构造上游鉴权头`);
    assert.ok(!/authorization\s*:/i.test(source), `${name} 不该构造 Authorization 头`);
  }
});

test('密钥只可能出现在服务端模块里', async () => {
  const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
  // 服务端也不硬编码密钥，只从环境里读
  assert.ok(!/\bsk-[A-Za-z0-9_-]{8,}/.test(server), 'server.mjs 里出现了疑似密钥的串');
});

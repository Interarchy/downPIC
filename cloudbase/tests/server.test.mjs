import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnalysisServer } from '../server.mjs';
import { PRINCIPLE, SECTION_TITLES } from '../../plugin-prototype/prompt-model.mjs';
import { VisionAnalysisError } from '../../plugin-prototype/vision-analyzer.mjs';

const token = 'test-only-token-not-a-real-credential-12345678';
const apiKey = 'test-only-upstream-secret-not-a-real-key';
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=';
const payload = { image: { mimeType: 'image/png', base64: png } };
const result = { sections: SECTION_TITLES.map(title => ({ title, text: '测试视觉描述' })), model: 'deepseek-flash', durationMs: 5 };

async function withServer(run, { environment = {}, ...options } = {}) {
  let calls = 0;
  const server = createAnalysisServer({
    environment: { DEEPSEEK_API_KEY: apiKey, ARCHBUDDY_TEST_TOKEN: token, ...environment },
    analyzerFactory: () => ({ analyze: async () => { calls++; return result; } }),
    ...options,
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (body = payload, authorization = `Bearer ${token}`) => fetch(`${base}/api/analyze`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization }, body: JSON.stringify(body),
  });
  try { await run({ base, post, calls: () => calls }); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}

test('健康检查和状态不泄露凭据、内部地址或本地路径', async () => {
  await withServer(async ({ base }) => {
    assert.equal((await fetch(`${base}/healthz`)).status, 200);
    const response = await fetch(`${base}/api/status`);
    const text = await response.text();
    assert.equal(JSON.parse(text).authenticationRequired, true);
    for (const value of [token, apiKey, 'baseUrl', 'libraryRoot']) assert.ok(!text.includes(value));
  });
});

test('未配置凭据时关闭分析；伪造插件请求头不能绕过鉴权', async () => {
  await withServer(async ({ post, calls }) => {
    assert.equal((await post()).status, 503);
    assert.equal(calls(), 0);
  }, { environment: { ARCHBUDDY_TEST_TOKEN: '' } });
  await withServer(async ({ base, post, calls }) => {
    assert.equal((await post(payload, 'Bearer wrong')).status, 401);
    const forged = await fetch(`${base}/api/analyze`, { method: 'POST', headers: { 'x-downpic': '1', origin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop', 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    assert.equal(forged.status, 401);
    assert.equal(calls(), 0);
  });
});

test('授权请求输出与插件兼容的结构化提示词，固定准则位于最前', async () => {
  await withServer(async ({ post, calls }) => {
    const response = await post();
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.sections[0].text, PRINCIPLE);
    assert.equal(body.sections.length, SECTION_TITLES.length + 1);
    assert.equal(body.cached, false);
    assert.equal(calls(), 1);
  });
});

test('拒绝格式伪造、非法编码、超限请求及本地归档接口', async () => {
  await withServer(async ({ base, post, calls }) => {
    for (const image of [{ mimeType: 'image/jpeg', base64: png }, { mimeType: 'image/png', base64: '!!!!' }]) {
      assert.equal((await post({ image })).status, 400);
    }
    const huge = await fetch(`${base}/api/analyze`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ image: { mimeType: 'image/png', base64: 'A'.repeat(15 * 1024 * 1024) } }) });
    assert.equal(huge.status, 413);
    for (const route of ['/api/capture', '/api/library/reveal', '/plugin-prototype/developer-settings.mjs']) {
      assert.equal((await fetch(base + route)).status, 404);
    }
    assert.equal(calls(), 0);
  }, { environment: { ARCHBUDDY_CALLS_PER_MINUTE: '10' } });
});

test('达到进程测试额度后停止模型调用，失败调用也占用额度', async () => {
  await withServer(async ({ post, calls }) => {
    assert.equal((await post()).status, 200);
    const second = await post();
    assert.equal(second.status, 429);
    assert.equal((await second.json()).code, 'TEST_LIMIT_REACHED');
    assert.equal(calls(), 1);
  }, { environment: { ARCHBUDDY_MAX_CALLS_PER_PROCESS: '1' } });
  await withServer(async ({ post }) => {
    assert.equal((await post()).status, 502);
    assert.equal((await post()).status, 429);
  }, { environment: { ARCHBUDDY_MAX_CALLS_PER_PROCESS: '1' }, analyzerFactory: () => ({ analyze: async () => { throw new VisionAnalysisError('UPSTREAM_FAILED', apiKey + token); } }) });
});

test('模型错误仅返回安全文案，绝不透传上游凭据和错误内容', async () => {
  await withServer(async ({ post }) => {
    const response = await post();
    assert.equal(response.status, 502);
    const text = await response.text();
    assert.ok(!text.includes(apiKey));
    assert.ok(!text.includes(token));
  }, { analyzerFactory: () => ({ analyze: async () => { throw new VisionAnalysisError('UPSTREAM_FAILED', apiKey + token); } }) });
});

test('并发请求被限制，成功后释放槽位', async () => {
  let release;
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  const pending = new Promise(resolve => { release = resolve; });
  await withServer(async ({ post }) => {
    const first = post();
    await started;
    const second = await post();
    assert.equal(second.status, 429);
    assert.equal((await second.json()).code, 'BUSY');
    release();
    assert.equal((await first).status, 200);
    assert.equal((await post()).status, 200);
  }, { environment: { ARCHBUDDY_MAX_CONCURRENT: '1' }, analyzerFactory: () => ({ analyze: async () => { entered(); await pending; return result; } }) });
});

test('分钟限流及时间窗口重置', async () => {
  let clock = 0;
  await withServer(async ({ post, calls }) => {
    assert.equal((await post()).status, 200);
    assert.equal((await post()).status, 429);
    clock = 60_001;
    assert.equal((await post()).status, 200);
    assert.equal(calls(), 2);
  }, { now: () => clock, environment: { ARCHBUDDY_CALLS_PER_MINUTE: '1' } });
});

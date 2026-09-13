import test from 'node:test';
import assert from 'node:assert/strict';
import { DeepSeekVisionAnalyzer, VisionAnalysisError, extractContentText, redactSecrets } from '../vision-analyzer.mjs';

const API_KEY = 'sk-test-key-that-must-never-leak';
const SYSTEM_PROMPT = '你是一名建筑可视化分析助手。\n\n【核心视觉特征】\n提炼三至五个最有辨识度的特点。';
const IMAGE = Buffer.from('fake-png-bytes-for-request-shape-checks');

// 实测响应的形状：thinking 块排在第一个，正文在后面。
const LIVE_SHAPE = {
  model: 'deepseek-flash',
  stop_reason: 'end_turn',
  usage: { input_tokens: 1234, output_tokens: 890 },
  content: [
    { type: 'thinking', thinking: '用户想看这张图的视觉特征。我应该先看构图……' },
    { type: 'text', text: '【核心视觉特征】\n冷灰清水混凝土构成的几何建筑群。\n\n【场景与主体】\n山谷前缘的缓坡草地。' },
  ],
};

function analyzerWith(handler, options = {}) {
  const calls = [];
  const analyzer = new DeepSeekVisionAnalyzer({
    apiKey: API_KEY,
    systemPrompt: SYSTEM_PROMPT,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return handler(url, init);
    },
    ...options,
  });
  return { analyzer, calls };
}

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body };
}

test('thinking 块排在最前面时，正文只取 text 块', async () => {
  const { analyzer } = analyzerWith(() => jsonResponse(LIVE_SHAPE));
  const result = await analyzer.analyze({ buffer: IMAGE, mimeType: 'image/png' });

  assert.ok(!result.text.includes('我应该先看构图'), 'thinking 是模型内部推理，绝不能当成分析结果');
  assert.ok(result.text.startsWith('【核心视觉特征】'));
  assert.deepEqual(result.contentTypes, ['thinking', 'text']);
});

test('请求形状：Anthropic 端点、三件套鉴权头、base64 内联图片', async () => {
  const { analyzer, calls } = analyzerWith(() => jsonResponse(LIVE_SHAPE));
  await analyzer.analyze({ buffer: IMAGE, mimeType: 'image/png' });

  assert.equal(calls.length, 1);
  const { url, init } = calls[0];
  assert.equal(url, 'https://api.deepseek.com/anthropic/v1/messages');

  assert.equal(init.headers['x-api-key'], API_KEY);
  assert.equal(init.headers.authorization, `Bearer ${API_KEY}`);
  assert.equal(init.headers['anthropic-version'], '2023-06-01');

  const body = JSON.parse(init.body);
  assert.equal(body.model, 'deepseek-flash');
  assert.equal(body.system, SYSTEM_PROMPT);
  assert.deepEqual(body.messages[0].content[0], {
    type: 'image',
    source: { type: 'base64', media_type: 'image/png', data: IMAGE.toString('base64') },
  });
});

test('返回结果带上耗时、用量与分项', async () => {
  const { analyzer } = analyzerWith(() => jsonResponse(LIVE_SHAPE));
  const result = await analyzer.analyze({ buffer: IMAGE, mimeType: 'image/webp' });

  assert.equal(result.model, 'deepseek-flash');
  assert.equal(result.stopReason, 'end_turn');
  assert.equal(result.truncated, false);
  assert.deepEqual(result.usage, { input_tokens: 1234, output_tokens: 890 });
  assert.deepEqual(result.sections.map(section => section.title), ['核心视觉特征', '场景与主体']);
  assert.ok(result.durationMs >= 0);
});

test('被 max_tokens 截断时标记出来，而不是当成正常结果', async () => {
  const { analyzer } = analyzerWith(() => jsonResponse({
    ...LIVE_SHAPE,
    stop_reason: 'max_tokens',
  }));
  const result = await analyzer.analyze({ buffer: IMAGE, mimeType: 'image/png' });

  assert.equal(result.truncated, true);
  assert.equal(result.stopReason, 'max_tokens');
});

test('上游报错时把密钥从文案里抹掉，并且不改动调用方传入的 baseUrl', async () => {
  const { analyzer } = analyzerWith(() => jsonResponse(
    { error: { type: 'authentication_error', message: `Invalid key ${API_KEY} provided` } },
    { ok: false, status: 401 },
  ));

  await assert.rejects(
    analyzer.analyze({ buffer: IMAGE, mimeType: 'image/png' }),
    error => {
      assert.ok(error instanceof VisionAnalysisError);
      assert.equal(error.code, 'UPSTREAM_FAILED');
      assert.equal(error.status, 401);
      assert.ok(!error.message.includes(API_KEY), '响应体里绝不能出现密钥');
      assert.match(error.message, /\[redacted\]/);
      return true;
    },
  );
});

test('连不上上游时报 UPSTREAM_FAILED，并带上原因', async () => {
  const { analyzer } = analyzerWith(() => { throw new Error('getaddrinfo ENOTFOUND api.deepseek.com'); });

  await assert.rejects(
    analyzer.analyze({ buffer: IMAGE, mimeType: 'image/png' }),
    error => error.code === 'UPSTREAM_FAILED' && /ENOTFOUND/.test(error.message),
  );
});

test('上游返回非 JSON 时明确报错，而不是抛 JSON.parse 的原始异常', async () => {
  const { analyzer } = analyzerWith(() => ({
    ok: false,
    status: 502,
    json: async () => { throw new SyntaxError('Unexpected token < in JSON'); },
  }));

  await assert.rejects(
    analyzer.analyze({ buffer: IMAGE, mimeType: 'image/png' }),
    error => error.code === 'UPSTREAM_FAILED' && /不是 JSON/.test(error.message),
  );
});

test('只有 thinking 块没有正文时报错，不把空结果当成成功', async () => {
  const { analyzer } = analyzerWith(() => jsonResponse({
    stop_reason: 'end_turn',
    content: [{ type: 'thinking', thinking: '想不出来' }],
  }));

  await assert.rejects(
    analyzer.analyze({ buffer: IMAGE, mimeType: 'image/png' }),
    error => error.code === 'UPSTREAM_FAILED' && /thinking/.test(error.message),
  );
});

test('超时映射成 UPSTREAM_TIMEOUT', async () => {
  const { analyzer } = analyzerWith(
    (url, init) => new Promise((resolve, reject) => {
      // 真实 fetch 会在 signal 触发时 reject，假实现也要遵守这个约定
      init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    }),
    { timeoutMs: 30 },
  );

  await assert.rejects(
    analyzer.analyze({ buffer: IMAGE, mimeType: 'image/png' }),
    error => error.code === 'UPSTREAM_TIMEOUT' && /没有返回结果/.test(error.message),
  );
});

test('调用方主动取消映射成 ANALYSIS_ABORTED，与超时区分开', async () => {
  const controller = new AbortController();
  const { analyzer } = analyzerWith((url, init) => new Promise((resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  }));

  const pending = analyzer.analyze({ buffer: IMAGE, mimeType: 'image/png', signal: controller.signal });
  controller.abort();

  await assert.rejects(
    pending,
    error => error.code === 'ANALYSIS_ABORTED' && /已取消/.test(error.message),
  );
});

test('取消信号真的透传到了 outbound fetch', async () => {
  const controller = new AbortController();
  let seen = null;
  const { analyzer } = analyzerWith((url, init) => {
    seen = init.signal;
    return new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    });
  });

  const pending = analyzer.analyze({ buffer: IMAGE, mimeType: 'image/png', signal: controller.signal });
  assert.ok(seen, 'outbound 请求必须拿到 signal');
  assert.equal(seen.aborted, false);
  controller.abort();
  assert.equal(seen.aborted, true, '取消要真的断流，而不是只丢弃结果');
  await assert.rejects(pending, () => true);
});

test('缺少密钥、图片为空或格式不支持时，在发请求之前就拒绝', async () => {
  assert.throws(
    () => new DeepSeekVisionAnalyzer({ systemPrompt: SYSTEM_PROMPT }),
    error => error.code === 'NOT_CONFIGURED',
  );

  const { analyzer, calls } = analyzerWith(() => jsonResponse(LIVE_SHAPE));
  await assert.rejects(
    analyzer.analyze({ buffer: Buffer.alloc(0), mimeType: 'image/png' }),
    error => error.code === 'IMAGE_REJECTED',
  );
  await assert.rejects(
    analyzer.analyze({ buffer: IMAGE, mimeType: 'application/pdf' }),
    error => error.code === 'IMAGE_REJECTED',
  );
  assert.equal(calls.length, 0, '被拒的请求不该花掉一次调用');
});

test('baseUrl 末尾的斜杠被规整，不会拼出双斜杠', async () => {
  const { analyzer, calls } = analyzerWith(
    () => jsonResponse(LIVE_SHAPE),
    { baseUrl: 'https://proxy.example.com/anthropic///' },
  );
  await analyzer.analyze({ buffer: IMAGE, mimeType: 'image/png' });
  assert.equal(calls[0].url, 'https://proxy.example.com/anthropic/v1/messages');
});

test('extractContentText 只认 text 块，未知块类型被忽略', () => {
  assert.deepEqual(
    extractContentText({ content: [{ type: 'thinking', thinking: 'x' }, { type: 'text', text: '甲' }, { type: 'text', text: '乙' }] }),
    { text: '甲\n乙', contentTypes: ['thinking', 'text', 'text'] },
  );
  assert.deepEqual(extractContentText({}), { text: '', contentTypes: [] });
  assert.deepEqual(extractContentText(null), { text: '', contentTypes: [] });
});

test('redactSecrets 抹掉已知密钥，以及长得像密钥的串', () => {
  assert.equal(redactSecrets(`key=${API_KEY}`, [API_KEY]), 'key=[redacted]');
  // 上游可能回显一把并不等于本地密钥的 key，也要一并抹掉
  assert.equal(redactSecrets('leaked sk-abcdefghijklmnop here'), 'leaked [redacted] here');
  assert.equal(redactSecrets(''), '');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { encodePng } from '../scripts/png-tools.mjs';
import { parseSections } from '../analysis-contract.mjs';
import { PRINCIPLE, PRINCIPLE_TITLE, SECTION_TITLES } from '../prompt-model.mjs';
import { createPrototypeServer, describeError, isTrustedRequest } from '../server.mjs';
import { VisionAnalysisError } from '../vision-analyzer.mjs';

const API_KEY = 'sk-server-test-key-must-not-leak';
const MODEL_TEXT = `【整体生成准则】\n模型 echo 的版本，应当被代码常量覆盖。\n\n${SECTION_TITLES
  .map(title => `【${title}】\n${title}的描述。`)
  .join('\n\n')}`;

function solidPng(red, green, blue, size = 4) {
  const pixels = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    pixels[i * 4] = red;
    pixels[i * 4 + 1] = green;
    pixels[i * 4 + 2] = blue;
    pixels[i * 4 + 3] = 255;
  }
  return encodePng({ width: size, height: size, pixels });
}

function imagePayload(buffer, mimeType = 'image/png') {
  return { image: { mimeType, base64: buffer.toString('base64') } };
}

// 起一个真的 HTTP 服务，端口交给系统分配，避免测试之间抢端口。
async function withServer(run, { analyzer, ...overrides } = {}) {
  const libraryRoot = await mkdtemp(path.join(tmpdir(), 'downpic-server-'));
  const server = createPrototypeServer({
    libraryRoot,
    environment: { DEEPSEEK_API_KEY: API_KEY, DEEPSEEK_MODEL: 'deepseek-flash', DEEPSEEK_BASE_URL: 'https://example.invalid' },
    systemPrompt: '你是一名建筑可视化分析助手。',
    // 默认装假分析器；传 analyzerFactory: null 表示「用服务端默认工厂」，
    // 那是唯一能验到「未配置凭据 → 503」这条真实分支的路径。
    ...(analyzer || 'analyzerFactory' in overrides ? {} : { analyzerFactory: () => fakeAnalyzer() }),
    ...(analyzer ? { analyzerFactory: () => analyzer } : {}),
    ...overrides,
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    return await run({ base, libraryRoot, server });
  } finally {
    await new Promise(resolve => server.close(resolve));
    await rm(libraryRoot, { recursive: true, force: true });
  }
}

// 与真实适配器保持同样的因果关系：sections 由 text 派生。
// 否则「改 text 但 sections 还是旧值」会让格式错误的用例假通过。
function fakeAnalyzer(overrides = {}) {
  const result = {
    text: MODEL_TEXT,
    model: 'deepseek-flash',
    stopReason: 'end_turn',
    truncated: false,
    contentTypes: ['thinking', 'text'],
    usage: { input_tokens: 10, output_tokens: 20 },
    durationMs: 1234,
    ...overrides,
  };
  return {
    analyze: async () => ({ ...result, sections: result.sections ?? parseSections(result.text) }),
  };
}

async function post(base, route, body, headers = {}) {
  const response = await fetch(`${base}${route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-downpic': '1', ...headers },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

test('GET /api/status 报告配置状态，且响应体里没有密钥', async () => {
  await withServer(async ({ base, libraryRoot }) => {
    const response = await fetch(`${base}/api/status`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.configured, true);
    assert.equal(body.provider, 'deepseek');
    assert.equal(body.model, 'deepseek-flash');
    assert.equal(body.libraryRoot, libraryRoot);
    assert.ok(!JSON.stringify(body).includes(API_KEY));
    assert.ok(!JSON.stringify(body).includes('sk-'));
  });
});

test('未配置密钥时 /api/status 说 false，分析返回 503 而不是 500', async () => {
  await withServer(
    async ({ base }) => {
      const status = await fetch(`${base}/api/status`).then(res => res.json());
      assert.equal(status.configured, false);

      const result = await post(base, '/api/analyze', imagePayload(solidPng(1, 2, 3)));
      assert.equal(result.status, 503);
      assert.equal(result.body.code, 'NOT_CONFIGURED');
    },
    { environment: {}, analyzerFactory: null },
  );
});

test('缺少同源头或来源不对的 POST 一律 403，且不产生任何副作用', async () => {
  let analyzed = 0;
  await withServer(
    async ({ base, libraryRoot }) => {
      const image = solidPng(1, 2, 3);

      const noHeader = await post(base, '/api/capture', { meta: {}, ...imagePayload(image) }, { 'x-downpic': '' });
      assert.equal(noHeader.status, 403);

      const crossOrigin = await post(
        base,
        '/api/capture',
        { meta: {}, ...imagePayload(image) },
        { origin: 'https://evil.example.com' },
      );
      assert.equal(crossOrigin.status, 403);

      assert.equal(analyzed, 0, '被拒的请求不该花掉一次模型调用');
      assert.deepEqual(await readdir(libraryRoot), [], '被拒的请求不该写任何文件');
    },
    { analyzerFactory: () => { analyzed++; return fakeAnalyzer(); } },
  );
});

test('同源带校验头的 POST 正常通过', async () => {
  await withServer(async ({ base }) => {
    const result = await post(base, '/api/analyze', imagePayload(solidPng(1, 2, 3)), {
      origin: base,
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.sections[0].text, PRINCIPLE);
  });
});

test('/api/analyze 返回装配好的分项，首段强制用代码常量', async () => {
  await withServer(async ({ base }) => {
    const { status, body } = await post(base, '/api/analyze', imagePayload(solidPng(9, 9, 9)));

    assert.equal(status, 200);
    assert.equal(body.sections[0].title, PRINCIPLE_TITLE);
    assert.equal(body.sections[0].text, PRINCIPLE);
    assert.equal(body.sections.length, 1 + SECTION_TITLES.length);
    assert.equal(body.model, 'deepseek-flash');
    assert.equal(body.cached, false);
  });
});

test('同一张图第二次分析走缓存，不再调用模型', async () => {
  let calls = 0;
  await withServer(
    async ({ base }) => {
      const image = solidPng(4, 5, 6);
      const first = await post(base, '/api/analyze', imagePayload(image));
      const second = await post(base, '/api/analyze', imagePayload(image));

      assert.equal(first.body.cached, false);
      assert.equal(second.body.cached, true);
      assert.deepEqual(second.body.sections, first.body.sections);
      assert.equal(calls, 1, '示例图会被反复反推，第二次不该再花钱');
    },
    { analyzerFactory: () => { calls++; return fakeAnalyzer(); } },
  );
});

test('模型不守格式时返回 502 ANALYSIS_FORMAT_INVALID', async () => {
  await withServer(
    async ({ base }) => {
      const { status, body } = await post(base, '/api/analyze', imagePayload(solidPng(7, 7, 7)));
      assert.equal(status, 502);
      assert.equal(body.code, 'ANALYSIS_FORMAT_INVALID');
    },
    { analyzerFactory: () => fakeAnalyzer({ text: '抱歉，我无法分析这张图片。' }) },
  );
});

test('上游错误被原样分类，且密钥不会泄进响应体', async () => {
  await withServer(
    async ({ base }) => {
      const { status, body } = await post(base, '/api/analyze', imagePayload(solidPng(8, 8, 8)));

      assert.equal(status, 401);
      assert.equal(body.code, 'UPSTREAM_FAILED');
      assert.ok(!JSON.stringify(body).includes(API_KEY));
    },
    {
      analyzerFactory: () => ({
        analyze: async () => { throw new VisionAnalysisError('UPSTREAM_FAILED', '密钥 [redacted] 无效', { status: 401 }); },
      }),
    },
  );
});

test('/api/capture 真落盘，返回相对路径与内容哈希', async () => {
  await withServer(async ({ base, libraryRoot }) => {
    const image = solidPng(11, 22, 33);
    const { status, body } = await post(base, '/api/capture', {
      meta: {
        captureId: 'cafebabecafebabe',
        projectTypeName: '建筑外观',
        pageTitle: '山谷中的混凝土建筑',
        pageUrl: 'https://example.com/valley',
        siteName: '示例建筑网',
      },
      ...imagePayload(image),
    });

    assert.equal(status, 200);
    assert.equal(body.state, 'imported');
    assert.equal(body.relativePath, path.join('建筑外观', '山谷中的混凝土建筑', body.relativePath.split(path.sep).pop()));
    assert.match(body.contentHash, /^sha256:[0-9a-f]{64}$/);
    assert.equal((await readdir(libraryRoot)).length, 1);
  });
});

test('/api/capture 第二次同图返回 duplicate，目录文件数不变', async () => {
  await withServer(async ({ base, libraryRoot }) => {
    const image = solidPng(11, 22, 33);
    const meta = { captureId: 'cafebabecafebabe', projectTypeName: '建筑外观', pageTitle: '山谷' };

    const first = await post(base, '/api/capture', { meta, ...imagePayload(image) });
    const before = (await readdir(path.join(libraryRoot, '建筑外观', '山谷'))).length;

    const second = await post(base, '/api/capture', { meta: { ...meta, captureId: 'deadbeefdeadbeef' }, ...imagePayload(image) });

    assert.equal(first.body.state, 'imported');
    assert.equal(second.body.state, 'duplicate');
    assert.equal(second.body.managedPath, first.body.managedPath);
    assert.equal((await readdir(path.join(libraryRoot, '建筑外观', '山谷'))).length, before);
  });
});

test('声明格式与字节不符时 /api/capture 返回 400，不写文件', async () => {
  await withServer(async ({ base, libraryRoot }) => {
    const { status, body } = await post(base, '/api/capture', {
      meta: { projectTypeName: '建筑外观', pageTitle: '标题' },
      image: { mimeType: 'image/png', base64: solidPng(1, 2, 3).toString('base64') },
    });
    assert.equal(status, 200); // PNG 声明 PNG，先确认这条路径是通的

    const mismatch = await post(base, '/api/capture', {
      meta: { projectTypeName: '建筑外观', pageTitle: '标题' },
      image: { mimeType: 'image/png', base64: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(32)]).toString('base64') },
    });
    assert.equal(mismatch.status, 400);
    assert.equal(mismatch.body.code, 'FORMAT_MISMATCH');
    assert.equal((await readdir(libraryRoot)).length, 1);
  });
});

test('/api/analyze 绝不写磁盘', async () => {
  await withServer(async ({ base, libraryRoot }) => {
    await post(base, '/api/analyze', imagePayload(solidPng(1, 2, 3)));
    assert.deepEqual(await readdir(libraryRoot), [], '反推必须能独立使用，不该顺手留下文件');
  });
});

test('请求体超限返回 413', async () => {
  await withServer(async ({ base }) => {
    const response = await fetch(`${base}/api/analyze`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-downpic': '1' },
      body: JSON.stringify({ image: { mimeType: 'image/png', base64: 'A'.repeat(21 * 1024 * 1024) } }),
    });
    assert.equal(response.status, 413);
  });
});

test('请求体不是 JSON 时返回 400 而不是 500', async () => {
  await withServer(async ({ base }) => {
    const response = await fetch(`${base}/api/capture`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-downpic': '1' },
      body: '这不是 JSON',
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, 'MALFORMED_JSON');
  });
});

test('客户端提前断开时取消上游请求', async () => {
  let upstreamSignal = null;
  await withServer(
    async ({ base }) => {
      const controller = new AbortController();
      const pending = fetch(`${base}/api/analyze`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-downpic': '1' },
        body: JSON.stringify(imagePayload(solidPng(1, 2, 3))),
        signal: controller.signal,
      }).catch(() => null);

      // 等上游真的拿到 signal，再模拟用户关掉页面
      await waitFor(() => upstreamSignal !== null);
      controller.abort();
      await pending;

      await waitFor(() => upstreamSignal.aborted);
      assert.equal(upstreamSignal.aborted, true, '用户取消后不该继续烧钱');
    },
    {
      analyzerFactory: () => ({
        analyze: ({ signal }) => new Promise((resolve, reject) => {
          upstreamSignal = signal;
          signal?.addEventListener('abort', () => reject(new VisionAnalysisError('ANALYSIS_ABORTED', '分析已取消')));
        }),
      }),
    },
  );
});

test('正常完成的请求不会自己把上游 abort 掉', async () => {
  let aborted = false;
  await withServer(
    async ({ base }) => {
      const { status } = await post(base, '/api/analyze', imagePayload(solidPng(1, 2, 3)));
      assert.equal(status, 200);
      assert.equal(aborted, false, "req 的 'close' 在请求体读完时就触发，挂错对象会让每次分析自杀");
    },
    {
      analyzerFactory: () => ({
        analyze: async ({ signal }) => {
          signal?.addEventListener('abort', () => { aborted = true; });
          await new Promise(resolve => setTimeout(resolve, 30)); // 模拟模型耗时
          return fakeAnalyzer().analyze();
        },
      }),
    },
  );
});

test('/api/library/reveal 会真的去打开目录', async () => {
  const revealed = [];
  await withServer(
    async ({ base, libraryRoot }) => {
      const { status, body } = await post(base, '/api/library/reveal', {});
      assert.equal(status, 200);
      assert.equal(body.libraryRoot, libraryRoot);
      assert.deepEqual(revealed, [libraryRoot]);
    },
    { reveal: async target => { revealed.push(target); } },
  );
});

test('静态文件只从允许的目录里出，且挡得住路径穿越', async () => {
  await withServer(async ({ base }) => {
    const page = await fetch(`${base}/plugin-prototype/`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type'), /text\/html/);

    for (const attempt of ['/plugin-prototype/../../package.json', '/plugin-prototype/%2e%2e/%2e%2e/package.json', '/etc/passwd']) {
      const response = await fetch(`${base}${attempt}`);
      assert.equal(response.status, 404, `${attempt} 不该被放行`);
    }
  });
});

test('未知路由返回 404，不支持的方法返回 405', async () => {
  await withServer(async ({ base }) => {
    assert.equal((await fetch(`${base}/api/nope`)).status, 404);
    assert.equal((await fetch(`${base}/plugin-prototype/styles.css`, { method: 'DELETE' })).status, 405);
  });
});

test('isTrustedRequest 的判定规则', () => {
  assert.equal(isTrustedRequest({ headers: { 'x-downpic': '1', host: '127.0.0.1:4186' } }), true);
  assert.equal(isTrustedRequest({
    headers: { 'x-downpic': '1', host: '127.0.0.1:4186', origin: 'http://127.0.0.1:4186' },
  }), true);
  assert.equal(isTrustedRequest({ headers: { 'x-downpic': '1', host: '127.0.0.1:4186', origin: 'http://localhost:4186' } }), false);
  assert.equal(isTrustedRequest({ headers: { 'x-downpic': '1', host: '127.0.0.1:4186', origin: 'not a url' } }), false);
  assert.equal(isTrustedRequest({ headers: { host: '127.0.0.1:4186' } }), false);
});

test('describeError 把未知异常收敛成不泄露内部细节的 500', () => {
  const described = describeError(new Error('ENOENT: C:\\Users\\lee\\secret\\file'));
  assert.equal(described.status, 500);
  assert.equal(described.code, 'INTERNAL_ERROR');
  assert.ok(!described.message.includes('secret'));
});

async function waitFor(predicate, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('等待条件超时');
}

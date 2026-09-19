import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createAnalysisServer } from '../server.mjs';
import { createQuotaService } from '../quota.mjs';
import { SECTION_TITLES } from '../../plugin-prototype/prompt-model.mjs';
import { fakeDatabase } from './fake-database.mjs';

const token = 'only-a-test-token-with-more-than-32-characters';
const sessionSecret = 'only-a-test-session-secret-more-than-32-characters';
const image = { mimeType: 'image/png', base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=' };
const result = { sections: SECTION_TITLES.map(title => ({ title, text: '测试' })), model: 'fake', durationMs: 10, usage: { input_tokens: 1234, output_tokens: 890 } };

async function serve(run, options = {}) {
  const backend = fakeDatabase();
  let calls = 0;
  const server = createAnalysisServer({
    environment: { DEEPSEEK_API_KEY: 'test-key-not-real', ARCHBUDDY_TEST_TOKEN: token, ARCHBUDDY_SESSION_SECRET: sessionSecret, ARCHBUDDY_QUOTA_MODE: 'cloudbase', ARCHBUDDY_CALLS_PER_MINUTE: '100', ...options.environment },
    quota: createQuotaService(backend.store),
    analyzerFactory: () => ({ analyze: async () => { calls++; if (options.fail) throw new Error('private upstream detail'); return result; } }),
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const post = (id = randomUUID(), body = { image }, extra = {}, authorization = `Bearer ${token}`) => fetch(url + '/api/analyze', {
    method: 'POST', headers: { authorization, 'content-type': 'application/json', 'x-archbuddy-request-id': id, ...extra }, body: JSON.stringify(body),
  });
  const createSession = async (installationId = randomUUID()) => {
    const response = await fetch(url + '/api/session', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ installationId }),
    });
    return { response, body: await response.json() };
  };
  try { await run({ post, createSession, docs: backend.docs, calls: () => calls }); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}

test('每日服务真实 HTTP：返回用量、个人额度；重复请求和伪造用户头不能绕过 20 次', async () => {
  await serve(async ({ post, calls }) => {
    const id = randomUUID();
    const first = await (await post(id)).json();
    assert.deepEqual(first.usage, result.usage);
    assert.equal(first.usageRecorded, true);
    assert.equal(first.quota.userRemaining, 19);
    assert.equal((await post(id)).status, 409);
    for (let i = 1; i < 20; i++) assert.equal((await post()).status, 200);
    const limit = await post(randomUUID(), { image, userId: 'different-user', projectId: 'other' }, { 'x-user-id': randomUUID() });
    assert.equal(limit.status, 429);
    assert.equal((await limit.json()).code, 'USER_DAILY_LIMIT');
    assert.equal(calls(), 20);
  });
});

test('匿名安装无需用户 Key 即可分析，并按不同安装身份分别计数', async () => {
  await serve(async ({ post, createSession, docs }) => {
    const firstSession = await createSession();
    assert.equal(firstSession.response.status, 201);
    assert.equal(typeof firstSession.body.token, 'string');
    assert.equal('installationId' in firstSession.body, false);
    const secondSession = await createSession();
    const first = await (await post(randomUUID(), { image }, {}, `Bearer ${firstSession.body.token}`)).json();
    const second = await (await post(randomUUID(), { image }, {}, `Bearer ${secondSession.body.token}`)).json();
    assert.equal('quota' in first, false);
    assert.equal('quota' in second, false);
    const quotaRecords = [...docs.entries()]
      .filter(([key]) => key.startsWith('archbuddy_dev_quotas/'))
      .map(([, value]) => value);
    assert.equal(quotaRecords.find(record => !record.actorHash).count, 2);
    assert.deepEqual(quotaRecords.filter(record => record.actorHash).map(record => record.count).sort(), [1, 1]);
    assert.equal((await post(randomUUID(), { image }, {}, 'Bearer forged')).status, 401);
  });
});

test('非法安装 ID 不签发匿名会话', async () => {
  await serve(async ({ createSession }) => {
    assert.equal((await createSession('not-a-uuid')).response.status, 400);
  });
});

test('无效图片和请求 ID 不扣次；上游失败扣次且不保存错误原文', async () => {
  await serve(async ({ post, calls, docs }) => {
    assert.equal((await post(randomUUID(), { image: { ...image, base64: 'bad' } })).status, 400);
    assert.equal((await post('not-a-uuid')).status, 400);
    assert.equal(docs.size, 0);
    const failure = await post();
    assert.equal(failure.status, 500);
    assert.ok(!(await failure.text()).includes('private upstream'));
    assert.equal(calls(), 1);
    assert.equal([...docs.values()].find(x => x.status).status, 'failed');
    assert.equal([...docs.values()].find(x => x.status).usage, null);
  }, { fail: true });
});

test('暂停开关在模型调用前生效，不扣任何额度', async () => {
  await serve(async ({ post, calls, docs }) => {
    assert.equal((await post()).status, 503);
    assert.equal(calls(), 0);
    assert.equal(docs.size, 0);
  }, { environment: { ARCHBUDDY_ANALYSIS_ENABLED: 'false' } });
});

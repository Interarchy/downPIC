import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { createAnalysisServer } from '../server.mjs';
import { createUnifiedExecutions } from '../unified-auth.mjs';
import { VisionAnalysisError } from '../../plugin-prototype/vision-analyzer.mjs';
import { SECTION_TITLES } from '../../plugin-prototype/prompt-model.mjs';
import { fakeDatabase } from './fake-database.mjs';

const secret = 'unit-test-only-executor-secret-not-a-real-credential';
const accountId = 'account_a_12345678';
const image = { mimeType: 'image/png', base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=' };
const modelResult = { sections: SECTION_TITLES.map(title => ({ title, text: '测试' })), model: 'mock', durationMs: 5, usage: { input_tokens: 12, output_tokens: 5 } };
function signed(path, body, requestId = randomUUID(), options = {}) {
  const raw = JSON.stringify(body);
  const timestamp = String(options.timestamp ?? Date.now());
  const method = options.method || 'POST';
  const digest = createHash('sha256').update(raw).digest('hex');
  const canonical = ['v1', method, path, timestamp, requestId, digest].join('\n');
  const signature = createHmac('sha256', secret).update(canonical).digest('hex');
  return { method, headers: { 'content-type': 'application/json', 'x-archbuddy-timestamp': timestamp,
    'x-archbuddy-request-id': requestId, 'x-archbuddy-signature': signature }, body: raw };
}
async function runServers(run, options = {}) {
  const backend = options.backend || fakeDatabase();
  let calls = 0, quotaCalls = 0;
  const instances = [0, 1].map(() => createAnalysisServer({
    environment: { NODE_ENV: 'production', DEEPSEEK_API_KEY: 'mock-model-key', PRODUCT_EXECUTOR_SECRET: secret,
      ARCHBUDDY_SESSION_SECRET: 'legacy-session-test-token-unused-1234567890',
      ARCHBUDDY_TEST_TOKEN: 'legacy-admin-test-token-unused-1234567890',
      ARCHBUDDY_QUOTA_MODE: 'cloudbase', ARCHBUDDY_CALLS_PER_MINUTE: '100', ...options.environment },
    unifiedExecutions: createUnifiedExecutions(backend.store),
    quota: { reserve() { quotaCalls++; throw new Error('Double billing attempted'); } },
    analyzerFactory: () => ({ analyze: async () => { calls++; return options.analyze ? options.analyze() : modelResult; },
      semanticSearch: async () => { calls++; return { matches: [], model: 'mock', durationMs: 5 }; } }),
    embedder: async () => { calls++; return { model: 'mock-embedding', vectors: [[0, 1]], usage: { input_tokens: 2 } }; },
  }));
  for (const server of instances) await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const urls = instances.map(server => `http://127.0.0.1:${server.address().port}`);
  const execute = (id, extra = {}, index = 0) => fetch(urls[index] + '/api/unified/execute', signed('/api/unified/execute', { accountId, operation: 'analyze', payload: { image }, ...extra }, id));
  const query = (id, actor = accountId, index = 0) => fetch(urls[index] + '/api/unified/result', signed('/api/unified/result', { accountId: actor, requestId: id }, id));
  try { await run({ urls, execute, query, calls: () => calls, quotaCalls: () => quotaCalls, docs: backend.docs }); }
  finally { for (const server of instances) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } }
}

test('production legacy anonymous and administrator endpoints are closed despite old secrets', async () => {
  await runServers(async ({ urls, calls }) => {
    for (const path of ['/api/session', '/api/analyze', '/api/v2/analyze', '/api/v3/evaluate', '/api/library/describe', '/api/library/embed', '/api/library/search']) {
      const response = await fetch(urls[0] + path, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer legacy-admin-test-token-unused-1234567890' }, body: JSON.stringify({ installationId: randomUUID(), image }) });
      assert.equal(response.status, 410); assert.equal((await response.json()).code, 'UNIFIED_LOGIN_REQUIRED');
    }
    const status = await (await fetch(urls[0] + '/api/status')).json();
    assert.equal(status.anonymousSessionsEnabled, false); assert.equal(status.accountMode, 'unified'); assert.equal(status.quotaMode, 'shared-worker');
    assert.equal(calls(), 0);
  });
  assert.throws(() => createAnalysisServer({ environment: { NODE_ENV: 'production', ARCHBUDDY_ACCOUNT_MODE: 'local-demo' }, accountService: {} }), /non-production/);
  assert.throws(() => createAnalysisServer({ environment: { NODE_ENV: 'production' }, legacyTestMode: true }), /test harness/);
});

test('signature binds timestamp method exact path raw body and account; malformed auth never dispatches', async () => {
  await runServers(async ({ urls, calls, docs }) => {
    const path = '/api/unified/execute';
    const body = { accountId, operation: 'analyze', payload: { image } };
    const tampered = signed(path, body); tampered.body = JSON.stringify({ ...body, accountId: 'account_b_12345678' });
    const wrongPath = signed('/api/unified/result', body);
    const wrongMethod = signed(path, body, randomUUID(), { method: 'PUT' }); wrongMethod.method = 'POST';
    const stale = signed(path, body, randomUUID(), { timestamp: Date.now() - 301000 });
    const bad = signed(path, body); bad.headers['x-archbuddy-signature'] = '00'.repeat(32);
    for (const request of [tampered, wrongPath, wrongMethod, stale, bad]) assert.equal((await fetch(urls[0] + path, request)).status, 401);
    assert.equal((await fetch(urls[0] + path, signed(path, { operation: 'analyze', payload: { image } }))).status, 400);
    assert.equal((await fetch(urls[0] + path, signed(path, { ...body, payload: { image, padding: 'x'.repeat(1024 * 1024) } }))).status, 413);
    assert.equal(calls(), 0); assert.equal(docs.size, 0);
  });
});

test('two server instances execute one request only, replay exact result, isolate account and skip old quota', async () => {
  let finish;
  const wait = new Promise(resolve => { finish = resolve; });
  await runServers(async ({ execute, query, calls, quotaCalls, docs }) => {
    const id = randomUUID();
    const first = execute(id);
    while (calls() === 0) await new Promise(resolve => setTimeout(resolve, 1));
    assert.equal((await query(id)).status, 200);
    assert.deepEqual(await (await query(id)).json(), { state: 'pending' });
    assert.equal((await execute(id, {}, 1)).status, 409);
    assert.deepEqual(await (await query(id, 'account_b_12345678')).json(), { state: 'not_found' });
    finish(modelResult);
    const result = await (await first).json();
    assert.equal(result.model, 'mock');
    const receipt = await (await query(id, accountId, 1)).json();
    assert.equal(receipt.state, 'completed'); assert.deepEqual(receipt.result, result);
    assert.deepEqual(await (await execute(id, {}, 1)).json(), result);
    assert.equal((await execute(id, { payload: { image, other: true } })).status, 409);
    assert.equal(calls(), 1); assert.equal(quotaCalls(), 0);
    assert.equal(docs.size, 1); assert.ok([...docs.keys()][0].startsWith('archbuddy_dev_requests/unified_'));
    const record = [...docs.values()][0];
    assert.equal(new Date(record.expiresAt) - new Date(record.createdAt), 30 * 86400000);
    assert.ok(record.unifiedExpiresAt instanceof Date);
    assert.equal(record.unifiedExpiresAt.getTime(), new Date(record.expiresAt).getTime());
    assert.equal('accountId' in record, false); assert.equal('payload' in record, false);
  }, { analyze: () => wait });
});

test('timeout and malformed success remain pending; explicit rejected and predispatch invalid input are refundable failed', async () => {
  for (const error of [new VisionAnalysisError('UPSTREAM_TIMEOUT', 'private'), new VisionAnalysisError('UPSTREAM_FAILED', 'private', { status: 500 }), new VisionAnalysisError('MODEL_RESPONSE_INVALID', 'private')]) {
    await runServers(async ({ execute, query, calls }) => {
      const id = randomUUID(); const response = await execute(id); const body = await response.json();
      assert.equal(body.executionState, 'pending'); assert.ok(!JSON.stringify(body).includes('private'));
      assert.deepEqual(await (await query(id)).json(), { state: 'pending' });
      assert.equal((await execute(id)).status, 409); assert.equal(calls(), 1);
    }, { analyze: () => { throw error; } });
  }
  await runServers(async ({ execute, query }) => {
    const id = randomUUID(); assert.equal((await (await execute(id)).json()).executionState, 'failed');
    assert.deepEqual(await (await query(id)).json(), { state: 'failed', errorCode: 'UPSTREAM_FAILED' });
  }, { analyze: () => { throw new VisionAnalysisError('UPSTREAM_FAILED', 'private', { status: 429 }); } });
  await runServers(async ({ execute, query, calls }) => {
    const id = randomUUID(); const response = await execute(id, { payload: { image: {} } });
    assert.equal((await response.json()).executionState, 'failed');
    assert.deepEqual(await (await query(id)).json(), { state: 'failed', errorCode: 'IMAGE_REJECTED' });
    assert.equal(calls(), 0);
  });
});

test('durable store failure rejects before model; signed search and embedding share the same persistent execution boundary', async () => {
  await runServers(async ({ execute, calls }) => { assert.equal((await execute(randomUUID())).status, 503); assert.equal(calls(), 0); },
    { backend: { store: { transaction() { throw new Error('private DB error'); } }, docs: new Map() } });
  await runServers(async ({ execute, query, calls, quotaCalls }) => {
    const search = randomUUID(), embedding = randomUUID();
    assert.equal((await execute(search, { operation: 'search', payload: { query: 'space', documents: [{ id: 'doc', text: 'space' }] } })).status, 200);
    assert.equal((await execute(embedding, { operation: 'embed', payload: { texts: ['space'] } })).status, 200);
    assert.equal((await (await query(search)).json()).state, 'completed');
    assert.equal((await (await query(embedding)).json()).state, 'completed');
    assert.equal(calls(), 2); assert.equal(quotaCalls(), 0);
  }, { environment: { ARCHBUDDY_EMBEDDING_API_KEY: 'mock-embedding-key-1234567890' } });
});

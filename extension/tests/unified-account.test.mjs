import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizationRequest, base64url, validateCallback, createCloudAccountClient } from '../cloud-account.mjs';
import { accountStorage, scopedKey } from '../account-storage.mjs';

function harness(fetchImpl) {
  const records = new Map([['active', { accessToken: 'opaque-test-only', accountId: 'account-a', expiresAt: Date.now() + 60000 }]]);
  const views = [];
  let clears = 0;
  const store = async (_mode, operation) => operation({
    get: key => ({ result: records.get(key) }), put: (value, key) => { records.set(key, value); return {}; },
    delete: key => { records.delete(key); return {}; },
  })?.result;
  const browser = { runtime: { id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }, storage: { session: { set: async value => views.push(value) } } };
  const makeClient = () => createCloudAccountClient({ fetchImpl, browser, store, onSessionChange: async () => { clears++; } });
  return { client: makeClient(), makeClient, records, views, clearCount: () => clears,
    setSecret: value => { records.set('active', value); } };
}
const response = data => new Response(JSON.stringify({ data, requestId: 'req-test' }), { headers: { 'Content-Type': 'application/json' } });
test('PKCE uses a random 256-bit verifier and exact approved redirect', async () => {
  const request = await authorizationRequest({ getRedirectURL: path => 'https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.chromiumapp.org/' + path }, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  const url = new URL(request.url);
  assert.equal(request.verifier.length, 43); assert.equal(request.state.length, 43);
  assert.equal(url.origin, 'https://canvas.archbuddy.top');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(request.verifier));
  assert.equal(url.searchParams.get('code_challenge'), base64url(new Uint8Array(digest)));
  assert.equal(url.searchParams.has('code_verifier'), false);
});
test('callback rejects spoofed hosts, alternate paths, fragments and duplicate state', () => {
  const expected = { redirectUri: 'https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.chromiumapp.org/archbuddy', state: 'expected-state' };
  const good = expected.redirectUri + '?code=one-time&state=expected-state';
  assert.equal(validateCallback(good, expected), 'one-time');
  for (const url of [
    good.replace('.chromiumapp.org', '.chromiumapp.org.evil.test'),
    good.replace('/archbuddy?', '/other?'), good + '#leak',
    good + '&state=expected-state', good.replace('expected-state', 'wrong-state'),
    good + '&code=duplicate',
  ]) assert.throws(() => validateCallback(url, expected), { code: 'AUTH_INVALID' });
});
test('account view never publishes the opaque access token', async () => {
  const h = harness(async () => response({ product: 'archbuddy', accountId: 'account-a', displayName: 'A', accessToken: 'must-not-publish', privateNotes: 'must-not-publish', credits: { availableUnits: 50 } }));
  await h.client.refresh();
  assert.equal(h.views[0].archbuddyAccountViewV1.account.credits.availableUnits, 50);
  assert.equal(JSON.stringify(h.views).includes('opaque-test-only'), false);
  assert.equal(JSON.stringify(h.views).includes('must-not-publish'), false);
});
test('stale identity refuses a call before reaching the server', async () => {
  let calls = 0;
  const h = harness(async () => { calls++; return response({}); });
  await assert.rejects(h.client.api('/v1/library', { expectedAccountId: 'account-b' }), { code: 'ACCOUNT_CHANGED' });
  assert.equal(calls, 0);
});
test('an in-flight response is discarded when its account changes', async () => {
  let release, started;
  const signal = new Promise(resolve => { started = resolve; });
  const pending = new Promise(resolve => { release = resolve; });
  const h = harness(async () => { started(); await pending; return response({ items: [{ id: 'private-a' }] }); });
  const result = h.client.api('/v1/library', { expectedAccountId: 'account-a' });
  await signal;
  h.setSecret({ accessToken: 'new-test-token', accountId: 'account-b', expiresAt: Date.now() + 60000 });
  release();
  await assert.rejects(result, { code: 'ACCOUNT_CHANGED' });
});
test('unknown execution outcomes are not retried with another id', async () => {
  const submitted = [];
  const h = harness(async (url, options) => {
    if (url.endsWith('/v1/execute')) { submitted.push(JSON.parse(options.body)); throw new TypeError('network interrupted'); }
    return response({ product: 'archbuddy', accountId: 'account-a' });
  });
  await assert.rejects(h.client.request('/api/v2/analyze', { requestId: 'stable-id', body: { image: {} } }));
  assert.equal(submitted.length, 1); assert.equal(submitted[0].requestId, 'stable-id'); assert.equal(submitted[0].operation, 'analyze-v2');
});
test('oversized requests are refused without truncation or paid dispatch', async () => {
  let calls = 0; const h = harness(async () => { calls++; return response({}); });
  await assert.rejects(h.client.request('/api/v2/analyze', { requestId: 'size-id', body: { image: { base64: 'x'.repeat(950 * 1024) } } }), { code: 'IMAGE_TOO_LARGE' });
  assert.equal(calls, 0);
});
test('private local cache is partitioned and never imports anonymous history', async () => {
  let accountId = 'account-a';
  const values = { captureCatalogV4: { historic: true } };
  globalThis.chrome = { storage: {
    session: { get: async () => ({ archbuddyAccountViewV1: { account: accountId ? { id: accountId } : null } }) },
    local: { get: async keys => Object.fromEntries(keys.filter(key => Object.hasOwn(values, key)).map(key => [key, values[key]])),
      set: async data => Object.assign(values, data), remove: async keys => keys.forEach(key => delete values[key]) },
  } };
  assert.deepEqual(await accountStorage.get('captureCatalogV4'), {});
  await accountStorage.set({ captureCatalogV4: { onlyA: true } });
  accountId = 'account-b'; assert.deepEqual(await accountStorage.get('captureCatalogV4'), {});
  await accountStorage.set({ captureCatalogV4: { onlyB: true } });
  accountId = 'account-a'; assert.deepEqual((await accountStorage.get('captureCatalogV4')).captureCatalogV4, { onlyA: true });
  assert.deepEqual(values.captureCatalogV4, { historic: true });
  assert.notEqual(scopedKey('captureCatalogV4', 'account-a'), scopedKey('captureCatalogV4', 'account-b'));
  delete globalThis.chrome;
});

test('undecided describe entitlement never reaches the server', async () => {
  let calls = 0; const h = harness(async () => { calls++; return response({}); });
  await assert.rejects(h.client.request('/api/library/describe', { requestId: 'describe-id', body: {} }), { code: 'POLICY_PENDING' });
  assert.equal(calls, 0);
});

const failure = (code, status = 401) => new Response(JSON.stringify({ error: { code } }), { status, headers: { 'Content-Type': 'application/json' } });
const accountResponse = accountId => response({ product: 'archbuddy', accountId });
test('actual worker UNAUTHENTICATED clears a revoked session and account view', async () => {
  const h = harness(async () => failure('UNAUTHENTICATED'));
  await assert.rejects(h.client.refresh(), { code: 'LOGIN_REQUIRED' });
  assert.equal(h.records.has('active'), false);
  assert.equal(h.clearCount(), 1);
  assert.equal(h.views.at(-1).archbuddyAccountViewV1.account, null);
});
test('logout succeeds when the server has already revoked the session', async () => {
  const h = harness(async () => failure('UNAUTHENTICATED'));
  assert.equal((await h.client.handle('account.logout')).account, null);
  assert.equal(h.records.has('active'), false);
  assert.equal(h.clearCount(), 1);
});
test('unknown execution retry survives worker restart and changing UI attempt ids', async () => {
  const calls = []; let interrupted = true;
  const h = harness(async (url, options) => {
    if (!url.endsWith('/v1/execute')) return accountResponse('account-a');
    calls.push(JSON.parse(options.body));
    if (interrupted) throw new TypeError('network interrupted after server dispatch');
    return response({ analysisId: 'existing-result' });
  });
  const body = { image: { mimeType: 'image/png', base64: 'private-image-marker' } };
  await assert.rejects(h.client.request('/api/v2/analyze', { requestId: 'first-id', body }), { code: 'EXECUTION_UNCONFIRMED' });
  assert.equal([...h.records.keys()].filter(key => key.startsWith('execution:account-a:')).length, 1);
  assert.equal(JSON.stringify([...h.records.entries()]).includes('private-image-marker'), false);
  interrupted = false;
  const restarted = h.makeClient();
  assert.equal((await restarted.request('/api/v2/analyze', { requestId: 'new-ui-id', body: { image: { base64: 'private-image-marker', mimeType: 'image/png' } } })).analysisId, 'existing-result');
  assert.equal(calls[0].requestId, calls[1].requestId);
  assert.deepEqual(calls[0].payload, calls[1].payload);
  // A deliberate repeat after confirmed success starts a new operation.
  await restarted.request('/api/v2/analyze', { requestId: 'deliberate-repeat', body });
  assert.equal(calls[2].requestId, 'deliberate-repeat');
});
test('evaluation retry reuses the same envelope and payload request id', async () => {
  const calls = [];
  const h = harness(async (url, options) => {
    if (!url.endsWith('/v1/execute')) return accountResponse('account-a');
    calls.push(JSON.parse(options.body)); throw new TypeError('network interrupted');
  });
  for (const requestId of ['first-evaluation', 'new-ui-attempt']) {
    await assert.rejects(h.client.request('/api/v3/evaluate', { requestId, body: { requestId, target: { versionId: 'v1' } } }), { code: 'EXECUTION_UNCONFIRMED' });
  }
  assert.equal(calls[0].requestId, 'first-evaluation');
  assert.equal(calls[1].requestId, 'first-evaluation');
  assert.equal(calls[1].payload.requestId, 'first-evaluation');
});
test('unknown execution journals remain isolated across account switches', async () => {
  const calls = [];
  let accountId = 'account-a';
  const h = harness(async (url, options) => {
    if (!url.endsWith('/v1/execute')) return accountResponse(accountId);
    calls.push(JSON.parse(options.body)); throw new TypeError('network interrupted');
  });
  for (const [id, requestId] of [['account-a', 'a-first'], ['account-b', 'b-first'], ['account-a', 'a-new-ui']]) {
    accountId = id; h.setSecret({ accessToken: 'test-' + id, accountId: id, expiresAt: Date.now() + 60000 });
    await assert.rejects(h.client.request('/api/v2/analyze', { requestId, body: { image: {} } }), { code: 'EXECUTION_UNCONFIRMED' });
    await h.client.refresh();
  }
  assert.deepEqual(calls.map(call => call.requestId), ['a-first', 'b-first', 'a-first']);
});
test('concurrent identical inputs share one paid dispatch', async () => {
  let release, started; const pending = new Promise(resolve => { release = resolve; });
  const signal = new Promise(resolve => { started = resolve; }); let calls = 0;
  const h = harness(async (url) => {
    if (!url.endsWith('/v1/execute')) return accountResponse('account-a');
    calls++; started(); await pending; return response({ analysisId: 'once' });
  });
  const first = h.client.request('/api/v2/analyze', { body: { image: {} } });
  await signal;
  const second = h.client.request('/api/v2/analyze', { body: { image: {} } });
  await new Promise(resolve => setTimeout(resolve, 10)); release();
  assert.deepEqual(await Promise.all([first, second]), [{ analysisId: 'once' }, { analysisId: 'once' }]);
  assert.equal(calls, 1);
});
test('an auth error on an uncertain retry retains the original execution id for reconnect', async () => {
  let code = 'network'; const calls = [];
  const h = harness(async (url, options) => {
    if (!url.endsWith('/v1/execute')) return accountResponse('account-a');
    calls.push(JSON.parse(options.body));
    if (code === 'network') throw new TypeError('network interrupted');
    if (code === 'UNAUTHENTICATED') return failure(code);
    return response({ analysisId: 'existing' });
  });
  await assert.rejects(h.client.request('/api/v2/analyze', { requestId: 'original', body: {} }), { code: 'EXECUTION_UNCONFIRMED' });
  code = 'UNAUTHENTICATED';
  await assert.rejects(h.client.request('/api/v2/analyze', { requestId: 'retry', body: {} }), { code: 'LOGIN_REQUIRED' });
  h.setSecret({ accessToken: 'reconnected-test', accountId: 'account-a', expiresAt: Date.now() + 60000 });
  code = 'success'; await h.client.request('/api/v2/analyze', { requestId: 'after-reconnect', body: {} });
  assert.deepEqual(calls.map(call => call.requestId), ['original', 'original', 'original']);
});
test('execution timeout outlasts the 170 second BFF budget', async () => {
  const original = AbortSignal.timeout; const timeouts = [];
  AbortSignal.timeout = value => { timeouts.push(value); return new AbortController().signal; };
  try {
    const h = harness(async url => url.endsWith('/v1/execute') ? response({ ok: true }) : accountResponse('account-a'));
    await h.client.request('/api/v2/analyze', { body: {} });
    assert.ok(timeouts.includes(185000));
  } finally { AbortSignal.timeout = original; }
});

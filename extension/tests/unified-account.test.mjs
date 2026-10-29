import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizationRequest, base64url, validateCallback, createCloudAccountClient } from '../cloud-account.mjs';
import { accountStorage, scopedKey } from '../account-storage.mjs';

function harness(fetchImpl) {
  let secret = { accessToken: 'opaque-test-only', accountId: 'account-a', expiresAt: Date.now() + 60000 };
  const views = [];
  const store = async (_mode, operation) => operation({
    get: () => ({ result: secret }), put: value => { secret = value; return {}; },
    delete: () => { secret = undefined; return {}; },
  })?.result;
  const browser = { runtime: { id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }, storage: { session: { set: async value => views.push(value) } } };
  const client = createCloudAccountClient({ fetchImpl, browser, store, onSessionChange: async () => {} });
  return { client, views, setSecret: value => { secret = value; } };
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

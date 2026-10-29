import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizationRequest, base64url, validateCallback, createCloudAccountClient } from '../cloud-account.mjs';
import { accountStorage, scopedKey } from '../account-storage.mjs';

function harness(fetchImpl, options = {}) {
  const records = new Map([['active', { accessToken: 'opaque-test-only', accountId: 'account-a', expiresAt: Date.now() + 60000 }]]);
  const views = [], transactions = [];
  let clears = 0, beforeStore, onPublish, onChange;
  let transactionQueue = Promise.resolve();
  const store = (mode, operation) => {
    const task = transactionQueue.then(async () => {
      await beforeStore?.(mode);
      const values = mode === 'readwrite' ? new Map(records) : records;
      const tasks = [], calls = [];
      const request = (kind, key, work) => {
        const result = {};
        calls.push([kind, key]);
        tasks.push(() => { result.result = work(); result.onsuccess?.(); });
        return result;
      };
      const result = operation({
        get: key => request('get', key, () => values.get(key)),
        put: (value, key) => request('put', key, () => { values.set(key, value); return key; }),
        delete: key => request('delete', key, () => values.delete(key)),
      });
      // IDB success handlers run inside the same transaction and may enqueue writes.
      while (tasks.length) tasks.shift()();
      if (mode === 'readwrite') { records.clear(); for (const [key, value] of values) records.set(key, value); }
      transactions.push({ mode, calls });
      return result?.result;
    });
    transactionQueue = task.catch(() => {});
    return task;
  };
  const browser = { runtime: { id: 'hkbnjlapflleibeodhghbephgpacbhle' }, storage: { session: { get: async () => views.at(-1) || {}, set: async value => { await onPublish?.(value); views.push(value); } } } };
  const makeClient = () => createCloudAccountClient({ fetchImpl, browser, store, onSessionChange: async () => { clears++; await onChange?.(); }, ...options });
  return { client: makeClient(), makeClient, records, views, browser, transactions, clearCount: () => clears,
    setSecret: value => { if (value) records.set('active', value); else records.delete('active'); },
    beforeStore: callback => { beforeStore = callback; }, onPublish: callback => { onPublish = callback; }, onChange: callback => { onChange = callback; } };
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
test('cancellation ends the flow only with the original callback and state', () => {
  const expected = { redirectUri: 'https://ikkmbpahejfapgnngdckocmfbcbnjedo.chromiumapp.org/archbuddy', state: 'expected-state' };
  const cancelled = expected.redirectUri + '?error=access_denied&state=expected-state';
  assert.throws(() => validateCallback(cancelled, expected), { code: 'LOGIN_CANCELLED' });
  assert.throws(() => validateCallback(cancelled.replace('expected-state', 'wrong-state'), expected), { code: 'AUTH_INVALID' });
  assert.throws(() => validateCallback(cancelled + '&code=unexpected', expected), { code: 'AUTH_INVALID' });
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

test('approved simple analysis retries the same request and returns the confirmed result', async () => {
  const calls = []; let interrupted = true;
  const h = harness(async (url, options) => {
    if (!url.endsWith('/v1/execute')) return response({ product: 'archbuddy', accountId: 'account-a' });
    calls.push(JSON.parse(options.body));
    if (interrupted) throw new TypeError('connection closed after dispatch');
    return response({ description: 'confirmed image description' });
  });
  const body = { image: { mimeType: 'image/png', base64: 'test-only' } };
  await assert.rejects(h.client.request('/api/library/describe', { requestId: 'describe-id', body }), { code: 'EXECUTION_UNCONFIRMED' });
  interrupted = false;
  const result = await h.makeClient().request('/api/library/describe', { requestId: 'new-ui-attempt', body });
  assert.equal(result.description, 'confirmed image description');
  assert.equal(calls.length, 2); assert.equal(calls[0].operation, 'describe');
  assert.equal(calls[1].requestId, 'describe-id');
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


function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
function installIdentity(h, launch) {
  h.browser.identity = {
    getRedirectURL: path => `https://${h.browser.runtime.id}.chromiumapp.org/${path}`,
    launchWebAuthFlow: launch || (async ({ url }) => {
      const request = new URL(url);
      return request.searchParams.get('redirect_uri') + '?state=' + request.searchParams.get('state') + '&code=' + 'c'.repeat(43);
    }),
  };
}
const newSession = () => ({ accessToken: 'abp_' + 'n'.repeat(43), accountId: 'account-b', expiresAt: Date.now() + 60000 });

test('stale auth failure cannot delete a new token between its read and write', async () => {
  const h = harness(async () => failure('UNAUTHENTICATED'));
  let replaced = false;
  h.beforeStore(mode => {
    if (mode === 'readwrite' && !replaced) { replaced = true; h.setSecret(newSession()); }
  });
  await assert.rejects(h.client.api('/v1/account'), { code: 'LOGIN_REQUIRED' });
  assert.equal(h.records.get('active').accountId, 'account-b');
  assert.equal(h.clearCount(), 0);
  assert.equal(h.views.some(view => view.archbuddyAccountViewV1.account === null), false);
  assert.ok(h.transactions.some(tx => tx.mode === 'readwrite' && tx.calls.some(([kind, key]) => kind === 'get' && key === 'active')));
});
test('clearing a revoked token compares and deletes in one readwrite transaction', async () => {
  const h = harness(async () => failure('UNAUTHENTICATED'));
  await assert.rejects(h.client.api('/v1/account'), { code: 'LOGIN_REQUIRED' });
  assert.ok(h.transactions.some(tx => tx.mode === 'readwrite' &&
    JSON.stringify(tx.calls) === JSON.stringify([['get', 'active'], ['delete', 'active']])));
});
test('expired credential cleanup cannot clear a replacement session', async () => {
  const h = harness(async () => { throw new Error('must not fetch'); });
  h.setSecret({ accessToken: 'expired', accountId: 'account-a', expiresAt: 1 });
  let replaced = false;
  h.beforeStore(mode => { if (mode === 'readwrite' && !replaced) { replaced = true; h.setSecret(newSession()); } });
  await assert.rejects(h.client.identity(), { code: 'LOGIN_REQUIRED' });
  assert.equal(h.records.get('active').accountId, 'account-b');
  assert.equal(h.clearCount(), 0);
});
test('a delayed account refresh cannot republish an account cleared by another request', async () => {
  const started = deferred(), release = deferred();
  const h = harness(async url => {
    if (url.endsWith('/v1/account')) { started.resolve(); await release.promise; return accountResponse('account-a'); }
    return failure('UNAUTHENTICATED');
  });
  const refresh = h.client.refresh();
  await started.promise;
  await assert.rejects(h.client.api('/v1/library'), { code: 'LOGIN_REQUIRED' });
  release.resolve();
  await assert.rejects(refresh, { code: 'ACCOUNT_CHANGED' });
  assert.equal(h.views.at(-1).archbuddyAccountViewV1.account, null);
  assert.equal(h.records.has('active'), false);
});
for (const mode of ['forbidden', 'network']) test(`logout clears locally on ${mode} and reports unconfirmed remote revocation`, async () => {
  const h = harness(async () => { if (mode === 'forbidden') return failure('FORBIDDEN', 403); throw new TypeError('private network details'); });
  const result = await h.client.handle('account.logout');
  assert.equal(result.ok, true); assert.equal(result.account, null);
  assert.equal(result.remoteLogoutConfirmed, false);
  assert.match(result.notice, /服务器暂未确认撤销/);
  assert.equal(h.views.at(-1).archbuddyAccountViewV1.notice, result.notice);
  assert.equal((await h.makeClient().handle('account.get')).notice, result.notice);
  assert.equal(h.records.has('active'), false);
  assert.equal(h.views.at(-1).archbuddyAccountViewV1.account, null);
});
for (const name of ['AbortError', 'TimeoutError']) test(`${name} numeric DOMException code becomes a stable timeout code`, async () => {
  const h = harness(async () => { throw new DOMException('private abort details', name); });
  await assert.rejects(h.client.api('/v1/library'), { code: 'PROCESS_TIMEOUT' });
  assert.equal(h.records.has('active'), true);
});
test('login keeps switching locked until new token and new cache scope are published and profile completes', async () => {
  const started = deferred(), release = deferred();
  const h = harness(async url => {
    if (url.endsWith('/token')) return response(newSession());
    started.resolve(); await release.promise; return accountResponse('account-b');
  });
  installIdentity(h);
  const login = h.client.handle('account.login');
  await started.promise;
  assert.equal(h.records.get('active').accountId, 'account-b');
  assert.equal(h.views.at(-1).archbuddyAccountViewV1.account.id, 'account-b');
  await assert.rejects(h.client.identity(), { code: 'ACCOUNT_BUSY' });
  await assert.rejects(h.client.api('/v1/library'), { code: 'ACCOUNT_BUSY' });
  await assert.rejects(h.client.request('/api/v2/analyze', { body: {} }), { code: 'ACCOUNT_BUSY' });
  await assert.rejects(h.client.handle('account.logout'), { code: 'ACCOUNT_BUSY' });
  release.resolve();
  assert.equal((await login).account.id, 'account-b');
  assert.equal(await h.client.identity(), 'account-b');
});
test('login profile failure leaves neither the new token nor an old-account public scope', async () => {
  const h = harness(async url => url.endsWith('/token') ? response(newSession()) : failure('UNAVAILABLE', 503));
  installIdentity(h);
  await assert.rejects(h.client.handle('account.login'), { code: 'UNAVAILABLE' });
  assert.equal(h.records.has('active'), false);
  assert.deepEqual(h.views.map(view => view.archbuddyAccountViewV1.account?.id || null), ['account-b', null]);
  await assert.rejects(h.client.identity(), { code: 'LOGIN_REQUIRED' });
});
test('public state writes stay serialized while credential transitions wait for publication', async () => {
  const publishing = deferred(), release = deferred();
  let writes = 0, simultaneous = 0, maximum = 0;
  const h = harness(async () => accountResponse('account-a'));
  h.onPublish(async () => {
    simultaneous++; maximum = Math.max(maximum, simultaneous); writes++;
    if (writes === 1) { publishing.resolve(); await release.promise; }
    simultaneous--;
  });
  const refresh = h.client.refresh(); await publishing.promise;
  const logout = h.client.handle('account.logout');
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(h.records.has('active'), true);
  release.resolve(); await refresh; await logout;
  assert.equal(maximum, 1);
  assert.equal(h.views.at(-1).archbuddyAccountViewV1.account, null);
});
test('unsupported clients and unavailable identity API fail before opening a login window', async () => {
  let fetches = 0;
  const h = harness(async () => { fetches++; return response({}); });
  h.browser.runtime.id = 'a'.repeat(32);
  await assert.rejects(h.client.handle('account.login'), { code: 'AUTH_CLIENT_UNSUPPORTED' });
  h.browser.runtime.id = 'hkbnjlapflleibeodhghbephgpacbhle';
  await assert.rejects(h.client.handle('account.login'), { code: 'AUTH_UNAVAILABLE' });
  assert.equal(fetches, 0);
  assert.equal(h.records.get('active').accountId, 'account-a');
});
test('login timeout ignores a late callback and permits a clean retry', async () => {
  const late = deferred(); let firstUrl; let tokenCalls = 0;
  const h = harness(async url => {
    if (url.endsWith('/token')) { tokenCalls++; return response(newSession()); }
    return accountResponse('account-b');
  }, { authTimeoutMs: 15 });
  installIdentity(h, ({ url }) => { firstUrl = url; return late.promise; });
  await assert.rejects(h.client.handle('account.login'), { code: 'LOGIN_TIMEOUT' });
  const old = new URL(firstUrl);
  late.resolve(old.searchParams.get('redirect_uri') + '?state=' + old.searchParams.get('state') + '&code=' + 'l'.repeat(43));
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(tokenCalls, 0); assert.equal(h.records.get('active').accountId, 'account-a');
  installIdentity(h);
  assert.equal((await h.client.handle('account.login')).account.id, 'account-b');
  assert.equal(tokenCalls, 1);
});

test('response body abort maps the numeric DOMException code to PROCESS_TIMEOUT', async () => {
  const h = harness(async () => ({ ok: true, json: async () => { throw new DOMException('private', 'AbortError'); } }));
  await assert.rejects(h.client.api('/v1/account'), { code: 'PROCESS_TIMEOUT' });
});
test('quota exhaustion remains a definitive error and does not turn into an uncertain charge', async () => {
  const h = harness(async url => url.endsWith('/v1/execute') ? failure('CREDIT_INSUFFICIENT', 409) : accountResponse('account-a'));
  await assert.rejects(h.client.request('/api/v2/analyze', { body: { image: {} } }), { code: 'CREDIT_INSUFFICIENT' });
  assert.equal([...h.records.keys()].some(key => key.startsWith('execution:')), false);
});
for (const code of ['FORBIDDEN', 'POLICY_ACCEPTANCE_REQUIRED', 'RATE_LIMITED']) test(`execution surfaces ${code} for queue control while retaining its request identity`, async () => {
  const h = harness(async url => url.endsWith('/v1/execute') ? failure(code, code === 'RATE_LIMITED' ? 429 : 403) : accountResponse('account-a'));
  await assert.rejects(h.client.request('/api/v2/analyze', { body: { image: {} } }), { code });
  assert.equal([...h.records.keys()].filter(key => key.startsWith('execution:')).length, 1);
});


test('successful login replaces an unconfirmed logout notice with the new account view', async () => {
  const h = harness(async url => {
    if (url.endsWith('/v1/logout')) return failure('FORBIDDEN', 403);
    return url.endsWith('/token') ? response(newSession()) : accountResponse('account-b');
  });
  await h.client.handle('account.logout');
  installIdentity(h);
  const result = await h.client.handle('account.login');
  assert.equal(result.notice, undefined);
  assert.equal(h.views.at(-1).archbuddyAccountViewV1.notice, undefined);
  assert.equal(result.account.id, 'account-b');
});

test('a normal explicit local logout clears a previously unconfirmed notice', async () => {
  const h = harness(async () => failure('FORBIDDEN', 403));
  await h.client.handle('account.logout');
  const result = await h.makeClient().handle('account.logout');
  assert.equal(result.notice, undefined);
  assert.equal(result.remoteLogoutConfirmed, false);
  assert.equal(h.views.at(-1).archbuddyAccountViewV1.notice, undefined);
});

import { ENABLE_UNIFIED_DESCRIBE } from './runtime-config.mjs';
import { ACCOUNT_VIEW_KEY } from './account-storage.mjs';
export const PRODUCT_ORIGIN = 'https://canvas.archbuddy.top';
export const PLUGIN_BASE = '/api/beta/plugin';
const APPROVED_CLIENTS = new Set(['hkbnjlapflleibeodhghbephgpacbhle', 'bdbnnnababglblekgnfpdcmeihjhflok', 'ikkmbpahejfapgnngdckocmfbcbnjedo']);
const AUTH_ERRORS = new Set(['UNAUTHENTICATED', 'UNAUTHORIZED', 'AUTH_REQUIRED', 'AUTH_INVALID', 'SESSION_EXPIRED', 'PLUGIN_SESSION_INVALID']);
const OPERATIONS = Object.freeze({
  '/api/analyze': 'analyze', '/api/v2/analyze': 'analyze-v2', '/api/v3/evaluate': 'evaluate',
  '/api/library/describe': 'describe', '/api/library/embed': 'embed', '/api/library/search': 'search',
});
const fail = (code, message) => Object.assign(new Error(message), { code });
// A browser timeout cannot prove that execution or charging failed.
const EXECUTION_TIMEOUT_MS = 185000;
const LOGOUT_UNCONFIRMED_NOTICE = '已退出本机插件，服务器暂未确认撤销。需要使关联会话失效时，请到画布退出账号。';
const DEFINITIVE_EXECUTION_ERRORS = new Set(['INVALID_INPUT', 'BODY_TOO_LARGE', 'CREDIT_INSUFFICIENT']);
function canonicalJson(value) {
  return JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
}

export function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
export async function authorizationRequest(identity, clientId) {
  const redirectUri = identity.getRedirectURL('archbuddy');
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const state = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  const url = new URL('/connect-plugin', PRODUCT_ORIGIN);
  url.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, code_challenge: challenge, code_challenge_method: 'S256', state });
  return { url: url.href, redirectUri, verifier, state };
}
export function validateCallback(callback, expected) {
  let result;
  try { result = new URL(callback); } catch { throw fail('AUTH_INVALID', '登录未完成，请重新登录'); }
  const redirect = new URL(expected.redirectUri);
  if (result.origin !== redirect.origin || result.pathname !== redirect.pathname || result.hash ||
      result.username || result.password || result.searchParams.getAll('state').length !== 1 ||
      result.searchParams.get('state') !== expected.state || result.searchParams.getAll('code').length !== 1) {
    throw fail('AUTH_INVALID', '登录返回地址校验失败');
  }
  const code = result.searchParams.get('code');
  if (!code || code.length > 512 || result.searchParams.has('error')) throw fail('AUTH_INVALID', '登录授权未完成');
  return code;
}
export function expiryMilliseconds(value) {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? (n < 1e12 ? n * 1000 : n) : Date.parse(value);
}
export async function secretStore(mode, operation) {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('archbuddy-unified-auth-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('sessions');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(fail('ACCOUNT_STORAGE', '无法读取登录状态'));
  });
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('sessions', mode);
      const request = operation(tx.objectStore('sessions'));
      tx.oncomplete = () => resolve(request?.result);
      tx.onerror = tx.onabort = () => reject(fail('ACCOUNT_STORAGE', '无法保存登录状态'));
    });
  } finally { db.close(); }
}
export function createCloudAccountClient({ onSessionChange, fetchImpl = fetch, store = secretStore, browser = chrome, canSwitch = () => true, authTimeoutMs = 300000 }) {
  let busy = 0;
  let transitioning = false;
  let refreshing;
  let mutationQueue = Promise.resolve();
  const mutate = operation => {
    const pending = mutationQueue.catch(() => {}).then(operation);
    mutationQueue = pending;
    return pending;
  };
  const executions = new Map();
  const signedOut = notice => ({ account: null, mode: 'unified', packages: [], ...(notice === LOGOUT_UNCONFIRMED_NOTICE ? { notice } : {}) });
  let lastView = signedOut();
  // All credential mutations and public-scope publications share this queue.
  const publish = async view => {
    await browser.storage.session.set({ [ACCOUNT_VIEW_KEY]: view });
    lastView = view;
    return view;
  };
  const clear = (expectedToken, notice) => mutate(async () => {
    const removed = await store('readwrite', data => {
      const outcome = { result: false };
      const current = data.get('active');
      current.onsuccess = () => {
        if ((current.result?.accessToken ?? null) !== (expectedToken ?? null)) return;
        if (current.result) data.delete('active');
        outcome.result = true;
      };
      return outcome;
    });
    if (!removed) return lastView;
    if (notice === undefined && !expectedToken) {
      const prior = (await browser.storage.session.get(ACCOUNT_VIEW_KEY))?.[ACCOUNT_VIEW_KEY];
      if (prior?.account === null && prior.notice === LOGOUT_UNCONFIRMED_NOTICE) notice = prior.notice;
    }
    try { await onSessionChange(); } finally { await publish(signedOut(notice)); }
    return lastView;
  });
  const assertActive = async session => {
    const current = await store('readonly', data => data.get('active'));
    if (current?.accountId !== session.accountId || current?.accessToken !== session.accessToken) {
      throw fail('ACCOUNT_CHANGED', '账号已切换，原操作结果不再显示');
    }
  };
  const credentials = async () => {
    const session = await store('readonly', data => data.get('active'));
    if (typeof session?.accessToken !== 'string' || !session.accessToken ||
        typeof session.accountId !== 'string' || !session.accountId ||
        !Number.isFinite(session.expiresAt) || session.expiresAt <= Date.now()) {
      await clear(session?.accessToken);
      throw fail('LOGIN_REQUIRED', '请先登录 ArchBuddy，官网、画布和插件共用此账号');
    }
    return session;
  };
  const transport = async (path, { method = 'GET', body, token, binary = false, timeoutMs = 135000 } = {}) => {
    try {
      const response = await fetchImpl(PRODUCT_ORIGIN + PLUGIN_BASE + path, {
        method, credentials: 'omit', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
        headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (response.ok && binary) return await response.blob();
      const envelope = await response.json().catch(reason => {
        if (['AbortError', 'TimeoutError'].includes(reason?.name)) throw reason;
        return null;
      });
      if (!response.ok || !envelope || !Object.hasOwn(envelope, 'data')) {
        const code = typeof envelope?.error?.code === 'string' ? envelope.error.code
          : response.status === 401 ? 'AUTH_INVALID' : 'SERVICE_UNAVAILABLE';
        throw fail(code, typeof envelope?.error?.message === 'string' ? envelope.error.message
          : 'ArchBuddy 服务暂时不可用，请稍后重试');
      }
      return envelope.data;
    } catch (reason) {
      // DOMException.code is numeric (AbortError = 20), not an API error code.
      if (typeof reason?.code === 'string') throw reason;
      const timedOut = ['AbortError', 'TimeoutError'].includes(reason?.name);
      throw fail(timedOut ? 'PROCESS_TIMEOUT' : 'NETWORK_UNAVAILABLE', timedOut
        ? '账号服务响应超时，请稍后重试' : '无法连接账号服务，请检查网络后重试');
    }
  };
  const authenticated = async (path, options = {}, allowTransition = false) => {
    if (transitioning && !allowTransition) throw fail('ACCOUNT_BUSY', '登录状态正在切换');
    busy++;
    let session;
    try {
      session = await credentials();
      if (options.expectedAccountId && session.accountId !== options.expectedAccountId) throw fail('ACCOUNT_CHANGED', '账号已切换，原操作已暂停');
      if (options.expectedToken && session.accessToken !== options.expectedToken) throw fail('ACCOUNT_CHANGED', '登录状态已变化');
      const result = await transport(path, { ...options, token: session.accessToken });
      await assertActive(session);
      return result;
    } catch (error) {
      if (AUTH_ERRORS.has(error.code)) {
        if (session) await clear(session.accessToken);
        throw fail('LOGIN_REQUIRED', '登录已失效，请重新登录');
      }
      throw error;
    } finally { busy--; }
  };
  const refresh = async (allowTransition = false) => {
    if (transitioning && !allowTransition) throw fail('ACCOUNT_BUSY', '登录状态正在切换');
    if (!refreshing) refreshing = (async () => {
      let session;
      try { session = await credentials(); } catch (error) {
        if (error.code === 'LOGIN_REQUIRED') return lastView;
        throw error;
      }
      const data = await authenticated('/v1/account', { expectedAccountId: session.accountId, expectedToken: session.accessToken, timeoutMs: 25000 }, allowTransition);
      if (data.product !== 'archbuddy' || data.accountId !== session.accountId) { await clear(session.accessToken); throw fail('AUTH_INVALID', '账号信息不匹配'); }
      return mutate(async () => {
        await assertActive(session);
        const view = await publish({ account: {
          id: data.accountId, product: 'archbuddy', accountId: data.accountId, workspaceId: data.workspaceId,
          status: data.status, displayName: data.displayName,
          credits: { availableUnits: data.credits?.availableUnits, reservedUnits: data.credits?.reservedUnits },
          entitlements: { downloads: data.entitlements?.downloads, deepReverse: data.entitlements?.deepReverse },
          library: { count: data.library?.count },
        }, mode: 'unified', packages: [] });
        await assertActive(session);
        return view;
      });
    })().finally(() => { refreshing = null; });
    return refreshing;
  };
  return {
    refresh: () => refresh(),
    async identity() { if (transitioning) throw fail('ACCOUNT_BUSY', '登录状态正在切换'); return (await credentials()).accountId; },
    api: authenticated,
    async request(path, options = {}) {
      if (path === '/api/events') return { accepted: false };
      const operation = OPERATIONS[path];
      if (!operation) throw fail('INVALID_INPUT', '不支持的统一服务操作');
      if (operation === 'describe' && !ENABLE_UNIFIED_DESCRIBE) throw fail('POLICY_PENDING', '简析权益规则正在确认，已保留图片；下载和整理仍可使用');
      if (transitioning) throw fail('ACCOUNT_BUSY', '登录状态正在切换');
      const payload = { ...options.body };
      // Evaluation's UI attempt id is not part of the paid input. A retry must
      // use the original id both in the envelope and in the executor payload.
      if (operation === 'evaluate') delete payload.requestId;
      const serialized = canonicalJson({ operation, payload });
      if (new TextEncoder().encode(serialized).length + 128 > 900 * 1024) throw fail('IMAGE_TOO_LARGE', '参考图仍过大，请缩小图片后重试；当前编辑内容会保留');
      const session = await credentials();
      if (options.expectedAccountId && session.accountId !== options.expectedAccountId) throw fail('ACCOUNT_CHANGED', '账号已切换，原操作已暂停');
      const fingerprint = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(serialized))));
      const key = 'execution:' + session.accountId + ':' + fingerprint;
      if (executions.has(key)) return executions.get(key);
      const execute = (async () => {
        // Persist before dispatch. The journal survives service-worker restarts,
        // logout and reconnect, and contains no images, prompts or credentials.
        const prior = await store('readonly', data => data.get(key));
        const requestId = prior?.requestId || options.requestId || crypto.randomUUID();
        if (!prior) await store('readwrite', data => data.put({ requestId }, key));
        const wirePayload = JSON.parse(serialized).payload;
        if (operation === 'evaluate') wirePayload.requestId = requestId;
        try {
          const result = await authenticated('/v1/execute', { method: 'POST', expectedAccountId: session.accountId,
            expectedToken: session.accessToken, timeoutMs: EXECUTION_TIMEOUT_MS, body: { operation, requestId, payload: wirePayload } });
          await store('readwrite', data => data.delete(key));
          await assertActive(session);
          return result;
        } catch (error) {
          // Only definitive rejection releases the local attempt. All network,
          // timeout, server and in-progress failures keep the same request id.
          if (DEFINITIVE_EXECUTION_ERRORS.has(error.code)) {
            await store('readwrite', data => data.delete(key));
            throw error;
          }
          if (['ACCOUNT_CHANGED', 'LOGIN_REQUIRED', 'FORBIDDEN', 'POLICY_ACCEPTANCE_REQUIRED', 'RATE_LIMITED', 'GENERATION_LIMIT_REACHED', 'SCHEMA_MISMATCH'].includes(error.code) || AUTH_ERRORS.has(error.code)) throw error;
          throw fail('EXECUTION_UNCONFIRMED', '这次操作的结果仍在确认中。再次点击会查询同一次操作，不会重复扣次；当前内容已保留。');
        } finally { void refresh().catch(() => {}); }
      })();
      executions.set(key, execute);
      try { return await execute; } finally { executions.delete(key); }
    },
    async handle(type, payload = {}) {
      if (type === 'account.get') return { ok: true, ...await refresh() };
      if (type === 'account.library.list') return { ok: true, ...await authenticated('/v1/library') };
      if (type === 'account.library.get') return { ok: true, item: await authenticated('/v1/library/' + encodeURIComponent(payload.id)) };
      if (type === 'account.library.put') return { ok: true, item: await authenticated('/v1/library/' + encodeURIComponent(payload.id), {
        method: 'PUT', body: payload.item, expectedAccountId: payload.expectedAccountId }) };
      if (type === 'account.library.canvas') return { ok: true, ...await authenticated('/v1/library/' + encodeURIComponent(payload.id) + '/canvas', { method: 'POST', body: {}, expectedAccountId: payload.expectedAccountId }) };
      if (type === 'account.library.delete') return { ok: true, ...await authenticated('/v1/library/' + encodeURIComponent(payload.id), { method: 'DELETE' }) };
      if (!['account.login', 'account.logout'].includes(type)) throw fail('INVALID_INPUT', '未知账号操作');
      if (busy || transitioning || !canSwitch()) throw fail('ACCOUNT_BUSY', '请等待当前操作完成再切换账号');
      transitioning = true;
      try {
        await refreshing?.catch(() => {});
        if (type === 'account.logout') {
          const session = await store('readonly', data => data.get('active'));
          let notice;
          if (session?.accessToken) {
            try { await transport('/v1/logout', { method: 'POST', body: {}, token: session.accessToken, timeoutMs: 15000 }); }
            catch (error) {
              if (!AUTH_ERRORS.has(error.code)) notice = LOGOUT_UNCONFIRMED_NOTICE;
            }
          }
          const view = await clear(session?.accessToken, notice ?? null);
          return { ok: true, ...view, remoteLogoutConfirmed: Boolean(session?.accessToken) && !notice };
        }
        if (!APPROVED_CLIENTS.has(browser.runtime?.id)) throw fail('AUTH_CLIENT_UNSUPPORTED', '请加载正式商店版或指定测试包，再登录 ArchBuddy。');
        if (typeof browser.identity?.getRedirectURL !== 'function' || typeof browser.identity?.launchWebAuthFlow !== 'function') {
          throw fail('AUTH_UNAVAILABLE', '浏览器未提供插件登录接口，请重新加载支持 identity 权限的最新插件。');
        }
        const pending = await authorizationRequest(browser.identity, browser.runtime.id);
        if (pending.redirectUri !== `https://${browser.runtime.id}.chromiumapp.org/archbuddy`) throw fail('AUTH_UNAVAILABLE', '浏览器未提供有效的插件登录回调地址。');
        let timer;
        let callback;
        try {
          // Timing out this await never accepts a late callback or writes its token.
          callback = await Promise.race([
            Promise.resolve().then(() => browser.identity.launchWebAuthFlow({ url: pending.url, interactive: true })),
            new Promise((_resolve, reject) => { timer = setTimeout(() => reject(fail('LOGIN_TIMEOUT', '登录等待超时。请关闭之前的登录窗口，再点击登录重试。')), authTimeoutMs); }),
          ]);
        } catch (reason) {
          if (reason?.code === 'LOGIN_TIMEOUT') throw reason;
          throw fail('LOGIN_CANCELLED', '登录未完成，请关闭之前的登录窗口后重试；已有登录状态不会改变。');
        } finally { clearTimeout(timer); }
        const code = validateCallback(callback, pending);
        const result = await transport('/token', { method: 'POST', body: {
          clientId: browser.runtime.id, redirectUri: pending.redirectUri, code, codeVerifier: pending.verifier,
        } });
        const expiresAt = expiryMilliseconds(result.expiresAt);
        if (typeof result.accessToken !== 'string' || !result.accessToken || typeof result.accountId !== 'string' || !(expiresAt > Date.now())) throw fail('AUTH_INVALID', '登录响应无效');
        const nextSession = { accessToken: result.accessToken, expiresAt, accountId: result.accountId };
        try {
          await mutate(async () => {
            await onSessionChange();
            await store('readwrite', data => data.put(nextSession, 'active'));
            // Publish the new storage scope while switching remains locked.
            // Profile latency must never pair a new token with the old user's cache.
            await publish({ ...signedOut(), account: { id: result.accountId, accountId: result.accountId, product: 'archbuddy' } });
          });
          const view = await refresh(true);
          await assertActive(nextSession);
          return { ok: true, ...view };
        } catch (error) {
          await clear(nextSession.accessToken);
          throw error;
        }
      } finally { transitioning = false; }
    },
  };
}

// 登录凭据只保存在扩展 origin 的 IndexedDB；不进入内容脚本可读的 storage.local。
import { BACKEND_MODE } from './runtime-config.mjs';

export const LOCAL_ACCOUNTS = BACKEND_MODE === 'local';
const PUBLIC_VIEW = 'archbuddyAccountViewV1';
const AUTH_ERRORS = new Set(['UNAUTHORIZED', 'AUTH_REQUIRED', 'AUTH_INVALID', 'SESSION_EXPIRED']);
function accountError(code, message) { return Object.assign(new Error(message), { code }); }

async function sessionStore(mode, operation) {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('archbuddy-account-local-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('session');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(accountError('ACCOUNT_STORAGE', '无法读取本地登录状态'));
  });
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('session', mode);
      const request = operation(tx.objectStore('session'));
      tx.oncomplete = () => resolve(request?.result);
      tx.onerror = tx.onabort = () => reject(accountError('ACCOUNT_STORAGE', '无法保存本地登录状态'));
    });
  } finally { db.close(); }
}

export function createAccountClient({ fetchBackend, onSessionChange }) {
  let busy = 0;
  let transitioning = false;
  let refreshQueue = Promise.resolve();
  const signedOut = () => ({ account: null, mode: LOCAL_ACCOUNTS ? 'local-demo' : 'cloud-legacy', packages: [] });
  const publish = async view => {
    await chrome.storage.session.set({ [PUBLIC_VIEW]: view });
    return view;
  };
  const clear = async () => {
    await sessionStore('readwrite', store => store.delete('active'));
    await onSessionChange();
    await publish(signedOut());
  };
  const credentials = async () => {
    const session = await sessionStore('readonly', store => store.get('active'));
    if (!session?.token || session.expiresAt <= Date.now()) {
      if (session) await clear();
      throw accountError('LOGIN_REQUIRED', '请先登录，再使用 AI 功能');
    }
    return session;
  };
  const refresh = () => {
    refreshQueue = refreshQueue.catch(() => {}).then(async () => {
      if (!LOCAL_ACCOUNTS) return signedOut();
      let session;
      try { session = await credentials(); }
      catch (error) { if (error.code === 'LOGIN_REQUIRED') return publish(signedOut()); throw error; }
      try {
        const view = await fetchBackend('/api/account', { token: session.token });
        const active = await sessionStore('readonly', store => store.get('active'));
        if (active?.token !== session.token) return signedOut();
        return publish({ ...view, mode: 'local-demo' });
      } catch (error) {
        if (AUTH_ERRORS.has(error.code)) {
          const active = await sessionStore('readonly', store => store.get('active'));
          if (active?.token === session.token) await clear();
          return signedOut();
        }
        throw error;
      }
    });
    return refreshQueue;
  };
  return {
    refresh,
    async identity() {
      if (transitioning) throw accountError('ACCOUNT_BUSY', '登录状态正在切换，请稍后再试');
      return LOCAL_ACCOUNTS ? (await credentials()).accountId : null;
    },
    async request(path, options = {}) {
      if (transitioning) throw accountError('ACCOUNT_BUSY', '登录状态正在切换，请稍后再试');
      busy++;
      try {
        const session = await credentials();
        if (options.expectedAccountId && session.accountId !== options.expectedAccountId) {
          throw accountError('ACCOUNT_CHANGED', '账号已切换，原来的 AI 队列已暂停');
        }
        return await fetchBackend(path, { ...options, token: session.token });
      } catch (error) {
        if (AUTH_ERRORS.has(error.code)) { await clear(); throw accountError('LOGIN_REQUIRED', '登录已失效，请重新登录'); }
        throw error;
      } finally { busy--; void refresh().catch(() => {}); }
    },
    async handle(type, payload = {}) {
      if (type === 'account.get') return { ok: true, ...await refresh() };
      if (!LOCAL_ACCOUNTS) throw accountError('LOCAL_ONLY', '账号与积分功能请在本地开发版中体验');
      if (type === 'account.code') return { ok: true, ...await fetchBackend('/api/auth/code', { method: 'POST', body: { phone: payload.phone } }) };
      if (type === 'account.bonus' || type === 'account.order') {
        const path = type === 'account.bonus' ? '/api/account/bonus' : '/api/account/orders';
        const result = await this.request(path, { method: 'POST', body: payload });
        await refresh();
        return { ok: true, ...result };
      }
      if (!['account.login', 'account.logout'].includes(type)) throw accountError('INVALID_INPUT', '未知账号操作');
      if (busy || transitioning) throw accountError('ACCOUNT_BUSY', '请等待当前 AI 请求完成，再切换或退出账号');
      transitioning = true;
      try {
        await refreshQueue.catch(() => {});
        if (type === 'account.login') {
          const previous = await sessionStore('readonly', store => store.get('active'));
          const result = await fetchBackend('/api/auth/login', { method: 'POST', body: {
            phone: payload.phone, challengeId: payload.challengeId, code: payload.code,
          } });
          if (!result.token || !result.account?.id || !Number.isFinite(Number(result.expiresAt))) throw accountError('AUTH_INVALID', '登录响应无效');
          await onSessionChange();
          await sessionStore('readwrite', store => store.put({
            token: result.token, expiresAt: Number(result.expiresAt), accountId: result.account.id,
          }, 'active'));
          if (previous?.token) await fetchBackend('/api/auth/logout', { method: 'POST', body: {}, token: previous.token }).catch(() => {});
          const view = await refresh();
          return { ok: true, ...view, expiresAt: result.expiresAt };
        }
        const session = await sessionStore('readonly', store => store.get('active'));
        if (session?.token) {
          try { await fetchBackend('/api/auth/logout', { method: 'POST', body: {}, token: session.token }); }
          catch (error) { if (!AUTH_ERRORS.has(error.code)) throw error; }
        }
        await clear();
        return { ok: true, ...signedOut() };
      } finally { transitioning = false; }
    },
  };
}

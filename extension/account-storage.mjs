import { BACKEND_MODE } from './runtime-config.mjs';
import { STORAGE } from './shared.mjs';

export const ACCOUNT_VIEW_KEY = 'archbuddyAccountViewV1';
// 公共采集开关保留；素材、提示词、分类和搜索缓存属于当前登录账户。
const PUBLIC_KEYS = new Set([STORAGE.captureEnabled, STORAGE.analyticsConsent]);
const PRIVATE_KEYS = new Set(Object.values(STORAGE).filter(key => !PUBLIC_KEYS.has(key)));
export async function currentScope() {
  if (BACKEND_MODE === 'local') return 'local-demo';
  const data = await chrome.storage.session.get(ACCOUNT_VIEW_KEY);
  return data[ACCOUNT_VIEW_KEY]?.account?.id || 'signed-out';
}
const pageScope = typeof document === 'undefined' ? null : currentScope();
export async function contextScope() {
  const scope = await currentScope();
  if (pageScope && scope !== await pageScope) throw Object.assign(new Error('账号已切换，请刷新页面'), { code: 'ACCOUNT_CHANGED' });
  return scope;
}
export function scopedKey(key, scope) {
  return BACKEND_MODE === 'local' || !PRIVATE_KEYS.has(key) ? key : `archbuddy:account:${scope}:${key}`;
}
async function transform(keys) {
  const scope = await contextScope();
  const names = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys || {});
  return { scope, names, mapped: names.map(key => scopedKey(key, scope)) };
}
export const accountStorage = {
  async get(keys) {
    const { scope, names, mapped } = await transform(keys);
    const values = await chrome.storage.local.get(mapped);
    if (scope !== await currentScope()) throw Object.assign(new Error('账号已切换，请重新打开操作'), { code: 'ACCOUNT_CHANGED' });
    return Object.fromEntries(names.filter((key, index) => Object.hasOwn(values, mapped[index]) || (keys && !Array.isArray(keys) && typeof keys === 'object'))
      .map(key => [key, values[scopedKey(key, scope)] ?? keys?.[key]]));
  },
  async set(values) {
    const scope = await contextScope();
    return chrome.storage.local.set(Object.fromEntries(Object.entries(values).map(([key, value]) => [scopedKey(key, scope), value])));
  },
  async remove(keys) {
    const { mapped } = await transform(keys);
    return chrome.storage.local.remove(mapped);
  },
};
export async function scopeChanges(changes, area) {
  if (area !== 'local' || BACKEND_MODE === 'local') return changes;
  const scope = await currentScope();
  const result = {};
  for (const key of Object.values(STORAGE)) {
    const mapped = scopedKey(key, scope);
    if (changes[mapped]) result[key] = changes[mapped];
  }
  return result;
}
export function watchScopeReload() {
  if (BACKEND_MODE === 'local') return;
  chrome.storage.onChanged.addListener((changes, area) => {
    const change = area === 'session' && changes[ACCOUNT_VIEW_KEY];
    if (change && (change.oldValue?.account?.id || null) !== (change.newValue?.account?.id || null)) {
      // 立即移除旧账户的页面内容，再重新读取新账户分区。
      document.body.replaceChildren();
      location.reload();
    }
  });
}

// 与文件夹导入共用浏览器锁；只包本地集合读改写，网络请求必须在锁外。
let libraryWrites = Promise.resolve();
export function withLibraryWriteLock(operation) {
  if (globalThis.navigator?.locks?.request) return navigator.locks.request('archbuddy-folder-import', operation);
  const pending = libraryWrites.catch(() => {}).then(operation);
  libraryWrites = pending;
  return pending;
}

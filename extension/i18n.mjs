// 全插件共享界面语言；只翻译显式标记的界面，不改用户内容或账户分区。
export const LANGUAGE_KEY = 'archbuddyUiLanguageV1';
let language = 'zh';
let initialization;
const listeners = new Set();
const originals = new WeakMap();
const ATTRIBUTES = ['placeholder', 'title', 'aria-label', 'alt'];
const selector = ['[data-i18n-en]', ...ATTRIBUTES.map(name => `[data-i18n-${name}-en]`)].join(',');
const normalize = value => value === 'en' ? 'en' : 'zh';
export const getLanguage = () => language;
function interpolate(value, params) {
  return String(value ?? '').replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (match, key) => Object.hasOwn(params, key) ? String(params[key]) : match);
}
export function t(zh, en, params = {}) { return interpolate(language === 'en' ? en : zh, params); }
export function formatNumber(value, options = {}) {
  return typeof value === 'number' && Number.isFinite(value)
    ? new Intl.NumberFormat(language === 'en' ? 'en-US' : 'zh-CN', { maximumFractionDigits: 2, ...options }).format(value) : '—';
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
}
export function htmlText(zh, en, params = {}) {
  const a = interpolate(zh, params), b = interpolate(en, params);
  return `<span data-i18n-zh="${escapeHtml(a)}" data-i18n-en="${escapeHtml(b)}">${escapeHtml(language === 'en' ? b : a)}</span>`;
}
export function setText(element, zh, en, params = {}) {
  if (!element) return element;
  element.setAttribute('data-i18n-zh', interpolate(zh, params));
  element.setAttribute('data-i18n-en', interpolate(en, params));
  translateElement(element);
  return element;
}
export function setLocalizedAttribute(element, name, zh, en, params = {}) {
  if (!element || !ATTRIBUTES.includes(name)) return;
  element.setAttribute(`data-i18n-${name}-zh`, interpolate(zh, params));
  element.setAttribute(`data-i18n-${name}-en`, interpolate(en, params));
  translateElement(element);
}
function translateElement(element) {
  if (element.closest?.('[data-i18n-user], [contenteditable="true"]')) return;
  let saved = originals.get(element);
  if (!saved) { saved = {}; originals.set(element, saved); }
  if (element.hasAttribute('data-i18n-en') && !['INPUT','TEXTAREA'].includes(element.tagName)) {
    if (!Object.hasOwn(saved, 'text')) saved.text = element.textContent;
    const text = language === 'en' ? element.getAttribute('data-i18n-en') : element.getAttribute('data-i18n-zh') ?? saved.text;
    if (element.textContent !== text) element.textContent = text;
  }
  for (const name of ATTRIBUTES) {
    if (!element.hasAttribute(`data-i18n-${name}-en`)) continue;
    if (!Object.hasOwn(saved, name)) saved[name] = element.getAttribute(name) ?? '';
    const text = language === 'en' ? element.getAttribute(`data-i18n-${name}-en`) : element.getAttribute(`data-i18n-${name}-zh`) ?? saved[name];
    if (element.getAttribute(name) !== text) element.setAttribute(name, text);
  }
}
export function translatePage(root = globalThis.document) {
  if (!root) return;
  if (root.matches?.(selector)) translateElement(root);
  for (const element of root.querySelectorAll?.(selector) ?? []) translateElement(element);
}
function applyLanguage(value, force = false) {
  const next = normalize(value), changed = next !== language;
  language = next;
  if (globalThis.document) { document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN'; translatePage(); }
  if (changed || force) for (const listener of listeners) listener(language);
}
export function onLanguageChange(listener) { listeners.add(listener); return () => listeners.delete(listener); }
export async function initI18n() {
  if (!initialization) initialization = (async () => {
    let saved, preferenceRevision = 0;
    globalThis.chrome?.storage?.onChanged?.addListener((changes, area) => {
      if (area === 'local' && changes[LANGUAGE_KEY]) {
        preferenceRevision += 1;
        applyLanguage(changes[LANGUAGE_KEY].newValue);
      }
    });
    try { saved = await globalThis.chrome?.storage?.local?.get(LANGUAGE_KEY); } catch { /* A temporary storage failure keeps Chinese usable. */ }
    // A newer change from another open view wins over an older storage snapshot.
    if (preferenceRevision === 0) applyLanguage(saved?.[LANGUAGE_KEY], true);
    if (globalThis.document && globalThis.MutationObserver) {
      new MutationObserver(records => {
        const roots = new Set();
        for (const record of records) for (const node of record.addedNodes) if (node.nodeType === 1) roots.add(node);
        for (const root of roots) translatePage(root);
      }).observe(document.documentElement, { childList: true, subtree: true });
    }
    return language;
  })();
  return initialization;
}
export async function setLanguage(value) {
  await initI18n();
  const prior = language, next = normalize(value);
  applyLanguage(next);
  try { await globalThis.chrome?.storage?.local?.set({ [LANGUAGE_KEY]: next }); }
  catch (error) { applyLanguage(prior); throw error; }
  return next;
}
export function mountLanguageToggle(container) {
  if (!container) return null;
  const existing = container.querySelector('.locale-toggle');
  if (existing) return existing;
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'locale-toggle';
  const render = () => {
    button.textContent = language === 'en' ? '中' : 'EN';
    button.setAttribute('aria-label', language === 'en' ? '切换为中文' : 'Switch to English');
    button.title = language === 'en' ? '切换为中文' : 'Switch to English';
  };
  button.addEventListener('click', async () => {
    button.disabled = true;
    try { await setLanguage(language === 'en' ? 'zh' : 'en'); }
    catch { button.title = t('语言设置暂时无法保存，请重试', 'Could not save the language. Try again.'); }
    finally { button.disabled = false; }
  });
  render(); onLanguageChange(render); container.append(button); void initI18n();
  return button;
}

const ERROR_TRANSLATIONS = {
  ACCOUNT_BUSY: 'Wait for the current action to finish, then try again.',
  ACCOUNT_CHANGED: 'Your account changed. Reopen this action.',
  LOGIN_REQUIRED: 'Sign in to ArchBuddy to continue.',
  UNAUTHENTICATED: 'Your session expired. Sign in again.',
  UNAUTHORIZED: 'Sign in to continue.',
  FORBIDDEN: 'This action is not available for this account.',
  POLICY_ACCEPTANCE_REQUIRED: 'Review and accept the current trial rules on the website first.',
  CREDIT_INSUFFICIENT: 'You do not have enough balance or remaining analyses for this action.',
  RATE_LIMITED: 'Too many requests. Wait a moment and try again.',
  GENERATION_LIMIT_REACHED: 'The service has reached its current usage limit. Try again later.',
  EXECUTION_UNCONFIRMED: 'The result is still being checked. Try again to check the same request without a duplicate charge.',
  NETWORK_UNAVAILABLE: 'Could not connect. Check your network and try again.',
  PROCESS_TIMEOUT: 'The service took too long to respond. Please try again.',
  IMAGE_TOO_LARGE: 'This image is too large. Reduce its size and try again.',
  NOT_FOUND: 'This item is no longer available.',
  SCHEMA_MISMATCH: 'The service is being updated. Please try again shortly.',
};
export function localizedError(value, fallbackZh = '操作未完成，请稍后重试', fallbackEn = 'The action did not complete. Please try again.') {
  const zh = typeof value === 'string' ? value : value?.zh || value?.message || value?.error || fallbackZh;
  const en = value?.en || ERROR_TRANSLATIONS[value?.code] || (/[^\u0000-\u007f]/.test(zh) ? fallbackEn : zh);
  return Object.assign(new Error(t(zh, en)), { zh, en, code: value?.code });
}

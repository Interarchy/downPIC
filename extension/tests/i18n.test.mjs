import test from 'node:test';
import assert from 'node:assert/strict';

const storage = {}, listeners = [];
globalThis.chrome = { storage: {
  local: { get: async key => ({ [key]: storage[key] }), set: async values => {
    const changes = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { oldValue: storage[key], newValue: value }]));
    Object.assign(storage, values);
    for (const listener of listeners) listener(changes, 'local');
  } }, onChanged: { addListener: listener => listeners.push(listener) },
} };
const first = await import('../i18n.mjs?first-view');
const second = await import('../i18n.mjs?second-view');
await Promise.all([first.initI18n(), second.initI18n()]);

test('one language setting updates already-open views without account keys', async () => {
  await first.setLanguage('en');
  assert.equal(first.getLanguage(), 'en'); assert.equal(second.getLanguage(), 'en');
  assert.equal(second.t('简析剩余', 'Brief analyses'), 'Brief analyses');
  await second.setLanguage('zh');
  assert.equal(first.t('深度反推剩余', 'Deep analyses'), '深度反推剩余');
  assert.deepEqual(Object.keys(storage), ['archbuddyUiLanguageV1']);
});
test('UI formatting preserves real zero and does not invent an unloaded balance', () => {
  assert.equal(first.formatNumber(0), '0');
  assert.equal(first.formatNumber(undefined), '—');
  assert.equal(first.formatNumber(null), '—');
  assert.equal(first.formatNumber(31), '31');
});
test('dynamic translations escape HTML without modifying interpolation content', async () => {
  await first.setLanguage('en');
  assert.equal(first.t('当前 {name}', 'Current {name}', { name: '项目 {not_a_variable}' }), 'Current 项目 {not_a_variable}');
  const html = first.htmlText('删除 {name}', 'Delete {name}', { name: '<img src=x onerror=alert(1)>' });
  assert.equal(html.includes('<img'), false);
  assert.ok(html.includes('&lt;img'));
  assert.ok(html.includes('data-i18n-zh='));
  assert.ok(html.includes('data-i18n-en='));
});
test('a failed preference save restores the active language', async () => {
  const original = chrome.storage.local.set;
  chrome.storage.local.set = async () => { throw new Error('test-only storage failure'); };
  await assert.rejects(first.setLanguage('zh'), /storage failure/);
  assert.equal(first.getLanguage(), 'en');
  chrome.storage.local.set = original;
});

test('common server errors retain both languages and a useful entitlement explanation', async () => {
  await first.setLanguage('en');
  const error = first.localizedError({ code: 'CREDIT_INSUFFICIENT', message: '可用次数不足' });
  assert.match(error.message, /remaining analyses/);
  assert.equal(error.zh, '可用次数不足');
  await first.setLanguage('zh');
  assert.equal(first.localizedError(error).message, '可用次数不足');
});

test('a language change during initialization wins over an older saved snapshot', async () => {
  const original = chrome.storage.local.get;
  let finishRead;
  chrome.storage.local.get = () => new Promise(resolve => { finishRead = resolve; });
  try {
    const openingView = await import('../i18n.mjs?opening-view');
    const opening = openingView.initI18n();
    await first.setLanguage('en');
    finishRead({ [first.LANGUAGE_KEY]: 'zh' });
    await opening;
    assert.equal(openingView.getLanguage(), 'en');
  } finally { chrome.storage.local.get = original; }
});
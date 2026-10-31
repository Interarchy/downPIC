import test from 'node:test';
import assert from 'node:assert/strict';

const calls = [];
const session = {};
const broadcasts = [];
const webSender = { id: 'test-extension', url: 'https://example.com/page', tab: { id: 7, windowId: 2, url: 'https://example.com/page', title: 'Example' } };
let messageListener;

globalThis.chrome = {
  alarms: { onAlarm: { addListener: () => {} }, create: async () => {} },
  storage: {
    onChanged: { addListener: () => {} },
    session: {
      setAccessLevel: () => undefined,
      set: async values => Object.assign(session, values),
      get: async keys => Object.fromEntries((typeof keys === 'string' ? [keys] : keys || []).filter(key => Object.hasOwn(session, key)).map(key => [key, session[key]])),
      remove: async () => {},
    },
    local: {
      get: async () => ({ capture_enabled: true }),
      set: async () => {},
    },
  },
  sidePanel: {
    setPanelBehavior: async behavior => calls.push(['panel-behavior', behavior]),
    open: async options => calls.push(['panel-open', options]),
  },
  runtime: {
    id: 'test-extension',
    getURL: path => 'chrome-extension://test-extension/' + path,
    onInstalled: { addListener: () => {} },
    onMessage: { addListener: listener => { messageListener = listener; } },
    sendMessage: async message => broadcasts.push(message),
  },
  scripting: {
    executeScript: async options => calls.push(['script', options]),
    insertCSS: async options => calls.push(['css', options]),
  },
  tabs: {
    sendMessage: async (tabId, message) => {
      calls.push(['tab-message', { tabId, message }]);
      return null;
    },
    captureVisibleTab: async () => {
      calls.push(['capture']);
      throw new Error('test stops before bitmap work');
    },
  },
  downloads: {
    onChanged: { addListener: () => {} },
    onErased: { addListener: () => {} },
    download: async () => 1,
    show: async downloadId => calls.push(['download-show', downloadId]),
  },
};

await import(`../background.mjs?test=${Date.now()}`);
await Promise.resolve();

test('点击扩展图标保留弹窗，弹窗开启后可注入当前页工具条', async () => {
  assert.deepEqual(calls[0], ['panel-behavior', { openPanelOnActionClick: false }]);
  calls.length = 0;
  const response = new Promise(resolve => {
    messageListener({ type: 'page.activate', tabId: 7 }, {}, resolve);
  });
  assert.deepEqual(await response, { ok: true });
  assert.deepEqual(calls.map(call => call[0]), ['css', 'script']);
  assert.equal(calls[0][1].target.tabId, 7);
});

test('网页图片按钮先打开侧栏，截图回退前重新读取页面几何信息', async () => {
  calls.length = 0;
  const response = new Promise(resolve => {
    const asyncResponse = messageListener(
      {
        type: 'image.select',
        payload: {
          viewportWidth: 1000,
          viewportHeight: 800,
          rect: { left: 10, top: 10, right: 500, bottom: 400 },
        },
      },
      webSender,
      resolve,
    );
    assert.equal(asyncResponse, true);
    // 不能移到任意 await 后；这正是浏览器用户手势的时限边界。
    assert.deepEqual(calls[0], ['panel-open', { tabId: 7 }]);
  });

  const result = await response;
  assert.deepEqual(calls.slice(0, 3).map(call => call[0]), ['panel-open', 'tab-message', 'capture']);
  assert.equal(result.ok, false);
  assert.match(result.error, /test stops before bitmap work/);
});

test('下载记录可以通过 Chrome 下载 API 在文件夹中显示', async () => {
  calls.length = 0;
  const response = new Promise(resolve => {
    messageListener({ type: 'download.show', payload: { downloadId: 21 } }, {}, resolve);
  });
  assert.deepEqual(await response, { ok: true });
  assert.deepEqual(calls, [['download-show', 21]]);
});


test('侧栏拒绝打开会明确返回错误，不能读取图片或误报成功', async () => {
  calls.length = 0;
  const original = chrome.sidePanel.open;
  chrome.sidePanel.open = () => Promise.reject(new Error('requires a user gesture'));
  try {
    const result = await new Promise(resolve => messageListener({ type: 'image.select', payload: {} }, webSender, resolve));
    assert.equal(result.ok, false);
    assert.equal(result.code, 'SIDEPANEL_OPEN_FAILED');
    assert.match(result.error, /侧栏未能打开/);
    assert.deepEqual(calls, []);
  } finally { chrome.sidePanel.open = original; }
});

test('不支持侧栏或其他扩展的消息无法读取图片', async () => {
  const original = chrome.sidePanel.open;
  chrome.sidePanel.open = undefined;
  try {
    const result = await new Promise(resolve => messageListener({ type: 'image.select' }, webSender, resolve));
    assert.equal(result.code, 'SIDEPANEL_UNAVAILABLE');
  } finally { chrome.sidePanel.open = original; }
  for (const sender of [{ ...webSender, id: 'other-extension' }, { ...webSender, url: 'chrome-extension://test-extension/library.html' }, { id: 'test-extension' }]) {
    calls.length = 0;
    const result = await new Promise(resolve => messageListener({ type: 'image.select' }, sender, resolve));
    assert.equal(result.code, 'FORBIDDEN');
    assert.deepEqual(calls, []);
  }
});

test('取图成功只保存待接收图片并通知侧栏，不调用模型或修改权益', async () => {
  const original = globalThis.fetch;
  const requests = [];
  broadcasts.length = 0;
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return new Response(new Blob(['synthetic-image'], { type: 'image/png' }));
  };
  try {
    const result = await new Promise(resolve => messageListener({ type: 'image.select', payload: { sourceUrl: 'https://example.com/reference.png', title: 'Synthetic reference' } }, webSender, resolve));
    assert.deepEqual(result, { ok: true });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, 'https://example.com/reference.png');
    assert.equal(requests[0].options.credentials, 'omit');
    assert.ok(requests[0].options.signal instanceof AbortSignal);
    const selection = Object.values(session).find(value => value?.pendingCapture);
    assert.ok(selection.selectionId);
    assert.equal(selection.displayName, 'Synthetic reference');
    assert.match(selection.imagePayload, /^data:image\/png;base64,/);
    assert.deepEqual(broadcasts, [{ type: 'selection.changed' }]);
  } finally { globalThis.fetch = original; }
});


test('图片网络等待不延后侧栏打开，也不能提前报告交接完成', async () => {
  calls.length = 0;
  const original = globalThis.fetch;
  let finishImage;
  let reachedFetch;
  const fetching = new Promise(resolve => { reachedFetch = resolve; });
  globalThis.fetch = () => { reachedFetch(); return new Promise(resolve => { finishImage = resolve; }); };
  let complete = false;
  try {
    const response = new Promise(resolve => messageListener({ type: 'image.select', payload: { sourceUrl: 'https://example.com/slow.png' } }, webSender, result => { complete = true; resolve(result); }));
    assert.deepEqual(calls[0], ['panel-open', { tabId: 7 }]);
    await fetching;
    assert.equal(complete, false);
    finishImage(new Response(new Blob(['synthetic-image'], { type: 'image/png' })));
    assert.deepEqual(await response, { ok: true });
  } finally { globalThis.fetch = original; }
});

const { restoreCloudLibraryItem } = await import('../cloud-library-service.mjs');
const { scopedKey, ACCOUNT_VIEW_KEY } = await import('../account-storage.mjs');
const { STORAGE, normalizePromptScheme } = await import('../shared.mjs');
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
const extensionSender = { id: chrome.runtime.id, url: chrome.runtime.getURL('library.html') };
const send = message => new Promise(resolve => messageListener(message, extensionSender, resolve));
async function concurrentRestore(mode) {
  const originalGet = chrome.storage.local.get, originalSet = chrome.storage.local.set;
  const oldView = session[ACCOUNT_VIEW_KEY];
  const key = scopedKey(STORAGE.promptSchemesV3, 'account-a');
  const id = crypto.randomUUID();
  const existing = normalizePromptScheme({ schemeId: id, name: 'Existing local prompt', overallConfirmedAt: new Date().toISOString() });
  const values = { [key]: mode === 'edit' ? [existing] : [] };
  const entered = deferred(), release = deferred();
  session[ACCOUNT_VIEW_KEY] = { account: { id: 'account-a' } };
  chrome.storage.local.get = async keys => Object.fromEntries((typeof keys === 'string' ? [keys] : keys || []).map(k => [k, structuredClone(values[k])]));
  chrome.storage.local.set = async update => {
    if (update[key]?.some(row => row.cloudSource) && !values[key].some(row => row.cloudSource)) {
      entered.resolve(); await release.promise;
    }
    Object.assign(values, structuredClone(update));
  };
  const item = { id: 'restored-cloud-item', kind: 'prompt', title: 'Cloud prompt', prompt: 'Exact cloud prompt', revision: 1, assetId: null };
  const client = { identity: async () => 'account-a', api: async () => item };
  try {
    const restoring = restoreCloudLibraryItem({ id: item.id, expectedAccountId: 'account-a' }, client);
    await entered.promise;
    let completed = false;
    const editing = send(mode === 'edit'
      ? { type: 'library.metadata.save', payload: { schemeId: id, projectName: 'Changed locally', category: '', tags: [] } }
      : { type: 'draft.save', payload: { draft: { schemeId: id, name: 'New local prompt' } } }).then(value => { completed = true; return value; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(completed, false, 'local write must wait for the short metadata transaction');
    release.resolve();
    assert.equal((await restoring).ok, true);
    assert.equal((await editing).ok, true);
    assert.equal(values[key].length, 2);
    assert.equal(values[key].filter(row => row.cloudSource?.id === item.id).length, 1);
    const local = values[key].find(row => row.schemeId === id);
    assert.equal(mode === 'edit' ? local.projectName : local.name, mode === 'edit' ? 'Changed locally' : 'New local prompt');
  } finally {
    release.resolve(); chrome.storage.local.get = originalGet; chrome.storage.local.set = originalSet;
    if (oldView === undefined) delete session[ACCOUNT_VIEW_KEY]; else session[ACCOUNT_VIEW_KEY] = oldView;
  }
}
test('cloud restore and a concurrent new local prompt both remain saved', { timeout: 3000 }, () => concurrentRestore('new'));
test('cloud restore preserves a concurrent edit to an existing local prompt', { timeout: 3000 }, () => concurrentRestore('edit'));

test('slow cloud image download does not block saving a local prompt', { timeout: 3000 }, async () => {
  const originalGet = chrome.storage.local.get, originalSet = chrome.storage.local.set, oldView = session[ACCOUNT_VIEW_KEY];
  const values = {}, downloading = deferred(), release = deferred();
  session[ACCOUNT_VIEW_KEY] = { account: { id: 'account-a' } };
  chrome.storage.local.get = async keys => Object.fromEntries((typeof keys === 'string' ? [keys] : keys || []).map(k => [k, structuredClone(values[k])]));
  chrome.storage.local.set = async update => Object.assign(values, structuredClone(update));
  const item = { id: 'slow-cloud-item', kind: 'capture', title: 'Cloud image', prompt: '', revision: 1, assetId: 'asset-one' };
  const client = { identity: async () => 'account-a', api: async path => {
    if (path.endsWith('/media')) { downloading.resolve(); await release.promise; return new Blob(['image'], { type: 'image/png' }); }
    return item;
  } };
  try {
    const restoring = restoreCloudLibraryItem({ id: item.id, expectedAccountId: 'account-a' }, client, {
      writeImage: async record => ({ byteSize: record.blob.size, mimeType: record.blob.type }), removeImage: async () => {},
    });
    await downloading.promise;
    const result = await send({ type: 'draft.save', payload: { draft: { schemeId: crypto.randomUUID(), name: 'Saved while downloading' } } });
    assert.equal(result.ok, true);
    release.resolve(); await restoring;
    assert.equal(values[scopedKey(STORAGE.promptSchemesV3, 'account-a')].length, 1);
    assert.equal(values[scopedKey(STORAGE.importedAssetsV4, 'account-a')].length, 1);
  } finally {
    release.resolve(); chrome.storage.local.get = originalGet; chrome.storage.local.set = originalSet;
    if (oldView === undefined) delete session[ACCOUNT_VIEW_KEY]; else session[ACCOUNT_VIEW_KEY] = oldView;
  }
});

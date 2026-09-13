import test from 'node:test';
import assert from 'node:assert/strict';

const calls = [];
let messageListener;

globalThis.chrome = {
  storage: {
    session: {
      setAccessLevel: () => undefined,
      set: async () => {},
      get: async () => ({}),
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
    onInstalled: { addListener: () => {} },
    onMessage: { addListener: listener => { messageListener = listener; } },
    sendMessage: async () => {},
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
      { tab: { id: 7, windowId: 2, url: 'https://example.com', title: 'Example' } },
      resolve,
    );
    assert.equal(asyncResponse, true);
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

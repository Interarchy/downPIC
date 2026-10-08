import { STORAGE } from './shared.mjs';

const elements = Object.fromEntries([
  'backend-status', 'capture-enabled', 'capture-copy', 'open-sidepanel',
  'open-library', 'global-feedback',
].map(id => [id, document.getElementById(id)]));
let enabled = false;
let currentTab = null;

function feedback(message, tone = '') {
  elements['global-feedback'].textContent = message;
  elements['global-feedback'].dataset.tone = tone;
}

async function request(message) {
  try { return await chrome.runtime.sendMessage(message); }
  catch (error) { return { ok: false, error: error?.message || String(error) }; }
}

function renderEnabled() {
  elements['capture-enabled'].checked = enabled;
  document.getElementById('capture-title').textContent = (enabled ? '关闭' : '打开') + '图片浏览器下载浮框';
  elements['capture-copy'].textContent = enabled ? '功能已开启' : '功能已关闭';
}

async function syncCurrentPage(active) {
  if (!currentTab?.id || !/^https?:/i.test(currentTab.url || '')) {
    feedback('请在普通网页中使用图片工具', 'error');
    return;
  }
  try {
    await chrome.tabs.sendMessage(currentTab.id, { type: 'capture.setEnabled', enabled: active });
  } catch {
    if (!active) return;
    const result = await request({ type: 'page.activate', tabId: currentTab.id });
    if (!result?.ok) {
      feedback(result?.error || '当前网页无法启用图片工具', 'error');
      return;
    }
    await chrome.tabs.sendMessage(currentTab.id, { type: 'capture.setEnabled', enabled: active }).catch(() => {});
  }
}

async function refreshBackend() {
  const result = await request({ type: 'backend.status' });
  const status = elements['backend-status'];
  if (result?.online && result?.configured) {
    status.dataset.state = 'online';
    status.querySelector('span').textContent = '服务可用';
  } else if (result?.online) {
    status.dataset.state = 'offline';
    status.querySelector('span').textContent = '未配置模型';
  } else {
    status.dataset.state = 'offline';
    status.querySelector('span').textContent = '本地服务未启动';
  }
}

async function initialize() {
  const [stored, tabs] = await Promise.all([
    chrome.storage.local.get(STORAGE.captureEnabled),
    chrome.tabs.query({ active: true, currentWindow: true }),
  ]);
  currentTab = tabs[0] || null;
  enabled = Boolean(stored[STORAGE.captureEnabled]);
  renderEnabled();
  await Promise.all([refreshBackend(), enabled ? syncCurrentPage(true) : Promise.resolve()]);
}

elements['capture-enabled'].addEventListener('change', async event => {
  const next = event.target.checked;
  if (next) {
    const consent = await chrome.storage.local.get(STORAGE.assetAIConsent);
    if (!consent[STORAGE.assetAIConsent] && confirm('开启图库 AI：新下载图片自动发送预览给 ArchBuddy 与 DeepSeek 生成描述，语义搜索发送查询与库内描述。确认有权处理并同意？取消仍可下载。')) {
      await chrome.storage.local.set({ [STORAGE.assetAIConsent]: true, [STORAGE.privacyAccepted]: true });
    }
  }
  enabled = next;
  await chrome.storage.local.set({ [STORAGE.captureEnabled]: enabled });
  renderEnabled();
  await syncCurrentPage(enabled);
  feedback(enabled ? '网页图片工具已开启' : '网页图片工具已关闭');
});

function openSidepanel() {
  if (typeof currentTab?.windowId !== 'number') {
    feedback('无法识别当前浏览器窗口', 'error');
    return;
  }
  // 保持在点击手势内打开，沿用侧栏保存的当前任务。
  chrome.sidePanel.open({ windowId: currentTab.windowId })
    .then(() => window.close())
    .catch(error => feedback(error?.message || '无法打开右侧面板', 'error'));
}

elements['open-sidepanel'].addEventListener('click', openSidepanel);
elements['open-library'].addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('library.html') })
    .then(tab => chrome.sidePanel.close({ windowId: tab.windowId }).catch(() => {}))
    .then(() => window.close())
    .catch(error => feedback(error?.message || '无法打开图词库', 'error'));
});

initialize().catch(error => feedback(error?.message || String(error), 'error'));

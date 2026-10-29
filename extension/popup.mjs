import { setText, t, localizedError } from './i18n.mjs';
import { mountAccountUI } from './account-ui.mjs';
import { accountStorage, scopeChanges } from './account-storage.mjs';
import { STORAGE } from './shared.mjs';

mountAccountUI(document.querySelector('.brand-row'));
const elements = Object.fromEntries([
  'backend-status', 'capture-enabled', 'capture-copy', 'open-sidepanel',
  'open-library', 'global-feedback',
].map(id => [id, document.getElementById(id)]));
let enabled = false;
let currentTab = null;

function feedback(message, tone = '') {
  const translations = { '网页图片工具同步失败，请重试': 'Could not update the webpage tools. Try again.', '网页图片工具已开启': 'Webpage image tools are on.', '网页图片工具已关闭': 'Webpage image tools are off.', '无法识别当前浏览器窗口': 'Could not identify this browser window.', '无法打开右侧面板': 'Could not open the sidebar.', '无法打开图词库': 'Could not open the library.' };
  setText(elements['global-feedback'], message?.zh || message, message?.en || translations[message] || message);
  elements['global-feedback'].dataset.tone = tone;
}

async function request(message) {
  try { return await chrome.runtime.sendMessage(message); }
  catch (error) { return { ok: false, error: error?.message || String(error) }; }
}

function renderEnabled() {
  elements['capture-enabled'].checked = enabled;
  setText(document.getElementById('capture-title'), '网页图片工具', 'Webpage image tools');
  setText(elements['capture-copy'], enabled ? '功能已开启' : '功能已关闭', enabled ? 'On' : 'Off');
}

async function syncCapturePages() {
  // 后台读取最新总开关并同步全部网页，避免旧消息把关闭状态反转。
  const sync = await request({ type: 'capture.syncPages' });
  if (!sync?.ok) {
    feedback(localizedError(sync, '网页图片工具同步失败，请重试', 'Could not update webpage tools. Try again.'), 'error');
    return false;
  }
  return true;
}

async function refreshBackend() {
  const result = await request({ type: 'backend.status' });
  const status = elements['backend-status'];
  if (result?.online && result?.configured) {
    status.dataset.state = 'online';
    setText(status.querySelector('span'), '服务可用', 'Online');
  } else if (result?.online) {
    status.dataset.state = 'offline';
    setText(status.querySelector('span'), '未配置模型', 'Models unavailable');
  } else {
    status.dataset.state = 'offline';
    setText(status.querySelector('span'), '服务暂时不可用', 'Offline');
  }
}

async function initialize() {
  const [stored, tabs] = await Promise.all([
    accountStorage.get(STORAGE.captureEnabled),
    chrome.tabs.query({ active: true, currentWindow: true }),
  ]);
  currentTab = tabs[0] || null;
  enabled = Boolean(stored[STORAGE.captureEnabled]);
  renderEnabled();
  await Promise.all([refreshBackend(), syncCapturePages()]);
}

elements['capture-enabled'].addEventListener('change', async event => {
  const next = event.target.checked;
  if (next) {
    const consent = await accountStorage.get(STORAGE.assetAIConsent);
    if (!consent[STORAGE.assetAIConsent] && confirm(t('开启图库 AI：新下载图片自动发送预览给 ArchBuddy 与 DeepSeek 生成描述，语义搜索发送查询与库内描述。确认有权处理并同意？取消仍可下载。', 'Enable library AI? New downloads send previews to ArchBuddy and DeepSeek for descriptions; semantic search sends your query and library descriptions. Confirm you have permission and agree. You can still download if you cancel.'))) {
      await accountStorage.set({ [STORAGE.assetAIConsent]: true, [STORAGE.privacyAccepted]: true });
    }
  }
  enabled = next;
  await accountStorage.set({ [STORAGE.captureEnabled]: enabled });
  renderEnabled();
  const synced = await syncCapturePages();
  if (synced !== false) feedback(enabled ? '网页图片工具已开启' : '网页图片工具已关闭');
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

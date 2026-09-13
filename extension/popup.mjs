import { PRESET_TYPES, STORAGE, normalizeProjectType } from './shared.mjs';

const elements = Object.fromEntries([
  'backend-status', 'capture-enabled', 'capture-copy', 'default-badge',
  'preset-type', 'preset-options', 'custom-options', 'custom-type',
  'save-type', 'type-feedback', 'open-analysis', 'global-feedback',
].map(id => [id, document.getElementById(id)]));

let state = { enabled: false, projectType: PRESET_TYPES[0], customTypes: [] };
let currentTab = null;

function feedback(element, message, tone = '') {
  element.textContent = message;
  element.dataset.tone = tone;
}

async function request(message) {
  try {
    return await chrome.runtime.sendMessage(message);
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}

function renderTypes() {
  elements['preset-options'].replaceChildren(...PRESET_TYPES.map(value => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    return option;
  }));
  elements['custom-options'].replaceChildren(...state.customTypes.map(value => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    return option;
  }));
  elements['custom-options'].hidden = state.customTypes.length === 0;
  elements['preset-type'].value = state.projectType;
  elements['default-badge'].textContent = state.projectType;
}

function renderEnabled() {
  elements['capture-enabled'].checked = state.enabled;
  elements['capture-copy'].textContent = state.enabled ? '功能已开启' : '功能已关闭';
}

async function syncCurrentPage(enabled) {
  if (!currentTab?.id || !/^https?:/i.test(currentTab.url || '')) {
    feedback(elements['global-feedback'], '请在普通网页中使用图片工具', 'error');
    return;
  }
  try {
    await chrome.tabs.sendMessage(currentTab.id, { type: 'capture.setEnabled', enabled });
  } catch {
    if (!enabled) return;
    const result = await request({ type: 'page.activate', tabId: currentTab.id });
    if (!result?.ok) {
      feedback(elements['global-feedback'], result?.error || '当前网页无法启用图片工具', 'error');
      return;
    }
    await chrome.tabs.sendMessage(currentTab.id, { type: 'capture.setEnabled', enabled }).catch(() => {});
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
    chrome.storage.local.get([STORAGE.captureEnabled, STORAGE.projectType, STORAGE.customTypes]),
    chrome.tabs.query({ active: true, currentWindow: true }),
  ]);
  currentTab = tabs[0] || null;
  state.enabled = Boolean(stored[STORAGE.captureEnabled]);
  state.projectType = normalizeProjectType(stored[STORAGE.projectType]) || PRESET_TYPES[0];
  state.customTypes = Array.isArray(stored[STORAGE.customTypes])
    ? stored[STORAGE.customTypes].map(normalizeProjectType).filter(Boolean)
    : [];
  renderEnabled();
  renderTypes();
  await Promise.all([
    refreshBackend(),
    state.enabled ? syncCurrentPage(true) : Promise.resolve(),
  ]);
}

elements['capture-enabled'].addEventListener('change', async event => {
  state.enabled = event.target.checked;
  await chrome.storage.local.set({ [STORAGE.captureEnabled]: state.enabled });
  renderEnabled();
  await syncCurrentPage(state.enabled);
  feedback(elements['global-feedback'], state.enabled ? '网页图片工具已开启' : '网页图片工具已关闭');
});

elements['preset-type'].addEventListener('change', async event => {
  state.projectType = event.target.value;
  await chrome.storage.local.set({ [STORAGE.projectType]: state.projectType });
  elements['custom-type'].value = '';
  renderTypes();
  feedback(elements['type-feedback'], `默认类型已设为${state.projectType}`);
});

elements['save-type'].addEventListener('click', async () => {
  const value = normalizeProjectType(elements['custom-type'].value);
  if (!value) {
    feedback(elements['type-feedback'], '请输入有效的项目类型', 'error');
    return;
  }
  state.customTypes = [...new Set([...state.customTypes, value])];
  state.projectType = value;
  await chrome.storage.local.set({
    [STORAGE.customTypes]: state.customTypes,
    [STORAGE.projectType]: value,
  });
  elements['custom-type'].value = '';
  renderTypes();
  feedback(elements['type-feedback'], `已新增并设为默认：${value}`);
});

elements['custom-type'].addEventListener('keydown', event => {
  if (event.key === 'Enter') elements['save-type'].click();
});

elements['open-analysis'].addEventListener('click', () => {
  if (typeof currentTab?.windowId !== 'number') {
    feedback(elements['global-feedback'], '无法识别当前浏览器窗口', 'error');
    return;
  }
  chrome.sidePanel.open({ windowId: currentTab.windowId })
    .then(() => window.close())
    .catch(error => feedback(elements['global-feedback'], error?.message || '无法打开右侧面板', 'error'));
});

initialize().catch(error => feedback(elements['global-feedback'], error?.message || String(error), 'error'));

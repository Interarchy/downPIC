const PRESETS = ['文化建筑', '教育建筑', '办公建筑', '社区建筑'];
const STORAGE = {
  enabled: 'capture_enabled',
  projectType: 'default_project_type',
  customTypes: 'custom_project_types_cache',
  copyright: 'copyright_ack_v1',
};

const panel = document.querySelector('#plugin-panel');
const copyrightPanel = document.querySelector('#copyright-panel');
const enabled = document.querySelector('#capture-enabled');
const captureStateCopy = document.querySelector('#capture-state-copy');
const preset = document.querySelector('#preset-type');
const custom = document.querySelector('#custom-type');
const customOptions = document.querySelector('#custom-options');
const applyDefault = document.querySelector('#apply-default');
const defaultBadge = document.querySelector('#default-badge');
const fieldError = document.querySelector('#field-error');
const feedback = document.querySelector('#global-feedback');
const connectionStatus = document.querySelector('#connection-status');
const connectionCopy = connectionStatus.querySelector('.connection-copy');
const copyrightCheck = document.querySelector('#copyright-check');
const copyrightAccept = document.querySelector('#copyright-accept');
const openLibraryFolder = document.querySelector('#open-library-folder');

let currentDefault = '文化建筑';
let customTypes = [];
let copyrightAcknowledged = false;

function normalize(value) {
  return String(value ?? '').replaceAll('\u3000', ' ').trim().replace(/\s+/g, ' ');
}

function setFeedback(message, tone = 'normal') {
  feedback.textContent = message;
  feedback.style.color = tone === 'error' ? 'var(--danger)' : 'var(--accent)';
}

function updateSwitchCopy() {
  captureStateCopy.textContent = enabled.checked ? '功能已开启' : '功能已关闭';
}

function showCopyright() {
  panel.hidden = true;
  copyrightPanel.hidden = false;
  copyrightCheck.checked = false;
  copyrightAccept.disabled = true;
  copyrightCheck.focus();
}

function hideCopyright() {
  copyrightPanel.hidden = true;
  panel.hidden = false;
}

function renderCustomOptions() {
  customOptions.innerHTML = '';
  customOptions.hidden = customTypes.length === 0;
  for (const value of customTypes) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    customOptions.append(option);
  }
}

function selectCurrentDefault() {
  if (PRESETS.includes(currentDefault) || customTypes.includes(currentDefault)) {
    preset.value = currentDefault;
    custom.value = '';
  } else {
    preset.value = '';
    custom.value = currentDefault;
  }
  defaultBadge.textContent = currentDefault;
  validateSelection(false);
}

function validateSelection(showError = true) {
  const customValue = normalize(custom.value);
  const value = customValue || preset.value;
  const invalidWhitespace = custom.value.length > 0 && !customValue;
  applyDefault.disabled = !value || invalidWhitespace;
  custom.setAttribute('aria-invalid', String(invalidWhitespace));
  fieldError.textContent = invalidWhitespace ? '请输入项目类型，不能只包含空格。' : '';
  fieldError.hidden = !showError || !invalidWhitespace;
  return { valid: Boolean(value) && !invalidWhitespace, value, isCustom: Boolean(customValue) };
}

async function refreshConnection() {
  connectionStatus.dataset.state = 'checking';
  connectionCopy.textContent = '正在检查';
  try {
    const result = await chrome.runtime.sendMessage({ type: 'app.get-status' });
    connectionStatus.dataset.state = result?.connected ? 'connected' : 'offline';
    connectionCopy.textContent = result?.connected
      ? '桌面端已连接'
      : result?.pendingCount
        ? `桌面端未运行 · ${result.pendingCount} 张待整理`
        : '桌面端未运行 · 可暂存';
  } catch {
    connectionStatus.dataset.state = 'offline';
    connectionCopy.textContent = '桌面端未运行 · 可暂存';
  }
}

async function initialize() {
  const values = await chrome.storage.local.get(Object.values(STORAGE));
  enabled.checked = Boolean(values[STORAGE.enabled]);
  currentDefault = normalize(values[STORAGE.projectType]) || '文化建筑';
  customTypes = Array.isArray(values[STORAGE.customTypes]) ? values[STORAGE.customTypes].map(normalize).filter(Boolean) : [];
  copyrightAcknowledged = Boolean(values[STORAGE.copyright]);
  renderCustomOptions();
  selectCurrentDefault();
  if (enabled.checked && !copyrightAcknowledged) {
    enabled.checked = false;
    await chrome.storage.local.set({ [STORAGE.enabled]: false });
    updateSwitchCopy();
    showCopyright();
  }
  updateSwitchCopy();
  await refreshConnection();
}

enabled.addEventListener('change', async () => {
  if (enabled.checked && !copyrightAcknowledged) {
    enabled.checked = false;
    updateSwitchCopy();
    showCopyright();
    return;
  }
  await chrome.storage.local.set({ [STORAGE.enabled]: enabled.checked });
  updateSwitchCopy();
  setFeedback(enabled.checked ? '图片保存功能已开启' : '图片保存功能已关闭');
});

preset.addEventListener('change', () => {
  if (preset.value) custom.value = '';
  fieldError.hidden = true;
  validateSelection(false);
});

custom.addEventListener('input', () => {
  if (custom.value.length > 0) preset.value = '';
  validateSelection(true);
});

custom.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !applyDefault.disabled) applyDefault.click();
});

applyDefault.addEventListener('click', async () => {
  const selection = validateSelection(true);
  if (!selection.valid) return;
  currentDefault = selection.value;
  if (selection.isCustom && !customTypes.includes(currentDefault)) {
    customTypes.push(currentDefault);
  }
  await chrome.storage.local.set({
    [STORAGE.projectType]: currentDefault,
    [STORAGE.customTypes]: customTypes,
  });
  renderCustomOptions();
  selectCurrentDefault();
  setFeedback(`默认项目类型已设为${currentDefault}`);
});

document.querySelector('#open-desktop').addEventListener('click', () => {
  chrome.tabs.create({ url: 'http://127.0.0.1:4174/desktop-prototype/' });
});

openLibraryFolder.addEventListener('click', async () => {
  openLibraryFolder.disabled = true;
  setFeedback('正在打开素材文件夹…');
  try {
    const result = await chrome.runtime.sendMessage({ type: 'library.reveal' });
    if (!result?.ok) setFeedback('无法打开，请确认桌面端服务可用', 'error');
    else window.close();
  } catch {
    setFeedback('无法打开，请确认桌面端服务可用', 'error');
  } finally {
    openLibraryFolder.disabled = false;
  }
});

copyrightCheck.addEventListener('change', () => {
  copyrightAccept.disabled = !copyrightCheck.checked;
});

copyrightAccept.addEventListener('click', async () => {
  copyrightAcknowledged = true;
  enabled.checked = true;
  await chrome.storage.local.set({
    [STORAGE.copyright]: true,
    [STORAGE.enabled]: true,
  });
  hideCopyright();
  updateSwitchCopy();
  setFeedback('已确认使用边界，图片保存功能已开启');
});

document.querySelector('#copyright-cancel').addEventListener('click', () => {
  hideCopyright();
  enabled.checked = false;
  updateSwitchCopy();
});

initialize();

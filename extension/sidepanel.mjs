import { PRESET_TYPES, STORAGE, normalizeProjectType } from './shared.mjs';

const elements = Object.fromEntries([
  'session-status', 'preview', 'preview-image', 'preview-caption', 'paste-zone',
  'privacy-gate', 'privacy-check', 'privacy-accept', 'analyze', 'analysis-feedback', 'result', 'result-meta',
  'result-sections', 'copy-all', 'analysis-panel', 'download-panel', 'preset-type',
  'custom-type', 'save-type', 'type-feedback', 'download-category',
  'download-current', 'download-feedback', 'last-download-path', 'show-download',
].map(id => [id, document.getElementById(id)]));

let state = {
  projectType: PRESET_TYPES[0],
  customTypes: [],
  privacyAccepted: false,
  backendReady: false,
  selection: null,
  result: null,
  lastDownload: null,
};
let analyzing = false;

async function request(message) {
  try {
    return await chrome.runtime.sendMessage(message);
  } catch (error) {
    return {
      ok: false,
      error: `扩展后台未响应：${error?.message || String(error)}。请在扩展管理页重新加载 downPIC 后再试。`,
    };
  }
}

function feedback(element, message, tone = '') {
  element.textContent = message;
  element.dataset.tone = tone;
}

function populateTypes() {
  const values = [...new Set([...PRESET_TYPES, ...state.customTypes.map(normalizeProjectType).filter(Boolean)])];
  elements['preset-type'].replaceChildren();
  for (const value of values) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    elements['preset-type'].append(option);
  }
  elements['preset-type'].value = values.includes(state.projectType) ? state.projectType : values[0];
  elements['download-category'].textContent = state.projectType;
}

function renderSelection() {
  const selection = state.selection;
  if (!selection?.dataUrl) {
    elements.preview.classList.add('is-empty');
    elements['preview-image'].hidden = true;
    elements['preview-caption'].textContent = '悬浮网页图片点击“反推提示词”，或在侧栏粘贴图片';
    elements.analyze.disabled = true;
    elements['download-current'].disabled = true;
    return;
  }
  elements.preview.classList.remove('is-empty');
  elements['preview-image'].src = selection.dataUrl;
  elements['preview-image'].hidden = false;
  elements['preview-caption'].textContent = selection.title || '当前参考图';
  elements['download-current'].disabled = false;
  elements.analyze.disabled = analyzing || !state.privacyAccepted || !state.backendReady;
}

function renderSetup() {
  elements['privacy-gate'].hidden = state.privacyAccepted;
  if (!state.privacyAccepted) feedback(elements['analysis-feedback'], '确认图片处理说明后即可分析');
  else if (!state.backendReady) feedback(elements['analysis-feedback'], 'downPIC 服务尚未就绪，请先启动本地服务');
  else if (!state.selection) feedback(elements['analysis-feedback'], '请选择或粘贴一张参考图');
  else if (!analyzing && !state.result) feedback(elements['analysis-feedback'], '参考图已就绪');
}

function renderResult() {
  const result = state.result;
  elements.result.hidden = !result?.sections?.length;
  if (!result?.sections?.length) {
    elements['result-sections'].replaceChildren();
    return;
  }
  elements['result-meta'].textContent = `${(result.durationMs / 1000).toFixed(1)} 秒 · ${result.sections.length} 个分项`;
  elements['result-sections'].replaceChildren(...result.sections.map(section => {
    const article = document.createElement('article');
    article.className = 'result-section';
    const title = document.createElement('h3');
    title.textContent = `【${section.title}】`;
    const body = document.createElement('p');
    body.textContent = section.text;
    article.append(title, body);
    return article;
  }));
}

function renderDownloadLocation() {
  const download = state.lastDownload;
  elements['show-download'].disabled = !Number.isInteger(Number(download?.downloadId));
  elements['last-download-path'].textContent = download?.filename
    ? `下载/${download.filename}`
    : '保存图片后可快速定位文件';
}

function render() {
  populateTypes();
  renderSelection();
  renderSetup();
  renderResult();
  renderDownloadLocation();
}

async function refreshState({ autoRun = false } = {}) {
  const response = await request({ type: 'state.get' });
  if (!response?.ok) {
    feedback(elements['analysis-feedback'], response?.error || '扩展后台未响应', 'error');
    return;
  }
  state = { ...state, ...response };
  render();
  if (autoRun && state.selection?.pendingAnalysis && state.privacyAccepted && state.backendReady) {
    await runAnalysis();
  }
}

async function refreshBackend({ autoRun = false } = {}) {
  elements['session-status'].dataset.state = 'checking';
  elements['session-status'].textContent = '正在检查服务';
  const response = await request({ type: 'backend.status' });
  state.backendReady = Boolean(response?.online && response?.configured);
  elements['session-status'].dataset.state = state.backendReady ? 'online' : 'offline';
  elements['session-status'].textContent = state.backendReady
    ? '本地服务可用'
    : response?.online
      ? '服务未配置模型'
      : '本地服务未启动';
  renderSetup();
  renderSelection();
  if (autoRun && state.selection?.pendingAnalysis && state.privacyAccepted && state.backendReady) {
    await runAnalysis();
  }
}

async function runAnalysis() {
  if (analyzing || !state.selection) return;
  analyzing = true;
  state.result = null;
  render();
  elements.analyze.textContent = '正在分析…';
  feedback(elements['analysis-feedback'], '正在提取色彩、构图、光影与材料特征');
  const started = Date.now();
  const ticker = setInterval(() => {
    feedback(elements['analysis-feedback'], `模型分析中 · ${Math.round((Date.now() - started) / 1000)} 秒`);
  }, 1000);
  try {
    const response = await request({ type: 'analysis.run' });
    if (!response?.ok) throw new Error(response?.error || '分析失败');
    state.result = response.result;
    state.selection = { ...state.selection, pendingAnalysis: false };
    feedback(elements['analysis-feedback'], '提示词已生成', 'success');
  } catch (error) {
    feedback(elements['analysis-feedback'], error?.message || String(error), 'error');
  } finally {
    clearInterval(ticker);
    analyzing = false;
    elements.analyze.textContent = '重新分析';
    renderSelection();
    renderResult();
  }
}

async function acceptImageFile(file) {
  if (!file || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    feedback(elements['analysis-feedback'], '请粘贴 PNG、JPEG 或 WebP 图片', 'error');
    return;
  }
  if (!file.size || file.size > 10 * 1024 * 1024) {
    feedback(elements['analysis-feedback'], '图片必须小于 10 MB', 'error');
    return;
  }
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  const response = await request({ type: 'image.paste', payload: { dataUrl, title: file.name || '粘贴的参考图' } });
  if (!response?.ok) feedback(elements['analysis-feedback'], response?.error || '图片读取失败', 'error');
  else await refreshState();
}

document.querySelectorAll('.tab').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('is-active', tab === button));
    const analysis = button.dataset.tab === 'analysis';
    elements['analysis-panel'].hidden = !analysis;
    elements['download-panel'].hidden = analysis;
  });
});

elements['privacy-check'].addEventListener('change', () => {
  elements['privacy-accept'].disabled = !elements['privacy-check'].checked;
});
elements['privacy-accept'].addEventListener('click', async () => {
  await chrome.storage.local.set({ [STORAGE.privacyAccepted]: true });
  state.privacyAccepted = true;
  renderSetup();
  renderSelection();
});
elements.analyze.addEventListener('click', runAnalysis);

elements['copy-all'].addEventListener('click', async () => {
  if (!state.result?.text) return;
  await navigator.clipboard.writeText(state.result.text);
  elements['copy-all'].textContent = '已复制';
  setTimeout(() => { elements['copy-all'].textContent = '复制全部'; }, 1200);
});

document.addEventListener('paste', event => {
  if (event.target instanceof HTMLInputElement) return;
  const file = [...event.clipboardData.files].find(item => item.type.startsWith('image/'));
  if (file) {
    event.preventDefault();
    acceptImageFile(file);
  }
});
elements['paste-zone'].addEventListener('dragover', event => {
  event.preventDefault();
  elements['paste-zone'].classList.add('is-over');
});
elements['paste-zone'].addEventListener('dragleave', () => elements['paste-zone'].classList.remove('is-over'));
elements['paste-zone'].addEventListener('drop', event => {
  event.preventDefault();
  elements['paste-zone'].classList.remove('is-over');
  acceptImageFile([...event.dataTransfer.files].find(item => item.type.startsWith('image/')));
});

elements['preset-type'].addEventListener('change', async () => {
  state.projectType = elements['preset-type'].value;
  await chrome.storage.local.set({ [STORAGE.projectType]: state.projectType });
  populateTypes();
  feedback(elements['type-feedback'], `默认类型已设为${state.projectType}`, 'success');
});
elements['save-type'].addEventListener('click', async () => {
  const value = normalizeProjectType(elements['custom-type'].value);
  if (!value) {
    feedback(elements['type-feedback'], '请输入自定义类型', 'error');
    return;
  }
  state.customTypes = [...new Set([...state.customTypes, value])];
  state.projectType = value;
  await chrome.storage.local.set({ [STORAGE.customTypes]: state.customTypes, [STORAGE.projectType]: value });
  elements['custom-type'].value = '';
  populateTypes();
  feedback(elements['type-feedback'], `已新增并设为默认：${value}`, 'success');
});

elements['download-current'].addEventListener('click', async () => {
  if (!state.selection) return;
  elements['download-current'].disabled = true;
  feedback(elements['download-feedback'], '正在保存…');
  const response = await request({
    type: 'download.image',
    payload: {
      dataUrl: state.selection.dataUrl,
      mimeType: state.selection.mimeType,
      title: state.selection.title,
      pageTitle: state.selection.pageTitle,
      category: state.projectType,
    },
  });
  elements['download-current'].disabled = false;
  if (response?.ok && response.download) {
    state.lastDownload = response.download;
    renderDownloadLocation();
  }
  feedback(elements['download-feedback'], response?.ok ? `已保存到 ${response.filename}` : response?.error || '保存失败', response?.ok ? 'success' : 'error');
});

elements['show-download'].addEventListener('click', async () => {
  if (!state.lastDownload?.downloadId && state.lastDownload?.downloadId !== 0) return;
  const response = await request({
    type: 'download.show',
    payload: { downloadId: state.lastDownload.downloadId },
  });
  if (!response?.ok) feedback(elements['download-feedback'], response?.error || '无法打开下载位置', 'error');
});

chrome.runtime.onMessage.addListener(message => {
  if (message?.type === 'selection.changed') {
    refreshState().then(() => refreshBackend({ autoRun: true }));
  }
  if (message?.type === 'download.changed') {
    state.lastDownload = message.download;
    renderDownloadLocation();
  }
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes[STORAGE.projectType] || changes[STORAGE.customTypes])) refreshState();
});

refreshState().then(() => refreshBackend({ autoRun: true }));

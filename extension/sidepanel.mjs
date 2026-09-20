import {
  PRESET_TYPES,
  PRINCIPLE,
  STORAGE,
  compileIntentPrompt,
  confirmIntentModules,
  editIntentModule,
  intentModuleStatus,
  normalizeIntentDraft,
  normalizeProjectType,
  setIntentModuleEnabled,
  setIntentModuleLocked,
} from './shared.mjs';

const elementIds = [
  'session-status', 'preview', 'preview-image', 'preview-caption', 'choose-file', 'file-input',
  'privacy-gate', 'privacy-check', 'privacy-accept', 'analyze', 'analysis-feedback',
  'draft-list', 'new-draft', 'workbench', 'result-meta',
  'candidate-results', 'candidate-reference', 'candidate-list', 'current-plan-count', 'plan-empty',
  'analysis-details-list', 'plan-source-list',
  'draft-name', 'principle-text', 'plan-module-list', 'prompt-preview', 'prompt-count', 'confirm-prompt', 'copy-prompt',
  'copy-fallback', 'copy-feedback', 'analysis-panel', 'download-panel', 'preset-type', 'custom-type', 'save-type',
  'type-feedback', 'download-category', 'download-current', 'download-feedback', 'continue-analysis',
  'last-download-path', 'show-download', 'analytics-toggle',
];
const elements = Object.fromEntries(elementIds.map(id => [id, document.getElementById(id)]));

const STATUS_LABELS = {
  suggested: 'AI 建议',
  confirmed: '已确认',
  modified: '已修改',
  locked: '已锁定',
  disabled: '已停用',
};
const BASIS_LABELS = { observed: '可见事实', inferred: '合理推断', uncertain: '无法确认' };
const CONFIDENCE_LABELS = { high: '高置信', medium: '中置信', low: '低置信', unknown: '未知' };

let state = {
  projectType: PRESET_TYPES[0],
  customTypes: [],
  privacyAccepted: false,
  backendReady: false,
  selection: null,
  result: null,
  drafts: [],
  activeDraftId: null,
  analyticsConsent: { enabled: false, updatedAt: '', policyVersion: '2026-09-20' },
  lastDownload: null,
};
let analyzing = false;

async function request(message) {
  try {
    return await chrome.runtime.sendMessage(message);
  } catch (error) {
    return {
      ok: false,
      category: 'service_unavailable',
      error: `扩展后台未响应：${error?.message || String(error)}。请在扩展管理页重新加载 ArchBuddy 后再试。`,
    };
  }
}

function feedback(element, message, tone = '') {
  element.textContent = message;
  element.dataset.tone = tone;
}

function recordAnalytics(eventName, outcome) {
  if (!state.analyticsConsent?.enabled) return;
  void request({ type: 'analytics.record', payload: { eventName, ...(outcome ? { outcome } : {}) } });
}

function activeDraft() {
  return state.drafts.find(draft => draft.draftId === state.activeDraftId) ?? null;
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
  if (!selection?.imagePayload) {
    elements.preview.classList.add('is-empty');
    elements['preview-image'].hidden = true;
    elements['preview-image'].removeAttribute('src');
    elements['preview-caption'].textContent = '拖入、粘贴或选择一张参考图';
    elements.analyze.disabled = true;
    elements['download-current'].disabled = true;
    return;
  }
  elements.preview.classList.remove('is-empty');
  elements['preview-image'].src = selection.imagePayload;
  elements['preview-image'].hidden = false;
  elements['preview-caption'].textContent = selection.displayName || '当前参考图';
  elements['download-current'].disabled = false;
  const unavailable = analyzing || !state.privacyAccepted || !state.backendReady;
  elements.analyze.disabled = unavailable;
}

function renderSetup() {
  document.body.classList.toggle('needs-consent', !state.privacyAccepted);
  elements['privacy-gate'].hidden = state.privacyAccepted;
  if (!state.privacyAccepted) feedback(elements['analysis-feedback'], '确认图片处理说明后即可分析');
  else if (!state.backendReady) feedback(elements['analysis-feedback'], 'ArchBuddy 云端反推服务暂不可用，下载与分类仍可使用');
  else if (!state.selection) feedback(elements['analysis-feedback'], '请选择、粘贴或拖入一张参考图');
  else if (!analyzing) feedback(elements['analysis-feedback'], '');
}

function renderDrafts() {
  elements['draft-list'].replaceChildren();
  if (!state.drafts.length) {
    const empty = document.createElement('p');
    empty.className = 'draft-empty';
    empty.textContent = '还没有草稿。成功分析后会在这里保存文字结果。';
    elements['draft-list'].append(empty);
    return;
  }
  for (const draft of state.drafts) {
    const row = document.createElement('div');
    row.className = `draft-item${draft.draftId === state.activeDraftId ? ' is-active' : ''}`;
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'draft-open';
    const name = document.createElement('strong');
    name.textContent = draft.name;
    const detail = document.createElement('span');
    detail.textContent = `${draft.referenceHint?.displayName || '无参考图记录'} · ${new Date(draft.updatedAt).toLocaleString('zh-CN')}`;
    open.append(name, detail);
    open.addEventListener('click', () => restoreDraft(draft.draftId));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'draft-delete';
    remove.textContent = '删除';
    remove.addEventListener('click', () => deleteDraft(draft.draftId));
    row.append(open, remove);
    elements['draft-list'].append(row);
  }
}

function fitTextarea(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = `${Math.max(72, textarea.scrollHeight)}px`;
}

function moduleCard(module) {
  const status = intentModuleStatus(module);
  const article = document.createElement('article');
  article.className = 'module-card';
  article.dataset.status = status;
  article.dataset.changed = String(module.changed);

  const head = document.createElement('div');
  head.className = 'module-head';
  const titleWrap = document.createElement('div');
  titleWrap.className = 'module-title';
  const title = document.createElement('h2');
  title.textContent = module.title;
  const chip = document.createElement('span');
  chip.className = 'status-chip';
  chip.textContent = `${STATUS_LABELS[status]}${module.changed ? ' · 有新建议' : ''}`;
  titleWrap.append(title, chip);

  const tools = document.createElement('div');
  tools.className = 'module-tools';
  const enable = document.createElement('button');
  enable.type = 'button';
  enable.textContent = module.enabled ? '停用' : '恢复';
  enable.addEventListener('click', async () => {
    const disabling = module.enabled;
    await updateActiveDraft({ modules: setIntentModuleEnabled(activeDraft().modules, module.key, !module.enabled) });
    if (disabling) recordAnalytics('module_disabled');
  });
  const lock = document.createElement('button');
  lock.type = 'button';
  lock.textContent = module.locked ? '解锁' : '锁定';
  lock.addEventListener('click', async () => {
    await updateActiveDraft({ modules: setIntentModuleLocked(activeDraft().modules, module.key, !module.locked) });
  });
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.textContent = '复制';
  copy.disabled = !module.enabled || !module.value;
  copy.addEventListener('click', () => copyText(module.value, `已复制“${module.title}”`));
  tools.append(enable, lock, copy);
  head.append(titleWrap, tools);

  const value = document.createElement('textarea');
  value.className = 'module-value';
  value.value = module.value;
  value.disabled = !module.enabled;
  value.addEventListener('input', () => fitTextarea(value));
  value.placeholder = module.basis === 'uncertain' ? '图像中无法确认，可由你补充设计意图' : '输入该模块的最终意图';
  value.addEventListener('change', async () => {
    await updateActiveDraft({ modules: editIntentModule(activeDraft().modules, module.key, value.value) });
    recordAnalytics('module_edited');
  });

  article.append(head, value);
  requestAnimationFrame(() => fitTextarea(value));
  return article;
}

function candidateCard(candidate) {
  const draft = activeDraft();
  const current = draft?.modules.find(module => module.key === candidate.key);
  const added = Boolean(current?.value
    && current.value === candidate.value
    && current.sourceHint?.analysisId === state.result?.analysisId);
  const replacing = Boolean(current?.value && !added);
  const article = document.createElement('article');
  article.className = 'candidate-card';

  const title = document.createElement('h3');
  title.textContent = candidate.title;
  const value = document.createElement('p');
  value.textContent = candidate.value || '本图没有可确认的内容';

  const action = document.createElement('button');
  action.type = 'button';
  action.className = 'candidate-action';
  action.dataset.state = added ? 'added' : replacing ? 'replace' : 'available';
  action.textContent = added ? '已加入' : replacing ? '替换' : '加入';
  action.disabled = added || !candidate.value;
  action.addEventListener('click', async () => {
    const response = await request({
      type: 'intent.add',
      payload: { analysisId: state.result.analysisId, key: candidate.key, replace: replacing },
    });
    if (!response?.ok) return feedback(elements['analysis-feedback'], response?.error || '加入失败，请重试', 'error');
    state.drafts = response.drafts;
    state.activeDraftId = response.activeDraftId;
    render();
    feedback(elements['analysis-feedback'], replacing ? `已替换“${candidate.title}”` : `已加入“${candidate.title}”`, 'success');
  });
  const head = document.createElement('div');
  head.className = 'candidate-card-head';
  head.append(title, action);
  article.append(head, value);
  return article;
}

function renderCandidates() {
  const modules = Array.isArray(state.result?.modules) ? state.result.modules.filter(module => module.value) : [];
  elements['candidate-results'].hidden = modules.length === 0;
  elements['candidate-list'].replaceChildren(...modules.map(candidateCard));
  elements['candidate-reference'].textContent = state.result?.referenceHint?.displayName || '';
}

function detailRow(title, text) {
  const row = document.createElement('p');
  row.className = 'detail-row';
  const name = document.createElement('strong');
  name.textContent = `${title}：`;
  row.append(name, document.createTextNode(text));
  return row;
}

function renderDetails() {
  elements['principle-text'].textContent = PRINCIPLE;
  const candidates = Array.isArray(state.result?.modules) ? state.result.modules.filter(module => module.value) : [];
  if (candidates.length) {
    elements['analysis-details-list'].replaceChildren(...candidates.map(module => detailRow(
      module.title,
      `${BASIS_LABELS[module.basis]}；${CONFIDENCE_LABELS[module.confidence]}；${module.evidence || '无补充证据'}`,
    )));
  } else {
    const empty = document.createElement('p');
    empty.className = 'detail-empty';
    empty.textContent = '完成分析后显示。';
    elements['analysis-details-list'].replaceChildren(empty);
  }
  const sources = activeDraft()?.modules.filter(module => module.value && module.sourceHint?.displayName) ?? [];
  if (sources.length) {
    elements['plan-source-list'].replaceChildren(...sources.map(module => detailRow(module.title, module.sourceHint.displayName)));
  } else {
    const empty = document.createElement('p');
    empty.className = 'detail-empty';
    empty.textContent = '加入候选后显示。';
    elements['plan-source-list'].replaceChildren(empty);
  }
}

function renderWorkbench() {
  const draft = activeDraft();
  elements.workbench.hidden = !draft;
  if (!draft) {
    elements['plan-module-list'].replaceChildren();
    return;
  }
  elements['draft-name'].value = draft.name;
  elements['result-meta'].textContent = draft.lastAnalyzedAt
    ? `最近分析 ${new Date(draft.lastAnalyzedAt).toLocaleString('zh-CN')}`
    : '已恢复的本地草稿';
  const selectedModules = draft.modules.filter(module => module.value);
  elements['plan-module-list'].replaceChildren(...selectedModules.map(moduleCard));
  elements['plan-empty'].hidden = selectedModules.length > 0;
  const prompt = compileIntentPrompt(draft.modules);
  elements['prompt-preview'].textContent = prompt;
  const included = draft.modules.filter(module => module.enabled && module.value).length;
  elements['current-plan-count'].textContent = `${included} / 11`;
  elements['prompt-count'].textContent = `${included}/11 个模块`;
  elements['confirm-prompt'].textContent = draft.overallConfirmedAt ? '已整体确认' : '整体确认';
  elements['copy-prompt'].disabled = included === 0;
  renderSelection();
}

function renderDownloadLocation() {
  const download = state.lastDownload;
  elements['show-download'].disabled = !Number.isInteger(Number(download?.downloadId));
  elements['last-download-path'].textContent = download?.filename ? `下载/${download.filename}` : '保存图片后可快速定位文件';
}

function render() {
  populateTypes();
  renderSelection();
  renderSetup();
  renderDrafts();
  renderCandidates();
  renderWorkbench();
  renderDetails();
  renderDownloadLocation();
  elements['analytics-toggle'].checked = state.analyticsConsent?.enabled === true;
}

async function refreshState() {
  const response = await request({ type: 'state.get' });
  if (!response?.ok) {
    feedback(elements['analysis-feedback'], response?.error || '扩展后台未响应', 'error');
    return;
  }
  state = { ...state, ...response };
  render();
}

async function refreshBackend() {
  elements['session-status'].dataset.state = 'checking';
  elements['session-status'].textContent = '正在检查服务';
  const response = await request({ type: 'backend.status' });
  state.backendReady = Boolean(response?.online && response?.configured);
  elements['session-status'].dataset.state = state.backendReady ? 'online' : 'offline';
  elements['session-status'].textContent = state.backendReady ? '云端服务可用' : response?.online ? '服务未配置模型' : '云端服务暂不可用';
  renderSetup();
  renderSelection();
}

function recoveryMessage(response) {
  const actions = {
    invalid_input: '请重新选择一张有效图片。',
    network_unavailable: '请检查网络后重试，当前草稿没有变化。',
    timeout: '服务可能正在冷启动，请稍后重试。',
    service_unavailable: '请稍后重试；下载与分类仍可使用。',
    quota_exceeded: '今天暂时无法继续分析；下载、草稿与复制仍可使用。',
    format_invalid: '模型结果无法解析，请重新分析。',
    version_mismatch: '请重新加载或更新 ArchBuddy 后再试。',
  };
  return `${response?.error || '分析失败'} ${actions[response?.category] || '请稍后重试。'}`;
}

async function runAnalysis() {
  if (analyzing || !state.selection) return;
  analyzing = true;
  elements.analyze.textContent = '正在分析…';
  renderSelection();
  const started = Date.now();
  feedback(elements['analysis-feedback'], '正在理解参考图并生成 11 个意图模块');
  const ticker = setInterval(() => {
    feedback(elements['analysis-feedback'], `模型分析中 · ${Math.round((Date.now() - started) / 1000)} 秒`);
  }, 1000);
  recordAnalytics('analysis_started');
  try {
    const response = await request({ type: 'analysis.run' });
    if (!response?.ok) {
      recordAnalytics('analysis_failed', response?.category || 'unknown_error');
      feedback(elements['analysis-feedback'], recoveryMessage(response), 'error');
      return;
    }
    state.result = response.result;
    state.drafts = response.drafts;
    state.activeDraftId = response.draft.draftId;
    recordAnalytics('analysis_succeeded', 'success');
    feedback(elements['analysis-feedback'], '本图候选意图已生成，请选择需要加入当前方案的方面', 'success');
  } finally {
    clearInterval(ticker);
    analyzing = false;
    elements.analyze.textContent = '开始分析';
    render();
  }
}

async function updateActiveDraft(patch) {
  const current = activeDraft();
  if (!current) return;
  const modulesChanged = Object.prototype.hasOwnProperty.call(patch, 'modules');
  const confirmationProvided = Object.prototype.hasOwnProperty.call(patch, 'overallConfirmedAt');
  const draft = normalizeIntentDraft({
    ...current,
    ...patch,
    overallConfirmedAt: modulesChanged && !confirmationProvided ? null : (patch.overallConfirmedAt ?? current.overallConfirmedAt),
    updatedAt: new Date().toISOString(),
  });
  const response = await request({ type: 'draft.save', payload: { draft } });
  if (!response?.ok) {
    feedback(elements['copy-feedback'], response?.error || '草稿保存失败', 'error');
    return;
  }
  state.drafts = response.drafts;
  state.activeDraftId = response.activeDraftId;
  renderDrafts();
  renderWorkbench();
}

async function restoreDraft(draftId) {
  const response = await request({ type: 'draft.restore', payload: { draftId } });
  if (!response?.ok) return feedback(elements['analysis-feedback'], response?.error || '草稿打开失败', 'error');
  state.drafts = response.drafts;
  state.activeDraftId = response.activeDraftId;
  render();
  feedback(elements['analysis-feedback'], '草稿已恢复；编辑和复制不需要原图，重新分析前请重新选择参考图', 'success');
}

async function deleteDraft(draftId) {
  const response = await request({ type: 'draft.delete', payload: { draftId } });
  if (!response?.ok) return feedback(elements['analysis-feedback'], response?.error || '草稿删除失败', 'error');
  state.drafts = response.drafts;
  state.activeDraftId = response.activeDraftId;
  render();
}

async function copyText(text, successMessage) {
  try {
    await navigator.clipboard.writeText(text);
    elements['copy-fallback'].hidden = true;
    feedback(elements['copy-feedback'], successMessage, 'success');
  } catch {
    elements['copy-fallback'].value = text;
    elements['copy-fallback'].hidden = false;
    elements['copy-fallback'].select();
    feedback(elements['copy-feedback'], '浏览器未允许自动复制，文本已选中，请按 Ctrl+C', 'error');
  }
}

async function acceptImageFiles(files, sourceType) {
  const images = [...files].filter(file => file.type.startsWith('image/'));
  if (images.length !== 1 || files.length !== 1) {
    feedback(elements['analysis-feedback'], '一次只能选择一张图片，请重新选择', 'error');
    return;
  }
  const [file] = images;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || !file.size || file.size > 10 * 1024 * 1024) {
    feedback(elements['analysis-feedback'], '请选择 1 字节到 10 MB 的 PNG、JPEG 或 WebP 图片', 'error');
    return;
  }
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  const response = await request({ type: 'image.paste', payload: { dataUrl, title: file.name, sourceType } });
  if (!response?.ok) feedback(elements['analysis-feedback'], response?.error || '图片读取失败', 'error');
  else await refreshState();
}

function switchTab(name) {
  document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('is-active', tab.dataset.tab === name));
  elements['analysis-panel'].hidden = name !== 'analysis';
  elements['download-panel'].hidden = name === 'analysis';
}

document.querySelectorAll('.tab').forEach(button => button.addEventListener('click', () => switchTab(button.dataset.tab)));
elements['privacy-check'].addEventListener('change', () => { elements['privacy-accept'].disabled = !elements['privacy-check'].checked; });
elements['privacy-accept'].addEventListener('click', async () => {
  await chrome.storage.local.set({ [STORAGE.privacyAccepted]: true });
  state.privacyAccepted = true;
  render();
});
elements.analyze.addEventListener('click', runAnalysis);
elements['choose-file'].addEventListener('click', () => elements['file-input'].click());
elements['file-input'].addEventListener('change', () => {
  acceptImageFiles(elements['file-input'].files, 'file');
  elements['file-input'].value = '';
});

elements['new-draft'].addEventListener('click', async () => {
  const response = await request({ type: 'draft.create' });
  if (!response?.ok) return feedback(elements['analysis-feedback'], response?.error || '无法新建草稿', 'error');
  state.activeDraftId = null;
  state.result = null;
  render();
  feedback(elements['analysis-feedback'], '已建立新的编辑上下文；分析成功后才会保存草稿', 'success');
});
elements['draft-name'].addEventListener('change', () => updateActiveDraft({ name: elements['draft-name'].value.trim() || '未命名意图草稿' }));
elements['confirm-prompt'].addEventListener('click', async () => {
  const draft = activeDraft();
  if (!draft) return;
  await updateActiveDraft({ modules: confirmIntentModules(draft.modules), overallConfirmedAt: draft.overallConfirmedAt || new Date().toISOString() });
  recordAnalytics('prompt_confirmed', 'success');
  feedback(elements['copy-feedback'], '已整体确认，可以复制完整 Prompt', 'success');
});
elements['copy-prompt'].addEventListener('click', async () => {
  const draft = activeDraft();
  if (!draft) return;
  if (!draft.overallConfirmedAt) {
    feedback(elements['copy-feedback'], '首次复制前，请先点击“整体确认”检查全部启用模块', 'error');
    return;
  }
  await copyText(compileIntentPrompt(draft.modules), '完整 Prompt 已复制');
  recordAnalytics('prompt_copied', 'success');
});

elements['analytics-toggle'].addEventListener('change', async () => {
  const response = await request({ type: 'analytics.consent.set', payload: { enabled: elements['analytics-toggle'].checked } });
  if (!response?.ok) {
    elements['analytics-toggle'].checked = state.analyticsConsent?.enabled === true;
    return;
  }
  state.analyticsConsent = response.consent;
});

document.addEventListener('paste', event => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  const files = [...event.clipboardData.files];
  if (files.some(file => file.type.startsWith('image/'))) {
    event.preventDefault();
    acceptImageFiles(files, 'paste');
  }
});
elements.preview.addEventListener('dragover', event => { event.preventDefault(); elements.preview.classList.add('is-over'); });
elements.preview.addEventListener('dragleave', () => elements.preview.classList.remove('is-over'));
elements.preview.addEventListener('drop', event => {
  event.preventDefault();
  elements.preview.classList.remove('is-over');
  acceptImageFiles([...event.dataTransfer.files], 'file');
});

elements['preset-type'].addEventListener('change', async () => {
  state.projectType = elements['preset-type'].value;
  await chrome.storage.local.set({ [STORAGE.projectType]: state.projectType });
  populateTypes();
  feedback(elements['type-feedback'], `默认类型已设为${state.projectType}`, 'success');
});
elements['save-type'].addEventListener('click', async () => {
  const value = normalizeProjectType(elements['custom-type'].value);
  if (!value) return feedback(elements['type-feedback'], '请输入自定义类型', 'error');
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
      dataUrl: state.selection.imagePayload,
      mimeType: state.selection.mimeType,
      title: state.selection.displayName,
      pageTitle: state.selection.displayName,
      category: state.projectType,
    },
  });
  elements['download-current'].disabled = false;
  if (response?.ok && response.download) {
    state.lastDownload = response.download;
    elements['continue-analysis'].hidden = false;
    renderDownloadLocation();
  }
  feedback(elements['download-feedback'], response?.ok ? `已保存到 ${response.filename}` : response?.error || '保存失败', response?.ok ? 'success' : 'error');
});
elements['continue-analysis'].addEventListener('click', () => {
  switchTab('analysis');
  feedback(elements['analysis-feedback'], state.selection ? '' : '请选择一张参考图');
});
elements['show-download'].addEventListener('click', async () => {
  if (!Number.isInteger(Number(state.lastDownload?.downloadId))) return;
  const response = await request({ type: 'download.show', payload: { downloadId: state.lastDownload.downloadId } });
  if (!response?.ok) feedback(elements['download-feedback'], response?.error || '无法打开下载位置', 'error');
});

chrome.runtime.onMessage.addListener(message => {
  if (message?.type === 'selection.changed') refreshState().then(refreshBackend);
  if (message?.type === 'download.changed') { state.lastDownload = message.download; renderDownloadLocation(); }
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes[STORAGE.projectType] || changes[STORAGE.customTypes])) refreshState();
});

refreshState().then(refreshBackend);

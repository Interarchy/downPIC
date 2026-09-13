import { assets, projectTree, searchHistory, tagGroups } from './data.mjs?v=detail-source-v1';
import { loadLiveLibrary, mergeUnknownTagsIntoGroups, projectTreeFromAssets } from './live-library.mjs?v=ai-created-tags-v1';
import { loadAnalysisServiceStatus, runNextAnalysis } from './analysis-service.mjs?v=real-analysis-v1';
import { addAssetTag, getExistingTagOptions, removeAssetTag, restoreAssetSnapshot, updateAssetDescription } from './asset-edit.mjs';
import { moveKeyword, validateKeyword } from './keyword.mjs';
import { getLibrarySetupSummary, validateLibraryPath } from './library-setup.mjs';
import { getQueueAssets, getQueueSummary, retryFailedAsset } from './queue.mjs';
import { getSuggestions, searchAssets, startNaturalLanguageSearch } from './search.mjs?v=natural-language-scope-v2';

const state = {
  view: 'home',
  query: '',
  selectedProject: '',
  selectedTags: [],
  queueFilter: 'all',
  history: [...searchHistory],
};

let workingAssets = assets.map((asset) => ({ ...asset, tags: [...asset.tags] }));
let workingProjectTree = projectTree;
let analysisServiceStatus = { available: false, configured: false };
const manualTagsByAsset = new Map();
const manuallyEditedDescriptions = new Set();

let workingTagGroups = [
  ...tagGroups.map((group) => ({ ...group, tags: [...group.tags] })),
  { label: '其他', tags: [] },
];

const content = document.querySelector('#content');
const searchForm = document.querySelector('#search-form');
const searchInput = document.querySelector('#global-search');
const suggestions = document.querySelector('#search-suggestions');
const projectTreeElement = document.querySelector('#project-tree');
const tagTreeElement = document.querySelector('#tag-tree');
const tagSearch = document.querySelector('#tag-search');
const previewPanel = document.querySelector('#preview-panel');
const unparsedCount = document.querySelector('#unparsed-count');
const onboardingFlow = document.querySelector('#onboarding-flow');
const folderChoices = document.querySelector('#folder-choices');
const folderChecks = document.querySelector('#folder-checks');
const libraryPathDisplay = document.querySelector('#library-path-display');
const originalViewer = document.querySelector('#original-viewer');
const originalViewerImage = document.querySelector('#original-viewer-image');
const toast = document.querySelector('#toast');
const addKeywordButton = document.querySelector('#add-keyword');
const keywordDialog = document.querySelector('#keyword-dialog');
const keywordForm = document.querySelector('#keyword-form');
const keywordName = document.querySelector('#keyword-name');
const keywordCategory = document.querySelector('#keyword-category');
const keywordError = document.querySelector('#keyword-error');
let toastTimer;
let lastAddedKeywordGroup = '';
let draggedKeyword = null;
let tagWasDragged = false;
let previewAssetId = '';
let previewTrigger = null;
let descriptionSaveTimer;
let pendingDescriptionEdit = null;
const assetEditHistory = new Map();
const MAX_ASSET_EDIT_HISTORY = 50;
let librarySetupMode = 'create';
let selectedLibraryPath = '';
let libraryPathValid = false;
let originalViewerTrigger = null;

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function imageStyle(asset, fit = 'cover') {
  if (!asset.webPath) return '';
  return ` style="background-image:url('${escapeHtml(asset.webPath)}');background-size:${fit};background-position:center;background-repeat:no-repeat"`;
}

function showToast(message, action = null) {
  window.clearTimeout(toastTimer);
  toast.replaceChildren(document.createTextNode(message));
  if (action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = action.label;
    button.addEventListener('click', () => {
      window.clearTimeout(toastTimer);
      toast.hidden = true;
      action.run();
    }, { once: true });
    toast.appendChild(button);
  }
  toast.hidden = false;
  toastTimer = window.setTimeout(() => { toast.hidden = true; }, action ? 4200 : 2200);
}

function setOnboardingStep(step) {
  onboardingFlow.querySelectorAll('[data-onboarding-step]').forEach((screen) => {
    screen.hidden = Number(screen.dataset.onboardingStep) !== step;
  });
  onboardingFlow.querySelectorAll('[data-step-indicator]').forEach((indicator) => {
    const indicatorStep = Number(indicator.dataset.stepIndicator);
    indicator.classList.toggle('is-active', indicatorStep === step);
    indicator.classList.toggle('is-complete', indicatorStep < step);
  });
  if (step === 3) renderLibrarySetupReview();
  onboardingFlow.querySelector('[data-onboarding-step]:not([hidden]) h1')?.focus?.();
}

function showLibrarySetup() {
  librarySetupMode = 'create';
  selectedLibraryPath = '';
  libraryPathValid = false;
  libraryPathDisplay.textContent = '尚未选择文件夹';
  folderChecks.innerHTML = '<p>选择文件夹后，将检查读取、写入和创建目录权限。</p>';
  folderChoices.hidden = true;
  onboardingFlow.querySelector('[data-onboarding-next="3"]').disabled = true;
  onboardingFlow.querySelectorAll('[data-setup-mode]').forEach((button) => {
    const selected = button.dataset.setupMode === 'create';
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-checked', String(selected));
  });
  onboardingFlow.hidden = false;
  setOnboardingStep(1);
}

function selectLibraryPath(path) {
  selectedLibraryPath = path;
  libraryPathDisplay.textContent = path;
  folderChoices.hidden = true;
  folderChecks.innerHTML = '<p class="is-checking"><i></i>正在检查目录权限…</p>';
  onboardingFlow.querySelector('[data-onboarding-next="3"]').disabled = true;
  window.setTimeout(() => {
    const result = validateLibraryPath(path);
    libraryPathValid = result.valid;
    if (result.valid) {
      folderChecks.innerHTML = `<div class="check-grid">${result.checks.map(({ label }) => `<span><i>✓</i>${escapeHtml(label)}</span>`).join('')}</div><p class="check-success">此位置可以建立素材库</p>`;
    } else {
      folderChecks.innerHTML = `<p class="check-error"><strong>无法使用此位置</strong>${escapeHtml(result.error)}</p>`;
    }
    onboardingFlow.querySelector('[data-onboarding-next="3"]').disabled = !result.valid;
  }, 420);
}

function renderLibrarySetupReview() {
  if (!libraryPathValid) return;
  const summary = getLibrarySetupSummary(librarySetupMode, selectedLibraryPath);
  document.querySelector('#setup-summary-description').textContent = summary.description;
  document.querySelector('#setup-summary-path').textContent = summary.path;
  document.querySelector('#folder-preview-tree').innerHTML = summary.folders.map(({ type, project }) => `
    <div><span>⌄ ${escapeHtml(type)}</span><small>└─ ${escapeHtml(project)}</small></div>
  `).join('');
}

function openOriginalViewer(assetId, trigger) {
  const asset = getWorkingAsset(assetId);
  if (!asset) return;
  commitPendingDescription();
  originalViewerTrigger = trigger;
  document.querySelector('#original-viewer-title').textContent = asset.title;
  document.querySelector('#original-viewer-meta').textContent = `${asset.projectType} / ${asset.projectName}`;
  originalViewerImage.className = `original-viewer-image ${asset.crop || ''}`;
  originalViewerImage.style.backgroundImage = asset.webPath ? `url('${asset.webPath}')` : '';
  originalViewerImage.style.backgroundSize = asset.webPath ? 'contain' : '';
  originalViewerImage.style.backgroundPosition = 'center';
  originalViewerImage.style.backgroundRepeat = 'no-repeat';
  originalViewerImage.setAttribute('aria-label', `${asset.title} 原图预览`);
  originalViewer.hidden = false;
  originalViewer.querySelector('.original-viewer-close').focus();
}

function closeOriginalViewer() {
  originalViewer.hidden = true;
  if (originalViewerTrigger?.isConnected) originalViewerTrigger.focus();
  originalViewerTrigger = null;
}

function renderProjectTree() {
  projectTreeElement.innerHTML = workingProjectTree.map((group, index) => `
    <details class="tree-group ${state.selectedProject === group.type ? 'is-selected' : ''}" ${index === 0 ? 'open' : ''}>
      <summary data-project-type="${escapeHtml(group.type)}">
        <span>${escapeHtml(group.type)}</span><span class="tree-count">${group.count}</span>
      </summary>
      ${group.projects.map((project) => `<button class="tree-button" type="button" data-coming="project-name">${escapeHtml(project)}</button>`).join('')}
    </details>
  `).join('');
}

function renderTagTree(filter = '') {
  const normalized = filter.trim().toLowerCase();
  tagTreeElement.innerHTML = workingTagGroups.map((group, index) => {
    const visibleTags = group.tags.filter((tag) => !normalized || tag.toLowerCase().includes(normalized));
    if (!visibleTags.length) return '';
    return `
      <details class="tag-group" data-tag-group="${escapeHtml(group.label)}" ${index < 2 || normalized || group.label === lastAddedKeywordGroup ? 'open' : ''}>
        <summary>${escapeHtml(group.label)}</summary>
        <div class="tag-options">
          ${visibleTags.map((tag) => `<button class="tag-filter ${state.selectedTags.includes(tag) ? 'is-selected' : ''}" type="button" draggable="true" data-tag="${escapeHtml(tag)}" data-tag-group="${escapeHtml(group.label)}" aria-label="${escapeHtml(tag)}，可拖动到其他分类" title="拖动到其他分类">${escapeHtml(tag)}</button>`).join('')}
        </div>
      </details>
    `;
  }).join('');
}

function assetCard(result, showReason = false) {
  const { asset, reasons = [] } = result;
  return `
    <button class="asset-card" type="button" data-asset-id="${asset.id}" data-ratio="${asset.ratio}">
      <div class="asset-image ${asset.crop || ''}"${imageStyle(asset)} role="img" aria-label="${escapeHtml(asset.title)}"></div>
      <div class="asset-meta">
        <div class="asset-kicker"><span>${escapeHtml(asset.projectType)} · ${escapeHtml(asset.projectName)}</span><span><i class="status-dot ${asset.status === '已解析' ? '' : 'pending'}"></i>${asset.status}</span></div>
        <h3>${escapeHtml(asset.title)}</h3>
        <div class="asset-tags">${asset.tags.slice(0, 3).map((tag) => `<span>${escapeHtml(tag)}</span>`).join('')}</div>
        ${showReason ? `<p class="match-reason">匹配：${escapeHtml(reasons.slice(0, 2).join(' · ') || '当前筛选条件')}</p>` : ''}
      </div>
    </button>
  `;
}

function renderHome() {
  state.view = 'home';
  previewPanel.hidden = true;
  const queue = getQueueSummary(workingAssets);
  const progress = queue.total ? Math.round((queue.completed / queue.total) * 100) : 0;
  content.innerHTML = `
    <section aria-labelledby="home-title">
      <div class="section-title home-section-title"><h2 id="home-title">最近添加</h2><span>按保存时间</span></div>
      <div class="asset-grid">${workingAssets.slice(0, 8).map((asset) => assetCard({ asset })).join('')}</div>

      <button class="queue-panel" type="button" data-view="unparsed">
        <span class="queue-heading"><i class="status-dot pending"></i><strong>未解析队列</strong><small>正在后台理解新保存的图片</small></span>
        <span class="queue-stats"><span><b>${queue.waiting}</b> 等待</span><span><b>${queue.processing}</b> 解析中</span><span class="needs-attention"><b>${queue.failed}</b> 需重试</span></span>
        <span class="queue-progress" aria-label="已解析 ${queue.completed} 张，共 ${queue.total} 张"><i style="width:${progress}%"></i></span>
        <span class="queue-link" aria-hidden="true">查看队列 →</span>
      </button>
    </section>
  `;
  syncNavigation();
}

function queueStatusDetail(asset) {
  if (asset.status === '解析中') return `${asset.analysis?.stage ?? '正在解析'} · ${asset.analysis?.progress ?? 0}%`;
  if (asset.status === '解析失败') return asset.analysis?.error ?? '解析失败，请重试';
  return asset.analysis?.stage ?? '等待进入解析队列';
}

function queueFilterButton(filter, label, count) {
  return `<button type="button" class="queue-filter ${state.queueFilter === filter ? 'is-active' : ''}" data-queue-filter="${filter}">${label}<b>${count}</b></button>`;
}

function renderUnparsed() {
  state.view = 'unparsed';
  previewPanel.hidden = true;
  const summary = getQueueSummary(workingAssets);
  const queueAssets = getQueueAssets(workingAssets, state.queueFilter);
  const progress = summary.total ? Math.round((summary.completed / summary.total) * 100) : 0;

  content.innerHTML = `
    <section class="queue-view" aria-labelledby="queue-title">
      <header class="queue-view-header">
        <div><p class="eyebrow">Analysis queue</p><h1 id="queue-title">未解析</h1><p>${summary.outstanding} 张待处理，系统将在后台依次生成图片描述与关键词。</p></div>
        <div class="queue-header-actions">
          <button class="run-analysis-button" type="button" data-run-analysis ${analysisServiceStatus.configured && summary.waiting ? '' : 'disabled'} title="${analysisServiceStatus.configured ? '调用千问视觉模型解析下一张图片' : '开发者 AI 服务尚未连接，普通用户无需配置'}">▶ ${analysisServiceStatus.configured ? '解析下一张' : 'AI 服务未连接'}</button>
          <button class="retry-all-button" type="button" data-retry-all ${summary.failed ? '' : 'disabled'}>↻ 重试全部失败项${summary.failed ? `（${summary.failed}）` : ''}</button>
        </div>
      </header>
      ${analysisServiceStatus.available && !analysisServiceStatus.configured ? '<p class="analysis-setup-note"><strong>AI 服务暂未连接</strong><span>图片会安全保留在队列中；普通用户无需配置或支付 API Key。</span></p>' : ''}

      <div class="queue-overview" aria-label="解析队列统计">
        <div><span>等待解析</span><strong>${summary.waiting}</strong><small>尚未开始</small></div>
        <div><span>解析中</span><strong>${summary.processing}</strong><small>后台处理中</small></div>
        <div class="has-warning"><span>解析失败</span><strong>${summary.failed}</strong><small>需要重试</small></div>
        <div class="queue-completion"><span>整体进度</span><strong>${summary.completed} / ${summary.total}</strong><small>${progress}% 已完成</small><i><b style="width:${progress}%"></b></i></div>
      </div>

      <div class="queue-toolbar">
        <div class="queue-filters" aria-label="按解析状态筛选">
          ${queueFilterButton('all', '全部', summary.outstanding)}
          ${queueFilterButton('waiting', '等待', summary.waiting)}
          ${queueFilterButton('processing', '解析中', summary.processing)}
          ${queueFilterButton('failed', '失败', summary.failed)}
        </div>
        <span>数量来自当前素材库实时状态</span>
      </div>

      <div class="queue-list">
        ${queueAssets.length ? queueAssets.map((asset) => `
          <article class="queue-row" data-status="${escapeHtml(asset.status)}">
            <div class="queue-thumb ${asset.crop || ''}"${imageStyle(asset)} role="img" aria-label="${escapeHtml(asset.title)}"></div>
            <div class="queue-asset-info"><strong>${escapeHtml(asset.title)}</strong><span>${escapeHtml(asset.projectType)} / ${escapeHtml(asset.projectName)}</span><small>${escapeHtml(asset.sourceSite ?? asset.source)} · 加入于 ${escapeHtml(asset.analysis?.queuedAt ?? '最近')}</small></div>
            <div class="queue-state-cell">
              <span class="queue-status-badge"><i></i>${escapeHtml(asset.status)}</span>
              <p>${escapeHtml(queueStatusDetail(asset))}</p>
              ${asset.status === '解析中' ? `<div class="row-progress"><i style="width:${asset.analysis?.progress ?? 0}%"></i></div>` : ''}
            </div>
            <div class="queue-row-actions">
              ${asset.status === '解析失败' ? `<button type="button" data-retry-asset="${asset.id}">重新解析</button>` : ''}
              <button type="button" data-asset-id="${asset.id}">查看图片</button>
            </div>
          </article>
        `).join('') : `
          <div class="queue-empty"><span>✓</span><h2>当前分类没有任务</h2><p>可以切换其他状态，或继续从浏览器保存图片。</p></div>
        `}
      </div>
    </section>
  `;
  syncNavigation();
}

function activeFilterMarkup() {
  const items = [
    ...(state.selectedProject ? [{ kind: 'project', value: state.selectedProject }] : []),
    ...state.selectedTags.map((value) => ({ kind: 'tag', value })),
  ];
  if (!items.length) return '';
  return `
    <div class="active-filters" aria-label="当前筛选条件">
      ${items.map(({ kind, value }) => `<button class="filter-chip" type="button" data-remove-filter="${kind}" data-value="${escapeHtml(value)}">${kind === 'project' ? '项目' : '关键词'}：${escapeHtml(value)}<span>×</span></button>`).join('')}
      <button class="clear-button" type="button" data-clear-filters>清除筛选</button>
    </div>
  `;
}

function renderResults() {
  state.view = 'results';
  previewPanel.hidden = true;
  const results = searchAssets(state.query, workingAssets, {
    projectTypes: state.selectedProject ? [state.selectedProject] : [],
    tags: state.selectedTags,
  });
  const title = state.query ? `“${escapeHtml(state.query)}”` : state.selectedProject || state.selectedTags.join(' · ') || '全部素材';

  if (!results.length) {
    content.innerHTML = `
      <div class="result-header"><p class="eyebrow">Search result</p><h1>${title}</h1>${activeFilterMarkup()}</div>
      <section class="empty-state">
        <span>∅</span><h2>没有图片同时满足这些条件</h2>
        <p>当前采用严格的 AND 筛选。可以移除一个关键词标签，或换一种自然语言描述。</p>
        <div class="empty-actions"><button type="button" data-clear-filters>清除筛选条件</button><button type="button" data-clear-all>重新搜索</button></div>
      </section>
    `;
  } else {
    content.innerHTML = `
      <section aria-labelledby="result-title">
        <div class="result-header">
          <p class="eyebrow">Search result</p>
          <h1 id="result-title">${title}</h1>
          <div class="result-summary"><span>找到 ${results.length} 张图片 · 按语义相关度排序</span><span>${state.query ? (state.selectedProject || state.selectedTags.length ? '自然语言为基准 · 后续筛选采用 AND' : '自然语言正在检索整个素材库') : '项目与多个关键词采用 AND'}</span></div>
          ${activeFilterMarkup()}
        </div>
        <div class="asset-grid">${results.map((result) => assetCard(result, Boolean(state.query))).join('')}</div>
      </section>
    `;
  }
  syncNavigation();
}

function syncNavigation() {
  document.querySelectorAll('[data-view]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.view === (state.view === 'results' ? '' : state.view));
  });
  const summary = getQueueSummary(workingAssets);
  unparsedCount.textContent = summary.outstanding;
  unparsedCount.hidden = summary.outstanding === 0;
  renderProjectTree();
  renderTagTree(tagSearch.value);
}

function showSuggestions() {
  const items = getSuggestions(searchInput.value, state.history, workingAssets);
  if (!items.length) {
    suggestions.hidden = true;
    searchInput.setAttribute('aria-expanded', 'false');
    return;
  }
  suggestions.innerHTML = `<p class="suggestion-label">${searchInput.value ? '关键词与历史建议' : '最近搜索'}</p>${items.map((item) => `<button class="suggestion-button" type="button" data-suggestion="${escapeHtml(item)}"><span>↗</span>${escapeHtml(item)}</button>`).join('')}`;
  suggestions.hidden = false;
  searchInput.setAttribute('aria-expanded', 'true');
}

function closeSuggestions() {
  suggestions.hidden = true;
  searchInput.setAttribute('aria-expanded', 'false');
}

function getWorkingAsset(assetId) {
  return workingAssets.find(({ id }) => id === assetId);
}

function replaceWorkingAsset(updatedAsset) {
  workingAssets = workingAssets.map((asset) => asset.id === updatedAsset.id ? updatedAsset : asset);
  const summary = getQueueSummary(workingAssets);
  unparsedCount.textContent = summary.outstanding;
  unparsedCount.hidden = summary.outstanding === 0;
}

function assetSnapshot(asset) {
  return {
    description: asset.description,
    tags: [...asset.tags],
    status: asset.status,
    manualTags: [...(manualTagsByAsset.get(asset.id) ?? [])],
    manualDescription: manuallyEditedDescriptions.has(asset.id),
  };
}

function syncVisibleAssetCard(asset) {
  const card = content.querySelector(`[data-asset-id="${CSS.escape(asset.id)}"]`);
  if (!card) return;
  card.querySelector('.asset-tags').innerHTML = asset.tags.slice(0, 3).map((tag) => `<span>${escapeHtml(tag)}</span>`).join('');
  const status = card.querySelector('.asset-kicker span:last-child');
  if (status) status.innerHTML = `<i class="status-dot ${asset.status === '已解析' ? '' : 'pending'}"></i>${escapeHtml(asset.status)}`;
}

function assetHistory(assetId = previewAssetId) {
  return assetEditHistory.get(assetId) ?? [];
}

function recordAssetEdit(assetId, snapshot) {
  const history = [...assetHistory(assetId), snapshot].slice(-MAX_ASSET_EDIT_HISTORY);
  assetEditHistory.set(assetId, history);
  return history.length;
}

function setPreviewEditStatus(message, tone = 'saved', undoAvailable = true) {
  const status = previewPanel.querySelector('.preview-edit-status');
  if (!status) return;
  status.dataset.tone = tone;
  status.querySelector('span').textContent = message;
  const undoButton = status.querySelector('button');
  const historyCount = assetHistory().length;
  undoButton.hidden = !undoAvailable || historyCount === 0;
  undoButton.textContent = historyCount > 1 ? `撤销（${historyCount}）` : '撤销';
}

function existingTagOptionsMarkup(asset, query = '') {
  const options = getExistingTagOptions(workingAssets, asset.tags, query);
  if (!options.length) {
    return '<p class="preview-existing-tags-empty">没有其他匹配的库内关键词</p>';
  }
  return options.map(({ value, count }) => `
    <button type="button" data-add-existing-asset-tag="${escapeHtml(value)}" title="添加关键词 ${escapeHtml(value)}">
      <span>${escapeHtml(value)}</span><sup>${count}</sup>
    </button>
  `).join('');
}

function renderPreview(asset, { focus = 'close' } = {}) {
  const manualTags = manualTagsByAsset.get(asset.id) ?? new Set();
  const descriptionSource = manuallyEditedDescriptions.has(asset.id) ? '人工修改' : 'AI 生成';
  const [fallbackSite = '来源网站', fallbackCapturedAt = ''] = (asset.source || '').split(' · ');
  const sourceSite = asset.sourceSite ?? fallbackSite;
  const sourcePageTitle = asset.sourcePageTitle ?? asset.projectName;
  const sourceUrl = asset.sourceUrl ?? '#';
  const sourceCapturedAt = asset.sourceCapturedAt ?? fallbackCapturedAt;
  previewPanel.innerHTML = `
    <div class="preview-image-wrap">
      <div class="preview-image ${asset.crop || ''}"${imageStyle(asset)} role="img" aria-label="${escapeHtml(asset.title)}"></div>
      <button class="preview-close" type="button" aria-label="关闭详情预览">×</button>
      <button class="preview-open-original" type="button" data-open-original="${asset.id}"><span aria-hidden="true">⛶</span> 查看原图</button>
    </div>
    <h2>${escapeHtml(asset.title)}</h2>
    <div class="preview-location">
      <p class="preview-path">${escapeHtml(asset.projectType)} / ${escapeHtml(asset.projectName)}</p>
      <button type="button" data-reveal-asset="${asset.id}">打开所在文件夹 <span aria-hidden="true">↗</span></button>
    </div>
    <div class="preview-field-heading"><p class="preview-label">图片描述</p><span class="description-source">${descriptionSource}</span></div>
    <textarea class="preview-description-editor" aria-label="图片描述" rows="5">${escapeHtml(asset.description)}</textarea>
    <div class="preview-edit-status" data-tone="idle" aria-live="polite"><span>修改后自动保存</span><button type="button" data-undo-asset-edit hidden>撤销</button></div>
    <div class="preview-field-heading"><p class="preview-label">当前关键词</p><span>仅点击 × 删除</span></div>
    <div class="preview-tags preview-tags-editable">
      ${asset.tags.map((tag) => `
        <span class="preview-tag-item ${manualTags.has(tag) ? 'is-manual' : 'is-ai'}" title="${manualTags.has(tag) ? '人工添加' : 'AI 生成'}">
          <span class="preview-tag-name">${escapeHtml(tag)}</span>
          <button class="preview-tag-remove" type="button" data-remove-asset-tag="${escapeHtml(tag)}" aria-label="删除关键词 ${escapeHtml(tag)}"><span aria-hidden="true">×</span></button>
        </span>
      `).join('')}
    </div>
    <form class="preview-keyword-form">
      <label for="preview-keyword-input">添加关键词</label>
      <div class="preview-keyword-input-wrap">
        <span aria-hidden="true">⌕</span>
        <input id="preview-keyword-input" class="preview-keyword-input" type="text" placeholder="搜索已有词，或输入新词" autocomplete="off" />
        <button type="submit">添加</button>
      </div>
      <div class="preview-existing-tags" aria-label="素材库已有关键词候选">
        ${existingTagOptionsMarkup(asset)}
      </div>
      <p class="preview-keyword-help">点击候选复用；输入新词后按 Enter 创建</p>
      <p class="preview-tag-error" role="alert" hidden></p>
    </form>
    <p class="preview-note">人工修改优先于 AI 结果；普通重新解析不会覆盖你的修正。</p>
    <section class="preview-source" aria-labelledby="preview-source-title">
      <p class="preview-label" id="preview-source-title">图片来源</p>
      <div class="preview-source-card">
        <div class="preview-source-heading">
          <span class="preview-source-mark" aria-hidden="true">↗</span>
          <div><strong>${escapeHtml(sourceSite)}</strong><span>${escapeHtml(sourcePageTitle)}</span></div>
        </div>
        <a class="preview-source-link" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">打开来源网站 <span aria-hidden="true">↗</span></a>
        <p class="preview-source-url" title="${escapeHtml(sourceUrl)}">${escapeHtml(sourceUrl)}</p>
        ${sourceCapturedAt ? `<small>采集于 ${escapeHtml(sourceCapturedAt)}</small>` : ''}
      </div>
    </section>
  `;
  previewPanel.hidden = false;
  const historyCount = assetHistory(asset.id).length;
  if (historyCount) setPreviewEditStatus(`可继续撤销 ${historyCount} 步`, 'idle', true);
  const focusTarget = focus === 'tag' || focus === 'existing'
    ? previewPanel.querySelector('.preview-keyword-input')
      : previewPanel.querySelector('.preview-close');
  focusTarget?.focus();
}

function refreshExistingTagOptions(query = '') {
  const asset = getWorkingAsset(previewAssetId);
  const options = previewPanel.querySelector('.preview-existing-tags');
  if (!asset || !options) return;
  options.innerHTML = existingTagOptionsMarkup(asset, query);
}

function commitAssetTagAddition(value, { focus = 'tag' } = {}) {
  const current = getWorkingAsset(previewAssetId);
  if (!current) return { error: '未找到当前图片' };
  const result = addAssetTag(current, value);
  if (result.error) return result;

  const snapshot = assetSnapshot(current);
  const manualTags = new Set(manualTagsByAsset.get(current.id) ?? []);
  manualTags.add(result.tag);
  manualTagsByAsset.set(current.id, manualTags);
  if (!workingTagGroups.some((group) => group.tags.includes(result.tag))) {
    workingTagGroups.find((group) => group.label === '其他').tags.push(result.tag);
    lastAddedKeywordGroup = '其他';
    renderTagTree(tagSearch.value);
  }
  replaceWorkingAsset(result.asset);
  recordAssetEdit(current.id, snapshot);
  syncVisibleAssetCard(result.asset);
  renderPreview(result.asset, { focus });
  setPreviewEditStatus(`已添加“${result.tag}”`, 'saved', true);
  return result;
}

function openPreview(assetId, trigger = null) {
  const asset = getWorkingAsset(assetId);
  if (!asset) return;
  previewAssetId = assetId;
  if (trigger) previewTrigger = trigger;
  renderPreview(asset);
}

function closePreview({ restoreFocus = true } = {}) {
  commitPendingDescription();
  previewPanel.hidden = true;
  previewAssetId = '';
  if (restoreFocus && previewTrigger?.isConnected) previewTrigger.focus();
}

function clearFilters() {
  state.selectedProject = '';
  state.selectedTags = [];
  renderResults();
}

function commitPendingDescription() {
  if (!pendingDescriptionEdit) return;
  window.clearTimeout(descriptionSaveTimer);
  const pending = pendingDescriptionEdit;
  pendingDescriptionEdit = null;
  const current = getWorkingAsset(pending.assetId);
  if (!current) return;
  const result = updateAssetDescription(current, pending.value);
  const editor = previewAssetId === pending.assetId
    ? previewPanel.querySelector('.preview-description-editor')
    : null;
  if (result.error) {
    if (editor) {
      editor.setAttribute('aria-invalid', 'true');
    }
    setPreviewEditStatus(result.error, 'error', false);
    return;
  }
  editor?.setAttribute('aria-invalid', 'false');
  if (!result.changed) {
    setPreviewEditStatus('已保存', 'saved', assetHistory(current.id).length > 0);
    return;
  }
  const snapshot = assetSnapshot(current);
  replaceWorkingAsset(result.asset);
  manuallyEditedDescriptions.add(current.id);
  recordAssetEdit(current.id, snapshot);
  syncVisibleAssetCard(result.asset);
  const source = previewPanel.querySelector('.description-source');
  if (source && previewAssetId === pending.assetId) source.textContent = '人工修改';
  setPreviewEditStatus('已保存', 'saved', true);
}

previewPanel.addEventListener('input', (event) => {
  const keywordInput = event.target.closest('.preview-keyword-input');
  if (keywordInput) {
    refreshExistingTagOptions(keywordInput.value);
    const error = previewPanel.querySelector('.preview-tag-error');
    if (error) error.hidden = true;
    return;
  }
  const editor = event.target.closest('.preview-description-editor');
  if (!editor || !previewAssetId) return;
  window.clearTimeout(descriptionSaveTimer);
  setPreviewEditStatus('正在保存…', 'saving', false);
  pendingDescriptionEdit = { assetId: previewAssetId, value: editor.value };
  descriptionSaveTimer = window.setTimeout(commitPendingDescription, 450);
});

previewPanel.addEventListener('focusout', (event) => {
  if (event.target.closest('.preview-description-editor')) {
    commitPendingDescription();
  }
});

previewPanel.addEventListener('keydown', (event) => {
  const input = event.target.closest('.preview-keyword-input');
  if (input && event.key === 'Enter' && !event.isComposing) {
    event.preventDefault();
    input.form?.requestSubmit();
  }
});

previewPanel.addEventListener('submit', (event) => {
  const form = event.target.closest('.preview-keyword-form');
  if (!form || !previewAssetId) return;
  event.preventDefault();
  const input = form.querySelector('.preview-keyword-input');
  const error = form.querySelector('.preview-tag-error');
  const result = commitAssetTagAddition(input.value, { focus: 'tag' });
  if (result.error) {
    error.textContent = result.error;
    error.hidden = false;
    input.setAttribute('aria-invalid', 'true');
    input.focus();
    return;
  }
});

searchForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const transition = startNaturalLanguageSearch(searchInput.value, state);
  state.query = transition.query;
  state.selectedProject = transition.selectedProject;
  state.selectedTags = transition.selectedTags;
  if (state.query) state.history = [state.query, ...state.history.filter((item) => item !== state.query)].slice(0, 8);
  closeSuggestions();
  renderResults();
  if (transition.clearedFilters) showToast('已清除之前的项目与关键词筛选，正在检索整个素材库');
});

searchInput.addEventListener('focus', showSuggestions);
searchInput.addEventListener('input', showSuggestions);
searchInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    searchForm.requestSubmit();
  }
});

tagSearch.addEventListener('input', () => renderTagTree(tagSearch.value));

addKeywordButton.addEventListener('click', () => {
  keywordForm.reset();
  keywordCategory.value = '其他';
  keywordError.hidden = true;
  keywordName.setAttribute('aria-invalid', 'false');
  keywordDialog.showModal();
  keywordName.focus();
});

function closeKeywordDialog() {
  keywordDialog.close();
  addKeywordButton.focus();
}

document.querySelector('#close-keyword-dialog').addEventListener('click', closeKeywordDialog);
document.querySelector('#cancel-keyword').addEventListener('click', closeKeywordDialog);

keywordForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const allKeywords = workingTagGroups.flatMap((group) => group.tags);
  const result = validateKeyword(keywordName.value, allKeywords);
  if (!result.valid) {
    keywordError.textContent = result.error;
    keywordError.hidden = false;
    keywordName.setAttribute('aria-invalid', 'true');
    keywordName.focus();
    return;
  }

  const group = workingTagGroups.find(({ label }) => label === keywordCategory.value);
  group.tags.push(result.value);
  lastAddedKeywordGroup = group.label;
  tagSearch.value = '';
  renderTagTree();
  closeKeywordDialog();
  showToast(`已添加关键词标签“${result.value}”`);
});

function clearDragFeedback() {
  tagTreeElement.querySelectorAll('.is-drop-target, .is-drag-source, .is-dragging').forEach((element) => {
    element.classList.remove('is-drop-target', 'is-drag-source', 'is-dragging');
  });
  document.body.classList.remove('is-tag-dragging');
}

tagTreeElement.addEventListener('dragstart', (event) => {
  const tag = event.target.closest('.tag-filter');
  if (!tag) return;
  draggedKeyword = { value: tag.dataset.tag, sourceGroup: tag.dataset.tagGroup };
  tagWasDragged = true;
  tag.classList.add('is-dragging');
  tag.closest('.tag-group').classList.add('is-drag-source');
  document.body.classList.add('is-tag-dragging');
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', tag.dataset.tag);
});

tagTreeElement.addEventListener('dragover', (event) => {
  const group = event.target.closest('.tag-group');
  if (!group || !draggedKeyword || group.dataset.tagGroup === draggedKeyword.sourceGroup) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  tagTreeElement.querySelectorAll('.is-drop-target').forEach((item) => item.classList.remove('is-drop-target'));
  group.classList.add('is-drop-target');
  group.open = true;
});

tagTreeElement.addEventListener('dragleave', (event) => {
  const group = event.target.closest('.tag-group');
  if (group && !group.contains(event.relatedTarget)) group.classList.remove('is-drop-target');
});

tagTreeElement.addEventListener('drop', (event) => {
  const group = event.target.closest('.tag-group');
  if (!group || !draggedKeyword) return;
  event.preventDefault();
  const targetGroup = group.dataset.tagGroup;
  const previousGroups = workingTagGroups.map((item) => ({ ...item, tags: [...item.tags] }));
  const result = moveKeyword(workingTagGroups, draggedKeyword.value, draggedKeyword.sourceGroup, targetGroup);
  if (!result.moved) {
    showToast(result.error);
    draggedKeyword = null;
    clearDragFeedback();
    return;
  }

  const move = { ...draggedKeyword, targetGroup };
  workingTagGroups = result.groups;
  lastAddedKeywordGroup = targetGroup;
  renderTagTree(tagSearch.value);
  showToast(`已将“${move.value}”移动到“${targetGroup}”`, {
    label: '撤销',
    run: () => {
      workingTagGroups = previousGroups;
      lastAddedKeywordGroup = move.sourceGroup;
      renderTagTree(tagSearch.value);
      showToast(`已撤销“${move.value}”的分类移动`);
    },
  });
  draggedKeyword = null;
  window.setTimeout(() => { tagWasDragged = false; }, 0);
  clearDragFeedback();
});

tagTreeElement.addEventListener('dragend', () => {
  clearDragFeedback();
  draggedKeyword = null;
  window.setTimeout(() => { tagWasDragged = false; }, 0);
});

document.addEventListener('click', async (event) => {
  if (event.target.closest('[data-close-original]')) {
    closeOriginalViewer();
    return;
  }

  const openOriginalButton = event.target.closest('[data-open-original]');
  if (openOriginalButton) {
    openOriginalViewer(openOriginalButton.dataset.openOriginal, openOriginalButton);
    return;
  }

  if (event.target.closest('[data-open-library-setup]')) {
    showLibrarySetup();
    return;
  }

  const onboardingNext = event.target.closest('[data-onboarding-next]');
  if (onboardingNext && !onboardingNext.disabled) {
    setOnboardingStep(Number(onboardingNext.dataset.onboardingNext));
    return;
  }

  const onboardingBack = event.target.closest('[data-onboarding-back]');
  if (onboardingBack) {
    setOnboardingStep(Number(onboardingBack.dataset.onboardingBack));
    return;
  }

  const setupMode = event.target.closest('[data-setup-mode]');
  if (setupMode) {
    librarySetupMode = setupMode.dataset.setupMode;
    onboardingFlow.querySelectorAll('[data-setup-mode]').forEach((button) => {
      const selected = button === setupMode;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-checked', String(selected));
    });
    return;
  }

  if (event.target.closest('[data-toggle-folder-choices]')) {
    folderChoices.hidden = !folderChoices.hidden;
    return;
  }

  const libraryPath = event.target.closest('[data-library-path]');
  if (libraryPath) {
    selectLibraryPath(libraryPath.dataset.libraryPath);
    return;
  }

  if (event.target.closest('[data-complete-onboarding]')) {
    onboardingFlow.hidden = true;
    document.querySelector('.sidebar-footer p').innerHTML = '<i></i>素材库已连接 · 插件正常';
    renderHome();
    showToast(`素材库已建立在 ${selectedLibraryPath}`);
    searchInput.focus();
    return;
  }

  if (event.target.closest('.preview-close')) {
    closePreview();
    return;
  }

  const revealAssetButton = event.target.closest('[data-reveal-asset]');
  if (revealAssetButton) {
    const asset = getWorkingAsset(revealAssetButton.dataset.revealAsset);
    if (asset) showToast(`将在资源管理器中定位：${asset.projectType} / ${asset.projectName}`);
    return;
  }

  if (event.target.closest('[data-undo-asset-edit]') && assetHistory().length) {
    const current = getWorkingAsset(previewAssetId);
    if (!current) return;
    const history = [...assetHistory(current.id)];
    const snapshot = history.pop();
    const restored = restoreAssetSnapshot(current, snapshot);
    replaceWorkingAsset(restored);
    manualTagsByAsset.set(current.id, new Set(snapshot.manualTags));
    if (snapshot.manualDescription) manuallyEditedDescriptions.add(current.id);
    else manuallyEditedDescriptions.delete(current.id);
    assetEditHistory.set(current.id, history);
    syncVisibleAssetCard(restored);
    renderPreview(restored);
    setPreviewEditStatus(history.length ? `已撤销，可继续回退 ${history.length} 步` : '已撤销至最初状态', 'saved', history.length > 0);
    return;
  }

  const addExistingAssetTagButton = event.target.closest('[data-add-existing-asset-tag]');
  if (addExistingAssetTagButton && previewAssetId) {
    commitAssetTagAddition(addExistingAssetTagButton.dataset.addExistingAssetTag, { focus: 'existing' });
    return;
  }

  const removeAssetTagButton = event.target.closest('[data-remove-asset-tag]');
  if (removeAssetTagButton && previewAssetId) {
    const current = getWorkingAsset(previewAssetId);
    if (!current) return;
    const result = removeAssetTag(current, removeAssetTagButton.dataset.removeAssetTag);
    if (!result.changed) return;
    const snapshot = assetSnapshot(current);
    const manualTags = new Set(manualTagsByAsset.get(current.id) ?? []);
    manualTags.delete(removeAssetTagButton.dataset.removeAssetTag);
    manualTagsByAsset.set(current.id, manualTags);
    replaceWorkingAsset(result.asset);
    recordAssetEdit(current.id, snapshot);
    syncVisibleAssetCard(result.asset);
    renderPreview(result.asset, { focus: 'tag' });
    setPreviewEditStatus(`已删除“${removeAssetTagButton.dataset.removeAssetTag}”`, 'saved', true);
    return;
  }

  const suggestion = event.target.closest('[data-suggestion]');
  if (suggestion) {
    searchInput.value = suggestion.dataset.suggestion;
    const transition = startNaturalLanguageSearch(suggestion.dataset.suggestion, state);
    state.query = transition.query;
    state.selectedProject = transition.selectedProject;
    state.selectedTags = transition.selectedTags;
    closeSuggestions();
    renderResults();
    if (transition.clearedFilters) showToast('已清除之前的项目与关键词筛选，正在检索整个素材库');
    return;
  }

  if (!event.target.closest('.search-form')) closeSuggestions();

  const projectType = event.target.closest('[data-project-type]');
  if (projectType) {
    event.preventDefault();
    state.selectedProject = state.selectedProject === projectType.dataset.projectType ? '' : projectType.dataset.projectType;
    renderResults();
    return;
  }

  const tag = event.target.closest('[data-tag]');
  if (tag) {
    if (tagWasDragged) return;
    const value = tag.dataset.tag;
    state.selectedTags = state.selectedTags.includes(value)
      ? state.selectedTags.filter((item) => item !== value)
      : [...state.selectedTags, value];
    renderResults();
    return;
  }

  const view = event.target.closest('[data-view]');
  if (view) {
    state.query = '';
    searchInput.value = '';
    if (view.dataset.view === 'home') {
      state.selectedProject = '';
      state.selectedTags = [];
      renderHome();
    } else if (view.dataset.view === 'unparsed') {
      state.queueFilter = 'all';
      renderUnparsed();
    } else {
      state.view = 'all';
      renderResults();
      state.view = 'all';
      syncNavigation();
    }
    return;
  }

  const queueFilter = event.target.closest('[data-queue-filter]');
  if (queueFilter) {
    state.queueFilter = queueFilter.dataset.queueFilter;
    renderUnparsed();
    return;
  }

  const retryAssetButton = event.target.closest('[data-retry-asset]');
  if (retryAssetButton) {
    const current = getWorkingAsset(retryAssetButton.dataset.retryAsset);
    if (!current) return;
    const result = retryFailedAsset(current);
    if (result.changed) replaceWorkingAsset(result.asset);
    renderUnparsed();
    showToast(`“${current.title}”已重新加入等待队列`);
    return;
  }

  if (event.target.closest('[data-retry-all]')) {
    const failedAssets = getQueueAssets(workingAssets, 'failed');
    workingAssets = workingAssets.map((asset) => retryFailedAsset(asset).asset);
    renderUnparsed();
    if (failedAssets.length) showToast(`已将 ${failedAssets.length} 个失败任务重新加入队列`);
    return;
  }

  const runAnalysisButton = event.target.closest('[data-run-analysis]');
  if (runAnalysisButton) {
    runAnalysisButton.disabled = true;
    runAnalysisButton.textContent = '正在解析…';
    try {
      const result = await runNextAnalysis();
      const liveAssets = await loadLiveLibrary();
      if (liveAssets.length) {
        workingAssets = liveAssets;
        workingProjectTree = projectTreeFromAssets(liveAssets);
        workingTagGroups = mergeUnknownTagsIntoGroups(workingTagGroups, liveAssets);
      }
      renderUnparsed();
      showToast(result.status === 'completed' ? '已生成图片描述与预设关键词' : `解析失败：${result.message}`);
    } catch (error) {
      renderUnparsed();
      showToast(error.message);
    }
    return;
  }

  const removeFilter = event.target.closest('[data-remove-filter]');
  if (removeFilter) {
    if (removeFilter.dataset.removeFilter === 'project') state.selectedProject = '';
    else state.selectedTags = state.selectedTags.filter((tagValue) => tagValue !== removeFilter.dataset.value);
    renderResults();
    return;
  }

  if (event.target.closest('[data-clear-filters]')) { clearFilters(); return; }
  if (event.target.closest('[data-clear-all]')) {
    state.query = '';
    state.selectedProject = '';
    state.selectedTags = [];
    searchInput.value = '';
    renderHome();
    searchInput.focus();
    return;
  }

  const card = event.target.closest('[data-asset-id]');
  if (card) { openPreview(card.dataset.assetId, card); return; }

  const coming = event.target.closest('[data-coming]');
  if (coming) showToast('该模块将在下一阶段原型中补全');
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    if (!originalViewer.hidden) closeOriginalViewer();
    else if (!suggestions.hidden) closeSuggestions();
    else if (!previewPanel.hidden) {
      closePreview();
    }
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    searchInput.focus();
    showSuggestions();
  }
});

async function initializeApp() {
  const [liveAssets, serviceStatus] = await Promise.all([loadLiveLibrary(), loadAnalysisServiceStatus()]);
  analysisServiceStatus = serviceStatus;
  if (liveAssets.length) {
    workingAssets = liveAssets;
    workingProjectTree = projectTreeFromAssets(liveAssets);
    workingTagGroups = mergeUnknownTagsIntoGroups(workingTagGroups, liveAssets);
  }
  renderProjectTree();
  renderTagTree();
  renderHome();
  window.requestAnimationFrame(() => {
  if (new URLSearchParams(window.location.search).get('flow') === 'onboarding') showLibrarySetup();
  else searchInput.focus();
  });
}

initializeApp();

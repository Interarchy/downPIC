import { t, setText, setLocalizedAttribute, localizedError } from './i18n.mjs';
import { accountStorage, scopeChanges, withLibraryWriteLock } from './account-storage.mjs';
import { PRESET_TYPES, STORAGE, normalizePromptScheme, normalizeSourcePageUrl, normalizeProjectType, orderedProjectTypes, resolveProjectType } from './shared.mjs';
import { getSourceImage, putSourceImage } from './source-image-store.mjs';
import { createSemanticSearch, keywordMatches } from './library-search.mjs';
import { importLocalFolder, importSummary, wireFolderDrop } from './folder-import.mjs';
import { mountAccountUI, ensureAccount, pointsEnabled, formatPoints } from './account-ui.mjs';


// 仅界面文案绑定语言；传入的名称、描述和提示词按原文展示。
function ui(zh, en) { return { zh, en }; }
function errorText(error) { return error?.zh !== undefined && error?.en !== undefined ? ui(error.zh, error.en) : error?.message || String(error); }
function clearUiText(target) { target.removeAttribute('data-i18n-zh'); target.removeAttribute('data-i18n-en'); return target; }
function writeUiText(target, value) {
  if (value && typeof value === 'object' && 'zh' in value) setText(target, value.zh, value.en);
  else clearUiText(target).textContent = value ?? '';
  return target;
}
function localizedOption(value, id) { const option = new Option('', id); writeUiText(option, value); return option; }
const $ = id => document.getElementById(id);
mountAccountUI(document.querySelector('.top-actions'));
if (pointsEnabled()) {
  $('bulk-description-points').hidden = false;
  writeUiText($('asset-consent').querySelector('span'), ui('开启后，新下载图片自动生成核心视觉描述，每张 0.1 积分；向量建索引与检索不扣积分，均受每日调用上限保护。', "New downloads receive visual descriptions at 0.1 credits per image. Indexing and search are free; daily call limits still apply."));
  $('local-demo-notice').hidden = false;
  writeUiText($('local-demo-notice'), ui('本地演示：手机号验证码未发送短信，正在确认 AI 模式…', "Local demo: no SMS sent. Checking AI mode…"));
  void request('backend.status').then(status => {
    writeUiText($('local-demo-notice'), ui(!status.online || !status.configured
    ? '本地账号服务未连接，请先启动本地服务。' : status.mockAI
      ? '本地演示：验证码和 AI 结果均为模拟，未发送短信。'
      : '当前服务不是本地模拟模式，请启动账号积分演示服务。', !status.online || !status.configured
    ? "Start the local account service to continue." : status.mockAI
      ? "Local demo: verification codes and AI results are simulated. No SMS sent."
      : "Start the local account and credits demo service."));
  }).catch(() => { writeUiText($('local-demo-notice'), ui('本地账号服务未连接，请先启动本地服务。', "Start the local account service to continue.")); });
}
const state = { schemes: [], items: [], selectedKey: null, urls: new Map(), pendingUrls: new Map(), loadNumber: 0, captures: [], activeTypes: [], previews: {}, catalog: {}, selectedFolder: null, selectedType: null, showAllCaptures: false, captureProjectView: 'small', typeChosenByUser: false, openTypes: new Set(), foldersInitialized: false, captureUrls: new Map(), capturePendingUrls: new Map(), captureLoad: 0, groups: [], assignments: {}, selectedGroupId: 'all', selectedKeys: new Set() };
let toastTimer;
let recentSearches = [];
let selectedCaptureId = null;
let captureSearchReturn = null;
let deletionSelection = [];
let failedDescriptionsOnly = false;
let descriptionTaskFailedIds = new Set();
const captureSearch = createSemanticSearch(body => request('library.embed', body), 'captures');
const promptSearch = createSemanticSearch(body => request('library.embed', body), 'prompts');
let draggingType = null;
let draggingFolder = null;
let draggingPromptKey = null;
let folderScrollFrame = 0;
let folderScrollPointerY = null;
const descriptionSaves = new Map();
const descriptionDrafts = new Map();
let viewerItems = [];
let viewerIndex = 0;
let viewerZoom = { scale: 1, x: 0, y: 0 };
let viewerDrag = null;

function applyViewerZoom() {
  const canvas = $('viewer-canvas');
  const image = $('viewer-image');
  const maxX = Math.max(0, (image.offsetWidth * viewerZoom.scale - canvas.clientWidth) / 2);
  const maxY = Math.max(0, (image.offsetHeight * viewerZoom.scale - canvas.clientHeight) / 2);
  viewerZoom.x = Math.max(-maxX, Math.min(maxX, viewerZoom.x));
  viewerZoom.y = Math.max(-maxY, Math.min(maxY, viewerZoom.y));
  image.style.transform = `translate(${viewerZoom.x}px, ${viewerZoom.y}px) scale(${viewerZoom.scale})`;
  canvas.classList.toggle('is-zoomed', viewerZoom.scale > 1);
  writeUiText($('viewer-zoom'), ui(Math.round(viewerZoom.scale * 100) + '% · 滚轮缩放', Math.round(viewerZoom.scale * 100) + "% · Scroll to zoom"));
}

function resetViewerZoom() {
  viewerZoom = { scale: 1, x: 0, y: 0 };
  viewerDrag = null;
  $('viewer-canvas').classList.remove('is-panning');
  applyViewerZoom();
}

function element(tag, className, text) {
  const result = document.createElement(tag);
  if (className) result.className = className;
  if (text !== undefined) {
    if (tag === 'label' && text && typeof text === 'object') result.append(writeUiText(document.createElement('span'), text));
    else writeUiText(result, text);
  }
  return result;
}

function button(text, className, handler) {
  const result = element('button', className, text);
  result.type = 'button';
  result.addEventListener('click', handler);
  return result;
}

function toast(message, tone = '') {
  const notice = $('library-toast');
  writeUiText(notice, typeof message === 'string' ? externalStatus(message) : message);
  notice.dataset.tone = tone;
  notice.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { notice.hidden = true; }, 4800);
}


// 适配搜索和导入模块的状态，不翻译其输入或存储内容。
function externalStatus(value, localizedStatus) {
  if (localizedStatus?.source === value) return ui(localizedStatus.zh, localizedStatus.en);
  const exact = {
    '已恢复关键词结果；按回车继续语义搜索': 'Keyword results restored. Press Enter for semantic search.',
    '关键词结果已更新；当前向量检索结束后处理新查询': 'Keyword results updated. The new semantic query will run after the current one.',
    '已显示关键词结果；正在检查本地向量索引…': 'Keyword results shown. Checking the local semantic index…',
    '已显示关键词结果；正在生成一次查询向量…': 'Keyword results shown. Preparing the semantic query…',
    '请选择包含图片的文件夹': 'Select a folder containing images.',
    '请拖入一个或多个文件夹': 'Drop one or more folders.',
  };
  if (exact[value]) return ui(value, exact[value]);
  const patterns = [
    [/^关键词匹配 (\d+) 项$/, n => `Keyword matches: ${n}`],
    [/^已显示关键词结果；首次建立索引 (\d+) \/ (\d+) 项$/, (done, total) => `Keyword results shown. Indexing ${done} / ${total} items`],
    [/^关键词与本地向量结果已合并 · 语义候选 (\d+) 项$/, n => `Keyword and semantic results merged · ${n} semantic matches`],
    [/^已保留关键词结果；向量检索未完成：(.*)$/s, error => `Keyword results kept. Semantic search did not complete: ${error}`],
    [/^已导入 (\d+) 张图片…$/, n => `Imported ${n} images…`],
  ];
  for (const [pattern, format] of patterns) { const match = String(value).match(pattern); if (match) return ui(value, format(...match.slice(1))); }
  return value;
}
function importSummaryText(result) {
  const en = (result.added ? `Imported ${result.added} images into ${result.folders} top-level folders` : `No new images; checked ${result.folders} top-level folders`)
    + (result.duplicate ? `; skipped ${result.duplicate} duplicates` : '')
    + (result.unsupported ? `; skipped ${result.unsupported} unsupported files or files over 10 MB` : '')
    + (result.failed ? `; ${result.failed} images could not be saved` : '') + '. Original files were not moved.';
  return ui(importSummary(result), en);
}

function humanDate(value, language = 'zh') {
  const time = new Date(value);
  return Number.isNaN(time.getTime()) ? (language === 'en' ? 'Unknown date' : '时间未知') : time.toLocaleString(language === 'en' ? 'en-US' : 'zh-CN');
}
function defaultCategoryText(value) {
  return ({ '文化建筑': 'Cultural buildings', '教育建筑': 'Educational buildings', '办公建筑': 'Office buildings', '社区建筑': 'Community buildings' })[value] || value;
}

function keyFor(item) {
  return item.scheme.schemeId + ':' + (item.reference?.sourceReferenceId || 'none');
}

function releaseUrls() {
  for (const url of state.urls.values()) URL.revokeObjectURL(url);
  state.urls.clear();
  state.pendingUrls.clear();
}

async function imageUrl(item) {
  const reference = item.reference;
  if (!reference || reference.assetState !== 'available') return null;
  const id = reference.sourceReferenceId;
  if (state.urls.has(id)) return state.urls.get(id);
  if (state.pendingUrls.has(id)) return state.pendingUrls.get(id);
  const loadNumber = state.loadNumber;
  const pending = (async () => {
    try {
      const record = await getSourceImage(id);
      if (loadNumber !== state.loadNumber || record.schemeId !== item.scheme.schemeId) return null;
      const url = URL.createObjectURL(record.blob);
      state.urls.set(id, url);
      return url;
    } catch {
      return null;
    } finally {
      if (state.pendingUrls.get(id) === pending) state.pendingUrls.delete(id);
    }
  })();
  state.pendingUrls.set(id, pending);
  return pending;
}

async function request(type, payload = {}) {
  const response = await chrome.runtime.sendMessage({ type, payload });
  if (!response?.ok) throw localizedError(response, '本地操作失败，请重新加载扩展', 'The local operation failed. Reload the extension.');
  return response;
}

function localDownloadPath(value) {
  const parts = String(value || '').split(/[\\/]/).filter(Boolean);
  const root = parts.lastIndexOf('ArchBuddy');
  return root < 0 ? '' : parts.slice(root).join('/').normalize('NFC').toLocaleLowerCase();
}

function captureFromDownload(item) {
  if (item.byExtensionId !== chrome.runtime.id || item.state !== 'complete') return null;
  const saved = state.catalog[String(item.id)];
  const parts = String(item.filename || '').split(/[\\/]/).filter(Boolean);
  const root = parts.lastIndexOf('ArchBuddy');
  if (saved?.category && saved?.project) {
    return { id: item.id, type: resolveProjectType(saved.virtualType || saved.category, state.typeAliases), project: saved.project, name: saved.name || '参考图',
      filePath: localDownloadPath(item.filename || saved.filename), date: item.endTime || saved.createdAt, size: item.fileSize };
  }
  if (root < 0 || parts.length < root + 4) return null;
  return { id: item.id, type: resolveProjectType(saved?.virtualType || parts[root + 1], state.typeAliases), project: parts[root + 2],
    name: parts.slice(root + 3).join(' / ').replace(/^[0-9]{8}-[0-9]{6}_/, ''),
    filePath: localDownloadPath(item.filename), date: item.endTime || item.startTime, size: item.fileSize };
}

function captureFromImport(record) {
  return { id: 'local:' + record.id, imported: true, type: resolveProjectType(record.type, state.typeAliases),
    project: record.project, name: record.name, date: record.date, size: record.size };
}

function captureText(item) {
  return [item.type, item.project, item.name, state.catalog[item.id]?.description].filter(Boolean).join('；');
}

function promptSearchText(item) {
  const version = item.version || item.scheme.versions.at(-1);
  return [item.scheme.name, item.scheme.projectName, item.scheme.category, item.reference?.displayName,
    ...(item.reference?.tags || []), version?.compiledPrompt, promptExcerpt(item)].filter(Boolean).join('；');
}

function folderKey(item) {
  return item.type + '\u0000' + item.project;
}

function showSection(section) {
  const captures = section === 'captures';
  $('captures-section').hidden = !captures;
  $('prompts-section').hidden = captures;
  $('capture-sidebar').hidden = !captures;
  $('prompt-sidebar').hidden = captures;
  $('capture-sidebar-tools').hidden = !captures;
  $('prompt-sidebar-tools').hidden = captures;
  $('capture-header-search').hidden = !captures;
  $('prompt-header-search').hidden = captures;
  $('capture-search-history').hidden = true;
  $('prompt-search-history').hidden = true;
  for (const [id, selected] of [['show-captures', captures], ['show-prompts', !captures]]) {
    $(id).classList.toggle('is-active', selected);
    $(id).setAttribute('aria-pressed', String(selected));
  }
}

function captureGroups() {
  const groups = new Map(state.activeTypes.map(type => [type, new Map()]));
  for (const item of state.captures) {
    if (!groups.has(item.type)) groups.set(item.type, new Map());
    const projects = groups.get(item.type);
    if (!projects.has(item.project)) projects.set(item.project, []);
    projects.get(item.project).push(item);
  }
  return groups;
}

function renderCaptureFolders() {
  const target = $('capture-folders');
  clearUiText(target).replaceChildren();
  const groups = captureGroups();
  if (!state.selectedType || !groups.has(state.selectedType)) {
    state.selectedType = state.captures[0]?.type || state.activeTypes[0] || null;
  }
  if (!state.foldersInitialized && state.selectedType) {
    state.openTypes.add(state.selectedType);
    state.foldersInitialized = true;
  }
  const all = button('', 'capture-all' + (state.showAllCaptures ? ' is-selected' : ''), () => {
    state.showAllCaptures = true;
    captureSearchReturn = null;
    failedDescriptionsOnly = false;
    state.selectedFolder = null;
    selectedCaptureId = null;
    $('capture-search').value = ''; captureSearch.clear(); writeUiText($('capture-search-status'), '');
    renderCaptureFolders();
    renderCaptureGrid();
  });
  all.append(element('span', '', ui('全部图片', "All images")), element('small', '', ui(state.captures.length + ' 张', state.captures.length + " images")));
  target.append(all);
  const types = [...groups.keys()];
  for (const type of types) {
    const projects = groups.get(type);
    const group = element('div', 'folder-group');
    const total = [...projects.values()].reduce((count, images) => count + images.length, 0);
    const heading = button(ui(type + ' · ' + total, defaultCategoryText(type) + ' · ' + total), 'folder-type' + (type === state.selectedType && !state.showAllCaptures ? ' is-selected' : ''), () => {
      state.selectedType = type;
      captureSearchReturn = null;
      state.showAllCaptures = false;
      state.typeChosenByUser = true;
      $('capture-search').value = ''; captureSearch.clear(); writeUiText($('capture-search-status'), '');
      selectedCaptureId = null;
      state.selectedFolder = null;
      if (state.openTypes.has(type)) state.openTypes.delete(type);
      else state.openTypes.add(type);
      renderCaptureFolders();
      renderCaptureGrid();
    });
    heading.setAttribute('aria-expanded', String(state.openTypes.has(type)));
    group.dataset.type = type;
    heading.draggable = true;
    setLocalizedAttribute(heading, 'title', '拖动排序；Alt + ↑ / ↓ 也可移动', "Drag to reorder, or use Alt + ↑ / ↓");
    heading.addEventListener('dragstart', event => {
      draggingType = type; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', type);
      group.classList.add('is-dragging');
    });
    heading.addEventListener('dragend', () => {
      draggingType = null;
      target.querySelectorAll('.is-dragging,.drag-before,.drag-after').forEach(node => node.classList.remove('is-dragging','drag-before','drag-after'));
    });
    group.addEventListener('dragover', event => {
      if (draggingFolder) {
        if (draggingFolder.type !== type) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; group.classList.add('folder-drop-target'); }
        return;
      }
      if (!draggingType || draggingType === type) return;
      event.preventDefault(); event.dataTransfer.dropEffect = 'move';
      target.querySelectorAll('.drag-before,.drag-after').forEach(node => node.classList.remove('drag-before','drag-after'));
      group.classList.add(event.clientY < heading.getBoundingClientRect().top + heading.offsetHeight / 2 ? 'drag-before' : 'drag-after');
    });
    group.addEventListener('dragleave', event => { if (!group.contains(event.relatedTarget)) group.classList.remove('folder-drop-target'); });
    group.addEventListener('drop', event => {
      event.preventDefault();
      if (draggingFolder) {
        const moved = draggingFolder; draggingFolder = null; group.classList.remove('folder-drop-target');
        if (moved.type !== type) void moveProjectFolder(moved, type).catch(error => toast(errorText(error), 'error'));
        return;
      }
      if (!draggingType || draggingType === type) return;
      const order = types.filter(value => value !== draggingType);
      order.splice(order.indexOf(type) + (group.classList.contains('drag-after') ? 1 : 0), 0, draggingType);
      void reorderTypes(order).catch(error => toast(errorText(error), 'error'));
    });
    heading.addEventListener('keydown', event => {
      if (!event.altKey || !['ArrowUp','ArrowDown'].includes(event.key)) return;
      event.preventDefault(); const index = types.indexOf(type), next = index + (event.key === 'ArrowUp' ? -1 : 1);
      if (next < 0 || next >= types.length) return;
      const order = [...types]; [order[index],order[next]] = [order[next],order[index]];
      void reorderTypes(order).then(() => [...target.querySelectorAll('.folder-group')].find(node => node.dataset.type === type)?.querySelector('button')?.focus());
    });
    const typeRow = element('div', 'folder-type-row');
    const rename = button(ui('改名', "Rename"), 'group-mini-action type-rename', () => {
      const name = prompt(t('修改分类名称', "Rename category"), type);
      if (name === null) return;
      void renameCaptureType(type, name).catch(error => toast(errorText(error), 'error'));
    });
    setLocalizedAttribute(rename, 'title', '修改分类“' + type + '”', "Rename category “" + type + '”');
    const remove = button(ui('删除', "Delete"), 'group-mini-action type-remove', () => {
      void deleteCaptureType(type).catch(error => toast(errorText(error), 'error'));
    });
    setLocalizedAttribute(remove, 'title', '删除空分类“' + type + '”，不删除图片', "Delete empty category “" + type + "”, keeping images");
    typeRow.append(heading, rename, remove);
    group.append(typeRow);
    if (state.openTypes.has(type)) {
      if (!projects.size) group.append(element('p', 'folder-empty', ui('暂无采集项目', "No captured projects yet")));
      for (const project of [...projects.keys()].sort((a, b) => a.localeCompare(b, 'zh-CN'))) {
        const images = projects.get(project);
        const key = folderKey(images[0]);
        const folder = button(project + ' (' + images.length + ')',
          'folder-project' + (key === state.selectedFolder ? ' is-selected' : ''), () => {
            captureSearchReturn = null;
            $('capture-search').value = ''; captureSearch.clear(); writeUiText($('capture-search-status'), '');
            selectedCaptureId = null;
            state.selectedType = type;
            state.showAllCaptures = false;
            state.selectedFolder = key;
            renderCaptureFolders();
            renderCaptureGrid();
          });
        setLocalizedAttribute(folder, 'aria-label', project + '，' + images.length + ' 张图片', project + '，' + images.length + " images");
        folder.draggable = true;
        setLocalizedAttribute(folder, 'title', '拖至其他项目类型可移动整个项目', "Drag to another category to move this project");
        folder.addEventListener('dragstart', event => {
          draggingFolder = { type, project }; event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', type + ' / ' + project);
          row.classList.add('is-dragging');
        });
        folder.addEventListener('dragend', () => { draggingFolder = null; target.querySelectorAll('.folder-drop-target,.is-dragging').forEach(node => node.classList.remove('folder-drop-target','is-dragging')); });
        const row = element('div', 'capture-folder-row');
        row.append(folder, button('×', 'group-mini-action folder-delete', () => showDeleteCaptures(images, project)));
        setLocalizedAttribute(row.lastChild, 'title', '删除项目“' + project + '”', "Delete project “" + project + '”');
        group.append(row);
      }
    }
    target.append(group);
  }
}

function stopFolderAutoScroll() {
  if (folderScrollFrame) cancelAnimationFrame(folderScrollFrame);
  folderScrollFrame = 0;
  folderScrollPointerY = null;
}

function scrollFolderListWhileDragging() {
  const list = $('capture-folders');
  if (!draggingFolder || folderScrollPointerY === null || list.scrollHeight <= list.clientHeight) {
    stopFolderAutoScroll();
    return;
  }
  const rect = list.getBoundingClientRect();
  const edge = Math.min(96, rect.height / 3);
  const y = folderScrollPointerY;
  const amount = y < rect.top + edge ? -Math.min(18, Math.max(2, (rect.top + edge - y) / edge * 18))
    : y > rect.bottom - edge ? Math.min(18, Math.max(2, (y - rect.bottom + edge) / edge * 18)) : 0;
  if (!amount) { folderScrollFrame = 0; return; }
  const before = list.scrollTop;
  list.scrollTop += amount;
  folderScrollFrame = list.scrollTop === before ? 0 : requestAnimationFrame(scrollFolderListWhileDragging);
}

function openCaptureProject(item) {
  const query = $('capture-search').value.trim();
  captureSearchReturn = query ? {
    query, searchQuery: captureSearch.query, ids: [...captureSearch.ids],
    status: captureSearch.busy ? '已恢复关键词结果；按回车继续语义搜索' : captureSearch.status,
    statusI18n: captureSearch.busy ? null : captureSearch.statusI18n,
    selectedId: selectedCaptureId, scrollY: window.scrollY, folder: folderKey(item)
  } : null;
  state.showAllCaptures = false;
  state.selectedType = item.type;
  state.typeChosenByUser = true;
  state.openTypes.add(item.type);
  state.selectedFolder = folderKey(item);
  failedDescriptionsOnly = false;
  selectedCaptureId = item.id;
  $('capture-search').value = ''; captureSearch.clear(); writeUiText($('capture-search-status'), '');
  renderCaptureFolders();
  renderCaptureGrid();
  $('capture-folders').querySelector('.folder-project.is-selected')?.scrollIntoView({ block: 'nearest' });
  $('capture-grid').querySelector('.capture-card.is-selected')?.scrollIntoView({ block: 'nearest' });
}

async function captureImageUrl(captureId) {
  if (state.captureUrls.has(captureId)) return state.captureUrls.get(captureId);
  if (state.capturePendingUrls.has(captureId)) return state.capturePendingUrls.get(captureId);
  const version = state.captureLoad;
  const pending = (async () => {
    try {
      const record = await getSourceImage(captureId);
      if (version !== state.captureLoad || record.schemeId !== captureId) return null;
      const url = URL.createObjectURL(record.blob);
      state.captureUrls.set(captureId, url);
      return url;
    } catch { return null; }
    finally {
      if (state.capturePendingUrls.get(captureId) === pending) state.capturePendingUrls.delete(captureId);
    }
  })();
  state.capturePendingUrls.set(captureId, pending);
  return pending;
}

function updateProjectPreviewLayout(folder) {
  if (!folder?.isConnected) return;
  const thumbs = [...folder.querySelectorAll('.project-thumb')];
  const images = thumbs.map(thumb => thumb.querySelector('img'));
  if (images.some(image => !image?.naturalWidth || !image.naturalHeight)) return;
  const portraits = thumbs.filter((_, index) => images[index].naturalWidth / images[index].naturalHeight <= 1.05);
  const usePair = portraits.length >= (thumbs.length >= 4 ? 3 : 2);
  const layout = usePair ? 'pair' : thumbs.length >= 4 ? 'quad' : 'single';
  const selected = layout === 'pair' ? portraits.slice(0, 2)
    : layout === 'single' ? [thumbs.reduce((best, thumb, index) => {
      const ratio = images[index].naturalWidth / images[index].naturalHeight;
      const bestIndex = thumbs.indexOf(best);
      const bestRatio = images[bestIndex].naturalWidth / images[bestIndex].naturalHeight;
      return Math.abs(Math.log(ratio / 1.55)) < Math.abs(Math.log(bestRatio / 1.55)) ? thumb : best;
    }, thumbs[0])] : thumbs;
  folder.dataset.previewLayout = layout;
  thumbs.forEach(thumb => thumb.classList.toggle('is-preview-selected', selected.includes(thumb)));
}
async function capturePreview(item, visual) {
  const captureId = state.previews[String(item.id)];
  if (!captureId) return;
  const url = await captureImageUrl(captureId);
  if (!visual.isConnected) return;
  if (!url) {
    if (!visual.classList.contains('folder-thumb')) writeUiText(visual, ui('预览不可用', "Preview unavailable"));
    return;
  }
  const image = element('img');
  image.alt = item.name;
  if (visual.classList.contains('project-thumb')) {
    visual.style.setProperty('--project-thumb-image', `url("${url}")`);
    visual.classList.add('has-preview');
    image.addEventListener('load', () => updateProjectPreviewLayout(visual.parentElement));
  }
  clearUiText(visual).replaceChildren(image);
  image.src = url;
}

function renderCaptureGrid() {
  const projectsTarget = $('capture-project-grid');
  const imagesTarget = $('capture-grid');
  clearUiText(projectsTarget).replaceChildren();
  clearUiText(imagesTarget).replaceChildren();
  const query = $('capture-search').value.trim();
  const projects = captureGroups().get(state.selectedType) || new Map();
  const folderImages = state.captures.filter(item => folderKey(item) === state.selectedFolder);
  const insideFolder = Boolean(state.selectedFolder && folderImages.length);
  const allImages = state.showAllCaptures && !insideFolder;
  const failedItems = state.captures.filter(item => descriptionTaskFailedIds.has(String(item.id)));
  const failedOnly = failedDescriptionsOnly && failedItems.length > 0;
  const images = failedOnly ? failedItems
    : query ? captureSearch.select(state.captures, query, item => item.id, captureText)
      : allImages ? state.captures : folderImages;
  const showImages = failedOnly || insideFolder || allImages || Boolean(query);
  $('capture-back').hidden = !(failedOnly || insideFolder || query);
  writeUiText($('capture-back'), ui(insideFolder && captureSearchReturn?.folder === state.selectedFolder
    ? '← 返回搜索结果' : '← 返回项目', insideFolder && captureSearchReturn?.folder === state.selectedFolder
    ? "← Back to results" : "← Back to projects"));
  $('capture-view-switch').hidden = showImages || projects.size === 0;
  $('capture-view-small').setAttribute('aria-pressed', String(state.captureProjectView === 'small'));
  $('capture-view-large').setAttribute('aria-pressed', String(state.captureProjectView === 'large'));
  projectsTarget.classList.toggle('is-large', state.captureProjectView === 'large');
  projectsTarget.hidden = showImages;
  imagesTarget.hidden = !showImages;
  writeUiText($('capture-path'), ui(failedOnly ? '失败描述 · ' + images.length + ' 张图片'
    : query ? '全图库搜索 · ' + images.length + ' 张图片'
    : insideFolder ? folderImages[0].type + ' / ' + folderImages[0].project + ' / ' + images.length + ' 张图片'
      : allImages ? '全部图片 · ' + images.length + ' 张图片'
        : (state.selectedType || '项目类型') + ' / ' + projects.size + ' 个项目', failedOnly ? "Failed descriptions · " + images.length + " images"
    : query ? "All-library search · " + images.length + " images"
    : insideFolder ? defaultCategoryText(folderImages[0].type) + ' / ' + folderImages[0].project + ' / ' + images.length + " images"
      : allImages ? "All images · " + images.length + " images"
        : (defaultCategoryText(state.selectedType) || "Project category") + ' / ' + projects.size + " projects"));
  $('capture-empty').hidden = showImages ? images.length > 0 : projects.size > 0;
  writeUiText($('capture-empty').querySelector('h2'), ui(failedOnly ? '没有失败的描述' : query ? '没有找到匹配的图片' : state.captures.length ? '这个类型还没有项目' : '还没有采集的图片', failedOnly ? "No failed descriptions" : query ? "No matching images" : state.captures.length ? "No projects in this category" : "No captured images yet"));
  writeUiText($('capture-empty').querySelector('p'), ui(failedOnly ? '失败项已自动重试；可稍后再次点击“生成概要描述”。'
    : query ? '可换个关键词，或按回车进行本地向量检索。' : '下载图片或导入本地文件夹后，会按项目类型和项目名称出现在这里。', failedOnly ? "Failed items were retried automatically. Try “Generate summaries” again later."
    : query ? "Try another keyword, or press Enter for semantic search." : "Download images or import a folder to organize them here by category and project."));
  if (!showImages) for (const [project, entries] of [...projects].sort((a,b) => a[0].localeCompare(b[0], 'zh-CN'))) {
    const card = element('article', 'capture-project-card');
    card.draggable = true;
    setLocalizedAttribute(card, 'title', '可拖至左侧其他项目类型', "Drag to another sidebar category");
    card.addEventListener('dragstart', event => {
      draggingFolder = { type: entries[0].type, project }; event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', entries[0].type + ' / ' + project);
      card.classList.add('is-dragging');
      $('capture-folders').classList.add('is-moving-project');
    });
    card.addEventListener('dragend', () => {
      draggingFolder = null; card.classList.remove('is-dragging');
      document.querySelectorAll('.folder-drop-target').forEach(node => node.classList.remove('folder-drop-target'));
    });
    const head = element('div', 'project-card-heading');
    head.append(element('strong', '', project), button(ui('删除', "Delete"), 'group-mini-action', () => showDeleteCaptures(entries, project)));
    const folder = button('', 'project-preview-button', () => {
      state.selectedFolder = folderKey(entries[0]);
      selectedCaptureId = null;
      renderCaptureFolders();
      renderCaptureGrid();
    });
    setLocalizedAttribute(folder, 'title', '打开项目：' + project, "Open project: " + project);
    const previews = entries.filter(item => state.previews[String(item.id)]).slice(0, 4);
    const previewEntries = previews.length ? previews : entries.slice(0, 1);
    folder.dataset.previewLayout = previewEntries.length >= 4 ? 'quad' : 'single';
    for (const [index, entry] of previewEntries.entries()) {
      const visual = element('div', 'project-thumb', ui(state.previews[String(entry.id)] ? '' : '待关联预览', state.previews[String(entry.id)] ? '' : "Preview not linked"));
      if (index === 0) visual.classList.add('is-preview-selected');
      folder.append(visual);
      // 连接到文档后再异步取图。
      queueMicrotask(() => { void capturePreview(entry, visual); });
    }
    card.append(head, folder, element('span', 'project-image-count', ui(entries.length + ' 张图片', entries.length + " images")));
    projectsTarget.append(card);
  }
  const missing = state.captures.some(item => !state.previews[String(item.id)]);
  $('link-downloads').hidden = !missing;
  $('capture-preview-help').hidden = !showImages || !images.some(item => !state.previews[String(item.id)]);
  if (!showImages || !images.some(item => item.id === selectedCaptureId)) selectedCaptureId = null;
  for (const item of showImages ? images : []) {
    const card = element('article', 'capture-card' + (item.id === selectedCaptureId ? ' is-selected' : ''));
    const main = button('', 'capture-card-main', () => {
      if (selectedCaptureId !== null && selectedCaptureId !== item.id) void autoSaveDescription(selectedCaptureId);
      selectedCaptureId = item.id;
      imagesTarget.querySelectorAll('.capture-card').forEach(node => node.classList.toggle('is-selected', node === card));
      void renderCaptureDetail();
    });
    main.addEventListener('dblclick', () => { void showCaptureImage(item, images); });
    setLocalizedAttribute(main, 'title', '单击查看详情，双击查看大图', "Click for details; double-click for a larger view");
    const visual = element('div', 'capture-visual', ui(state.previews[String(item.id)] ? '正在读取预览…' : '等待关联本地图片', state.previews[String(item.id)] ? "Loading preview…" : "Waiting for a local image"));
    const info = element('div', 'capture-info');
    info.append(element('strong', '', item.name), element('span', '', ui(query || allImages ? item.type + ' / ' + item.project : humanDate(item.date), query || allImages ? defaultCategoryText(item.type) + ' / ' + item.project : humanDate(item.date, 'en'))));
    const description = state.catalog[item.id]?.description;
    if (description) info.append(element('p', 'capture-description-preview', description));
    main.append(visual, info);
    const remove = button('×', 'image-delete', event => { event.stopPropagation(); showDeleteCaptures([item], item.name); });
    remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7M14 10v7"/></svg>';
    setLocalizedAttribute(remove, 'title', '删除图片', "Delete image"); setLocalizedAttribute(remove, 'aria-label', '删除图片 ' + item.name, "Delete image " + item.name);
    card.append(main);
    if (query) {
      const jump = button(ui('进入项目', "Open project"), 'project-jump', event => {
        event.stopPropagation();
        openCaptureProject(item);
      });
      setLocalizedAttribute(jump, 'title', '进入图库项目文件夹：' + item.type + ' / ' + item.project, "Open library project: " + item.type + ' / ' + item.project);
      card.append(jump);
    }
    card.append(remove);
    imagesTarget.append(card);
    void capturePreview(item, visual);
  }
  if (!document.activeElement?.classList.contains('capture-description-editor')) void renderCaptureDetail();
}

async function showCaptureImage(item, siblings) {
  const available = siblings.filter(entry => state.previews[String(entry.id)]);
  const index = available.findIndex(entry => entry.id === item.id);
  if (index < 0) { toast(ui('这张图片尚无可用的本地预览', "No local preview is available for this image."), 'error'); return; }
  viewerItems = available;
  viewerIndex = index;
  if (await updateViewer() && !$('image-viewer').open) $('image-viewer').showModal();
}

async function updateViewer() {
  const item = viewerItems[viewerIndex];
  if (!item) return false;
  const url = await captureImageUrl(state.previews[String(item.id)]);
  if (viewerItems[viewerIndex]?.id !== item.id) return false;
  if (!url) { toast(ui('图片预览不可用', "Image preview unavailable"), 'error'); return false; }
  resetViewerZoom();
  $('viewer-image').src = url;
  $('viewer-image').alt = item.name;
  writeUiText($('viewer-counter'), (viewerIndex + 1) + ' / ' + viewerItems.length + ' · ' + item.name);
  $('viewer-prev').hidden = viewerItems.length < 2;
  $('viewer-next').hidden = viewerItems.length < 2;
  return true;
}

function stepViewer(delta) {
  if (viewerItems.length < 2) return;
  viewerIndex = (viewerIndex + delta + viewerItems.length) % viewerItems.length;
  void updateViewer();
}

async function renderCaptureDetail() {
  const detail = $('capture-detail');
  const item = state.captures.find(item => item.id === selectedCaptureId);
  detail.hidden = !item;
  $('capture-content-layout').classList.toggle('has-detail', Boolean(item));
  if (!item) { clearUiText(detail).replaceChildren(); return; }
  const visual = button('', 'detail-image capture-detail-image', () => {
    const query = $('capture-search').value.trim();
    const siblings = query ? captureSearch.select(state.captures, query, entry => entry.id, captureText)
      : state.showAllCaptures ? state.captures
        : state.captures.filter(entry => folderKey(entry) === folderKey(item));
    void showCaptureImage(item, siblings);
  });
  setLocalizedAttribute(visual, 'title', '点击查看大图，可左右浏览同一项目', "Open a larger view and browse this project");
  writeUiText(visual, ui('等待关联本地图片', "Waiting for a local image"));
  const body = element('div', 'detail-body');
  const head = element('div', 'capture-detail-head');
  head.append(element('strong', '', item.name), button('×', 'quiet-button', () => { selectedCaptureId = null; renderCaptureGrid(); }));
  const description = element('textarea', 'capture-description-editor');
  setLocalizedAttribute(description, 'placeholder', '描述主体、材质、视角与氛围，方便以后搜索…', "Describe the subject, materials, viewpoint and mood for future searches…");
  description.maxLength = 4000;
  description.value = descriptionDrafts.get(item.id) ?? state.catalog[item.id]?.description ?? '';
  description.addEventListener('input', () => {
    descriptionDrafts.set(item.id, description.value);
    clearTimeout(descriptionSaves.get(item.id));
    descriptionSaves.set(item.id, setTimeout(() => { void autoSaveDescription(item.id); }, 700));
  });
  description.addEventListener('blur', () => { void autoSaveDescription(item.id); });
  const actions = element('div', 'detail-actions capture-detail-actions');
  const summary = button(ui('生成概要描述', "Generate summaries"), 'solid-button', async () => {
    if (!(await ensureCaptureDescriptionConsent())) return;
    summary.disabled = true;
    try {
      await autoSaveDescription(item.id);
      await request('capture.describe', { downloadId: item.id });
      toast(ui('概要描述已生成并保存', "Summary generated and saved"));
      await loadCaptures();
    } catch (error) { toast(ui('生成概要描述失败：' + (error.zh || error.message), "Could not generate the summary: " + (error.en || error.message)), 'error'); }
    finally { summary.disabled = false; }
  });
  summary.disabled = !state.previews[String(item.id)];
  const generate = button(ui('生成全提示词', "Generate full prompt"), 'solid-button', () => {
    const opening = openPanel(); opening.catch(() => {});
    void request('capture.resume', { downloadId: item.id }).then(() => opening).catch(error => toast(errorText(error), 'error'));
  });
  generate.disabled = !state.previews[String(item.id)];
  actions.append(summary, generate);
  if (item.imported) {
    const folder = button(ui('打开原文件夹', "Original folder"), 'solid-button', () => {
      const path = String(item.sourcePath || '').replaceAll('\\', '/').split('/').filter(Boolean);
      $('import-source-path').value = path.slice(0, -1).join('/') || item.project || '';
      setLocalizedAttribute($('import-source-path'), 'placeholder', '来源目录未记录', 'Source folder not recorded');
      $('import-source-dialog').showModal();
    });
    setLocalizedAttribute(folder, 'title', '查看并复制导入时的来源目录；浏览器无法直接打开电脑原文件夹', "View and copy the import path. Browsers cannot open the original folder directly.");
    actions.append(folder);
  } else actions.append(button(ui('打开原文件夹', "Original folder"), 'solid-button', () => {
    try { chrome.downloads.show(item.id); }
    catch { toast(ui('文件已移动或删除', "The file was moved or deleted."), 'error'); }
  }));
  const status = state.catalog[item.id]?.descriptionStatus;
  if (!description.value) setLocalizedAttribute(description, 'placeholder', status === 'processing' ? '正在自动生成视觉描述…'
    : status === 'pending' ? '等待自动生成视觉描述…' : state.catalog[item.id]?.descriptionError || '填写视觉特征，编辑后自动保存', status === 'processing' ? "Generating a visual description…"
    : status === 'pending' ? "Waiting for a visual description…" : state.catalog[item.id]?.descriptionError || "Describe visual features; edits save automatically");
  body.append(head, captureSourceRow(item), infoRow(ui('保存时间', "Saved"), ui(humanDate(item.date), humanDate(item.date, 'en'))), visual,
    element('h3', '', ui('核心视觉特征', "Visual features")), description);
  if (pointsEnabled()) body.append(element('p', 'points-cost-note capture-action-costs', ui('本次消耗：概要描述 0.1 积分；完整提示词 1 积分。', "Cost: 0.1 credits per summary; 1 credit per full prompt.")));
  body.append(actions);
  if (item.imported) body.append(element('span', 'imported-origin', ui('原文件保留在导入时选择的文件夹中', "The original stays in the folder selected during import.")));
  clearUiText(detail).replaceChildren(body);
  void capturePreview(item, visual);
}

function captureSourceRow(item) {
  const url = normalizeSourcePageUrl(state.catalog[item.id]?.sourcePageUrl);
  if (!url) return infoRow(ui('来源网页', "Source page"), ui(item.imported ? '本地导入，无网页来源' : '未记录来源网页', item.imported ? "Local import; no source page" : "Source page not recorded"));
  const row = element('div', 'meta-line capture-source');
  const content = element('div', 'capture-source-content');
  const link = element('a', 'capture-source-link', url);
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  setLocalizedAttribute(link, 'title', '打开来源网页（新标签页）', "Open source page in a new tab");
  content.append(link);
  row.append(element('span', '', ui('来源网页', "Source page")), content);
  return row;
}

async function autoSaveDescription(id) {
  clearTimeout(descriptionSaves.get(id)); descriptionSaves.delete(id);
  if (!descriptionDrafts.has(id)) return;
  const value = descriptionDrafts.get(id);
  const previousDescription = state.catalog[id]?.description || '';
  if (value === previousDescription) { descriptionDrafts.delete(id); return; }
  try {
    await request('capture.description.save', { downloadId: id, description: value, previousDescription });
    if (descriptionDrafts.get(id) === value) descriptionDrafts.delete(id);
  } catch (error) { toast(ui('描述未保存：' + (error.zh || error.message), "Description not saved: " + (error.en || error.message)), 'error'); }
}

function resetCaptureSelection(type) {
  captureSearchReturn = null;
  failedDescriptionsOnly = false;
  selectedCaptureId = null;
  $('capture-search').value = ''; captureSearch.clear(); writeUiText($('capture-search-status'), '');
  state.selectedType = type;
  state.typeChosenByUser = true;
  state.openTypes.add(type);
  state.showAllCaptures = false;
  state.selectedFolder = null;
}

function restoreHistoricalCaptureType(type) {
  return withLibraryWriteLock(() => restoreHistoricalCaptureTypeUnlocked(type));
}
async function restoreHistoricalCaptureTypeUnlocked(type) {
  const saved = await accountStorage.get([STORAGE.customTypes, STORAGE.hiddenProjectTypesV4, STORAGE.projectTypeAliasesV4, STORAGE.projectTypeOrderV4]);
  const custom = saved[STORAGE.customTypes] || [];
  const hidden = saved[STORAGE.hiddenProjectTypesV4] || [];
  if (orderedProjectTypes(custom, hidden, saved[STORAGE.projectTypeOrderV4] || []).includes(type)) return;
  // 旧版允许移除分类而保留素材；用户整理这些素材时恢复其分类登记。
  if (!state.captures.some(item => item.type === type) || resolveProjectType(type, saved[STORAGE.projectTypeAliasesV4] || {}) !== type)
    throw new Error(t('分类已变化，请刷新后重试', "The category changed. Refresh and try again."));
  await accountStorage.set({
    [STORAGE.customTypes]: PRESET_TYPES.includes(type) ? custom : [...new Set([...custom, type])],
    [STORAGE.hiddenProjectTypesV4]: hidden.filter(name => name !== type),
  });
}

async function renameCaptureType(type, value) {
  const name = normalizeProjectType(value);
  if (!name || name.length > 40 || /[<>:"/\\|?*\x00-\x1f]/.test(name)) throw new Error(t('请输入 1–40 字的有效分类名称', "Enter a valid category name of 1–40 characters."));
  if (name === type) return;
  if ([...captureGroups().keys()].some(other => other !== type && other.toLocaleLowerCase() === name.toLocaleLowerCase()))
    throw new Error(t('已有同名分类', "A category with this name already exists."));
  await restoreHistoricalCaptureType(type);
  await request('project-types.rename', { from: type, name });
  state.openTypes.delete(type);
  resetCaptureSelection(name);
  await loadCaptures();
  toast(ui('分类已改名，已保存图片保留', "Category renamed. Saved images are unchanged."));
}

function addCaptureType() {
  return withLibraryWriteLock(() => addCaptureTypeUnlocked());
}
async function addCaptureTypeUnlocked() {
  const input = $('custom-type');
  const type = normalizeProjectType(input.value);
  if (!type || type.length > 40 || /[<>:"/\\|?*\x00-\x1f]/.test(type)) throw new Error(t('请输入 1–40 字的有效分类名称', "Enter a valid category name of 1–40 characters."));
  const saved = await accountStorage.get([STORAGE.customTypes, STORAGE.hiddenProjectTypesV4, STORAGE.projectTypeAliasesV4, STORAGE.projectTypeOrderV4]);
  const custom = saved[STORAGE.customTypes] || [];
  const hidden = saved[STORAGE.hiddenProjectTypesV4] || [];
  const active = orderedProjectTypes(custom, hidden, saved[STORAGE.projectTypeOrderV4] || []);
  if (active.some(name => name.toLocaleLowerCase() === type.toLocaleLowerCase())) throw new Error(t('已有同名分类', "A category with this name already exists."));
  const resolved = resolveProjectType(type, saved[STORAGE.projectTypeAliasesV4] || {});
  if (resolved !== type) throw new Error(t('这个分类已改名为“' + resolved + '”，请使用新名称', "This category was renamed to “" + resolved + "”. Use its new name."));
  await accountStorage.set({
    [STORAGE.customTypes]: PRESET_TYPES.includes(type) ? custom : [...new Set([...custom, type])],
    [STORAGE.hiddenProjectTypesV4]: hidden.filter(name => name !== type),
    [STORAGE.projectType]: type,
  });
  input.value = '';
  resetCaptureSelection(type);
  await loadCaptures();
  toast(ui('已新增分类，并设为浮框默认分类', "Category added and set as the capture default."));
}

function deleteCaptureType(type) {
  return withLibraryWriteLock(() => deleteCaptureTypeUnlocked(type));
}
async function deleteCaptureTypeUnlocked(type) {
  // 分类整理不能隐式删除图库记录或电脑原图；已有拖动项目功能可先移走内容。
  await loadCaptures();
  if (state.captures.some(item => item.type === type)) throw new Error(t('分类中还有图片，请先将项目拖到其他分类，再删除此分类', "Move the projects to another category before deleting this category."));
  const saved = await accountStorage.get([STORAGE.customTypes, STORAGE.hiddenProjectTypesV4, STORAGE.projectType, STORAGE.projectTypeOrderV4]);
  const custom = saved[STORAGE.customTypes] || [];
  const hidden = saved[STORAGE.hiddenProjectTypesV4] || [];
  const active = orderedProjectTypes(custom, hidden, saved[STORAGE.projectTypeOrderV4] || []);
  if (!active.includes(type)) throw new Error(t('分类已变化，请刷新后重试', "The category changed. Refresh and try again."));
  if (active.length <= 1) throw new Error(t('至少保留一个分类', "Keep at least one category."));
  const next = active.filter(name => name !== type);
  await accountStorage.set({
    [STORAGE.customTypes]: custom.filter(name => name !== type),
    [STORAGE.hiddenProjectTypesV4]: PRESET_TYPES.includes(type) ? [...new Set([...hidden, type])] : hidden,
    [STORAGE.projectTypeOrderV4]: next,
    [STORAGE.projectType]: saved[STORAGE.projectType] === type ? next[0] : saved[STORAGE.projectType] || next[0],
  });
  if (state.selectedType === type) state.selectedType = next[0];
  state.openTypes.delete(type);
  await loadCaptures();
  toast(ui('分类已删除，已保存图片不受影响', "Category deleted. Saved images are unchanged."));
}

async function reorderTypes(order) {
  const target = $('capture-folders');
  const old = new Map([...target.children].map(node => [node.dataset.type, node.getBoundingClientRect().top]));
  for (const type of order) {
    const node = [...target.children].find(node => node.dataset.type === type);
    if (node) target.append(node);
  }
  target.querySelectorAll('.is-dragging,.drag-before,.drag-after').forEach(node => node.classList.remove('is-dragging','drag-before','drag-after'));
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) for (const node of target.children) {
    const dy = old.get(node.dataset.type) - node.getBoundingClientRect().top;
    if (dy) node.animate([{ transform: 'translateY(' + dy + 'px)' }, { transform: 'translateY(0)' }], { duration: 220, easing: 'ease-out' });
  }
  draggingType = null;
  await new Promise(resolve => setTimeout(resolve, 230));
  await accountStorage.set({ [STORAGE.projectTypeOrderV4]: order });
}

async function moveProjectFolder({ type, project }, targetType) {
  const affected = state.captures.filter(item => item.type === type && item.project === project);
  if (!affected.length) throw new Error(t('项目已变化，请刷新后再试', "The project changed. Refresh and try again."));
  await restoreHistoricalCaptureType(type);
  await restoreHistoricalCaptureType(targetType);
  await request('capture.folder.move', { fromType: type, project, targetType, ids: affected.map(item => item.id) });
  state.selectedType = targetType; state.showAllCaptures = false; state.typeChosenByUser = true; state.openTypes.add(targetType);
  state.selectedFolder = targetType + '\u0000' + project; selectedCaptureId = null;
  await loadCaptures();
  toast(ui('项目“' + project + '”已移到“' + targetType + '”', "Project “" + project + "” moved to “" + defaultCategoryText(targetType) + '”'));
}

function showDeleteCaptures(items, name) {
  deletionSelection = items.map(item => item.id);
  writeUiText($('delete-capture-title'), ui(items.length === 1 ? '删除图片' : '删除项目图片', items.length === 1 ? "Delete image" : "Delete project images"));
  writeUiText($('delete-capture-description'), ui('“' + name + '”：共 ' + items.length + ' 张图片及其本地描述和预览。', '“' + name + "”: " + items.length + " images, including their local descriptions and previews."));
  $('delete-original').checked = false;
  $('delete-original').closest('label').hidden = !items.some(item => !item.imported);
  writeUiText($('delete-capture-dialog').querySelector('.dialog-note'), ui(items.some(item => item.imported)
    ? '导入图片会删除图词库副本及可清理的系统查看副本，电脑里的导入源文件保留；下载图片可选择是否删除原图。'
    : '仅处理本次列出的图片；电脑上的空文件夹会保留。', items.some(item => item.imported)
    ? "Imported images lose their library and removable viewer copies; source files remain. You can also delete original downloaded images."
    : "Only listed images are affected. Empty folders remain."));
  $('delete-capture-dialog').showModal();
}

async function loadCaptures() {
  const version = ++state.captureLoad;
  const [downloads, stored] = await Promise.all([
    chrome.downloads.search({}), accountStorage.get([STORAGE.capturePreviewsV4, STORAGE.captureCatalogV4, STORAGE.customTypes, STORAGE.hiddenProjectTypesV4, STORAGE.projectTypeOrderV4, STORAGE.projectTypeAliasesV4, STORAGE.captureHiddenV4, STORAGE.importedAssetsV4, STORAGE.captureProjectViewV4]),
  ]);
  if (version !== state.captureLoad) return;
  for (const url of state.captureUrls.values()) URL.revokeObjectURL(url);
  state.captureUrls.clear();
  state.capturePendingUrls.clear();
  state.captureProjectView = stored[STORAGE.captureProjectViewV4] === 'large' ? 'large' : 'small';
  const imported = Array.isArray(stored[STORAGE.importedAssetsV4]) ? stored[STORAGE.importedAssetsV4] : [];
  state.previews = { ...(stored[STORAGE.capturePreviewsV4] || {}), ...Object.fromEntries(imported.map(item => ['local:' + item.id, item.id])) };
  state.catalog = { ...(stored[STORAGE.captureCatalogV4] || {}), ...Object.fromEntries(imported.map(item => ['local:' + item.id, item])) };
  state.typeAliases = stored[STORAGE.projectTypeAliasesV4] || {};
  const hidden = Array.isArray(stored[STORAGE.hiddenProjectTypesV4]) ? stored[STORAGE.hiddenProjectTypesV4] : [];
  const custom = Array.isArray(stored[STORAGE.customTypes]) ? stored[STORAGE.customTypes] : [];
  state.activeTypes = orderedProjectTypes(custom, hidden, stored[STORAGE.projectTypeOrderV4] || []);
  const hiddenCaptures = new Set(stored[STORAGE.captureHiddenV4] || []);
  state.captures = [...downloads.filter(item => (pointsEnabled() || Object.hasOwn(stored[STORAGE.captureCatalogV4] || {}, item.id)) && !hiddenCaptures.has(item.id)).map(captureFromDownload).filter(Boolean),
    ...imported.map(captureFromImport)].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  if (state.selectedFolder && !state.captures.some(item => folderKey(item) === state.selectedFolder)) state.selectedFolder = null;
  if (!state.typeChosenByUser && state.captures.length) {
    state.selectedType = state.captures[0].type;
    state.openTypes.add(state.selectedType);
  }
  writeUiText($('capture-count'), ui(state.captures.length + ' 张图片', state.captures.length + " images"));
  renderCaptureFolders();
  renderCaptureGrid();
  void renderDescriptionProgress();
  void primeVectorIndex(captureSearch, captureDocuments());
}

async function importDownloadPreviews(files) {
  const localFiles = new Map([...files]
    .filter(file => ['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
    .map(file => [localDownloadPath(file.webkitRelativePath), file])
    .filter(([key]) => key));
  if (!localFiles.size) throw new Error(t('请选择包含 ArchBuddy 图片的下载目录', "Select the download folder containing your ArchBuddy images."));
  const next = { ...state.previews };
  let added = 0;
  let failed = 0;
  for (const item of state.captures) {
    if (next[String(item.id)] || !item.filePath) continue;
    const file = localFiles.get(item.filePath);
    if (!file) continue;
    try {
      const bitmap = await createImageBitmap(file);
      const ratio = Math.min(1, 640 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
      canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.72));
      if (!blob) throw new Error(t('预览生成失败', "Could not generate the preview."));
      const id = crypto.randomUUID();
      await putSourceImage({ sourceReferenceId: id, schemeId: id, blob });
      next[String(item.id)] = id;
      added++;
    } catch { failed++; }
  }
  if (added) await accountStorage.set({ [STORAGE.capturePreviewsV4]: next });
  await loadCaptures();
  toast(ui(added ? '已补齐 ' + added + ' 张图片预览' + (failed ? '，' + failed + ' 张未能读取' : '')
    : '没有匹配到缺少预览的下载图片' + (failed ? '；' + failed + ' 张未能读取' : ''), added ? "Linked " + added + " image previews" + (failed ? '，' + failed + " images could not be read" : '')
    : "No downloads matched the missing previews." + (failed ? '；' + failed + " images could not be read" : '')));
}

function groupFor(item) {
  return state.assignments[keyFor(item)] || 'ungrouped';
}

function groupName(id, language = 'zh') {
  const fallback = language === 'en' ? 'Ungrouped' : '未分组';
  return id === 'ungrouped' ? fallback : state.groups.find(group => group.id === id)?.name || fallback;
}

function filteredItems() {
  const query = $('library-search').value.trim();
  const category = $('category-filter').value;
  const candidates = state.items.filter(item => (!category || item.scheme.category === category)
    && (query || state.selectedGroupId === 'all' || groupFor(item) === state.selectedGroupId));
  return promptSearch.select(candidates, query, keyFor, promptSearchText);
}

function promptExcerpt(item) {
  const version = item.version || item.scheme.versions.at(-1);
  const text = (version?.modulesSnapshot || item.scheme.modules).filter(module => module.enabled && module.value)
    .map(module => module.title + '：' + module.value).join('\n');
  return text || promptText(item);
}

function promptText(item) {
  return (item.version || item.scheme.versions.at(-1))?.compiledPrompt || '暂无已确认提示词';
}

function renderGroupControls() {
  const select = $('group-select');
  const chosen = select.value;
  clearUiText(select).replaceChildren(localizedOption(ui('选择目标分组', "Choose a group"), ''));
  select.add(localizedOption(ui('未分组', "Ungrouped"), 'ungrouped'));
  for (const group of state.groups) select.add(new Option(group.name, group.id));
  select.value = [...select.options].some(option => option.value === chosen) ? chosen : '';
  writeUiText($('selected-count'), ui(state.selectedKeys.size ? '已选 ' + state.selectedKeys.size + ' 张图片卡' : '未选择图片卡', state.selectedKeys.size ? "Selected " + state.selectedKeys.size + " image cards" : "No image cards selected"));
  $('move-selected').disabled = !state.selectedKeys.size || !select.value || select.value === state.selectedGroupId;
}

function renderPromptSidebar() {
  const target = $('prompt-sidebar-list');
  clearUiText(target).replaceChildren();
  const groups = [{ id: 'all', name: '全部提示词' }, { id: 'ungrouped', name: '未分组' }, ...state.groups];
  for (const group of groups) {
    const count = group.id === 'all' ? state.items.length : state.items.filter(item => groupFor(item) === group.id).length;
    const row = element('div', 'prompt-group-row' + (group.id === state.selectedGroupId ? ' is-selected' : ''));
    const choose = button('', 'prompt-sidebar-item', () => {
      state.selectedGroupId = group.id;
      state.selectedKeys.clear();
      $('library-search').value = ''; promptSearch.clear(); writeUiText($('prompt-search-status'), '');
      $('category-filter').value = '';
      renderPromptSidebar();
      renderGrid();
      void renderDetail();
    });
    choose.append(element('strong', '', ui(group.name, group.id === 'all' ? 'All prompts' : group.id === 'ungrouped' ? 'Ungrouped' : group.name)), element('small', '', ui(count + ' 张图片卡', count + " image cards")));
    row.append(choose);
    if (group.id !== 'all') {
      row.addEventListener('dragover', event => {
        if (!draggingPromptKey || state.assignments[draggingPromptKey] === group.id
            || (group.id === 'ungrouped' && !state.assignments[draggingPromptKey])) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        row.classList.add('is-drop-target');
      });
      row.addEventListener('dragleave', event => {
        if (!row.contains(event.relatedTarget)) row.classList.remove('is-drop-target');
      });
      row.addEventListener('drop', event => {
        if (!draggingPromptKey) return;
        event.preventDefault();
        row.classList.remove('is-drop-target');
        const key = draggingPromptKey;
        draggingPromptKey = null;
        if (!state.items.some(item => keyFor(item) === key)) return;
        const previous = state.assignments[key];
        const previousSelectedGroupId = state.selectedGroupId;
        if (group.id === 'ungrouped') delete state.assignments[key];
        else state.assignments[key] = group.id;
        state.selectedGroupId = group.id;
        state.selectedKey = key;
        state.selectedKeys.clear();
        void persistGroups().then(() => toast(ui('图片卡已移入“' + group.name + '”', "Image cards moved to “" + group.name + '”'))).catch(error => {
          if (previous) state.assignments[key] = previous;
          else delete state.assignments[key];
          state.selectedGroupId = previousSelectedGroupId;
          renderPromptSidebar(); renderGrid();
          toast(ui('移动图片卡失败：' + (error.zh || error.message), "Could not move image cards: " + (error.en || error.message)), 'error');
        });
      });
    }
    if (!['all', 'ungrouped'].includes(group.id)) {
      row.append(button(ui('编辑', "Edit"), 'group-mini-action', () => {
        const value = prompt(t('重命名分组', "Rename group"), group.name);
        if (value === null) return;
        const name = value.trim().replace(/\s+/g, ' ').slice(0, 40);
        if (!name) { toast(ui('请输入分组名称', "Enter a group name."), 'error'); return; }
        if (state.groups.some(other => other.id !== group.id && other.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
          toast(ui('已有同名分组', "A group with this name already exists."), 'error'); return;
        }
        group.name = name;
        void persistGroups();
      }));
      row.append(button(ui('删除', "Delete"), 'group-mini-action', () => {
        if (!confirm(t('删除分组“' + group.name + '”？其中的图片卡会回到“未分组”，原始提示词方案不会删除。', "Delete group “" + group.name + "”? Its image cards become ungrouped. Original prompt schemes remain."))) return;
        state.groups = state.groups.filter(other => other.id !== group.id);
        for (const [key, id] of Object.entries(state.assignments)) if (id === group.id) delete state.assignments[key];
        state.selectedGroupId = 'ungrouped';
        state.selectedKeys.clear();
        void persistGroups();
      }));
    }
    target.append(row);
  }
  renderGroupControls();
}

async function persistGroups() {
  await accountStorage.set({ [STORAGE.promptGroupsV4]: { groups: state.groups, assignments: state.assignments } });
  renderPromptSidebar();
  renderGrid();
  await renderDetail();
}

function renderSummary() {
  const summary = $('library-summary');
  clearUiText(summary).replaceChildren();
  writeUiText($('prompt-count'), ui(state.items.length + ' 张图片卡', state.items.length + " image cards"));
  const metrics = [
    [String(state.groups.length), ui('个自建分组', 'custom groups')],
    [String(state.items.length), ui('张提示词图片卡', 'prompt image cards')],
  ];
  for (const [value, label] of metrics) {
    const metric = element('div');
    metric.append(element('strong', '', value), element('span', '', label));
    summary.append(metric);
  }
}

function renderCategories() {
  const select = $('category-filter');
  const chosen = select.value;
  const categories = [...new Set(state.schemes.map(scheme => scheme.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
  clearUiText(select).replaceChildren(localizedOption(ui('全部分类', "All categories"), ''));
  for (const category of categories) select.add(localizedOption(ui(category, defaultCategoryText(category)), category));
  select.value = categories.includes(chosen) ? chosen : '';
}

function renderGrid() {
  const grid = $('library-grid');
  clearUiText(grid).replaceChildren();
  const matches = filteredItems();
  $('empty-state').hidden = state.items.length > 0;
  $('no-results').hidden = state.items.length === 0 || matches.length > 0;
  writeUiText($('no-results'), ui(state.selectedGroupId === 'ungrouped' ? '没有找到符合条件的图片卡。' : '这个分组还没有符合条件的图片卡。', state.selectedGroupId === 'ungrouped' ? "No matching image cards." : "No matching image cards in this group."));
  writeUiText($('result-count'), ui(state.items.length ? ($('library-search').value.trim() ? '全提示词库搜索 · ' : '显示 ') + matches.length + ' / ' + state.items.length + ' 项' : '', state.items.length ? ($('library-search').value.trim() ? "All-prompt search · " : "Showing ") + matches.length + ' / ' + state.items.length + " items" : ''));
  if (!matches.length) state.selectedKey = null;
  if (matches.length && !matches.some(item => keyFor(item) === state.selectedKey)) {
    state.selectedKey = keyFor(matches[0]);
  }
  for (const item of matches) {
    const key = keyFor(item);
    const card = element('article', 'asset-card' + (key === state.selectedKey ? ' is-selected' : ''));
    card.draggable = true;
    card.addEventListener('dragstart', event => {
      if (event.target.closest('label, input')) { event.preventDefault(); return; }
      draggingPromptKey = key;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('application/x-archbuddy-prompt-card', key);
      card.classList.add('is-dragging');
    });
    card.addEventListener('dragend', () => {
      draggingPromptKey = null;
      card.classList.remove('is-dragging');
      $('prompt-sidebar-list').querySelectorAll('.is-drop-target').forEach(node => node.classList.remove('is-drop-target'));
    });
    const selectRow = element('div', 'asset-select');
    const selectLabel = element('label', 'asset-select-label');
    const checkbox = element('input');
    checkbox.type = 'checkbox';
    checkbox.checked = state.selectedKeys.has(key);
    setLocalizedAttribute(checkbox, 'aria-label', '选择图片卡 ' + (item.reference?.displayName || item.scheme.name), "Select image card " + (item.reference?.displayName || item.scheme.name));
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) state.selectedKeys.add(key);
      else state.selectedKeys.delete(key);
      renderGroupControls();
    });
    selectLabel.append(checkbox, element('span', '', ui('选择', "Select")));
    selectRow.append(selectLabel, element('span', 'asset-drag-hint', ui('拖至左侧分组', "Drag to a sidebar group")));
    const main = button('', 'asset-card-main', () => {
      state.selectedKey = key;
      grid.querySelectorAll('.asset-card').forEach(node => node.classList.toggle('is-selected', node === card));
      void renderDetail();
    });
    main.addEventListener('dblclick', () => { void showPromptImage(item); });
    setLocalizedAttribute(main, 'title', '单击查看提示词，双击查看大图', "Click for the prompt; double-click for a larger image");
    const visual = element('div', 'asset-image', ui(item.reference ? '正在读取图片…' : '尚无来源图', item.reference ? "Loading image…" : "No source image"));
    const copy = element('div', 'asset-copy');
    copy.append(
      element('strong', '', item.reference?.displayName || item.scheme.name),
      element('span', '', ui((item.generated ? '生成效果图 · ' : '参考图 · ') + (item.scheme.projectName || item.scheme.category || '已确认提示词'), (item.generated ? "Generated image · " : "Reference image · ") + (item.scheme.projectName || defaultCategoryText(item.scheme.category) || "Confirmed prompt"))),
      element('span', '', ui(item.reference?.tags.length ? item.reference.tags.join('、') : '确认于 ' + humanDate(item.scheme.overallConfirmedAt), item.reference?.tags.length ? item.reference.tags.join('、') : "Confirmed " + humanDate(item.scheme.overallConfirmedAt, 'en'))),
    );
    copy.append(element('p', 'asset-prompt-preview', ui(promptExcerpt(item), promptExcerpt(item) === '暂无已确认提示词' && !(item.version || item.scheme.versions.at(-1))?.compiledPrompt ? 'No confirmed prompt yet' : promptExcerpt(item))));
    main.append(visual, copy);
    card.append(selectRow, main);
    grid.append(card);
    if (item.reference) {
      void imageUrl(item).then(url => {
        if (!card.isConnected) return;
        clearUiText(visual).replaceChildren();
        if (!url) { writeUiText(visual, ui('原图缺失', "Original image missing")); return; }
        const image = element('img');
        image.src = url;
        image.alt = item.reference.displayName;
        image.draggable = false;
        visual.append(image);
      });
    }
  }
  renderGroupControls();
}

function infoRow(label, value) {
  const row = element('div', 'meta-line');
  row.append(element('span', '', label), element('span', '', value || ui('未填写', 'Not provided')));
  return row;
}

async function copyVersion(version) {
  if (!version?.compiledPrompt) return;
  try {
    await navigator.clipboard.writeText(version.compiledPrompt);
    $('copy-fallback').hidden = true;
    toast(ui('Prompt 已复制', "Prompt copied"));
  } catch {
    const field = $('copy-fallback');
    field.value = version.compiledPrompt;
    field.hidden = false;
    field.focus();
    field.select();
    toast(ui('自动复制未获允许，请按 Ctrl+C 复制已选中的 Prompt', "Clipboard access was not allowed. Press Ctrl+C to copy the selected prompt."), 'error');
  }
}

function openPanel() {
  return chrome.sidePanel.open({ windowId: chrome.windows.WINDOW_ID_CURRENT });
}

async function saveMetadata(item, projectInput, categoryInput, tagsInput) {
  const tags = item.reference && !item.generated
    ? tagsInput.value.split(/[,，、]/).map(value => value.trim()).filter(Boolean)
    : [];
  if (projectInput.value.trim().length > 80 || categoryInput.value.trim().length > 40
      || tags.length > 5 || tags.some(tag => tag.length > 24)) {
    toast(ui('项目最多 80 字、分类最多 40 字；标签最多 5 个且每个最多 24 字', "Use up to 80 characters for projects, 40 for categories, and 5 tags of up to 24 characters each."), 'error');
    return;
  }
  try {
    await request('library.metadata.save', {
      schemeId: item.scheme.schemeId,
      sourceReferenceId: item.generated ? null : item.reference?.sourceReferenceId || null,
      projectName: projectInput.value,
      category: categoryInput.value,
      tags,
    });
    await load();
    toast(ui('整理信息已保存', "Details saved"));
  } catch (error) {
    toast(errorText(error), 'error');
  }
}

async function deleteScheme(item) {
  if (!confirm(t('删除“' + item.scheme.name + '”及其所有本地来源图和 Prompt 版本？此操作无法撤销，下载目录中的文件不会删除。', "Delete “" + item.scheme.name + "” and all local source images and prompt versions? This cannot be undone. Downloads remain."))) return;
  try {
    await request('scheme.delete', { schemeId: item.scheme.schemeId, confirmed: true });
    state.selectedKey = null;
    await load();
    toast(ui('方案及关联本地素材已删除', "Scheme and linked local assets deleted"));
  } catch (error) {
    toast(errorText(error), 'error');
  }
}

async function renderDetail() {
  const detail = $('asset-detail');
  const item = state.items.find(candidate => keyFor(candidate) === state.selectedKey);
  if (!item) {
    clearUiText(detail).replaceChildren(element('div', 'detail-placeholder', ui('选择一张图片，查看对应版本、来源图和提示词。', "Select an image to view its versions, sources and prompts.")));
    return;
  }
  const key = keyFor(item);
  const scheme = item.scheme;
  const selectedVersion = item.version || [...scheme.versions].reverse()
    .find(version => version.sourceReferenceIds.includes(item.reference?.sourceReferenceId))
    || scheme.versions.at(-1);
  const visual = element('div', 'detail-image', ui(item.reference ? '正在读取图片…' : '尚无关联图', item.reference ? "Loading image…" : "No linked image"));
  setLocalizedAttribute(visual, 'title', '双击查看大图', "Double-click for a larger view");
  visual.addEventListener('dblclick', () => { void showPromptImage(item); });
  const body = element('div', 'detail-body');
  const head = element('div', 'detail-head');
  head.append(element('h2', '', item.reference?.displayName || scheme.name),
    element('p', '', ui('所属方案：' + scheme.name, "Scheme: " + scheme.name)));

  const versionSection = element('section', 'detail-section');
  versionSection.append(element('h3', '', ui('Prompt 版本历史', "Prompt version history")));
  const versions = [...scheme.versions].reverse();
  if (versions.length) {
    const picker = element('div', 'version-list');
    const select = element('select');
    for (const version of versions) select.add(localizedOption(ui('版本 ' + version.versionNumber + ' · ' + humanDate(version.createdAt), "Version " + version.versionNumber + ' · ' + humanDate(version.createdAt, 'en')), version.versionId));
    if (selectedVersion) select.value = selectedVersion.versionId;
    const preview = element('pre', 'version-text');
    const versionMeta = element('p', 'version-meta');
    const update = () => {
      const version = versions.find(candidate => candidate.versionId === select.value);
      writeUiText(preview, version?.compiledPrompt || '');
      writeUiText(versionMeta, ui(version
        ? (version.generatedResult ? '对应生成图：' + version.generatedResult.displayName + ' · ' : '')
          + '关联参考图 ' + version.sourceReferenceIds.length + ' 张' : '', version
        ? (version.generatedResult ? "Generated image: " + version.generatedResult.displayName + ' · ' : '')
          + "Linked references: " + version.sourceReferenceIds.length + " images" : ''));
    };
    select.addEventListener('change', update);
    update();
    picker.append(select, versionMeta, preview, button(ui('复制此版本', "Copy this version"), 'outline-button', () => {
      void copyVersion(versions.find(version => version.versionId === select.value));
    }));
    versionSection.append(picker);
  } else versionSection.append(element('p', '', ui('暂无确认版本。', "No confirmed versions yet.")));
  body.append(versionSection);

  const baseline = selectedVersion?.baselineVersionId
    ? scheme.versions.find(version => version.versionId === selectedVersion.baselineVersionId)
    : scheme.versions[0];
  if (baseline?.compiledPrompt && baseline.versionId !== selectedVersion?.versionId) {
    const original = element('section', 'detail-section');
    original.append(element('h3', '', ui(selectedVersion?.baselineVersionId ? '优化前原始提示词' : '最初确认的提示词', selectedVersion?.baselineVersionId ? "Original prompt before refinement" : "First confirmed prompt")),
      element('pre', 'version-text original-prompt', baseline.compiledPrompt));
    body.append(original);
  }

  const context = element('section', 'detail-section');
  context.append(element('h3', '', ui('对应图片', "Linked images")));
  const imageList = element('div', 'related-images');
  const relatedRefs = scheme.sourceReferences.filter(reference =>
    !selectedVersion || selectedVersion.sourceReferenceIds.includes(reference.sourceReferenceId));
  for (const reference of relatedRefs) {
    const row = element('div', 'related-image-row');
    row.append(element('span', 'related-image-role', ui('参考图', "Reference image")), element('span', '', reference.displayName));
    imageList.append(row);
  }
  if (selectedVersion?.generatedResult) {
    const row = element('div', 'related-image-row');
    row.append(element('span', 'related-image-role result-role', ui('生成图', "Generated image")),
      element('span', '', selectedVersion.generatedResult.displayName));
    imageList.append(row);
  }
  if (!imageList.childNodes.length) imageList.append(element('p', '', ui('此版本没有关联图片。', "No images linked to this version.")));
  context.append(imageList);

  const meta = element('div', 'compact-meta');
  meta.append(infoRow(ui('项目分类', "Project category"), ui(scheme.category, defaultCategoryText(scheme.category))), infoRow(ui('保存时间', "Saved"), ui(humanDate(selectedVersion?.createdAt || scheme.updatedAt), humanDate(selectedVersion?.createdAt || scheme.updatedAt, 'en'))));
  body.append(meta);

  const form = element('form', 'metadata-form');
  form.append(element('h3', '', ui('整理信息', "Organize details")));
  const projectLabel = element('label', '', ui('项目名称', "Project name"));
  const projectInput = element('input');
  projectInput.maxLength = 80; setLocalizedAttribute(projectInput, 'placeholder', '例如：山地酒店方案', "For example: mountain hotel"); projectInput.value = scheme.projectName;
  projectLabel.append(projectInput);
  const categoryLabel = element('label', '', ui('项目分类', "Project category"));
  const categoryInput = element('input');
  categoryInput.maxLength = 40; setLocalizedAttribute(categoryInput, 'placeholder', '例如：文化建筑', "For example: cultural buildings"); categoryInput.value = scheme.category;
  categoryLabel.append(categoryInput);
  form.append(projectLabel, categoryLabel);
  const tagsInput = element('input');
  if (item.reference && !item.generated) {
    const tagsLabel = element('label', '', ui('图片标签', "Image tags"));
    tagsInput.maxLength = 150; setLocalizedAttribute(tagsInput, 'placeholder', '用逗号分隔', "Separate with commas"); tagsInput.value = item.reference.tags.join('，');
    tagsLabel.append(tagsInput);
    form.append(tagsLabel);
  }
  const save = element('button', 'outline-button', ui('保存整理信息', "Save details"));
  save.type = 'submit';
  form.append(save);
  form.addEventListener('submit', event => {
    event.preventDefault();
    void saveMetadata(item, projectInput, categoryInput, tagsInput);
  });
  body.append(form);
  body.append(head, visual, context);

  const actions = element('div', 'detail-actions');
  actions.append(button(ui('删除方案', "Delete scheme"), 'danger-button', () => { void deleteScheme(item); }));
  body.append(actions);
  clearUiText(detail).replaceChildren(body);
  if (item.reference) {
    const url = await imageUrl(item);
    if (key !== state.selectedKey || !visual.isConnected) return;
    clearUiText(visual).replaceChildren();
    if (url) {
      const image = element('img');
      image.src = url;
      image.alt = item.reference.displayName;
      visual.append(image);
    } else writeUiText(visual, ui('原图缺失，仍可查看 Prompt', "Original image missing. The prompt is still available."));
  }
}
async function load() {
  const loadNumber = ++state.loadNumber;
  const stored = await accountStorage.get([STORAGE.promptSchemesV3, STORAGE.promptGroupsV4]);
  if (loadNumber !== state.loadNumber) return;
  releaseUrls();
  const raw = Array.isArray(stored[STORAGE.promptSchemesV3]) ? stored[STORAGE.promptSchemesV3] : [];
  state.schemes = raw.map(item => normalizePromptScheme(item))
    .filter(scheme => scheme.overallConfirmedAt || scheme.versions.some(version => version.origin !== 'legacy-baseline'))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  state.items = state.schemes.flatMap(scheme => {
    const sourceCards = scheme.sourceReferences.map(reference => ({
      scheme, reference, version: [...scheme.versions].reverse()
        .find(version => version.sourceReferenceIds.includes(reference.sourceReferenceId)),
    }));
    const resultCards = scheme.versions.filter(version => version.generatedResult)
      .map(version => ({
        scheme, version, generated: true,
        reference: {
          sourceReferenceId: version.generatedResult.generatedResultId,
          displayName: version.generatedResult.displayName,
          assetState: 'available',
          tags: [], createdAt: version.generatedResult.createdAt,
          sourceType: 'file',
        },
      }));
    return [...sourceCards, ...resultCards].length ? [...sourceCards, ...resultCards]
      : [{ scheme, reference: null, version: scheme.versions.at(-1) }];
  });
  const grouping = stored[STORAGE.promptGroupsV4] || {};
  state.groups = Array.isArray(grouping.groups)
    ? grouping.groups.filter(group => group && typeof group.id === 'string' && typeof group.name === 'string')
    : [];
  state.assignments = grouping.assignments && typeof grouping.assignments === 'object' ? grouping.assignments : {};
  if (!['all', 'ungrouped'].includes(state.selectedGroupId) && !state.groups.some(group => group.id === state.selectedGroupId)) {
    state.selectedGroupId = 'ungrouped';
  }
  const validKeys = new Set(state.items.map(keyFor));
  const validGroups = new Set(state.groups.map(group => group.id));
  const validAssignments = Object.fromEntries(Object.entries(state.assignments)
    .filter(([key, id]) => validKeys.has(key) && validGroups.has(id)));
  if (Object.keys(validAssignments).length !== Object.keys(state.assignments).length) {
    state.assignments = validAssignments;
    void accountStorage.set({ [STORAGE.promptGroupsV4]: { groups: state.groups, assignments: validAssignments } });
  }
  state.selectedKeys = new Set([...state.selectedKeys].filter(key => validKeys.has(key)));
  renderSummary();
  renderCategories();
  renderGrid();
  renderPromptSidebar();
  await renderDetail();
  void primeVectorIndex(promptSearch, promptDocuments());
}

$('create-group').addEventListener('click', () => {
  const name = $('group-name').value.trim().replace(/\s+/g, ' ').slice(0, 40);
  if (!name) { toast(ui('请输入分组名称', "Enter a group name."), 'error'); return; }
  if (state.groups.some(group => group.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
    toast(ui('已有同名分组', "A group with this name already exists."), 'error'); return;
  }
  const id = crypto.randomUUID();
  state.groups.push({ id, name });
  for (const key of state.selectedKeys) state.assignments[key] = id;
  state.selectedGroupId = id;
  state.selectedKeys.clear();
  $('group-name').value = '';
  void persistGroups().then(() => toast(ui('已建立分组“' + name + '”', "Created group “" + name + '”'))).catch(error => toast(errorText(error), 'error'));
});
$('group-name').addEventListener('keydown', event => {
  if (event.key === 'Enter') $('create-group').click();
});
$('group-select').addEventListener('change', renderGroupControls);
$('move-selected').addEventListener('click', () => {
  const id = $('group-select').value;
  if (!id || !state.selectedKeys.size || (id !== 'ungrouped' && !state.groups.some(group => group.id === id))) return;
  for (const key of state.selectedKeys) {
    if (id === 'ungrouped') delete state.assignments[key];
    else state.assignments[key] = id;
  }
  state.selectedGroupId = id;
  state.selectedKeys.clear();
  void persistGroups().then(() => toast(ui('图片卡已移入“' + groupName(id) + '”', "Image cards moved to “" + groupName(id, 'en') + '”'))).catch(error => toast(errorText(error), 'error'));
});
document.addEventListener('dragover', event => {
  if (!draggingFolder) return;
  const rect = $('capture-folders').getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right
      || event.clientY < rect.top - 24 || event.clientY > rect.bottom + 40) {
    stopFolderAutoScroll();
    return;
  }
  folderScrollPointerY = event.clientY;
  if (!folderScrollFrame) folderScrollFrame = requestAnimationFrame(scrollFolderListWhileDragging);
});
document.addEventListener('dragend', () => { stopFolderAutoScroll(); $('capture-folders').classList.remove('is-moving-project'); });
document.addEventListener('drop', () => { stopFolderAutoScroll(); $('capture-folders').classList.remove('is-moving-project'); });
$('show-captures').addEventListener('click', () => showSection('captures'));
$('show-prompts').addEventListener('click', () => showSection('prompts'));
$('generate-missing-descriptions').addEventListener('click', async event => {
  const button = event.currentTarget;
  if (button.dataset.busy === 'true') return;
  const missing = state.captures.filter(item => !String(state.catalog[item.id]?.description || '').trim()).length;
  if (!missing) { toast(ui('当前图库没有缺少核心描述的图片', "All library images already have descriptions.")); return; }
  if (!(await ensureAccount())) return;
  const prompt = t(pointsEnabled()
    ? `将为 ${missing} 张缺少描述的图片逐张生成核心视觉特点，最多消耗 ${formatPoints(missing)} 积分（每张 0.1 积分），失败释放。每日模型调用最多 50 次，达到后暂停。继续？`
    : `将为 ${missing} 张缺少描述的图片生成简析，每成功一张消耗 1 次简析权益。普通下载免费；额度不足会暂停，未知结果不会重复扣次。继续？`, pointsEnabled()
    ? `Generate summaries for ${missing} images missing descriptions, using at most ${formatPoints(missing)} credits (0.1 per image). Confirmed failures release credits. Work pauses at 50 daily model calls. Continue?`
    : `Generate summaries for ${missing} images missing descriptions. Each successful summary uses one summary allowance. Downloads are free. Work pauses when the allowance runs out; unknown outcomes are not charged again. Continue?`);
  if (!confirm(prompt)) return;
  if (!(await ensureCaptureDescriptionConsent())) return;
  if (button.dataset.busy === 'true') return;
  button.dataset.busy = 'true'; button.disabled = true;
  try {
    const result = await request('capture.describe.missing', {});
    toast(ui(result.queued ? '已排队 ' + result.queued + ' 张，将在后台生成' : '没有可生成的缺失描述', result.queued ? "Queued " + result.queued + " images for background processing" : "No missing descriptions to generate"));
  } catch (error) { toast(errorText(error), 'error'); }
  finally {
    button.dataset.busy = 'false'; button.disabled = false;
    void renderDescriptionProgress();
  }
});
function captureDocuments() { return state.captures.map(item => ({ id: String(item.id), text: captureText(item).slice(0, 2000) })); }
function promptDocuments() { return state.items.map(item => {
  const text = promptSearchText(item);
  return { id: keyFor(item), text: text.length > 2000 ? text.slice(0, 800) + '；' + text.slice(-1199) : text };
}); }
async function primeVectorIndex(search, documents) {
  const consent = await accountStorage.get([STORAGE.assetAIConsent, STORAGE.assetVectorConsent]);
  if (consent[STORAGE.assetAIConsent] && consent[STORAGE.assetVectorConsent]) await search.prime(documents).catch(() => {});
  else await search.prune(documents).catch(() => {});
}
wireSemanticSearch('capture-search', 'search-captures', 'capture-search-status', captureSearch, captureDocuments, renderCaptureGrid);
wireSemanticSearch('library-search', 'search-prompts', 'prompt-search-status', promptSearch, promptDocuments, () => { renderGrid(); void renderDetail(); });
$('category-filter').addEventListener('change', () => { renderGrid(); void renderDetail(); });
async function setCaptureProjectView(view) {
  if (state.captureProjectView === view) return;
  state.captureProjectView = view;
  $('capture-project-grid').classList.toggle('is-large', view === 'large');
  $('capture-view-small').setAttribute('aria-pressed', String(view === 'small'));
  $('capture-view-large').setAttribute('aria-pressed', String(view === 'large'));
  try { await accountStorage.set({ [STORAGE.captureProjectViewV4]: view }); }
  catch (error) { toast(ui('保存视图偏好失败：' + (error.zh || error.message), "Could not save the view preference: " + (error.en || error.message)), 'error'); }
}
$('capture-view-small').addEventListener('click', () => { void setCaptureProjectView('small'); });
$('capture-view-large').addEventListener('click', () => { void setCaptureProjectView('large'); });
$('capture-back').addEventListener('click', () => {
  const previous = captureSearchReturn?.folder === state.selectedFolder ? captureSearchReturn : null;
  captureSearchReturn = null;
  captureSearch.clear();
  $('capture-search').value = previous?.query || '';
  captureSearch.query = previous?.searchQuery || '';
  captureSearch.ids = previous?.ids || [];
  captureSearch.status = previous?.status || '';
  captureSearch.statusI18n = previous?.statusI18n || null;
  writeUiText($('capture-search-status'), externalStatus(captureSearch.status, captureSearch.statusI18n));
  selectedCaptureId = previous?.selectedId ?? null;
  failedDescriptionsOnly = false;
  state.selectedFolder = null;
  renderCaptureFolders();
  renderCaptureGrid();
  if (previous) requestAnimationFrame(() => window.scrollTo(0, previous.scrollY));
});
$('description-progress-failed').addEventListener('click', () => {
  failedDescriptionsOnly = true;
  state.showAllCaptures = false;
  selectedCaptureId = null;
  state.selectedFolder = null;
  $('capture-search').value = ''; captureSearch.clear(); writeUiText($('capture-search-status'), '');
  showSection('captures');
  renderCaptureFolders();
  renderCaptureGrid();
});
async function importFolders(files) {
  const control = $('import-local-folder');
  if (control.disabled) return;
  control.disabled = true;
  writeUiText($('import-feedback'), ui('正在复制图片到本地图词库…', "Copying images to the local library…"));
  try {
    const result = await importLocalFolder(files, message => { writeUiText($('import-feedback'), externalStatus(message)); });
    await loadCaptures();
    writeUiText($('import-feedback'), importSummaryText(result));
    toast(importSummaryText(result));
  } catch (error) {
    writeUiText($('import-feedback'), ui('导入失败：' + (error.zh || error.message), "Import failed: " + (error.en || error.message)));
    toast(errorText(error), 'error');
  } finally { control.disabled = false; }
}
$('save-type').addEventListener('click', async () => {
  const control = $('save-type');
  control.disabled = true;
  try { await addCaptureType(); }
  catch (error) { toast(errorText(error), 'error'); }
  finally { control.disabled = false; }
});
$('custom-type').addEventListener('keydown', event => {
  if (event.key === 'Enter') $('save-type').click();
});
$('import-local-folder').addEventListener('click', () => $('local-folder-files').click());
$('local-folder-files').addEventListener('change', event => {
  const files = [...event.currentTarget.files]; event.currentTarget.value = '';
  if (files.length) void importFolders(files);
});
wireFolderDrop($('folder-import-drop'), importFolders,
  error => { writeUiText($('import-feedback'), ui('导入失败：' + (error.zh || error.message), "Import failed: " + (error.en || error.message))); toast(errorText(error), 'error'); },
  () => { if ($('import-local-folder').disabled) return false; writeUiText($('import-feedback'), ui('正在读取所拖入的文件夹…', "Reading the dropped folder…")); });
$('link-downloads').addEventListener('click', () => $('capture-folder-files').click());
$('capture-folder-files').addEventListener('change', event => {
  const files = [...event.currentTarget.files];
  event.currentTarget.value = '';
  void importDownloadPreviews(files).catch(error => toast(errorText(error), 'error'));
});
$('open-sidepanel').addEventListener('click', () => { void openPanel().catch(error => toast(errorText(error), 'error')); });
$('empty-open-panel').addEventListener('click', () => { void openPanel().catch(error => toast(errorText(error), 'error')); });
chrome.storage.onChanged.addListener(async (changes, area) => {
  changes = await scopeChanges(changes, area);
  if (area === 'local' && (changes[STORAGE.promptSchemesV3] || changes[STORAGE.promptGroupsV4])) {
    void load().catch(error => toast(errorText(error), 'error'));
  }
  if (area === 'local' && (changes[STORAGE.capturePreviewsV4] || changes[STORAGE.captureCatalogV4]
      || changes[STORAGE.importedAssetsV4] || changes[STORAGE.customTypes] || changes[STORAGE.hiddenProjectTypesV4] || changes[STORAGE.projectTypeOrderV4] || changes[STORAGE.projectTypeAliasesV4] || changes[STORAGE.captureHiddenV4])) {
    void loadCaptures().catch(error => toast(errorText(error), 'error'));
  }
});
chrome.downloads.onChanged.addListener(change => {
  if (change.state?.current === 'complete' || change.filename) {
    void loadCaptures().catch(error => toast(errorText(error), 'error'));
  }
});
chrome.downloads.onErased.addListener(() => {
  void loadCaptures().catch(error => toast(errorText(error), 'error'));
});
window.addEventListener('beforeunload', () => {
  releaseUrls();
  for (const url of state.captureUrls.values()) URL.revokeObjectURL(url);
});
void Promise.all([load(), loadCaptures()]).catch(error => toast(ui('图词库读取失败：' + (error.zh || error.message), "Could not load the library: " + (error.en || error.message)), 'error'));

$('confirm-delete-capture').addEventListener('click', event => {
  event.preventDefault();
  const downloadIds = [...deletionSelection];
  const deleteOriginal = $('delete-original').checked;
  $('delete-capture-dialog').close();
  deletionSelection = [];
  void request('capture.delete', { downloadIds, deleteOriginal, confirmed: true }).then(async result => {
    for (const id of result.deleted) descriptionDrafts.delete(id);
    await loadCaptures();
    toast(ui(result.failed.length ? '已删除 ' + result.deleted.length + ' 张；' + result.failed.length + ' 张未完成：' + result.failed[0].error
      : result.viewerCopiesKept?.length ? '图库图片已删除；部分系统查看副本仍在下载目录，请手动清理'
        : (deleteOriginal ? '已删除所选下载原图和图库记录；导入原文件保留' : '已移出图库，电脑原文件保留'), result.failed.length ? "Deleted " + result.deleted.length + " images; " + result.failed.length + " images could not be deleted: " + result.failed[0].error
      : result.viewerCopiesKept?.length ? "Library images deleted. Some viewer copies remain in Downloads; remove them manually if needed."
        : (deleteOriginal ? "Selected downloads and library records deleted. Imported source files remain." : "Removed from the library. Original files remain.")),
      result.failed.length || result.viewerCopiesKept?.length ? 'error' : '');
  }).catch(error => toast(errorText(error), 'error'));
});

async function renderDescriptionProgress() {
  const progressElement = $('description-progress');
  const progressBar = $('description-progress-bar');
  const progressTotal = $('description-progress-total');
  const progressText = $('description-progress-text');
  const progressDetail = $('description-progress-detail');
  const failedButton = $('description-progress-failed');
  const stored = await accountStorage.get(STORAGE.descriptionProgressV4);
  const progress = stored[STORAGE.descriptionProgressV4];
  if (!Array.isArray(progress?.ids) || !progress.ids.length) {
    progressElement.hidden = true;
    descriptionTaskFailedIds = new Set();
    return;
  }
  const total = progress.ids.length;
  const processed = Math.min(total, Number(progress.done) || 0);
  descriptionTaskFailedIds = new Set(Array.isArray(progress.failedIds) ? progress.failedIds : []);
  const failed = Math.min(processed, descriptionTaskFailedIds.size);
  const completed = processed - failed;
  const remaining = total - processed;
  progressElement.hidden = false;
  progressBar.style.width = Math.round((processed / total) * 100) + '%';
  writeUiText(progressTotal, ui('本次 ' + total, "Total " + total));
  writeUiText(progressText, ui('已完成 ' + completed, "Completed " + completed));
  writeUiText(progressDetail, ui(progress.pauseCode ? '已暂停：' + (progress.pauseMessage || '请查看账号权益后重新点击生成') : '剩余 ' + remaining, progress.pauseCode ? "Paused: " + (progress.pauseMessage || "Check your allowance, then generate again.") : "Remaining " + remaining));
  failedButton.hidden = failed < 1;
  writeUiText(failedButton, ui('失败 ' + failed, "Failed " + failed));
  setLocalizedAttribute(failedButton, 'title', '查看本次任务失败的图片', "View images that failed in this task");
  progressElement.setAttribute('aria-valuemax', String(total));
  progressElement.setAttribute('aria-valuenow', String(processed));
  setLocalizedAttribute(progressElement, 'aria-label', '本次概要描述任务：总数 ' + total + '，已完成 ' + completed + '，剩余 ' + remaining + '，失败 ' + failed, "Summary task: total " + total + ", completed " + completed + ", remaining " + remaining + ", failed " + failed);
}
async function refreshAssetConsent() {
  const stored = await accountStorage.get([STORAGE.assetAIConsent, STORAGE.assetVectorConsent]);
  $('asset-consent').hidden = stored[STORAGE.assetAIConsent] === true && stored[STORAGE.assetVectorConsent] === true;
}
async function ensureCaptureDescriptionConsent() {
  if (!(await ensureAccount())) return false;
  const stored = await accountStorage.get(STORAGE.assetAIConsent);
  if (stored[STORAGE.assetAIConsent]) return true;
  const text = t(pointsEnabled()
    ? '生成核心视觉特点会发送图片的压缩预览，每张 0.1 积分；开启后新下载图片也会自动描述。确认同意并开启图库 AI？'
    : '开启图库 AI 后，新下载图片的压缩预览会自动发送给 ArchBuddy 与 DeepSeek 生成简析，每成功一张消耗 1 次简析权益。普通下载本身免费。确认开启？', pointsEnabled()
    ? "Visual descriptions send compressed previews and cost 0.1 credits per image. New downloads will be described automatically. Enable library AI?"
    : "Library AI sends compressed previews of new downloads to ArchBuddy and DeepSeek. Each successful summary uses one summary allowance. Downloads are free. Enable it?");
  if (!confirm(text)) return false;
  await request('assets.consent', { enabled: true });
  await refreshAssetConsent();
  return true;
}
async function ensureAssetConsent() {
  if (!(await ensureAccount())) return false;
  const stored = await accountStorage.get([STORAGE.assetAIConsent, STORAGE.assetVectorConsent]);
  if (!stored[STORAGE.assetAIConsent]) {
    const text = t(pointsEnabled()
      ? '开启图库 AI：新下载图片的预览将自动生成核心视觉特点，每张 0.1 积分（100 张共 10 积分）。确认有权处理并同意自动消耗积分？'
      : '开启图库 AI：新下载图片的预览将自动发送给 ArchBuddy 与 DeepSeek 生成简析，每成功一张消耗 1 次简析权益。普通下载免费。确认开启？', pointsEnabled()
      ? "Library AI describes new download previews at 0.1 credits per image (10 for 100 images). Confirm you can process these images and allow automatic credit use?"
      : "Library AI sends new download previews to ArchBuddy and DeepSeek. Each successful summary uses one summary allowance. Downloads are free. Enable it?");
    if (!confirm(text)) return false;
    await request('assets.consent', { enabled: true });
  }
  if (!stored[STORAGE.assetVectorConsent]) {
    const text = t('开启本地向量检索：首次建索引及文本变化时，图片名称/描述和提示词文本会发给腾讯云 TokenHub 生成向量；每次提交搜索只发送一次查询。图片字节与文件路径不发送给向量服务；向量索引保存在本机，统一服务为防重复处理保留任务结果 30 天；'
      + (pointsEnabled() ? '向量建索引与查询不扣积分，但计入每日模型调用保护。' : '语义搜索和向量化不扣简析、深度反推次数或 BuddyCoin，仍受并发和防滥用限制。') + '确认同意？', "Local semantic search sends image names, descriptions and prompts to Tencent Cloud TokenHub when indexing or updating text. Each submitted search sends one query. Image bytes and paths are not sent. The index stays on this device; task results are kept for 30 days to prevent duplicate processing. "
      + (pointsEnabled() ? "Indexing and queries do not use credits, but daily call limits apply. " : "Semantic search and indexing do not use summary or deep analysis allowances or BuddyCoin. Concurrency and abuse protections still apply. ") + "Do you agree?");
    if (!confirm(text)) return false;
    await request('assets.vectorConsent', { enabled: true });
    void primeVectorIndex(captureSearch, captureDocuments());
    void primeVectorIndex(promptSearch, promptDocuments());
  }
  await refreshAssetConsent(); return true;
}
function normalizedRecentSearches(values) {
  return (Array.isArray(values) ? values : []).filter(value => typeof value === 'string' && value.trim())
    .map(value => value.trim().slice(0, 500)).slice(0, 5);
}

async function rememberSearch(query) {
  const stored = await accountStorage.get(STORAGE.librarySearchHistoryV4);
  const value = query.trim();
  recentSearches = [value, ...normalizedRecentSearches(stored[STORAGE.librarySearchHistoryV4])
    .filter(entry => entry.toLocaleLowerCase() !== value.toLocaleLowerCase())].slice(0, 5);
  await accountStorage.set({ [STORAGE.librarySearchHistoryV4]: recentSearches });
}

function renderSearchHistory(menu, input, filter = false) {
  clearUiText(menu).replaceChildren();
  const heading = element('div', 'search-history-heading');
  heading.append(element('span', '', ui('最近搜索', "Recent searches")));
  if (recentSearches.length) heading.append(button(ui('清空', "Clear"), 'search-history-clear', async () => {
    try {
      await accountStorage.remove(STORAGE.librarySearchHistoryV4);
      recentSearches = [];
      renderSearchHistory(menu, input);
    } catch (error) { toast(ui('清空搜索记录失败：' + (error.zh || error.message), "Could not clear search history: " + (error.en || error.message)), 'error'); }
  }));
  menu.append(heading);
  const term = filter ? input.value.trim().toLocaleLowerCase() : '';
  const entries = recentSearches.filter(value => !term || value.toLocaleLowerCase().includes(term));
  if (!entries.length) menu.append(element('div', 'search-history-empty', ui(recentSearches.length ? '没有匹配的搜索记录' : '暂无搜索记录', recentSearches.length ? "No matching searches" : "No recent searches")));
  for (const value of entries) menu.append(button(value, 'search-history-item', () => {
    input.value = value;
    menu.hidden = true;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.closest('.header-search').querySelector('.search-submit').click();
  }));
  menu.hidden = false;
}

function wireSemanticSearch(inputId, buttonId, statusId, search, documents, render) {
  const input = $(inputId), submit = $(buttonId), status = $(statusId);
  const menu = $(inputId === 'capture-search' ? 'capture-search-history' : 'prompt-search-history');
  input.maxLength = 500;
  let queuedQuery = null;
  let openingHistory = false;
  const openHistory = async () => {
    if (openingHistory) return;
    openingHistory = true;
    try {
      const stored = await accountStorage.get(STORAGE.librarySearchHistoryV4);
      recentSearches = normalizedRecentSearches(stored[STORAGE.librarySearchHistoryV4]);
      if (document.activeElement === input) renderSearchHistory(menu, input);
    } catch (error) { toast(ui('读取搜索记录失败：' + (error.zh || error.message), "Could not load search history: " + (error.en || error.message)), 'error'); }
    finally { openingHistory = false; }
  };
  input.addEventListener('focus', () => { void openHistory(); });
  input.addEventListener('click', () => { if (menu.hidden) void openHistory(); });
  menu.addEventListener('pointerdown', event => event.preventDefault());
  document.addEventListener('pointerdown', event => {
    if (!menu.parentElement.contains(event.target)) menu.hidden = true;
  });
  const update = () => { writeUiText(status, externalStatus(search.status, search.statusI18n)); render(); };
  input.addEventListener('input', () => {
    if (inputId === 'capture-search') captureSearchReturn = null;
    queuedQuery = null;
    search.clear();
    const count = keywordMatches(documents(), input.value, item => item.text).length;
    search.status = input.value.trim() ? `关键词匹配 ${count} 项` : '';
    if (!menu.hidden) renderSearchHistory(menu, input, true);
    update();
  });
  const run = async () => {
    if (!input.value.trim()) return;
    const query = input.value;
    if (search.busy) {
      if (query !== search.query) { queuedQuery = query; search.status = '关键词结果已更新；当前向量检索结束后处理新查询'; update(); }
      return;
    }
    if (!(await ensureAssetConsent()) || input.value !== query) return;
    menu.hidden = true;
    try { await rememberSearch(query); } catch (error) { toast(ui('保存搜索记录失败：' + (error.zh || error.message), "Could not save search history: " + (error.en || error.message)), 'error'); }
    await search.run(query, documents(), update);
    if (queuedQuery && queuedQuery === input.value) { queuedQuery = null; await run(); }
  };
  submit.addEventListener('click', () => { void run().catch(error => toast(errorText(error), 'error')); });
  input.addEventListener('keydown', event => {
    if (event.key === 'Escape') menu.hidden = true;
    if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); submit.click(); }
  });
}
async function showPromptImage(item) {
  const url = await imageUrl(item);
  if (!url) { toast(ui('原图缺失，请重新关联图片', "Original image missing. Relink the image."), 'error'); return; }
  viewerItems = [];
  resetViewerZoom();
  $('viewer-image').src = url; setLocalizedAttribute($('viewer-image'), 'alt', item.reference?.displayName || '图片大图', item.reference?.displayName || "Large image preview");
  writeUiText($('viewer-counter'), item.reference?.displayName || '');
  $('viewer-prev').hidden = true; $('viewer-next').hidden = true;
  if (!$('image-viewer').open) $('image-viewer').showModal();
}
$('close-image-viewer').addEventListener('click', () => $('image-viewer').close());
$('viewer-prev').addEventListener('click', () => stepViewer(-1));
$('viewer-next').addEventListener('click', () => stepViewer(1));
$('viewer-canvas').addEventListener('wheel', event => {
  event.preventDefault();
  const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? $('viewer-canvas').clientHeight : 1);
  const nextScale = Math.max(1, Math.min(6, viewerZoom.scale * Math.exp(-delta * 0.002)));
  if (nextScale === viewerZoom.scale) return;
  const rect = $('viewer-canvas').getBoundingClientRect();
  const anchorX = event.clientX - rect.left - rect.width / 2;
  const anchorY = event.clientY - rect.top - rect.height / 2;
  viewerZoom.x = anchorX - (anchorX - viewerZoom.x) * nextScale / viewerZoom.scale;
  viewerZoom.y = anchorY - (anchorY - viewerZoom.y) * nextScale / viewerZoom.scale;
  viewerZoom.scale = nextScale;
  applyViewerZoom();
}, { passive: false });
$('viewer-canvas').addEventListener('pointerdown', event => {
  if (event.button !== 0 || viewerZoom.scale <= 1) return;
  viewerDrag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, panX: viewerZoom.x, panY: viewerZoom.y };
  $('viewer-canvas').setPointerCapture(event.pointerId);
  $('viewer-canvas').classList.add('is-panning');
  event.preventDefault();
});
$('viewer-canvas').addEventListener('pointermove', event => {
  if (!viewerDrag || event.pointerId !== viewerDrag.pointerId) return;
  viewerZoom.x = viewerDrag.panX + event.clientX - viewerDrag.x;
  viewerZoom.y = viewerDrag.panY + event.clientY - viewerDrag.y;
  applyViewerZoom();
});
function stopViewerDrag(event) {
  if (!viewerDrag || event.pointerId !== viewerDrag.pointerId) return;
  viewerDrag = null;
  $('viewer-canvas').classList.remove('is-panning');
  if ($('viewer-canvas').hasPointerCapture(event.pointerId)) $('viewer-canvas').releasePointerCapture(event.pointerId);
}
$('viewer-canvas').addEventListener('pointerup', stopViewerDrag);
$('viewer-canvas').addEventListener('pointercancel', stopViewerDrag);
$('viewer-canvas').addEventListener('dblclick', resetViewerZoom);
$('image-viewer').addEventListener('keydown', event => {
  if (event.key === 'ArrowLeft') { event.preventDefault(); stepViewer(-1); }
  if (event.key === 'ArrowRight') { event.preventDefault(); stepViewer(1); }
});
$('image-viewer').addEventListener('close', () => { viewerItems = []; resetViewerZoom(); $('viewer-image').removeAttribute('src'); });
$('enable-asset-ai').addEventListener('click', () => { void ensureAssetConsent().catch(error => toast(errorText(error), 'error')); });
chrome.storage.onChanged.addListener(async (changes, area) => {
  changes = await scopeChanges(changes, area);
  if (area !== 'local') return;
  if (changes[STORAGE.assetAIConsent] || changes[STORAGE.assetVectorConsent]) void refreshAssetConsent();
  if (changes[STORAGE.descriptionProgressV4] || changes[STORAGE.importedAssetsV4] || changes[STORAGE.captureCatalogV4]) void renderDescriptionProgress();
});
function updateTopbarShadow() {
  document.querySelector('.topbar').classList.toggle('is-scrolled', window.scrollY > 4);
}
window.addEventListener('scroll', updateTopbarShadow, { passive: true });
updateTopbarShadow();
void refreshAssetConsent();
void renderDescriptionProgress();

$('copy-import-source').addEventListener('click', async () => {
  const field = $('import-source-path');
  try {
    await navigator.clipboard.writeText(field.value);
    toast(ui('已复制导入时的相对目录', "Import path copied"));
  } catch {
    field.focus(); field.select();
    toast(ui('路径已选中，请按 Ctrl+C 复制', "Path selected. Press Ctrl+C to copy."));
  }
});

// 页眉随账号额度和语言自动增高，保持下方筛选及详情可见。
const libraryHeader = document.querySelector('.topbar');
new ResizeObserver(() => {
  document.documentElement.style.setProperty('--library-header-height', `${Math.ceil(libraryHeader.getBoundingClientRect().height)}px`);
}).observe(libraryHeader);

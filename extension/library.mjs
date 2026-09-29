import { PRESET_TYPES, STORAGE, normalizePromptScheme, orderedProjectTypes, resolveProjectType } from './shared.mjs';
import { getSourceImage, putSourceImage } from './source-image-store.mjs';
import { createSemanticSearch, keywordMatches } from './library-search.mjs';
import { importLocalFolder, importSummary, wireFolderDrop } from './folder-import.mjs';

const $ = id => document.getElementById(id);
const state = { schemes: [], items: [], selectedKey: null, urls: new Map(), pendingUrls: new Map(), loadNumber: 0, captures: [], activeTypes: [], previews: {}, catalog: {}, selectedFolder: null, selectedType: null, showAllCaptures: false, captureProjectView: 'small', typeChosenByUser: false, openTypes: new Set(), foldersInitialized: false, captureUrls: new Map(), capturePendingUrls: new Map(), captureLoad: 0, groups: [], assignments: {}, selectedGroupId: 'all', selectedKeys: new Set() };
let toastTimer;
let recentSearches = [];
let selectedCaptureId = null;
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
  $('viewer-zoom').textContent = Math.round(viewerZoom.scale * 100) + '% · 滚轮缩放';
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
  if (text !== undefined) result.textContent = text;
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
  notice.textContent = message;
  notice.dataset.tone = tone;
  notice.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { notice.hidden = true; }, 4800);
}

function humanDate(value) {
  const time = new Date(value);
  return Number.isNaN(time.getTime()) ? '时间未知' : time.toLocaleString('zh-CN');
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
  if (!response?.ok) throw new Error(response?.error || '本地操作失败，请重新加载扩展');
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
  target.replaceChildren();
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
    failedDescriptionsOnly = false;
    state.selectedFolder = null;
    selectedCaptureId = null;
    $('capture-search').value = ''; captureSearch.clear(); $('capture-search-status').textContent = '';
    renderCaptureFolders();
    renderCaptureGrid();
  });
  all.append(element('span', '', '全部图片'), element('small', '', state.captures.length + ' 张'));
  target.append(all);
  const types = [...groups.keys()];
  for (const type of types) {
    const projects = groups.get(type);
    const group = element('div', 'folder-group');
    const total = [...projects.values()].reduce((count, images) => count + images.length, 0);
    const heading = button(type + ' · ' + total, 'folder-type' + (type === state.selectedType && !state.showAllCaptures ? ' is-selected' : ''), () => {
      state.selectedType = type;
      state.showAllCaptures = false;
      state.typeChosenByUser = true;
      $('capture-search').value = ''; captureSearch.clear(); $('capture-search-status').textContent = '';
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
    heading.title = '拖动排序；Alt + ↑ / ↓ 也可移动';
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
        if (moved.type !== type) void moveProjectFolder(moved, type).catch(error => toast(error.message, 'error'));
        return;
      }
      if (!draggingType || draggingType === type) return;
      const order = types.filter(value => value !== draggingType);
      order.splice(order.indexOf(type) + (group.classList.contains('drag-after') ? 1 : 0), 0, draggingType);
      void reorderTypes(order).catch(error => toast(error.message, 'error'));
    });
    heading.addEventListener('keydown', event => {
      if (!event.altKey || !['ArrowUp','ArrowDown'].includes(event.key)) return;
      event.preventDefault(); const index = types.indexOf(type), next = index + (event.key === 'ArrowUp' ? -1 : 1);
      if (next < 0 || next >= types.length) return;
      const order = [...types]; [order[index],order[next]] = [order[next],order[index]];
      void reorderTypes(order).then(() => [...target.querySelectorAll('.folder-group')].find(node => node.dataset.type === type)?.querySelector('button')?.focus());
    });
    group.append(heading);
    if (state.openTypes.has(type)) {
      if (!projects.size) group.append(element('p', 'folder-empty', '暂无采集项目'));
      for (const project of [...projects.keys()].sort((a, b) => a.localeCompare(b, 'zh-CN'))) {
        const images = projects.get(project);
        const key = folderKey(images[0]);
        const folder = button(project + ' (' + images.length + ')',
          'folder-project' + (key === state.selectedFolder ? ' is-selected' : ''), () => {
            $('capture-search').value = ''; captureSearch.clear(); $('capture-search-status').textContent = '';
            selectedCaptureId = null;
            state.selectedType = type;
            state.showAllCaptures = false;
            state.selectedFolder = key;
            renderCaptureFolders();
            renderCaptureGrid();
          });
        folder.setAttribute('aria-label', project + '，' + images.length + ' 张图片');
        folder.draggable = true;
        folder.title = '拖至其他项目类型可移动整个项目';
        folder.addEventListener('dragstart', event => {
          draggingFolder = { type, project }; event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', type + ' / ' + project);
          row.classList.add('is-dragging');
        });
        folder.addEventListener('dragend', () => { draggingFolder = null; target.querySelectorAll('.folder-drop-target,.is-dragging').forEach(node => node.classList.remove('folder-drop-target','is-dragging')); });
        const row = element('div', 'capture-folder-row');
        row.append(folder, button('×', 'group-mini-action folder-delete', () => showDeleteCaptures(images, project)));
        row.lastChild.title = '删除项目“' + project + '”';
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
  state.showAllCaptures = false;
  state.selectedType = item.type;
  state.typeChosenByUser = true;
  state.openTypes.add(item.type);
  state.selectedFolder = folderKey(item);
  failedDescriptionsOnly = false;
  selectedCaptureId = item.id;
  $('capture-search').value = ''; captureSearch.clear(); $('capture-search-status').textContent = '';
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
    if (!visual.classList.contains('folder-thumb')) visual.textContent = '预览不可用';
    return;
  }
  const image = element('img');
  image.alt = item.name;
  if (visual.classList.contains('project-thumb')) {
    visual.style.setProperty('--project-thumb-image', `url("${url}")`);
    visual.classList.add('has-preview');
    image.addEventListener('load', () => updateProjectPreviewLayout(visual.parentElement));
  }
  visual.replaceChildren(image);
  image.src = url;
}

function renderCaptureGrid() {
  const projectsTarget = $('capture-project-grid');
  const imagesTarget = $('capture-grid');
  projectsTarget.replaceChildren();
  imagesTarget.replaceChildren();
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
  $('capture-view-switch').hidden = showImages || projects.size === 0;
  $('capture-view-small').setAttribute('aria-pressed', String(state.captureProjectView === 'small'));
  $('capture-view-large').setAttribute('aria-pressed', String(state.captureProjectView === 'large'));
  projectsTarget.classList.toggle('is-large', state.captureProjectView === 'large');
  projectsTarget.hidden = showImages;
  imagesTarget.hidden = !showImages;
  $('capture-path').textContent = failedOnly ? '失败描述 · ' + images.length + ' 张图片'
    : query ? '全图库搜索 · ' + images.length + ' 张图片'
    : insideFolder ? folderImages[0].type + ' / ' + folderImages[0].project + ' / ' + images.length + ' 张图片'
      : allImages ? '全部图片 · ' + images.length + ' 张图片'
        : (state.selectedType || '项目类型') + ' / ' + projects.size + ' 个项目';
  $('capture-empty').hidden = showImages ? images.length > 0 : projects.size > 0;
  $('capture-empty').querySelector('h2').textContent = failedOnly ? '没有失败的描述' : query ? '没有找到匹配的图片' : state.captures.length ? '这个类型还没有项目' : '还没有采集的图片';
  $('capture-empty').querySelector('p').textContent = failedOnly ? '失败项已自动重试；可稍后再次点击“生成概要描述”。'
    : query ? '可换个关键词，或按回车进行本地向量检索。' : '下载图片或导入本地文件夹后，会按项目类型和项目名称出现在这里。';
  if (!showImages) for (const [project, entries] of [...projects].sort((a,b) => a[0].localeCompare(b[0], 'zh-CN'))) {
    const card = element('article', 'capture-project-card');
    card.draggable = true;
    card.title = '可拖至左侧其他项目类型';
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
    head.append(element('strong', '', project), button('删除', 'group-mini-action', () => showDeleteCaptures(entries, project)));
    const folder = button('', 'project-preview-button', () => {
      state.selectedFolder = folderKey(entries[0]);
      selectedCaptureId = null;
      renderCaptureFolders();
      renderCaptureGrid();
    });
    folder.title = '打开项目：' + project;
    const previews = entries.filter(item => state.previews[String(item.id)]).slice(0, 4);
    const previewEntries = previews.length ? previews : entries.slice(0, 1);
    folder.dataset.previewLayout = previewEntries.length >= 4 ? 'quad' : 'single';
    for (const [index, entry] of previewEntries.entries()) {
      const visual = element('div', 'project-thumb', state.previews[String(entry.id)] ? '' : '待关联预览');
      if (index === 0) visual.classList.add('is-preview-selected');
      folder.append(visual);
      // 连接到文档后再异步取图。
      queueMicrotask(() => { void capturePreview(entry, visual); });
    }
    card.append(head, folder, element('span', 'project-image-count', entries.length + ' 张图片'));
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
    main.title = '单击查看详情，双击查看大图';
    const visual = element('div', 'capture-visual', state.previews[String(item.id)] ? '正在读取预览…' : '等待关联本地图片');
    const info = element('div', 'capture-info');
    info.append(element('strong', '', item.name), element('span', '', query || allImages ? item.type + ' / ' + item.project : humanDate(item.date)));
    const description = state.catalog[item.id]?.description;
    if (description) info.append(element('p', 'capture-description-preview', description));
    main.append(visual, info);
    const remove = button('×', 'image-delete', event => { event.stopPropagation(); showDeleteCaptures([item], item.name); });
    remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7M14 10v7"/></svg>';
    remove.title = '删除图片'; remove.setAttribute('aria-label', '删除图片 ' + item.name);
    card.append(main);
    if (query) {
      const jump = button('进入项目', 'project-jump', event => {
        event.stopPropagation();
        openCaptureProject(item);
      });
      jump.title = '进入图库项目文件夹：' + item.type + ' / ' + item.project;
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
  if (index < 0) { toast('这张图片尚无可用的本地预览', 'error'); return; }
  viewerItems = available;
  viewerIndex = index;
  if (await updateViewer() && !$('image-viewer').open) $('image-viewer').showModal();
}

async function updateViewer() {
  const item = viewerItems[viewerIndex];
  if (!item) return false;
  const url = await captureImageUrl(state.previews[String(item.id)]);
  if (viewerItems[viewerIndex]?.id !== item.id) return false;
  if (!url) { toast('图片预览不可用', 'error'); return false; }
  resetViewerZoom();
  $('viewer-image').src = url;
  $('viewer-image').alt = item.name;
  $('viewer-counter').textContent = (viewerIndex + 1) + ' / ' + viewerItems.length + ' · ' + item.name;
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
  if (!item) { detail.replaceChildren(); return; }
  const visual = button('', 'detail-image capture-detail-image', () => {
    const query = $('capture-search').value.trim();
    const siblings = query ? captureSearch.select(state.captures, query, entry => entry.id, captureText)
      : state.showAllCaptures ? state.captures
        : state.captures.filter(entry => folderKey(entry) === folderKey(item));
    void showCaptureImage(item, siblings);
  });
  visual.title = '点击查看大图，可左右浏览同一项目';
  visual.textContent = '等待关联本地图片';
  const body = element('div', 'detail-body');
  const head = element('div', 'capture-detail-head');
  head.append(element('strong', '', item.name), button('×', 'quiet-button', () => { selectedCaptureId = null; renderCaptureGrid(); }));
  const description = element('textarea', 'capture-description-editor');
  description.placeholder = '描述主体、材质、视角与氛围，方便以后搜索…';
  description.maxLength = 4000;
  description.value = descriptionDrafts.get(item.id) ?? state.catalog[item.id]?.description ?? '';
  description.addEventListener('input', () => {
    descriptionDrafts.set(item.id, description.value);
    clearTimeout(descriptionSaves.get(item.id));
    descriptionSaves.set(item.id, setTimeout(() => { void autoSaveDescription(item.id); }, 700));
  });
  description.addEventListener('blur', () => { void autoSaveDescription(item.id); });
  const actions = element('div', 'detail-actions capture-detail-actions');
  const summary = button('生成概要描述', 'solid-button', async () => {
    if (!(await ensureCaptureDescriptionConsent())) return;
    summary.disabled = true;
    try {
      await autoSaveDescription(item.id);
      await request('capture.describe', { downloadId: item.id });
      toast('概要描述已生成并保存');
      await loadCaptures();
    } catch (error) { toast('生成概要描述失败：' + error.message, 'error'); }
    finally { summary.disabled = false; }
  });
  summary.disabled = !state.previews[String(item.id)];
  const generate = button('生成全提示词', 'solid-button', () => {
    const opening = openPanel(); opening.catch(() => {});
    void request('capture.resume', { downloadId: item.id }).then(() => opening).catch(error => toast(error.message, 'error'));
  });
  generate.disabled = !state.previews[String(item.id)];
  actions.append(summary, generate);
  if (item.imported) {
    const folder = button('打开原文件夹', 'solid-button', () => {
      const path = String(item.sourcePath || '').replaceAll('\\', '/').split('/').filter(Boolean);
      $('import-source-path').value = path.slice(0, -1).join('/') || item.project || '来源目录未记录';
      $('import-source-dialog').showModal();
    });
    folder.title = '查看并复制导入时的来源目录；浏览器无法直接打开电脑原文件夹';
    actions.append(folder);
  } else actions.append(button('打开原文件夹', 'solid-button', () => {
    try { chrome.downloads.show(item.id); }
    catch { toast('文件已移动或删除', 'error'); }
  }));
  const status = state.catalog[item.id]?.descriptionStatus;
  if (!description.value) description.placeholder = status === 'processing' ? '正在自动生成视觉描述…'
    : status === 'pending' ? '等待自动生成视觉描述…' : state.catalog[item.id]?.descriptionError || '填写视觉特征，编辑后自动保存';
  body.append(head, infoRow('项目', item.project), infoRow('分类', item.type),
    infoRow('保存时间', humanDate(item.date)),
    element('h3', '', '核心视觉特征'), description, actions);
  if (item.imported) body.append(element('span', 'imported-origin', '原文件保留在导入时选择的文件夹中'));
  detail.replaceChildren(visual, body);
  void capturePreview(item, visual);
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
  } catch (error) { toast('描述未保存：' + error.message, 'error'); }
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
  await chrome.storage.local.set({ [STORAGE.projectTypeOrderV4]: order });
}

async function moveProjectFolder({ type, project }, targetType) {
  const affected = state.captures.filter(item => item.type === type && item.project === project);
  if (!affected.length || !state.activeTypes.includes(targetType)) throw new Error('目标分类已变化，请刷新后再试');
  await request('capture.folder.move', { fromType: type, project, targetType, ids: affected.map(item => item.id) });
  state.selectedType = targetType; state.showAllCaptures = false; state.typeChosenByUser = true; state.openTypes.add(targetType);
  state.selectedFolder = targetType + '\u0000' + project; selectedCaptureId = null;
  await loadCaptures();
  toast('项目“' + project + '”已移到“' + targetType + '”');
}

function showDeleteCaptures(items, name) {
  deletionSelection = items.map(item => item.id);
  $('delete-capture-title').textContent = items.length === 1 ? '删除图片' : '删除项目图片';
  $('delete-capture-description').textContent = '“' + name + '”：共 ' + items.length + ' 张图片及其本地描述和预览。';
  $('delete-original').checked = false;
  $('delete-original').closest('label').hidden = !items.some(item => !item.imported);
  $('delete-capture-dialog').querySelector('.dialog-note').textContent = items.some(item => item.imported)
    ? '导入图片会删除图词库副本及可清理的系统查看副本，电脑里的导入源文件保留；下载图片可选择是否删除原图。'
    : '仅处理本次列出的图片；电脑上的空文件夹会保留。';
  $('delete-capture-dialog').showModal();
}

async function loadCaptures() {
  const version = ++state.captureLoad;
  const [downloads, stored] = await Promise.all([
    chrome.downloads.search({}), chrome.storage.local.get([STORAGE.capturePreviewsV4, STORAGE.captureCatalogV4, STORAGE.customTypes, STORAGE.hiddenProjectTypesV4, STORAGE.projectTypeOrderV4, STORAGE.projectTypeAliasesV4, STORAGE.captureHiddenV4, STORAGE.importedAssetsV4, STORAGE.captureProjectViewV4]),
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
  state.captures = [...downloads.filter(item => !hiddenCaptures.has(item.id)).map(captureFromDownload).filter(Boolean),
    ...imported.map(captureFromImport)].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  if (state.selectedFolder && !state.captures.some(item => folderKey(item) === state.selectedFolder)) state.selectedFolder = null;
  if (!state.typeChosenByUser && state.captures.length) {
    state.selectedType = state.captures[0].type;
    state.openTypes.add(state.selectedType);
  }
  $('capture-count').textContent = state.captures.length + ' 张图片';
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
  if (!localFiles.size) throw new Error('请选择包含 ArchBuddy 图片的下载目录');
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
      if (!blob) throw new Error('预览生成失败');
      const id = crypto.randomUUID();
      await putSourceImage({ sourceReferenceId: id, schemeId: id, blob });
      next[String(item.id)] = id;
      added++;
    } catch { failed++; }
  }
  if (added) await chrome.storage.local.set({ [STORAGE.capturePreviewsV4]: next });
  await loadCaptures();
  toast(added ? '已补齐 ' + added + ' 张图片预览' + (failed ? '，' + failed + ' 张未能读取' : '')
    : '没有匹配到缺少预览的下载图片' + (failed ? '；' + failed + ' 张未能读取' : ''));
}

function groupFor(item) {
  return state.assignments[keyFor(item)] || 'ungrouped';
}

function groupName(id) {
  return id === 'ungrouped' ? '未分组' : state.groups.find(group => group.id === id)?.name || '未分组';
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
  select.replaceChildren(new Option('选择目标分组', ''));
  select.add(new Option('未分组', 'ungrouped'));
  for (const group of state.groups) select.add(new Option(group.name, group.id));
  select.value = [...select.options].some(option => option.value === chosen) ? chosen : '';
  $('selected-count').textContent = state.selectedKeys.size ? '已选 ' + state.selectedKeys.size + ' 张图片卡' : '未选择图片卡';
  $('move-selected').disabled = !state.selectedKeys.size || !select.value || select.value === state.selectedGroupId;
}

function renderPromptSidebar() {
  const target = $('prompt-sidebar-list');
  target.replaceChildren();
  const groups = [{ id: 'all', name: '全部提示词' }, { id: 'ungrouped', name: '未分组' }, ...state.groups];
  for (const group of groups) {
    const count = group.id === 'all' ? state.items.length : state.items.filter(item => groupFor(item) === group.id).length;
    const row = element('div', 'prompt-group-row' + (group.id === state.selectedGroupId ? ' is-selected' : ''));
    const choose = button('', 'prompt-sidebar-item', () => {
      state.selectedGroupId = group.id;
      state.selectedKeys.clear();
      $('library-search').value = ''; promptSearch.clear(); $('prompt-search-status').textContent = '';
      $('category-filter').value = '';
      renderPromptSidebar();
      renderGrid();
      void renderDetail();
    });
    choose.append(element('strong', '', group.name), element('small', '', count + ' 张图片卡'));
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
        void persistGroups().then(() => toast('图片卡已移入“' + group.name + '”')).catch(error => {
          if (previous) state.assignments[key] = previous;
          else delete state.assignments[key];
          state.selectedGroupId = previousSelectedGroupId;
          renderPromptSidebar(); renderGrid();
          toast('移动图片卡失败：' + error.message, 'error');
        });
      });
    }
    if (!['all', 'ungrouped'].includes(group.id)) {
      row.append(button('编辑', 'group-mini-action', () => {
        const value = prompt('重命名分组', group.name);
        if (value === null) return;
        const name = value.trim().replace(/\s+/g, ' ').slice(0, 40);
        if (!name) { toast('请输入分组名称', 'error'); return; }
        if (state.groups.some(other => other.id !== group.id && other.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
          toast('已有同名分组', 'error'); return;
        }
        group.name = name;
        void persistGroups();
      }));
      row.append(button('删除', 'group-mini-action', () => {
        if (!confirm('删除分组“' + group.name + '”？其中的图片卡会回到“未分组”，原始提示词方案不会删除。')) return;
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
  await chrome.storage.local.set({ [STORAGE.promptGroupsV4]: { groups: state.groups, assignments: state.assignments } });
  renderPromptSidebar();
  renderGrid();
  await renderDetail();
}

function renderSummary() {
  const summary = $('library-summary');
  summary.replaceChildren();
  $('prompt-count').textContent = state.items.length + ' 张图片卡';
  const metrics = [
    [String(state.groups.length), '个自建分组'],
    [String(state.items.length), '张提示词图片卡'],
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
  select.replaceChildren(new Option('全部分类', ''));
  for (const category of categories) select.add(new Option(category, category));
  select.value = categories.includes(chosen) ? chosen : '';
}

function renderGrid() {
  const grid = $('library-grid');
  grid.replaceChildren();
  const matches = filteredItems();
  $('empty-state').hidden = state.items.length > 0;
  $('no-results').hidden = state.items.length === 0 || matches.length > 0;
  $('no-results').textContent = state.selectedGroupId === 'ungrouped' ? '没有找到符合条件的图片卡。' : '这个分组还没有符合条件的图片卡。';
  $('result-count').textContent = state.items.length ? ($('library-search').value.trim() ? '全提示词库搜索 · ' : '显示 ') + matches.length + ' / ' + state.items.length + ' 项' : '';
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
    checkbox.setAttribute('aria-label', '选择图片卡 ' + (item.reference?.displayName || item.scheme.name));
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) state.selectedKeys.add(key);
      else state.selectedKeys.delete(key);
      renderGroupControls();
    });
    selectLabel.append(checkbox, element('span', '', '选择'));
    selectRow.append(selectLabel, element('span', 'asset-drag-hint', '拖至左侧分组'));
    const main = button('', 'asset-card-main', () => {
      state.selectedKey = key;
      grid.querySelectorAll('.asset-card').forEach(node => node.classList.toggle('is-selected', node === card));
      void renderDetail();
    });
    main.addEventListener('dblclick', () => { void showPromptImage(item); });
    main.title = '单击查看提示词，双击查看大图';
    const visual = element('div', 'asset-image', item.reference ? '正在读取图片…' : '尚无来源图');
    const copy = element('div', 'asset-copy');
    copy.append(
      element('strong', '', item.reference?.displayName || item.scheme.name),
      element('span', '', (item.generated ? '生成效果图 · ' : '参考图 · ') + (item.scheme.projectName || item.scheme.category || '已确认提示词')),
      element('span', '', item.reference?.tags.length ? item.reference.tags.join('、') : '确认于 ' + humanDate(item.scheme.overallConfirmedAt)),
    );
    copy.append(element('p', 'asset-prompt-preview', promptExcerpt(item)));
    main.append(visual, copy);
    card.append(selectRow, main);
    grid.append(card);
    if (item.reference) {
      void imageUrl(item).then(url => {
        if (!card.isConnected) return;
        visual.replaceChildren();
        if (!url) { visual.textContent = '原图缺失'; return; }
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
  row.append(element('span', '', label), element('span', '', value || '未填写'));
  return row;
}

async function copyVersion(version) {
  if (!version?.compiledPrompt) return;
  try {
    await navigator.clipboard.writeText(version.compiledPrompt);
    $('copy-fallback').hidden = true;
    toast('Prompt 已复制');
  } catch {
    const field = $('copy-fallback');
    field.value = version.compiledPrompt;
    field.hidden = false;
    field.focus();
    field.select();
    toast('自动复制未获允许，请按 Ctrl+C 复制已选中的 Prompt', 'error');
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
    toast('项目最多 80 字、分类最多 40 字；标签最多 5 个且每个最多 24 字', 'error');
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
    toast('整理信息已保存');
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function deleteScheme(item) {
  if (!confirm('删除“' + item.scheme.name + '”及其所有本地来源图和 Prompt 版本？此操作无法撤销，下载目录中的文件不会删除。')) return;
  try {
    await request('scheme.delete', { schemeId: item.scheme.schemeId, confirmed: true });
    state.selectedKey = null;
    await load();
    toast('方案及关联本地素材已删除');
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function renderDetail() {
  const detail = $('asset-detail');
  const item = state.items.find(candidate => keyFor(candidate) === state.selectedKey);
  if (!item) {
    detail.replaceChildren(element('div', 'detail-placeholder', '选择一张图片，查看对应版本、来源图和提示词。'));
    return;
  }
  const key = keyFor(item);
  const scheme = item.scheme;
  const selectedVersion = item.version || [...scheme.versions].reverse()
    .find(version => version.sourceReferenceIds.includes(item.reference?.sourceReferenceId))
    || scheme.versions.at(-1);
  const visual = element('div', 'detail-image', item.reference ? '正在读取图片…' : '尚无关联图');
  visual.title = '双击查看大图';
  visual.addEventListener('dblclick', () => { void showPromptImage(item); });
  const body = element('div', 'detail-body');
  const head = element('div', 'detail-head');
  head.append(element('h2', '', item.reference?.displayName || scheme.name),
    element('p', '', '所属方案：' + scheme.name));

  const versionSection = element('section', 'detail-section');
  versionSection.append(element('h3', '', 'Prompt 版本历史'));
  const versions = [...scheme.versions].reverse();
  if (versions.length) {
    const picker = element('div', 'version-list');
    const select = element('select');
    for (const version of versions) select.add(new Option('版本 ' + version.versionNumber + ' · ' + humanDate(version.createdAt), version.versionId));
    if (selectedVersion) select.value = selectedVersion.versionId;
    const preview = element('pre', 'version-text');
    const versionMeta = element('p', 'version-meta');
    const update = () => {
      const version = versions.find(candidate => candidate.versionId === select.value);
      preview.textContent = version?.compiledPrompt || '';
      versionMeta.textContent = version
        ? (version.generatedResult ? '对应生成图：' + version.generatedResult.displayName + ' · ' : '')
          + '关联参考图 ' + version.sourceReferenceIds.length + ' 张' : '';
    };
    select.addEventListener('change', update);
    update();
    picker.append(select, versionMeta, preview, button('复制此版本', 'outline-button', () => {
      void copyVersion(versions.find(version => version.versionId === select.value));
    }));
    versionSection.append(picker);
  } else versionSection.append(element('p', '', '暂无确认版本。'));
  body.append(versionSection);

  const baseline = selectedVersion?.baselineVersionId
    ? scheme.versions.find(version => version.versionId === selectedVersion.baselineVersionId)
    : scheme.versions[0];
  if (baseline?.compiledPrompt && baseline.versionId !== selectedVersion?.versionId) {
    const original = element('section', 'detail-section');
    original.append(element('h3', '', selectedVersion?.baselineVersionId ? '优化前原始提示词' : '最初确认的提示词'),
      element('pre', 'version-text original-prompt', baseline.compiledPrompt));
    body.append(original);
  }

  const context = element('section', 'detail-section');
  context.append(element('h3', '', '对应图片'));
  const imageList = element('div', 'related-images');
  const relatedRefs = scheme.sourceReferences.filter(reference =>
    !selectedVersion || selectedVersion.sourceReferenceIds.includes(reference.sourceReferenceId));
  for (const reference of relatedRefs) {
    const row = element('div', 'related-image-row');
    row.append(element('span', 'related-image-role', '参考图'), element('span', '', reference.displayName));
    imageList.append(row);
  }
  if (selectedVersion?.generatedResult) {
    const row = element('div', 'related-image-row');
    row.append(element('span', 'related-image-role result-role', '生成图'),
      element('span', '', selectedVersion.generatedResult.displayName));
    imageList.append(row);
  }
  if (!imageList.childNodes.length) imageList.append(element('p', '', '此版本没有关联图片。'));
  context.append(imageList);

  const meta = element('div', 'compact-meta');
  meta.append(infoRow('项目分类', scheme.category), infoRow('保存时间', humanDate(selectedVersion?.createdAt || scheme.updatedAt)));
  body.append(meta);

  const form = element('form', 'metadata-form');
  form.append(element('h3', '', '整理信息'));
  const projectLabel = element('label', '', '项目名称');
  const projectInput = element('input');
  projectInput.maxLength = 80; projectInput.placeholder = '例如：山地酒店方案'; projectInput.value = scheme.projectName;
  projectLabel.append(projectInput);
  const categoryLabel = element('label', '', '项目分类');
  const categoryInput = element('input');
  categoryInput.maxLength = 40; categoryInput.placeholder = '例如：文化建筑'; categoryInput.value = scheme.category;
  categoryLabel.append(categoryInput);
  form.append(projectLabel, categoryLabel);
  const tagsInput = element('input');
  if (item.reference && !item.generated) {
    const tagsLabel = element('label', '', '图片标签');
    tagsInput.maxLength = 150; tagsInput.placeholder = '用逗号分隔'; tagsInput.value = item.reference.tags.join('，');
    tagsLabel.append(tagsInput);
    form.append(tagsLabel);
  }
  const save = element('button', 'outline-button', '保存整理信息');
  save.type = 'submit';
  form.append(save);
  form.addEventListener('submit', event => {
    event.preventDefault();
    void saveMetadata(item, projectInput, categoryInput, tagsInput);
  });
  body.append(form);
  body.append(head, visual, context);

  const actions = element('div', 'detail-actions');
  actions.append(button('删除方案', 'danger-button', () => { void deleteScheme(item); }));
  body.append(actions);
  detail.replaceChildren(body);
  if (item.reference) {
    const url = await imageUrl(item);
    if (key !== state.selectedKey || !visual.isConnected) return;
    visual.replaceChildren();
    if (url) {
      const image = element('img');
      image.src = url;
      image.alt = item.reference.displayName;
      visual.append(image);
    } else visual.textContent = '原图缺失，仍可查看 Prompt';
  }
}
async function load() {
  const loadNumber = ++state.loadNumber;
  const stored = await chrome.storage.local.get([STORAGE.promptSchemesV3, STORAGE.promptGroupsV4]);
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
    void chrome.storage.local.set({ [STORAGE.promptGroupsV4]: { groups: state.groups, assignments: validAssignments } });
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
  if (!name) { toast('请输入分组名称', 'error'); return; }
  if (state.groups.some(group => group.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
    toast('已有同名分组', 'error'); return;
  }
  const id = crypto.randomUUID();
  state.groups.push({ id, name });
  for (const key of state.selectedKeys) state.assignments[key] = id;
  state.selectedGroupId = id;
  state.selectedKeys.clear();
  $('group-name').value = '';
  void persistGroups().then(() => toast('已建立分组“' + name + '”')).catch(error => toast(error.message, 'error'));
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
  void persistGroups().then(() => toast('图片卡已移入“' + groupName(id) + '”')).catch(error => toast(error.message, 'error'));
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
  if (!missing) { toast('当前图库没有缺少核心描述的图片'); return; }
  if (!confirm('将逐张发送本地预览给 ArchBuddy 生成核心视觉描述，可能消耗模型额度。继续？')) return;
  button.dataset.busy = 'true'; button.disabled = true;
  try {
    const result = await request('capture.describe.missing', {});
    toast(result.queued ? '已排队 ' + result.queued + ' 张，将在后台生成' : '没有可生成的缺失描述');
  } catch (error) { toast(error.message, 'error'); }
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
  const consent = await chrome.storage.local.get([STORAGE.assetAIConsent, STORAGE.assetVectorConsent]);
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
  try { await chrome.storage.local.set({ [STORAGE.captureProjectViewV4]: view }); }
  catch (error) { toast('保存视图偏好失败：' + error.message, 'error'); }
}
$('capture-view-small').addEventListener('click', () => { void setCaptureProjectView('small'); });
$('capture-view-large').addEventListener('click', () => { void setCaptureProjectView('large'); });
$('capture-back').addEventListener('click', () => {
  $('capture-search').value = ''; captureSearch.clear(); $('capture-search-status').textContent = '';
  selectedCaptureId = null;
  failedDescriptionsOnly = false;
  state.selectedFolder = null;
  renderCaptureFolders();
  renderCaptureGrid();
});
$('description-progress-failed').addEventListener('click', () => {
  failedDescriptionsOnly = true;
  state.showAllCaptures = false;
  selectedCaptureId = null;
  state.selectedFolder = null;
  $('capture-search').value = ''; captureSearch.clear(); $('capture-search-status').textContent = '';
  showSection('captures');
  renderCaptureFolders();
  renderCaptureGrid();
});
async function importFolders(files) {
  const control = $('import-local-folder');
  if (control.disabled) return;
  control.disabled = true;
  $('import-feedback').textContent = '正在复制图片到本地图词库…';
  try {
    const result = await importLocalFolder(files, message => { $('import-feedback').textContent = message; });
    await loadCaptures();
    $('import-feedback').textContent = importSummary(result);
    toast(importSummary(result));
  } catch (error) {
    $('import-feedback').textContent = '导入失败：' + error.message;
    toast(error.message, 'error');
  } finally { control.disabled = false; }
}
$('import-local-folder').addEventListener('click', () => $('local-folder-files').click());
$('local-folder-files').addEventListener('change', event => {
  const files = [...event.currentTarget.files]; event.currentTarget.value = '';
  if (files.length) void importFolders(files);
});
wireFolderDrop($('folder-import-drop'), importFolders,
  error => { $('import-feedback').textContent = '导入失败：' + error.message; toast(error.message, 'error'); },
  () => { if ($('import-local-folder').disabled) return false; $('import-feedback').textContent = '正在读取所拖入的文件夹…'; });
$('link-downloads').addEventListener('click', () => $('capture-folder-files').click());
$('capture-folder-files').addEventListener('change', event => {
  const files = [...event.currentTarget.files];
  event.currentTarget.value = '';
  void importDownloadPreviews(files).catch(error => toast(error.message, 'error'));
});
$('open-sidepanel').addEventListener('click', () => { void openPanel().catch(error => toast(error.message, 'error')); });
$('empty-open-panel').addEventListener('click', () => { void openPanel().catch(error => toast(error.message, 'error')); });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes[STORAGE.promptSchemesV3] || changes[STORAGE.promptGroupsV4])) {
    void load().catch(error => toast(error.message, 'error'));
  }
  if (area === 'local' && (changes[STORAGE.capturePreviewsV4] || changes[STORAGE.captureCatalogV4]
      || changes[STORAGE.importedAssetsV4] || changes[STORAGE.customTypes] || changes[STORAGE.hiddenProjectTypesV4] || changes[STORAGE.projectTypeOrderV4] || changes[STORAGE.projectTypeAliasesV4] || changes[STORAGE.captureHiddenV4])) {
    void loadCaptures().catch(error => toast(error.message, 'error'));
  }
});
chrome.downloads.onChanged.addListener(change => {
  if (change.state?.current === 'complete' || change.filename) {
    void loadCaptures().catch(error => toast(error.message, 'error'));
  }
});
chrome.downloads.onErased.addListener(() => {
  void loadCaptures().catch(error => toast(error.message, 'error'));
});
window.addEventListener('beforeunload', () => {
  releaseUrls();
  for (const url of state.captureUrls.values()) URL.revokeObjectURL(url);
});
void Promise.all([load(), loadCaptures()]).catch(error => toast('图词库读取失败：' + error.message, 'error'));

$('confirm-delete-capture').addEventListener('click', event => {
  event.preventDefault();
  const downloadIds = [...deletionSelection];
  const deleteOriginal = $('delete-original').checked;
  $('delete-capture-dialog').close();
  deletionSelection = [];
  void request('capture.delete', { downloadIds, deleteOriginal, confirmed: true }).then(async result => {
    for (const id of result.deleted) descriptionDrafts.delete(id);
    await loadCaptures();
    toast(result.failed.length ? '已删除 ' + result.deleted.length + ' 张；' + result.failed.length + ' 张未完成：' + result.failed[0].error
      : result.viewerCopiesKept?.length ? '图库图片已删除；部分系统查看副本仍在下载目录，请手动清理'
        : (deleteOriginal ? '已删除所选下载原图和图库记录；导入原文件保留' : '已移出图库，电脑原文件保留'),
      result.failed.length || result.viewerCopiesKept?.length ? 'error' : '');
  }).catch(error => toast(error.message, 'error'));
});

async function renderDescriptionProgress() {
  const progressElement = $('description-progress');
  const progressBar = $('description-progress-bar');
  const progressTotal = $('description-progress-total');
  const progressText = $('description-progress-text');
  const progressDetail = $('description-progress-detail');
  const failedButton = $('description-progress-failed');
  const stored = await chrome.storage.local.get(STORAGE.descriptionProgressV4);
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
  progressTotal.textContent = '本次 ' + total;
  progressText.textContent = '已完成 ' + completed;
  progressDetail.textContent = '剩余 ' + remaining;
  failedButton.hidden = failed < 1;
  failedButton.textContent = '失败 ' + failed;
  failedButton.title = '查看本次任务失败的图片';
  progressElement.setAttribute('aria-valuemax', String(total));
  progressElement.setAttribute('aria-valuenow', String(processed));
  progressElement.setAttribute('aria-label', '本次概要描述任务：总数 ' + total + '，已完成 ' + completed + '，剩余 ' + remaining + '，失败 ' + failed);
}
async function refreshAssetConsent() {
  const stored = await chrome.storage.local.get([STORAGE.assetAIConsent, STORAGE.assetVectorConsent]);
  $('asset-consent').hidden = stored[STORAGE.assetAIConsent] === true && stored[STORAGE.assetVectorConsent] === true;
}
async function ensureCaptureDescriptionConsent() {
  const stored = await chrome.storage.local.get(STORAGE.assetAIConsent);
  if (stored[STORAGE.assetAIConsent]) return true;
  if (!confirm('生成概要描述会发送此图片的压缩预览给 ArchBuddy 与 DeepSeek，并消耗模型额度。确认开启图库 AI？')) return false;
  await request('assets.consent', { enabled: true });
  await refreshAssetConsent();
  return true;
}
async function ensureAssetConsent() {
  const stored = await chrome.storage.local.get([STORAGE.assetAIConsent, STORAGE.assetVectorConsent]);
  if (!stored[STORAGE.assetAIConsent]) {
    if (!confirm('开启图库 AI：新下载图片的预览将发送给 ArchBuddy 与 DeepSeek 生成视觉描述。确认有权处理并同意？')) return false;
    await request('assets.consent', { enabled: true });
  }
  if (!stored[STORAGE.assetVectorConsent]) {
    if (!confirm('开启本地向量检索：首次建索引及文本变化时，图片名称/描述和提示词文本会发给腾讯云 TokenHub 生成向量；每次提交搜索只发送一次查询。图片字节、文件路径和向量索引不会上传或保存在云端；建索引批次与查询各计入现有 AI 调用额度。确认同意？')) return false;
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
  const stored = await chrome.storage.local.get(STORAGE.librarySearchHistoryV4);
  const value = query.trim();
  recentSearches = [value, ...normalizedRecentSearches(stored[STORAGE.librarySearchHistoryV4])
    .filter(entry => entry.toLocaleLowerCase() !== value.toLocaleLowerCase())].slice(0, 5);
  await chrome.storage.local.set({ [STORAGE.librarySearchHistoryV4]: recentSearches });
}

function renderSearchHistory(menu, input, filter = false) {
  menu.replaceChildren();
  const heading = element('div', 'search-history-heading');
  heading.append(element('span', '', '最近搜索'));
  if (recentSearches.length) heading.append(button('清空', 'search-history-clear', async () => {
    try {
      await chrome.storage.local.remove(STORAGE.librarySearchHistoryV4);
      recentSearches = [];
      renderSearchHistory(menu, input);
    } catch (error) { toast('清空搜索记录失败：' + error.message, 'error'); }
  }));
  menu.append(heading);
  const term = filter ? input.value.trim().toLocaleLowerCase() : '';
  const entries = recentSearches.filter(value => !term || value.toLocaleLowerCase().includes(term));
  if (!entries.length) menu.append(element('div', 'search-history-empty', recentSearches.length ? '没有匹配的搜索记录' : '暂无搜索记录'));
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
      const stored = await chrome.storage.local.get(STORAGE.librarySearchHistoryV4);
      recentSearches = normalizedRecentSearches(stored[STORAGE.librarySearchHistoryV4]);
      if (document.activeElement === input) renderSearchHistory(menu, input);
    } catch (error) { toast('读取搜索记录失败：' + error.message, 'error'); }
    finally { openingHistory = false; }
  };
  input.addEventListener('focus', () => { void openHistory(); });
  input.addEventListener('click', () => { if (menu.hidden) void openHistory(); });
  menu.addEventListener('pointerdown', event => event.preventDefault());
  document.addEventListener('pointerdown', event => {
    if (!menu.parentElement.contains(event.target)) menu.hidden = true;
  });
  const update = () => { status.textContent = search.status; render(); };
  input.addEventListener('input', () => {
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
    try { await rememberSearch(query); } catch (error) { toast('保存搜索记录失败：' + error.message, 'error'); }
    await search.run(query, documents(), update);
    if (queuedQuery && queuedQuery === input.value) { queuedQuery = null; await run(); }
  };
  submit.addEventListener('click', () => { void run().catch(error => toast(error.message, 'error')); });
  input.addEventListener('keydown', event => {
    if (event.key === 'Escape') menu.hidden = true;
    if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); submit.click(); }
  });
}
async function showPromptImage(item) {
  const url = await imageUrl(item);
  if (!url) { toast('原图缺失，请重新关联图片', 'error'); return; }
  viewerItems = [];
  resetViewerZoom();
  $('viewer-image').src = url; $('viewer-image').alt = item.reference?.displayName || '图片大图';
  $('viewer-counter').textContent = item.reference?.displayName || '';
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
$('enable-asset-ai').addEventListener('click', () => { void ensureAssetConsent().catch(error => toast(error.message, 'error')); });
chrome.storage.onChanged.addListener((changes, area) => {
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
    toast('已复制导入时的相对目录');
  } catch {
    field.focus(); field.select();
    toast('路径已选中，请按 Ctrl+C 复制');
  }
});

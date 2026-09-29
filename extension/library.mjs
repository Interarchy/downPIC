import { PRESET_TYPES, STORAGE, normalizePromptScheme, orderedProjectTypes, resolveProjectType, sanitizePathSegment } from './shared.mjs';
import { getSourceImage, putSourceImage } from './source-image-store.mjs';
import { createSemanticSearch, keywordMatches } from './library-search.mjs';
import { importLocalFolder, importSummary, wireFolderDrop } from './folder-import.mjs';

const $ = id => document.getElementById(id);
const state = { schemes: [], items: [], selectedKey: null, urls: new Map(), pendingUrls: new Map(), loadNumber: 0, captures: [], activeTypes: [], previews: {}, catalog: {}, selectedFolder: null, selectedType: null, typeChosenByUser: false, openTypes: new Set(), foldersInitialized: false, captureUrls: new Map(), capturePendingUrls: new Map(), captureLoad: 0, groups: [], assignments: {}, selectedGroupId: 'all', selectedKeys: new Set() };
let toastTimer;
let selectedCaptureId = null;
let deletionSelection = [];
let failedDescriptionsOnly = false;
const captureSearch = createSemanticSearch(body => request('library.embed', body), 'captures');
const promptSearch = createSemanticSearch(body => request('library.embed', body), 'prompts');
let draggingType = null;
let draggingFolder = null;
const descriptionSaves = new Map();
const descriptionDrafts = new Map();
let viewerExportBusy = false;
let readyViewerDownloadId = null;
let lastSystemOpen = { id: null, at: 0 };

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

function humanBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '未知';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

function sourceTypeLabel(type) {
  return { 'page-image': '网页图片', screenshot: '网页截图', paste: '粘贴图片', file: '本地文件' }[type] || '暂无';
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
  return [item.scheme.name, item.scheme.projectName, item.scheme.category, item.reference?.displayName,
    ...(item.reference?.tags || []), ...item.scheme.versions.map(version => version.compiledPrompt), promptExcerpt(item)].filter(Boolean).join('；');
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
  const types = [...groups.keys()];
  for (const type of types) {
    const projects = groups.get(type);
    const group = element('div', 'folder-group');
    const total = [...projects.values()].reduce((count, images) => count + images.length, 0);
    const heading = button(type + ' · ' + total, 'folder-type' + (type === state.selectedType ? ' is-selected' : ''), () => {
      state.selectedType = type;
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
  image.src = url;
  image.alt = item.name;
  visual.replaceChildren(image);
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
  const failedItems = state.captures.filter(item => state.catalog[item.id]?.descriptionStatus === 'failed');
  const failedOnly = failedDescriptionsOnly && failedItems.length > 0;
  const images = failedOnly ? failedItems
    : query ? captureSearch.select(state.captures, query, item => item.id, captureText) : folderImages;
  const showImages = failedOnly || insideFolder || Boolean(query);
  $('capture-back').hidden = !(failedOnly || insideFolder || query);
  projectsTarget.hidden = showImages;
  imagesTarget.hidden = !showImages;
  $('capture-path').textContent = failedOnly ? '失败描述 · ' + images.length + ' 张图片'
    : query ? '全图库搜索 · ' + images.length + ' 张图片'
    : insideFolder ? folderImages[0].type + ' / ' + folderImages[0].project + ' / ' + images.length + ' 张图片'
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
    const previews = entries.filter(item => state.previews[String(item.id)]).slice(0, 3);
    for (const entry of previews.length ? previews : entries.slice(0,1)) {
      const visual = element('div', 'project-thumb', state.previews[String(entry.id)] ? '' : '待关联预览');
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
  if (!showImages || !images.some(item => item.id === selectedCaptureId)) { selectedCaptureId = null; hideViewerNotice(); }
  for (const item of showImages ? images : []) {
    const card = element('article', 'capture-card' + (item.id === selectedCaptureId ? ' is-selected' : ''));
    const main = button('', 'capture-card-main', () => {
      if (selectedCaptureId !== null && selectedCaptureId !== item.id) void autoSaveDescription(selectedCaptureId);
      if (selectedCaptureId !== item.id) hideViewerNotice();
      selectedCaptureId = item.id;
      imagesTarget.querySelectorAll('.capture-card').forEach(node => node.classList.toggle('is-selected', node === card));
      void renderCaptureDetail();
    });
    main.addEventListener('dblclick', () => openOriginal(item));
    main.title = '单击查看详情，双击用系统看图软件打开';
    const visual = element('div', 'capture-visual', state.previews[String(item.id)] ? '正在读取预览…' : '等待关联本地图片');
    const info = element('div', 'capture-info');
    info.append(element('strong', '', item.name), element('span', '', query ? item.type + ' / ' + item.project : humanDate(item.date)));
    const description = state.catalog[item.id]?.description;
    if (description) info.append(element('p', 'capture-description-preview', description));
    main.append(visual, info);
    const remove = button('×', 'image-delete', event => { event.stopPropagation(); showDeleteCaptures([item], item.name); });
    remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7M14 10v7"/></svg>';
    remove.title = '删除图片'; remove.setAttribute('aria-label', '删除图片 ' + item.name);
    card.append(main, remove);
    imagesTarget.append(card);
    void capturePreview(item, visual);
  }
  if (!document.activeElement?.classList.contains('capture-description-editor')) void renderCaptureDetail();
}

function viewerFolder(item) {
  const parts = String(state.catalog[item.id]?.sourcePath || '').split('/').filter(Boolean);
  const type = parts[0] || item.type;
  const project = parts.length > 2 ? parts[1] : '未分类项目';
  return 'ArchBuddy-系统查看/' + sanitizePathSegment(type, '未分类') + '/' + sanitizePathSegment(project, '未分类项目');
}

function hideViewerNotice() {
  readyViewerDownloadId = null;
  $('system-viewer-notice').hidden = true;
}

function viewerNotice(message, downloadId = null) {
  readyViewerDownloadId = downloadId;
  $('system-viewer-notice').hidden = false;
  $('system-viewer-message').textContent = message;
  $('open-system-viewer').hidden = downloadId === null;
}

async function waitForViewerDownload(id) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const [download] = await chrome.downloads.search({ id });
    if (download?.state === 'complete') return download;
    if (!download || download.state === 'interrupted') throw new Error('系统查看副本未能写入下载目录');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('准备系统查看副本超时，请稍后重试');
}

async function ensureViewerDownload(item, folder) {
  const existing = state.viewerExports[item.id];
  if (existing?.folder === folder && Number.isSafeInteger(existing.downloadId)) {
    const [download] = await chrome.downloads.search({ id: existing.downloadId });
    if (download?.byExtensionId === chrome.runtime.id && download.state === 'complete' && download.exists !== false) return existing.downloadId;
  }
  const id = item.id.slice(6);
  const image = await getSourceImage(id);
  if (image.schemeId !== id) throw new Error('导入图片的本地副本归属不一致');
  const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[image.blob.type];
  if (!extension) throw new Error('这张图片的格式无法交给系统看图软件');
  const stem = sanitizePathSegment(item.name.replace(/\.[^.]+$/, ''), '参考图').slice(0, 58);
  const url = URL.createObjectURL(image.blob);
  try {
    const downloadId = await chrome.downloads.download({
      url, filename: folder + '/' + stem + '_' + id.slice(0, 8) + '.' + extension,
      conflictAction: 'uniquify', saveAs: false,
    });
    await waitForViewerDownload(downloadId);
    state.viewerExports = { ...state.viewerExports, [item.id]: { downloadId, folder } };
    await chrome.storage.local.set({ [STORAGE.systemViewerExportsV4]: state.viewerExports });
    return downloadId;
  } finally { URL.revokeObjectURL(url); }
}

async function prepareSystemViewer(item) {
  if (viewerExportBusy) { viewerNotice('正在准备这个项目的系统查看副本，请稍候…'); return; }
  viewerExportBusy = true;
  const folder = viewerFolder(item);
  const siblings = [item, ...state.captures.filter(other => other.imported && other.id !== item.id && viewerFolder(other) === folder)];
  let selectedId = null, failed = 0;
  viewerNotice('正在准备 ' + siblings.length + ' 张图片供系统看图软件浏览…');
  try {
    for (const [index, sibling] of siblings.entries()) {
      try {
        const id = await ensureViewerDownload(sibling, folder);
        if (sibling.id === item.id) selectedId = id;
      } catch (error) {
        if (sibling.id === item.id) throw error;
        failed++;
      }
      viewerNotice('已准备 ' + (index + 1) + ' / ' + siblings.length + ' 张图片…');
    }
    if (selectedId === null) throw new Error('所选图片未能准备完成');
    try {
      await chrome.downloads.open(selectedId);
      viewerNotice('已交给系统看图软件' + (failed ? '（' + failed + ' 张准备失败）' : ''));
    } catch {
      viewerNotice('图片已准备好，请点击按钮用系统看图软件打开' + (failed ? '；' + failed + ' 张准备失败' : ''), selectedId);
    }
  } catch (error) { viewerNotice('无法打开系统看图软件：' + error.message); }
  finally { viewerExportBusy = false; }
}

function openOriginal(item) {
  const now = performance.now();
  if (lastSystemOpen.id === item.id && now - lastSystemOpen.at < 450) return;
  lastSystemOpen = { id: item.id, at: now };
  if (item.imported) {
    const folder = viewerFolder(item);
    const siblings = state.captures.filter(other => other.imported && viewerFolder(other) === folder);
    if (siblings.every(other => state.viewerExports?.[other.id]?.folder === folder)) {
      // 已准备过的图片直接在本次点击中交给系统，保留浏览器所需的用户手势。
      void chrome.downloads.open(state.viewerExports[item.id].downloadId)
        .then(() => viewerNotice('已交给系统看图软件'))
        .catch(() => { void prepareSystemViewer(item); });
    } else void prepareSystemViewer(item);
    return;
  }
  void chrome.downloads.open(item.id).catch(() => toast('无法打开原图，请确认文件尚未移动、删除，并已允许扩展打开下载文件', 'error'));
}

async function renderCaptureDetail() {
  const detail = $('capture-detail');
  const item = state.captures.find(item => item.id === selectedCaptureId);
  detail.hidden = !item;
  $('capture-content-layout').classList.toggle('has-detail', Boolean(item));
  if (!item) { detail.replaceChildren(); return; }
  const visual = button('', 'detail-image capture-detail-image', () => openOriginal(item));
  visual.title = '点击用系统看图软件打开';
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
  const actions = element('div', 'detail-actions');
  const generate = button('生成完整提示词', 'solid-button', () => {
    const opening = openPanel(); opening.catch(() => {});
    void request('capture.resume', { downloadId: item.id }).then(() => opening).catch(error => toast(error.message, 'error'));
  });
  generate.disabled = !state.previews[item.id];
  actions.append(generate);
  const files = element('div', 'detail-actions');
  if (item.imported) files.append(element('span', 'imported-origin', '来自本地文件夹；原文件保留在电脑中'));
  else files.append(button('打开原文件夹', 'quiet-button', () => {
    void Promise.resolve(chrome.downloads.show(item.id)).catch(() => toast('文件已移动或删除', 'error'));
  }));
  const status = state.catalog[item.id]?.descriptionStatus;
  if (!description.value) description.placeholder = status === 'processing' ? '正在自动生成视觉描述…'
    : status === 'pending' ? '等待自动生成视觉描述…' : state.catalog[item.id]?.descriptionError || '填写视觉特征，编辑后自动保存';
  body.append(head, infoRow('项目', item.project), infoRow('分类', item.type),
    infoRow('保存时间', humanDate(item.date)), infoRow('大小', humanBytes(item.size)),
    element('h3', '', '核心视觉特征'), description, actions, files);
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
  state.selectedType = targetType; state.typeChosenByUser = true; state.openTypes.add(targetType);
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
    chrome.downloads.search({}), chrome.storage.local.get([STORAGE.capturePreviewsV4, STORAGE.captureCatalogV4, STORAGE.customTypes, STORAGE.hiddenProjectTypesV4, STORAGE.projectTypeOrderV4, STORAGE.projectTypeAliasesV4, STORAGE.captureHiddenV4, STORAGE.importedAssetsV4, STORAGE.systemViewerExportsV4]),
  ]);
  if (version !== state.captureLoad) return;
  for (const url of state.captureUrls.values()) URL.revokeObjectURL(url);
  state.captureUrls.clear();
  state.capturePendingUrls.clear();
  const imported = Array.isArray(stored[STORAGE.importedAssetsV4]) ? stored[STORAGE.importedAssetsV4] : [];
  state.previews = { ...(stored[STORAGE.capturePreviewsV4] || {}), ...Object.fromEntries(imported.map(item => ['local:' + item.id, item.id])) };
  state.catalog = { ...(stored[STORAGE.captureCatalogV4] || {}), ...Object.fromEntries(imported.map(item => ['local:' + item.id, item])) };
  state.viewerExports = stored[STORAGE.systemViewerExportsV4] || {};
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
  const version = item.scheme.versions.at(-1);
  const text = (version?.modulesSnapshot || item.scheme.modules).filter(module => module.enabled && module.value)
    .map(module => module.title + '：' + module.value).join('\n');
  return text || promptText(item);
}

function promptText(item) {
  return item.scheme.versions.at(-1)?.compiledPrompt || '暂无已确认提示词';
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
    const selectRow = element('label', 'asset-select');
    const checkbox = element('input');
    checkbox.type = 'checkbox';
    checkbox.checked = state.selectedKeys.has(key);
    checkbox.setAttribute('aria-label', '选择图片卡 ' + (item.reference?.displayName || item.scheme.name));
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) state.selectedKeys.add(key);
      else state.selectedKeys.delete(key);
      renderGroupControls();
    });
    selectRow.append(checkbox, element('span', '', '选择'));
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
      element('span', '', item.scheme.projectName || item.scheme.category || '已确认提示词'),
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

async function resumeScheme(item, mode, opening) {
  try {
    await request('library.resume', { schemeId: item.scheme.schemeId, mode });
    await opening;
    toast(mode === 'builder' ? '已在侧栏打开这份方案' : '已在侧栏选择这份方案');
  } catch (error) {
    toast(error.message + '。可手动打开 ArchBuddy 侧栏继续。', 'error');
  }
}

async function saveMetadata(item, projectInput, categoryInput, tagsInput) {
  const tags = item.reference
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
      sourceReferenceId: item.reference?.sourceReferenceId || null,
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
    detail.replaceChildren(element('div', 'detail-placeholder', '选择一张参考图，查看关联的方案和 Prompt。'));
    return;
  }
  const key = keyFor(item);
  const visual = element('div', 'detail-image', item.reference ? '正在读取图片…' : '尚无来源图');
  visual.title = '双击查看大图';
  visual.addEventListener('dblclick', () => { void showPromptImage(item); });
  const body = element('div', 'detail-body');
  const head = element('div', 'detail-head');
  head.append(element('h2', '', item.reference?.displayName || item.scheme.name),
    element('p', '', '所属方案：' + item.scheme.name));
  const promptPreview = element('div', 'detail-prompt-preview');
  promptPreview.append(element('strong', '', '对应提示词'), element('p', '', promptExcerpt(item)));
  body.append(head, promptPreview, infoRow('项目', item.scheme.projectName), infoRow('分类', item.scheme.category),
    infoRow('来源', sourceTypeLabel(item.reference?.sourceType)),
    infoRow('保存时间', humanDate(item.reference?.createdAt || item.scheme.updatedAt)));
  if (item.reference) body.append(infoRow('标签', item.reference.tags.join('、')));

  const dimensions = element('section', 'detail-section');
  dimensions.append(element('h3', '', '已确认设计维度'));
  const dimensionList = element('div', 'dimension-list');
  const modules = item.scheme.versions.at(-1)?.modulesSnapshot || item.scheme.modules;
  const active = modules.filter(module => module.enabled && module.value);
  if (!active.length) dimensionList.append(element('p', '', '这份方案暂无可显示的设计维度。'));
  for (const module of active) {
    const line = element('p');
    line.append(element('strong', '', module.title + '：'), document.createTextNode(module.value));
    dimensionList.append(line);
  }
  dimensions.append(dimensionList);
  body.append(dimensions);

  const form = element('form', 'metadata-form');
  form.append(element('h3', '', '整理信息'));
  const projectLabel = element('label', '', '项目名称');
  const projectInput = element('input');
  projectInput.maxLength = 80; projectInput.placeholder = '例如：山地酒店方案'; projectInput.value = item.scheme.projectName;
  projectLabel.append(projectInput);
  const categoryLabel = element('label', '', '分类');
  const categoryInput = element('input');
  categoryInput.maxLength = 40; categoryInput.placeholder = '例如：文化建筑'; categoryInput.value = item.scheme.category;
  categoryLabel.append(categoryInput);
  form.append(projectLabel, categoryLabel);
  let tagsInput = element('input');
  if (item.reference) {
    const tagsLabel = element('label', '', '图片标签，用逗号分隔');
    tagsInput.maxLength = 150; tagsInput.placeholder = '例如：清水混凝土，暖光'; tagsInput.value = item.reference.tags.join('，');
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

  const versionSection = element('section', 'detail-section');
  versionSection.append(element('h3', '', 'Prompt 版本'));
  const versions = [...item.scheme.versions].reverse();
  if (versions.length) {
    const picker = element('div', 'version-list');
    const select = element('select');
    for (const version of versions) select.add(new Option('版本 ' + version.versionNumber + ' · ' + humanDate(version.createdAt), version.versionId));
    const preview = element('pre', 'version-text', versions[0].compiledPrompt);
    select.addEventListener('change', () => {
      preview.textContent = versions.find(version => version.versionId === select.value)?.compiledPrompt || '';
    });
    picker.append(select, preview, button('复制此版本', 'outline-button', () => {
      void copyVersion(versions.find(version => version.versionId === select.value));
    }));
    versionSection.append(picker);
  } else {
    versionSection.append(element('p', '', '暂无确认版本。'));
  }
  body.append(versionSection);

  const actions = element('div', 'detail-actions');
  if (item.reference?.assetState === 'available') actions.append(button('生成完整提示词', 'solid-button', () => {
    const opening = openPanel(); opening.catch(() => {});
    void request('library.image.resume', { schemeId: item.scheme.schemeId, sourceReferenceId: item.reference.sourceReferenceId })
      .then(() => opening).catch(error => toast(error.message, 'error'));
  }));
  actions.append(
    button('继续构建', 'solid-button', () => {
      const opening = openPanel();
      void resumeScheme(item, 'builder', opening);
    }),
    button('用于效果优化', 'outline-button', () => {
      const opening = openPanel();
      void resumeScheme(item, 'optimize', opening);
    }),
    button('删除方案', 'danger-button', () => { void deleteScheme(item); }),
  );
  body.append(actions);
  detail.replaceChildren(visual, body);
  if (item.reference) {
    const url = await imageUrl(item);
    if (key !== state.selectedKey || !visual.isConnected) return;
    visual.replaceChildren();
    if (url) {
      const image = element('img');
      image.src = url;
      image.alt = item.reference.displayName;
      visual.append(image);
    } else {
      visual.textContent = '原图缺失，仍可查看方案和 Prompt';
    }
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
  state.items = state.schemes.flatMap(scheme => scheme.sourceReferences.length
    ? scheme.sourceReferences.map(reference => ({ scheme, reference }))
    : [{ scheme, reference: null }]);
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
$('refresh-library').addEventListener('click', () => {
  void Promise.all([load(), loadCaptures()]).catch(error => toast(error.message, 'error'));
});
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
$('refresh-captures').addEventListener('click', () => {
  void loadCaptures().catch(error => toast('图片目录读取失败：' + error.message, 'error'));
});
$('open-sidepanel').addEventListener('click', () => { void openPanel().catch(error => toast(error.message, 'error')); });
$('empty-open-panel').addEventListener('click', () => { void openPanel().catch(error => toast(error.message, 'error')); });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[STORAGE.systemViewerExportsV4]) state.viewerExports = changes[STORAGE.systemViewerExportsV4].newValue || {};
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
  const progressText = $('description-progress-text');
  const progressDetail = $('description-progress-detail');
  const failedButton = $('description-progress-failed');
  const stored = await chrome.storage.local.get(STORAGE.descriptionProgressV4);
  const progress = stored[STORAGE.descriptionProgressV4];
  const missing = state.captures.filter(item => !String(state.catalog[item.id]?.description || '').trim()).length;
  let total = 0, done = 0, failed = 0;
  if (progress && Number.isFinite(progress.total) && progress.total > 0) {
    total = progress.total;
    done = Math.min(total, Number(progress.done || 0));
    failed = Math.min(done, Number(progress.failed || 0));
  } else if (missing > 0) {
    total = missing;
  }
  if (!total) { progressElement.hidden = true; return; }
  const percent = Math.round((done / total) * 100);
  progressElement.hidden = false;
  progressBar.style.width = percent + '%';
  progressText.textContent = done + ' / ' + total;
  progressDetail.textContent = done >= total ? (failed ? '已完成' : '全部已返回') : '剩余 ' + (total - done);
  failedButton.hidden = failed < 1;
  failedButton.textContent = '失败 ' + failed;
  failedButton.title = '查看失败描述的图片';
  progressElement.setAttribute('aria-valuemax', String(total));
  progressElement.setAttribute('aria-valuenow', String(done));
  progressElement.setAttribute('aria-label', '概要描述生成进度 ' + done + ' / ' + total);
}
async function refreshAssetConsent() {
  const stored = await chrome.storage.local.get([STORAGE.assetAIConsent, STORAGE.assetVectorConsent]);
  $('asset-consent').hidden = stored[STORAGE.assetAIConsent] === true && stored[STORAGE.assetVectorConsent] === true;
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
function wireSemanticSearch(inputId, buttonId, statusId, search, documents, render) {
  const input = $(inputId), submit = $(buttonId), status = $(statusId);
  input.maxLength = 500;
  let queuedQuery = null;
  const update = () => { status.textContent = search.status; render(); };
  input.addEventListener('input', () => {
    queuedQuery = null;
    search.clear();
    const count = keywordMatches(documents(), input.value, item => item.text).length;
    search.status = input.value.trim() ? `关键词即时匹配 ${count} 项；按回车进行本地向量检索` : '';
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
    await search.run(query, documents(), update);
    if (queuedQuery && queuedQuery === input.value) { queuedQuery = null; await run(); }
  };
  submit.addEventListener('click', () => { void run().catch(error => toast(error.message, 'error')); });
  input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); submit.click(); } });
}
async function showPromptImage(item) {
  const url = await imageUrl(item);
  if (!url) { toast('原图缺失，请重新关联图片', 'error'); return; }
  $('viewer-image').src = url; $('viewer-image').alt = item.reference?.displayName || '图片大图';
  $('image-viewer').showModal();
}
$('close-image-viewer').addEventListener('click', () => $('image-viewer').close());
$('open-system-viewer').addEventListener('click', () => {
  const id = readyViewerDownloadId;
  if (!Number.isSafeInteger(id)) return;
  void chrome.downloads.open(id)
    .then(() => viewerNotice('已交给系统看图软件'))
    .catch(error => viewerNotice('系统看图软件未能打开：' + error.message, id));
});
$('enable-asset-ai').addEventListener('click', () => { void ensureAssetConsent().catch(error => toast(error.message, 'error')); });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes[STORAGE.assetAIConsent] || changes[STORAGE.assetVectorConsent]) void refreshAssetConsent();
  if (changes[STORAGE.descriptionProgressV4] || changes[STORAGE.importedAssetsV4] || changes[STORAGE.captureCatalogV4]) void renderDescriptionProgress();
});
void refreshAssetConsent();
void renderDescriptionProgress();

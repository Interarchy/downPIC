import { PRESET_TYPES, STORAGE, normalizeProjectType, orderedProjectTypes, resolveProjectType } from './shared.mjs';
import { putSourceImage, deleteSourceImagesByScheme } from './source-image-store.mjs';

const ACCEPTED = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_BYTES = 10 * 1024 * 1024;

function fileEntry(file) {
  const source = file.file || file;
  const parts = String(file.path || source.webkitRelativePath || '').split('/').filter(Boolean);
  if (parts.length < 2) return null;
  const type = normalizeProjectType(parts[0]).slice(0, 40);
  const project = (parts.length > 2 ? parts[1] : '未分类项目').trim().slice(0, 80);
  if (!type || !project) return null;
  return { file: source, type, project, path: parts.join('/') };
}

function readDirectory(entry, path) {
  const reader = entry.createReader();
  return new Promise((resolve, reject) => {
    const children = [];
    const next = () => reader.readEntries(batch => {
      if (batch.length) { children.push(...batch); next(); }
      else resolve(children);
    }, reject);
    next();
  }).then(children => Promise.all(children.map(child => readEntry(child, path + '/' + child.name))))
    .then(groups => groups.flat());
}

function readEntry(entry, path) {
  if (entry.isDirectory) return readDirectory(entry, path);
  if (!entry.isFile) return Promise.resolve([]);
  return new Promise((resolve, reject) => entry.file(file => resolve([{ file, path }]), reject));
}

export async function filesFromDroppedFolders(dataTransfer) {
  // 条目必须在 drop 事件中立即取得，异步读取时 DataTransfer 已不再可用。
  const folders = [...(dataTransfer?.items || [])].map(item => item.webkitGetAsEntry?.())
    .filter(entry => entry?.isDirectory);
  if (!folders.length) throw new Error('请拖入一个或多个文件夹');
  return (await Promise.all(folders.map(folder => readEntry(folder, folder.name)))).flat();
}

export function wireFolderDrop(element, onFiles, onError, onStart) {
  const hasFiles = event => [...(event.dataTransfer?.types || [])].includes('Files');
  element.addEventListener('dragover', event => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    element.classList.add('is-over');
  });
  element.addEventListener('dragleave', event => {
    if (!element.contains(event.relatedTarget)) element.classList.remove('is-over');
  });
  element.addEventListener('drop', event => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    element.classList.remove('is-over');
    if (onStart?.() === false) return;
    void filesFromDroppedFolders(event.dataTransfer).then(onFiles).catch(onError);
  });
}

async function doImport(files, progress, entry) {
  const entries = [...files].map(fileEntry).filter(Boolean);
  const stored = await chrome.storage.local.get([
    STORAGE.importedAssetsV4, STORAGE.customTypes, STORAGE.hiddenProjectTypesV4,
    STORAGE.projectTypeOrderV4, STORAGE.projectTypeAliasesV4,
  ]);
  const existing = Array.isArray(stored[STORAGE.importedAssetsV4]) ? stored[STORAGE.importedAssetsV4] : [];
  const custom = Array.isArray(stored[STORAGE.customTypes]) ? stored[STORAGE.customTypes] : [];
  const hidden = Array.isArray(stored[STORAGE.hiddenProjectTypesV4]) ? stored[STORAGE.hiddenProjectTypesV4] : [];
  const types = orderedProjectTypes(custom, hidden, stored[STORAGE.projectTypeOrderV4] || []);
  const aliases = stored[STORAGE.projectTypeAliasesV4] || {};
  const known = new Set(existing.map(item => item.fingerprint));
  const added = [], created = [], newTypes = new Set(), restoreTypes = new Set();
  let duplicate = 0, unsupported = 0, failed = 0;
  for (const entry of entries) {
    const { file } = entry;
    if (!ACCEPTED.has(file.type) || file.size < 1 || file.size > MAX_BYTES) { unsupported++; continue; }
    const candidate = resolveProjectType(entry.type, aliases);
    const type = types.find(value => value.toLocaleLowerCase() === candidate.toLocaleLowerCase())
      || [...newTypes].find(value => value.toLocaleLowerCase() === candidate.toLocaleLowerCase())
      || candidate;
    const fingerprint = [entry.path.normalize('NFC').toLocaleLowerCase(), file.size, file.lastModified].join('\u0000');
    if (known.has(fingerprint)) { duplicate++; continue; }
    const id = crypto.randomUUID();
    try {
      await putSourceImage({ sourceReferenceId: id, schemeId: id, blob: file });
      created.push(id);
      added.push({ id, type, project: entry.project, name: file.name, sourcePath: entry.path,
        fingerprint, size: file.size, date: new Date().toISOString(), description: '' });
      known.add(fingerprint);
      if (!types.includes(type)) newTypes.add(type);
      if (hidden.includes(type) && PRESET_TYPES.includes(type)) restoreTypes.add(type);
      if (progress && added.length % 10 === 0) progress('已导入 ' + added.length + ' 张图片…');
    } catch { failed++; }
  }
  try {
    if (added.length) await chrome.storage.local.set({
      [STORAGE.importedAssetsV4]: [...existing, ...added],
      [STORAGE.customTypes]: [...new Set([...custom, ...[...newTypes].filter(type => !PRESET_TYPES.includes(type))])],
      [STORAGE.hiddenProjectTypesV4]: hidden.filter(type => !restoreTypes.has(type)),
    });
  } catch (error) {
    await Promise.allSettled(created.map(id => deleteSourceImagesByScheme(id)));
    throw error;
  }
  if (added.length) void chrome.runtime.sendMessage({ type: 'analytics.record', payload: { eventName: 'image_saved', entry, source: 'import', count: added.length } }).catch(() => {});
  return { added: added.length, duplicate, unsupported, failed, folders: new Set(entries.map(item => item.type)).size };
}

export async function importLocalFolder(files, progress, entry = 'library') {
  if (!files?.length) throw new Error('请选择包含图片的文件夹');
  if (navigator.locks?.request) return navigator.locks.request('archbuddy-folder-import', () => doImport(files, progress, entry));
  return doImport(files, progress, entry);
}

export function importSummary(result) {
  return (result.added ? `已导入 ${result.added} 张图片，归入 ${result.folders} 个一级目录`
    : `未新增图片，已检查 ${result.folders} 个一级目录`)
    + (result.duplicate ? `；跳过重复 ${result.duplicate} 张` : '')
    + (result.unsupported ? `；跳过非 PNG/JPEG/WebP 或超过 10 MB 的文件 ${result.unsupported} 个` : '')
    + (result.failed ? `；${result.failed} 张写入失败` : '') + '。电脑原文件未移动。';
}

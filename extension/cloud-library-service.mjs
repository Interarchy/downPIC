import { accountStorage, currentScope, scopedKey } from './account-storage.mjs';
import { STORAGE, normalizePromptScheme } from './shared.mjs';
import { getSourceImageForScope } from './source-image-store.mjs';

const error = message => Object.assign(new Error(message), { code: 'INVALID_INPUT' });
function rowsFromData(data, prefix = '', imageScope) {
  const rows = [];
  for (const [id, entry] of Object.entries(data[STORAGE.captureCatalogV4] || {})) rows.push({
    localId: 'capture:' + id, kind: 'capture', title: entry.name || entry.project || '参考图',
    prompt: entry.description || '', sourceUrl: entry.sourcePageUrl || '', tags: entry.tags || [],
    sourceReferenceId: data[STORAGE.capturePreviewsV4]?.[id], imageQuality: 'preview',
  });
  for (const entry of data[STORAGE.importedAssetsV4] || []) rows.push({
    localId: 'import:' + entry.id, kind: 'capture', title: entry.name || '导入图片',
    prompt: entry.description || '', sourceUrl: '', tags: entry.tags || [],
    sourceReferenceId: entry.id, imageQuality: 'original',
  });
  for (const raw of data[STORAGE.promptSchemesV3] || []) {
    const scheme = normalizePromptScheme(raw);
    rows.push({ localId: 'prompt:' + scheme.schemeId, kind: 'prompt', title: scheme.name,
      prompt: scheme.currentPrompt || '', sourceUrl: '', tags: [scheme.category].filter(Boolean) });
  }
  return rows.map(row => ({ ...row, localId: prefix + row.localId, imageScope }));
}
async function localRows(legacy) {
  const keys = [STORAGE.captureCatalogV4, STORAGE.capturePreviewsV4, STORAGE.importedAssetsV4, STORAGE.promptSchemesV3];
  if (!legacy) return rowsFromData(await accountStorage.get(keys));
  const history = rowsFromData(await chrome.storage.local.get(keys), '', 'legacy');
  const guestKeys = keys.map(key => scopedKey(key, 'signed-out'));
  const guest = await chrome.storage.local.get(guestKeys);
  const guestData = Object.fromEntries(keys.map((key, i) => [key, guest[guestKeys[i]]]));
  return [...history, ...rowsFromData(guestData, 'guest:', 'signed-out')];
}
function normalizedItem(value) { return value?.item || value; }
export async function handleCloudLibrary(message, client) {
  const type = message.type;
  const payload = message.payload || {};
  const accountId = await client.identity();
  if (type === 'account.local.list') {
    if (!['current', 'legacy'].includes(payload.scope)) throw error('请选择当前账号或本机历史素材');
    const rows = await localRows(payload.scope === 'legacy');
    if (accountId !== await client.identity()) throw error('账号已切换');
    return { ok: true, accountId, items: rows.map(({ sourceReferenceId, imageScope, ...row }) => ({ ...row, hasImage: Boolean(sourceReferenceId) })) };
  }
  if (type === 'account.local.publish') {
    if (payload.expectedAccountId !== accountId || !['current', 'legacy'].includes(payload.scope)) throw error('账号已切换，请重新选择素材');
    const rows = await localRows(payload.scope === 'legacy');
    const source = rows.find(row => row.localId === payload.localId);
    if (!source) throw error('本地素材已不存在');
    const mappingKey = 'archbuddy:cloud-transfer:' + accountId;
    const stored = await chrome.storage.local.get(mappingKey);
    const mappings = stored[mappingKey] || {};
    const sourceKey = payload.scope + ':' + source.localId;
    const mapping = mappings[sourceKey] || { id: crypto.randomUUID(), revision: 0 };
    const base = { kind: source.kind, title: source.title, prompt: source.prompt, tags: source.tags, sourceUrl: source.sourceUrl, ...(source.imageQuality ? { imageQuality: source.imageQuality } : {}) };
    let item = normalizedItem(await client.api('/v1/library/' + mapping.id, { method: 'PUT',
      expectedAccountId: accountId, body: { ...base, expectedRevision: mapping.revision } }));
    mappings[sourceKey] = { id: item.id || mapping.id, revision: item.revision };
    await chrome.storage.local.set({ [mappingKey]: mappings });
    if (payload.includeImage && source.sourceReferenceId) {
      const scope = payload.scope === 'legacy' ? source.imageScope : await currentScope();
      const image = await getSourceImageForScope(source.sourceReferenceId, scope);
      if (accountId !== await client.identity()) throw error('账号已切换');
      const intent = await client.api('/upload-intent', { method: 'POST', expectedAccountId: accountId,
        body: { projectId: item.projectId, purpose: 'reference', mime: image.blob.type, bytes: image.blob.size } });
      const uploadUrl = new URL(intent.putUrl);
      if (uploadUrl.protocol !== 'https:' || !uploadUrl.hostname.endsWith('.r2.cloudflarestorage.com')) throw error('图片上传地址无效');
      const uploaded = await fetch(intent.putUrl, { method: 'PUT', headers: intent.headers, body: image.blob, credentials: 'omit', signal: AbortSignal.timeout(120000) });
      if (!uploaded.ok) throw error('图片上传未完成，可稍后重新尝试；文字素材已保存');
      await client.api('/complete-upload', { method: 'POST', expectedAccountId: accountId, body: { projectId: item.projectId, intentId: intent.intentId } });
      item = normalizedItem(await client.api('/v1/library/' + mapping.id, { method: 'PUT', expectedAccountId: accountId,
        body: { ...base, projectId: item.projectId, assetId: intent.assetId, expectedRevision: item.revision } }));
      mappings[sourceKey] = { id: item.id || mapping.id, revision: item.revision };
      await chrome.storage.local.set({ [mappingKey]: mappings });
    }
    return { ok: true, item, imageUploaded: Boolean(item.assetId) };
  }
  if (type === 'account.library.media') {
    const blob = await client.api('/v1/library/' + encodeURIComponent(payload.id) + '/media', { binary: true, expectedAccountId: payload.expectedAccountId });
    if (!['image/png','image/jpeg','image/webp'].includes(blob.type) || blob.size > 10 * 1024 * 1024) throw error('图片格式或大小不受支持');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return { ok: true, dataUrl: 'data:' + blob.type + ';base64,' + btoa(binary) };
  }
  throw error('未知云素材操作');
}

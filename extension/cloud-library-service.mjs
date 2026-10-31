import { accountStorage, currentScope, scopedKey, withLibraryWriteLock } from './account-storage.mjs';
import { STORAGE, normalizePromptScheme } from './shared.mjs';
import { getSourceImageForScope, putSourceImageForScope, deleteSourceImageForScope } from './source-image-store.mjs';

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
    sourceReferenceId: entry.id, imageQuality: entry.imageQuality === 'preview' ? 'preview' : 'original',
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
  if (type === 'account.local.restore') return restoreCloudLibraryItem(payload, client);
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
    if (!['image/png','image/jpeg','image/webp'].includes(blob.type) || blob.size > 20 * 1024 * 1024) throw error('图片格式或大小不受支持');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return { ok: true, dataUrl: 'data:' + blob.type + ';base64,' + btoa(binary) };
  }
  throw error('未知云素材操作');
}


// 明确点击才下载；服务端重读素材，页面不能提供任意图片地址或写入账号。
export async function restoreCloudLibraryItem(payload, client, dependencies = {}) {
  const storage = dependencies.storage || chrome.storage.local;
  const writeImage = dependencies.writeImage || putSourceImageForScope;
  const removeImage = dependencies.removeImage || deleteSourceImageForScope;
  const accountId = await client.identity();
  const assertAccount = async () => {
    if (accountId !== payload.expectedAccountId || accountId !== await client.identity()) {
      throw Object.assign(new Error('账号已切换，请重新选择素材'), { code: 'ACCOUNT_CHANGED' });
    }
  };
  await assertAccount();
  if (typeof payload.id !== 'string' || !/^[A-Za-z0-9-]{1,80}$/.test(payload.id)) throw error('素材标识无效');
  const item = normalizedItem(await client.api('/v1/library/' + encodeURIComponent(payload.id), { expectedAccountId: accountId }));
  await assertAccount();
  if (!item || item.id !== payload.id || !['capture', 'prompt'].includes(item.kind)
      || typeof item.title !== 'string' || typeof item.prompt !== 'string' || item.prompt.length > 30000
      || !Number.isSafeInteger(item.revision) || item.revision < 0) throw error('云素材内容无效');
  const imageRequested = Boolean(item.assetId) && payload.includeImage !== false;
  const source = { id: item.id, revision: item.revision, assetId: imageRequested ? item.assetId : null,
    title: item.title, sourceUrl: item.sourceUrl || '', tags: item.tags || [] };
  const key = scopedKey(imageRequested && item.kind === 'capture' ? STORAGE.importedAssetsV4 : STORAGE.promptSchemesV3, accountId);
  const matching = rows => rows.find(row => row.cloudSource?.id === source.id && row.cloudSource?.revision === source.revision && row.cloudSource?.assetId === source.assetId);
  const duplicateResult = row => ({ ok: true, duplicate: true, localId: row.id || row.schemeId, imageSaved: imageRequested });
  const prior = await storage.get([key]);
  await assertAccount();
  const priorMatch = matching(Array.isArray(prior[key]) ? prior[key] : []);
  if (priorMatch) return duplicateResult(priorMatch);
  const expiry = item.imageExpiresAt || item.expiresAt;
  if (imageRequested && (item.imageState === 'expired' || item.imageAvailable === false || (expiry && Date.parse(expiry) <= Date.now()))) {
    throw Object.assign(new Error('云端图片已到期，可单独保存文字信息'), { code: 'ASSET_EXPIRED' });
  }
  const id = crypto.randomUUID(), now = new Date().toISOString();
  let image, imageWriteStarted = false, metadataCommitted = false;
  try {
    // 网络和大图读取在集合锁外，慢下载不会阻塞本地编辑。
    if (imageRequested) {
      const blob = await client.api('/v1/library/' + encodeURIComponent(item.id) + '/media', { binary: true, expectedAccountId: accountId });
      await assertAccount();
      if (!(blob instanceof Blob) || !['image/png','image/jpeg','image/webp'].includes(blob.type) || !blob.size || blob.size > 20 * 1024 * 1024) {
        throw Object.assign(new Error('本地图词库仅支持不超过 20 MB 的 PNG、JPEG 或 WebP；云端素材保持不变'), { code: 'IMAGE_TOO_LARGE' });
      }
      imageWriteStarted = true;
      image = await writeImage({ sourceReferenceId: id, schemeId: id, blob }, accountId);
    }
    const result = await withLibraryWriteLock(async () => {
      await assertAccount();
      const latest = await storage.get([key, scopedKey(STORAGE.customTypes, accountId)]);
      const rows = Array.isArray(latest[key]) ? latest[key] : [];
      const existing = matching(rows);
      if (existing) return duplicateResult(existing);
      let record;
      if (imageRequested && item.kind === 'capture') {
        record = { id, type: '云端素材', project: item.title, name: item.title, sourcePath: '',
          fingerprint: 'cloud:' + item.id + ':' + item.revision, size: image.byteSize, date: now,
          description: item.prompt, descriptionStatus: item.prompt ? 'ready' : 'missing', tags: item.tags || [],
          imageQuality: item.imageQuality === 'preview' ? 'preview' : 'original', cloudSource: source };
      } else {
        record = normalizePromptScheme({ schemeId: id, name: item.title, category: '', projectName: item.title,
          createdAt: now, updatedAt: now, overallConfirmedAt: now, cloudSource: source,
          sourceReferences: image ? [{ sourceReferenceId: id, schemeId: id, displayName: item.title,
            sourceType: 'file', mimeType: image.mimeType, byteSize: image.byteSize, assetState: 'available', tags: item.tags || [], createdAt: now }] : [],
          versions: [{ versionId: crypto.randomUUID(), versionNumber: 1, origin: 'initial-confirm',
            createdAt: now, modulesSnapshot: [], compiledPrompt: item.prompt, sourceReferenceIds: image ? [id] : [] }],
        });
      }
      const values = { [key]: [...rows, record] };
      if (imageRequested && item.kind === 'capture') {
        const typesKey = scopedKey(STORAGE.customTypes, accountId);
        values[typesKey] = [...new Set([...(Array.isArray(latest[typesKey]) ? latest[typesKey] : []), '云端素材'])];
      }
      await assertAccount();
      await storage.set(values);
      metadataCommitted = true;
      return { ok: true, localId: id, imageSaved: imageRequested, duplicate: false };
    });
    if (result.duplicate && imageWriteStarted) await removeImage(id, accountId).catch(() => {});
    await assertAccount();
    return result;
  } catch (reason) {
    // 写入后读回失败也可能已提交 IDB；按新生成的 ID 清理，不触碰已有素材。
    if (imageWriteStarted && !metadataCommitted) await removeImage(id, accountId).catch(() => {});
    throw reason;
  }
}

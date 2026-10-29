import { contextScope } from './account-storage.mjs';
const DB_NAME = 'archbuddy-local';
const DB_VERSION = 1;
const STORE_NAME = 'source-images-v1';
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

function storeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function validId(value) {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function openDb(explicitScope) {
  const scope = explicitScope || await contextScope();
  const name = ['legacy','local-demo'].includes(scope) ? DB_NAME : DB_NAME + ':' + scope;
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      const store = database.objectStoreNames.contains(STORE_NAME)
        ? request.transaction.objectStore(STORE_NAME)
        : database.createObjectStore(STORE_NAME, { keyPath: 'sourceReferenceId' });
      if (!store.indexNames.contains('schemeId')) store.createIndex('schemeId', 'schemeId', { unique: false });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(storeError('TRANSACTION_FAILED', '无法打开本地来源图仓库'));
  });
}

async function transaction(mode, operation, explicitScope) {
  const database = await openDb(explicitScope);
  try {
    return await new Promise((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      let result;
      try { result = operation(store, tx); } catch (error) { reject(error); return; }
      tx.oncomplete = () => resolve(result instanceof IDBRequest ? result.result : result);
      tx.onerror = () => reject(storeError(
        tx.error?.name === 'QuotaExceededError' ? 'QUOTA_EXCEEDED' : 'TRANSACTION_FAILED',
        tx.error?.name === 'QuotaExceededError' ? '本地图片空间不足' : '本地来源图操作失败',
      ));
      tx.onabort = tx.onerror;
    });
  } finally {
    database.close();
  }
}

export async function putSourceImage(record = {}) {
  if (!validId(record.sourceReferenceId) || !validId(record.schemeId)
      || !(record.blob instanceof Blob) || !MIME_TYPES.has(record.blob.type)
      || record.blob.size < 1 || record.blob.size > MAX_IMAGE_BYTES) {
    throw storeError('INVALID_IMAGE', '来源图必须是 1 字节至 10 MB 的 PNG、JPEG 或 WebP');
  }
  const stored = {
    sourceReferenceId: record.sourceReferenceId,
    schemeId: record.schemeId,
    mimeType: record.blob.type,
    byteSize: record.blob.size,
    blob: record.blob,
    createdAt: new Date().toISOString(),
  };
  await transaction('readwrite', store => store.put(stored));
  const verified = await getSourceImage(record.sourceReferenceId);
  if (verified.schemeId !== stored.schemeId || verified.mimeType !== stored.mimeType || verified.byteSize !== stored.byteSize) {
    throw storeError('TRANSACTION_FAILED', '来源图写入后校验失败');
  }
  return { ...verified, blob: undefined };
}

export async function getSourceImage(sourceReferenceId) {
  if (!validId(sourceReferenceId)) throw storeError('NOT_FOUND', '来源图不存在');
  const record = await transaction('readonly', store => store.get(sourceReferenceId));
  if (!record) throw storeError('NOT_FOUND', '来源图不存在');
  return record;
}

export async function listSourceImageMeta(schemeId) {
  if (!validId(schemeId)) return [];
  const rows = await transaction('readonly', store => store.index('schemeId').getAll(schemeId));
  return (rows ?? []).map(({ blob, ...meta }) => meta);
}

export async function deleteSourceImage(sourceReferenceId, schemeId) {
  if (!validId(sourceReferenceId) || !validId(schemeId)) throw storeError('OWNERSHIP_MISMATCH', '来源图归属不明确');
  const record = await getSourceImage(sourceReferenceId);
  if (record.schemeId !== schemeId) throw storeError('OWNERSHIP_MISMATCH', '不能删除其他方案的来源图');
  await transaction('readwrite', store => store.delete(sourceReferenceId));
}

export async function deleteSourceImagesByScheme(schemeId) {
  if (!validId(schemeId)) throw storeError('OWNERSHIP_MISMATCH', '方案标识不能为空');
  const rows = await transaction('readonly', store => store.index('schemeId').getAll(schemeId));
  await transaction('readwrite', store => {
    for (const row of rows ?? []) store.delete(row.sourceReferenceId);
  });
  return (rows ?? []).length;
}

// 仅后台的显式历史导入可指定 legacy；常规素材操作始终使用当前账户分区。
export async function getSourceImageForScope(id, scope) {
  if (!validId(id)) throw storeError('NOT_FOUND', '来源图不存在');
  const record = await transaction('readonly', store => store.get(id), scope);
  if (!record) throw storeError('NOT_FOUND', '本机图片副本不存在，文字可单独同步');
  return record;
}

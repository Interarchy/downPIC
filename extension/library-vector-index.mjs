// Vectors belong to this browser profile. Text and image bytes are not stored here.
const DB_NAME = 'archbuddy-library-vectors-v1';
const STORE = 'vectors';
const VERSION = 1;

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'key' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('无法打开本地向量索引'));
  });
}

async function transact(mode, action) {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, mode);
      const result = action(transaction.objectStore(STORE));
      transaction.oncomplete = () => resolve(result instanceof IDBRequest ? result.result : result);
      transaction.onerror = () => reject(new Error('本地向量索引读写失败'));
      transaction.onabort = transaction.onerror;
    });
  } finally { database.close(); }
}

export async function textFingerprint(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

export async function readVectors(namespace) {
  const rows = await transact('readonly', store => store.getAll());
  return new Map((rows || []).filter(row => row.namespace === namespace).map(row => [row.id, row]));
}

export async function writeVectors(namespace, rows) {
  if (!rows.length) return;
  await transact('readwrite', store => {
    for (const row of rows) store.put({ key: namespace + ':' + row.id, namespace,
      id: row.id, fingerprint: row.fingerprint, model: row.model, vector: new Float32Array(row.vector) });
  });
}

export async function pruneVectors(namespace, validIds) {
  const stored = await readVectors(namespace);
  const removed = [...stored.values()].filter(row => !validIds.has(row.id));
  if (!removed.length) return;
  await transact('readwrite', store => { for (const row of removed) store.delete(row.key); });
}

export function vectorScore(left, right) {
  if (!left || !right || left.length !== right.length || !left.length) return -1;
  let dot = 0, lengthLeft = 0, lengthRight = 0;
  for (let index = 0; index < left.length; index++) {
    dot += left[index] * right[index];
    lengthLeft += left[index] ** 2;
    lengthRight += right[index] ** 2;
  }
  return lengthLeft && lengthRight ? dot / Math.sqrt(lengthLeft * lengthRight) : -1;
}

import assert from 'node:assert/strict';
import { COLLECTIONS } from '../quota.mjs';
import { createCloudBaseStore } from '../cloudbase-store.mjs';

// Serializable transactions with rollback; two service objects share the backend.
export function fakeDatabase() {
  const docs = new Map();
  let queue = Promise.resolve();
  const db = {
    runTransaction(callback) {
      const task = queue.then(async () => {
        const draft = structuredClone(docs);
        const value = await callback({ collection(name) {
          assert.ok(Object.values(COLLECTIONS).includes(name));
          return { doc(id) { const key = `${name}/${id}`; return {
            async get() { return { data: draft.get(key) ?? null }; },
            async set(data) { draft.set(key, structuredClone(data)); return { updated: 1 }; },
          }; } };
        } });
        docs.clear();
        for (const [key, data] of draft) docs.set(key, data);
        return value;
      });
      queue = task.catch(() => {});
      return task;
    },
  };
  return { docs, db, store: createCloudBaseStore(db) };
}

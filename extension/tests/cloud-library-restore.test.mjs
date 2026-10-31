import test from 'node:test';
import assert from 'node:assert/strict';
import { restoreCloudLibraryItem } from '../cloud-library-service.mjs';
import { STORAGE, normalizePromptScheme } from '../shared.mjs';
import { scopedKey } from '../account-storage.mjs';

function fixture(overrides = {}) {
  let account = 'account-a';
  const values = {}, calls = [], images = [], removed = [];
  const item = { id: 'cloud-one', kind: 'prompt', title: '用户原始标题', prompt: '用户原始提示词、不翻译',
    revision: 1, tags: ['用户标签'], sourceUrl: 'https://example.com/source', assetId: null, ...overrides };
  const storage = { get: async keys => Object.fromEntries(keys.map(k => [k, values[k]])), set: async data => Object.assign(values, data) };
  const client = { identity: async () => account, api: async (path, options) => {
    calls.push({ path, options });
    if (path.endsWith('/media')) return new Blob([new Uint8Array(11 * 1024 * 1024)], { type: 'image/png' });
    return item;
  } };
  const deps = { storage, writeImage: async (record, scope) => { images.push({ record, scope }); return { byteSize: record.blob.size, mimeType: record.blob.type }; },
    removeImage: async (id, scope) => { removed.push({ id, scope }); } };
  const save = (payload = {}) => restoreCloudLibraryItem({ id: item.id, expectedAccountId: 'account-a', ...payload }, client, deps);
  return { item, values, calls, images, removed, deps, client, save, switchAccount: value => { account = value; } };
}

test('explicit cloud prompt restore preserves content and never overwrites a saved local edit', async () => {
  const f = fixture();
  const first = await f.save();
  const key = scopedKey(STORAGE.promptSchemesV3, 'account-a');
  assert.equal(first.imageSaved, false); assert.equal(f.images.length, 0);
  assert.equal(f.values[key][0].currentPrompt, f.item.prompt);
  assert.equal(f.values[key][0].name, f.item.title);
  f.values[key][0].name = '用户在本地改名';
  const again = await f.save();
  assert.equal(again.duplicate, true); assert.equal(f.values[key].length, 1);
  assert.equal(f.values[key][0].name, '用户在本地改名');
});

test('cloud images above 10MiB restore to existing local indexes without claiming preview is original', async () => {
  const f = fixture({ kind: 'capture', assetId: 'asset-one', imageQuality: 'preview' });
  await f.save();
  const records = f.values[scopedKey(STORAGE.importedAssetsV4, 'account-a')];
  assert.equal(records.length, 1); assert.equal(records[0].description, f.item.prompt);
  assert.equal(records[0].imageQuality, 'preview'); assert.equal(records[0].size, 11 * 1024 * 1024);
  assert.equal(f.images[0].scope, 'account-a');
  assert.equal(f.calls.filter(x => x.path.endsWith('/media')).length, 1);
  await f.save(); assert.equal(f.images.length, 1);
});

test('wrong-account restore stops before reading any private cloud item', async () => {
  const f = fixture();
  await assert.rejects(f.save({ expectedAccountId: 'account-b' }), { code: 'ACCOUNT_CHANGED' });
  assert.deepEqual(f.calls, []); assert.deepEqual(f.values, {});
});

test('switching accounts during a download prevents all local writes', async () => {
  const f = fixture({ kind: 'capture', assetId: 'asset-one' });
  const api = f.client.api;
  f.client.api = async (path, options) => { const result = await api(path, options); if (path.endsWith('/media')) f.switchAccount('account-b'); return result; };
  await assert.rejects(f.save(), { code: 'ACCOUNT_CHANGED' });
  assert.deepEqual(f.images, []); assert.deepEqual(f.values, {});
});

test('switching during image storage cleans the original account partition and never writes the new one', async () => {
  const f = fixture({ kind: 'capture', assetId: 'asset-one' });
  const write = f.deps.writeImage;
  f.deps.writeImage = async (...args) => { const result = await write(...args); f.switchAccount('account-b'); return result; };
  await assert.rejects(f.save(), { code: 'ACCOUNT_CHANGED' });
  assert.deepEqual(f.values, {}); assert.equal(f.removed.length, 1); assert.equal(f.removed[0].scope, 'account-a');
});

test('failed metadata save removes only the newly downloaded image', async () => {
  const f = fixture({ kind: 'capture', assetId: 'asset-one' });
  f.deps.storage.set = async () => { throw new Error('Storage quota exceeded'); };
  await assert.rejects(f.save(), /Storage quota exceeded/);
  assert.equal(f.removed.length, 1); assert.equal(f.removed[0].scope, 'account-a');
});

test('expired images are not downloaded but an explicit text-only restore remains available', async () => {
  const f = fixture({ kind: 'capture', assetId: 'asset-one', imageAvailable: false });
  await assert.rejects(f.save(), { code: 'ASSET_EXPIRED' });
  assert.equal(f.calls.filter(x => x.path.endsWith('/media')).length, 0);
  const saved = await f.save({ includeImage: false });
  assert.equal(saved.imageSaved, false);
  assert.equal(f.values[scopedKey(STORAGE.promptSchemesV3, 'account-a')][0].currentPrompt, f.item.prompt);
});

test('opening or editing a restored prompt keeps its cloud identity and avoids duplicate copies', async () => {
  const f = fixture();
  await f.save();
  const key = scopedKey(STORAGE.promptSchemesV3, 'account-a');
  f.values[key][0] = normalizePromptScheme({ ...f.values[key][0], name: '本地编辑后的名称' });
  const again = await f.save();
  assert.equal(again.duplicate, true);
  assert.equal(f.values[key].length, 1);
  assert.equal(f.values[key][0].name, '本地编辑后的名称');
  assert.equal(f.values[key][0].cloudSource.id, f.item.id);
});

test('image committed before readback failure is removed even when writeImage rejects', async () => {
  const f = fixture({ kind: 'capture', assetId: 'asset-one' });
  let committed;
  f.deps.writeImage = async (record, scope) => {
    committed = { id: record.sourceReferenceId, scope };
    throw Object.assign(new Error('Readback failed after IDB commit'), { code: 'TRANSACTION_FAILED' });
  };
  await assert.rejects(f.save(), { code: 'TRANSACTION_FAILED' });
  assert.deepEqual(f.values, {});
  assert.deepEqual(f.removed, [committed]);
});

test('parallel downloads of the same cloud revision commit only one local item and discard the spare image', async () => {
  const f = fixture({ kind: 'capture', assetId: 'asset-one' });
  const results = await Promise.all([f.save(), f.save()]);
  const key = scopedKey(STORAGE.importedAssetsV4, 'account-a');
  assert.equal(f.values[key].length, 1);
  assert.equal(results.filter(result => result.duplicate).length, 1);
  assert.equal(f.images.length, 2);
  assert.equal(f.removed.length, 1);
  assert.notEqual(f.removed[0].id, f.values[key][0].id);
});

test('an image above the 20 MiB limit does not write local image or metadata', async () => {
  const f = fixture({ kind: 'capture', assetId: 'asset-one' });
  const api = f.client.api;
  f.client.api = (path, options) => path.endsWith('/media')
    ? new Blob([new Uint8Array(20 * 1024 * 1024 + 1)], { type: 'image/png' }) : api(path, options);
  await assert.rejects(f.save(), { code: 'IMAGE_TOO_LARGE' });
  assert.deepEqual(f.images, []); assert.deepEqual(f.values, {});
});

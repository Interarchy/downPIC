import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addAssetTag,
  getExistingTagOptions,
  removeAssetTag,
  restoreAssetSnapshot,
  updateAssetDescription,
} from '../src/asset-edit.mjs';

const asset = {
  id: 'asset-01',
  description: '原始描述',
  tags: ['清水混凝土', '自然采光'],
  status: '已解析',
};

test('updates a non-empty description without mutating the source asset', () => {
  const result = updateAssetDescription(asset, '  人工修正后的描述  ');
  assert.equal(result.changed, true);
  assert.equal(result.asset.description, '人工修正后的描述');
  assert.equal(asset.description, '原始描述');
});

test('rejects an empty description', () => {
  const result = updateAssetDescription(asset, '   ');
  assert.equal(result.changed, false);
  assert.equal(result.error, '图片描述不能为空');
});

test('adds a normalized custom tag and rejects duplicates', () => {
  const added = addAssetTag(asset, '  柔和  天光  ');
  assert.deepEqual(added.asset.tags, ['清水混凝土', '自然采光', '柔和 天光']);
  assert.equal(addAssetTag(added.asset, '柔和 天光').error, '该关键词已存在');
});

test('builds existing tag options from the whole library, excluding current tags', () => {
  const options = getExistingTagOptions([
    { tags: ['自然采光', '庭院', '木构'] },
    { tags: ['自然采光', '庭院', '石材'] },
    { tags: ['林地'] },
  ], ['自然采光'], '庭');

  assert.deepEqual(options, [{ value: '庭院', count: 2 }]);
});

test('sorts existing tag options by library usage count', () => {
  const options = getExistingTagOptions([
    { tags: ['庭院', '木构'] },
    { tags: ['庭院', '石材'] },
    { tags: ['木构'] },
    { tags: ['庭院'] },
  ]);

  assert.deepEqual(options.map(({ value, count }) => [value, count]), [
    ['庭院', 3],
    ['木构', 2],
    ['石材', 1],
  ]);
});

test('removing the last tag returns the asset to unparsed', () => {
  const result = removeAssetTag({ ...asset, tags: ['自然采光'] }, '自然采光');
  assert.equal(result.asset.status, '未解析');
  assert.deepEqual(result.asset.tags, []);
});

test('restores the previous editable snapshot', () => {
  const changed = { ...asset, description: '新描述', tags: ['庭院'] };
  const restored = restoreAssetSnapshot(changed, asset);
  assert.equal(restored.description, '原始描述');
  assert.deepEqual(restored.tags, ['清水混凝土', '自然采光']);
});

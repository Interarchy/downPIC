import assert from 'node:assert/strict';
import test from 'node:test';
import { loadLiveLibrary, mergeUnknownTagsIntoGroups, projectTreeFromAssets } from '../src/live-library.mjs';

test('loads a valid local library projection', async () => {
  const assets = await loadLiveLibrary(async () => ({
    ok: true,
    async json() { return { schemaVersion: 1, assets: [{ id: 'a', webPath: '/a.jpg', projectType: '文化建筑', projectName: '美术馆' }] }; },
  }));
  assert.equal(assets.length, 1);
  assert.equal(assets[0].status, '未解析');
  assert.deepEqual(assets[0].tags, []);
});

test('falls back cleanly when the live projection is unavailable', async () => {
  assert.deepEqual(await loadLiveLibrary(async () => ({ ok: false })), []);
});

test('builds project counts from real assets', () => {
  const tree = projectTreeFromAssets([
    { projectType: '教育建筑', projectName: '学校 A' },
    { projectType: '教育建筑', projectName: '学校 B' },
  ]);
  assert.equal(tree[0].count, 2);
  assert.deepEqual(tree[0].projects, ['学校 A', '学校 B']);
});

test('places autonomous AI tags in Other without duplicating known tags', () => {
  const groups = mergeUnknownTagsIntoGroups(
    [{ label: '空间', tags: ['庭院'] }, { label: '其他', tags: [] }],
    [{ tags: ['庭院', '折板屋顶'] }, { tags: ['折板屋顶', '漂浮体量'] }],
  );
  assert.deepEqual(groups.find((group) => group.label === '其他').tags, ['折板屋顶', '漂浮体量']);
});

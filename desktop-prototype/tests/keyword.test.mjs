import test from 'node:test';
import assert from 'node:assert/strict';

import { moveKeyword, normalizeKeyword, validateKeyword } from '../src/keyword.mjs';

test('normalizes surrounding and repeated whitespace', () => {
  assert.equal(normalizeKeyword('  柔和   天光  '), '柔和 天光');
});

test('rejects a whitespace-only keyword', () => {
  assert.deepEqual(validateKeyword('　 \n ', []), {
    valid: false,
    value: '',
    error: '请输入关键词标签',
  });
});

test('rejects a duplicate keyword', () => {
  const result = validateKeyword(' 清水混凝土 ', ['木构', '清水混凝土']);
  assert.equal(result.valid, false);
  assert.equal(result.error, '该关键词标签已存在');
});

test('accepts a new keyword', () => {
  assert.deepEqual(validateKeyword('悬浮屋顶', ['木构']), {
    valid: true,
    value: '悬浮屋顶',
    error: '',
  });
});

test('moves a keyword between personal display groups without changing its value', () => {
  const groups = [
    { label: '形态', tags: ['山地', '林地'] },
    { label: '空间', tags: ['庭院'] },
  ];
  const result = moveKeyword(groups, '山地', '形态', '空间');
  assert.equal(result.moved, true);
  assert.deepEqual(result.groups, [
    { label: '形态', tags: ['林地'] },
    { label: '空间', tags: ['庭院', '山地'] },
  ]);
  assert.deepEqual(groups[0].tags, ['山地', '林地']);
});

test('does not move a keyword into its current group', () => {
  const groups = [{ label: '形态', tags: ['山地'] }];
  const result = moveKeyword(groups, '山地', '形态', '形态');
  assert.equal(result.moved, false);
  assert.equal(result.error, '标签已在该分类中');
});

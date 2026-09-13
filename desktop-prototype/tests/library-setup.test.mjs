import test from 'node:test';
import assert from 'node:assert/strict';

import { getLibrarySetupSummary, normalizeLibraryPath, validateLibraryPath } from '../src/library-setup.mjs';

test('normalizes surrounding whitespace and trailing separators', () => {
  assert.equal(normalizeLibraryPath('  D:\\建筑素材库\\  '), 'D:\\建筑素材库');
});

test('accepts a writable Windows folder and exposes all required checks', () => {
  const result = validateLibraryPath('D:\\建筑素材库');
  assert.equal(result.valid, true);
  assert.equal(result.checks.length, 3);
  assert.equal(result.checks.every(({ passed }) => passed), true);
});

test('rejects empty and protected install locations', () => {
  assert.equal(validateLibraryPath('   ').error, '请选择素材库文件夹');
  assert.match(validateLibraryPath('C:\\Program Files\\建筑素材库').error, /管理员权限/);
});

test('builds a two-level physical folder preview for the selected root', () => {
  const summary = getLibrarySetupSummary('create', 'D:\\建筑素材库');
  assert.equal(summary.path, 'D:\\建筑素材库');
  assert.deepEqual(summary.folders[0], { type: '文化建筑', project: '沿山艺术中心' });
});

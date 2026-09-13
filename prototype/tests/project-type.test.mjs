import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyCustomInput,
  applyPresetSelection,
  createTypeSelection,
  normalizeProjectType,
  resolveTypeSelection,
  validateProjectType,
} from '../src/project-type.mjs';

test('normalizes surrounding whitespace and preserves meaningful internal spaces', () => {
  assert.equal(normalizeProjectType('  文化建筑  '), '文化建筑');
  assert.equal(normalizeProjectType('城市 更新'), '城市 更新');
});

test('accepts a meaningful project type', () => {
  assert.deepEqual(validateProjectType('文化建筑'), {
    valid: true,
    value: '文化建筑',
    error: null,
  });
});

for (const [label, value] of [
  ['empty string', ''],
  ['ASCII spaces', '   '],
  ['full-width spaces', '　　'],
  ['newlines and tabs', '\n\t\r'],
]) {
  test(`rejects ${label}`, () => {
    assert.deepEqual(validateProjectType(value), {
      valid: false,
      value: '',
      error: '请输入项目类型',
    });
  });
}

test('preset and custom controls are mutually exclusive', () => {
  const initial = createTypeSelection('文化建筑');
  const custom = applyCustomInput(initial, '社区文化空间');
  assert.deepEqual(custom, { presetValue: '', customValue: '社区文化空间' });

  const preset = applyPresetSelection(custom, '教育建筑');
  assert.deepEqual(preset, { presetValue: '教育建筑', customValue: '' });
});

test('resolves either the selected preset or a normalized custom value', () => {
  assert.deepEqual(resolveTypeSelection({ presetValue: '教育建筑', customValue: '' }), {
    valid: true,
    value: '教育建筑',
    source: 'preset',
    error: null,
  });
  assert.deepEqual(resolveTypeSelection({ presetValue: '', customValue: '  社区文化空间  ' }), {
    valid: true,
    value: '社区文化空间',
    source: 'custom',
    error: null,
  });
});

test('pure whitespace custom input leaves no valid project type', () => {
  assert.deepEqual(resolveTypeSelection({ presetValue: '', customValue: '　 \n\t ' }), {
    valid: false,
    value: '',
    source: 'custom',
    error: '请输入项目类型',
  });
});

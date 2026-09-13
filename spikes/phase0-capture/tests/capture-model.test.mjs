import test from 'node:test';
import assert from 'node:assert/strict';

import {
  captureSuccessMessage,
  createPendingCapture,
  extensionFromUrl,
  normalizeProjectType,
  stagingFilename,
} from '../extension/capture-model.mjs';

test('describes the final managed location after import or deduplication', () => {
  const record = {
    project_type_name: '教育建筑',
    page_title: '林间学校',
    site_name: 'Example',
  };
  assert.equal(captureSuccessMessage(record, 'imported'), '已整理到：教育建筑 / 林间学校');
  assert.equal(captureSuccessMessage(record, 'duplicate'), '当前项目已存在：教育建筑 / 林间学校');
});

test('normalizes project types and rejects whitespace-only values', () => {
  assert.equal(normalizeProjectType('  文化　 建筑  '), '文化 建筑');
  assert.throws(
    () => createPendingCapture({ projectTypeName: '　 ', imageUrl: 'https://example.com/a.jpg' }),
    /PROJECT_TYPE_REQUIRED/,
  );
});

test('accepts only MVP image formats', () => {
  assert.equal(extensionFromUrl('https://example.com/image.JPEG'), 'jpg');
  assert.equal(extensionFromUrl('https://example.com/no-extension', 'image/webp'), 'webp');
  assert.equal(extensionFromUrl('https://example.com/vector.svg'), null);
  assert.equal(
    extensionFromUrl('https://sns-webpic-qc.xhscdn.com/path/asset!nc_n_webp_mw_1'),
    'webp',
  );
  assert.equal(
    extensionFromUrl('https://fe-platform.xhscdn.com/asset?imageView2/2/format/webp'),
    'webp',
  );
});

test('creates a deterministic relative staging path', () => {
  assert.equal(
    stagingFilename('capture-01', 'jpg', new Date('2026-08-10T00:00:00Z')),
    '索引室待导入/2026-08/capture-01.jpg',
  );
});

test('creates a pending record with source and project context', () => {
  const record = createPendingCapture({
    captureId: 'capture-01',
    projectTypeName: '文化建筑',
    imageUrl: 'https://example.com/image.png',
    pageUrl: 'https://example.com/project',
    pageTitle: '沿山艺术中心',
    siteName: 'Example',
  }, new Date('2026-08-10T02:30:00Z'));
  assert.equal(record.status, 'downloading');
  assert.equal(record.extension, 'png');
  assert.equal(record.page_title, '沿山艺术中心');
  assert.equal(record.captured_at, '2026-08-10T02:30:00.000Z');
});

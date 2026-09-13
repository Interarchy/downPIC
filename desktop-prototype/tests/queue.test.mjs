import test from 'node:test';
import assert from 'node:assert/strict';

import { getQueueAssets, getQueueSummary, retryFailedAsset } from '../src/queue.mjs';

const sampleAssets = [
  { id: '1', status: '已解析' },
  { id: '2', status: '已解析' },
  { id: '3', status: '未解析' },
  { id: '4', status: '未解析' },
  { id: '5', status: '解析中' },
  { id: '6', status: '解析失败', analysis: { retryCount: 2, error: '网络错误' } },
];

test('uses one queue count across waiting, processing and failed statuses', () => {
  assert.deepEqual(getQueueSummary(sampleAssets), {
    total: 6,
    completed: 2,
    outstanding: 4,
    waiting: 2,
    processing: 1,
    failed: 1,
  });
});

test('filters the queue by processing status', () => {
  assert.deepEqual(getQueueAssets(sampleAssets, 'failed').map(({ id }) => id), ['6']);
  assert.deepEqual(getQueueAssets(sampleAssets).map(({ id }) => id), ['3', '4', '5', '6']);
});

test('retry moves a failed asset back to waiting without changing queue total', () => {
  const retried = retryFailedAsset(sampleAssets[5]);
  assert.equal(retried.changed, true);
  assert.equal(retried.asset.status, '未解析');
  assert.equal(retried.asset.analysis.retryCount, 3);
  assert.equal(retried.asset.analysis.error, '');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { loadAnalysisServiceStatus, runNextAnalysis } from '../src/analysis-service.mjs';

test('reports whether local AI is configured without exposing the key', async () => {
  const status = await loadAnalysisServiceStatus(async () => ({ ok: true, async json() { return { configured: true, model: 'vision-model' }; } }));
  assert.deepEqual(status, { available: true, configured: true, model: 'vision-model' });
});

test('surfaces an unconfigured analysis service', async () => {
  await assert.rejects(() => runNextAnalysis(async () => ({ ok: false, async json() { return { message: '尚未配置' }; } })), /尚未配置/);
});

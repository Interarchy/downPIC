import assert from 'node:assert/strict';
import test from 'node:test';
import { getAnalysisConfiguration } from '../src/queue-worker.mjs';

test('uses a developer-managed Qwen configuration without exposing its credential', () => {
  const configuration = getAnalysisConfiguration({ DASHSCOPE_API_KEY: 'developer-secret' });
  assert.deepEqual(configuration, {
    configured: true,
    provider: 'qwen',
    model: 'qwen3.7-plus',
    deploymentMode: 'developer-managed',
    autoAnalyze: false,
  });
  assert.equal(JSON.stringify(configuration).includes('developer-secret'), false);
});

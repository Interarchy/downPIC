import assert from 'node:assert/strict';
import test from 'node:test';
import { settingsToEnvironment } from '../src/developer-settings.mjs';

test('maps encrypted developer settings into runtime environment without changing the model choice', () => {
  const environment = settingsToEnvironment({ baseUrl: 'https://workspace.example/compatible-mode/v1', model: 'qwen3.7-plus' }, 'decrypted-secret', {});
  assert.equal(environment.DASHSCOPE_API_KEY, 'decrypted-secret');
  assert.equal(environment.DASHSCOPE_BASE_URL, 'https://workspace.example/compatible-mode/v1');
  assert.equal(environment.QWEN_MODEL, 'qwen3.7-plus');
});

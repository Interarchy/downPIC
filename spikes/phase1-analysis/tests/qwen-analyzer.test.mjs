import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { PRESET_KEYWORDS, QwenArchitectureAnalyzer } from '../src/qwen-analyzer.mjs';

async function fixtureImage() {
  const directory = await mkdtemp(path.join(tmpdir(), 'archive-qwen-'));
  const imagePath = path.join(directory, 'test.jpg');
  await writeFile(imagePath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  return imagePath;
}

test('sends a local image to Qwen Chat Completions in JSON mode', async () => {
  const imagePath = await fixtureImage();
  let calledUrl;
  let requestBody;
  const analyzer = new QwenArchitectureAnalyzer({
    apiKey: 'test-key', model: 'qwen-test', baseUrl: 'https://example.test/compatible-mode/v1/',
    fetchImpl: async (url, options) => {
      calledUrl = url;
      requestBody = JSON.parse(options.body);
      return { ok: true, async json() { return { choices: [{ message: { content: JSON.stringify({ description: '一个由自然光照亮的混凝土展览空间。', keywords: ['展览空间', '清水混凝土', '自然采光'], new_keywords: [] }) } }] }; } };
    },
  });
  const result = await analyzer.analyze({ managedPath: imagePath, project_type: '文化建筑', project_name: '测试美术馆' });
  assert.equal(calledUrl, 'https://example.test/compatible-mode/v1/chat/completions');
  assert.equal(requestBody.response_format.type, 'json_object');
  assert.equal(requestBody.enable_thinking, false);
  assert.match(requestBody.messages[1].content[0].image_url.url, /^data:image\/jpeg;base64,/);
  assert.equal(result.keywords.length, 3);
});

test('accepts autonomous AI tags and merges them into the image tags', async () => {
  const imagePath = await fixtureImage();
  const analyzer = new QwenArchitectureAnalyzer({
    apiKey: 'test-key',
    fetchImpl: async () => ({ ok: true, async json() { return { choices: [{ message: { content: '{"description":"测试","keywords":["庭院"],"new_keywords":["折板屋顶","漂浮体量"]}' } }] }; } }),
  });
  const result = await analyzer.analyze({ managedPath: imagePath, project_type: '其他', project_name: '测试' });
  assert.deepEqual(result.keywords, ['庭院', '折板屋顶', '漂浮体量']);
  assert.deepEqual(result.newKeywords, ['折板屋顶', '漂浮体量']);
  assert.ok(PRESET_KEYWORDS.includes('清水混凝土'));
});

test('allows no matching preset tag and caps excessive preset tags instead of failing the asset', async () => {
  const imagePath = await fixtureImage();
  const noPresetAnalyzer = new QwenArchitectureAnalyzer({
    apiKey: 'test-key',
    fetchImpl: async () => ({ ok: true, async json() { return { choices: [{ message: { content: '{"description":"测试","keywords":[],"new_keywords":["悬挑屋顶"]}' } }] }; } }),
  });
  const noPresetResult = await noPresetAnalyzer.analyze({ managedPath: imagePath, project_type: '其他', project_name: '测试' });
  assert.deepEqual(noPresetResult.keywords, ['悬挑屋顶']);

  const manyPresetAnalyzer = new QwenArchitectureAnalyzer({
    apiKey: 'test-key',
    fetchImpl: async () => ({ ok: true, async json() { return { choices: [{ message: { content: JSON.stringify({ description: '测试', keywords: PRESET_KEYWORDS.slice(0, 9), new_keywords: [] }) } }] }; } }),
  });
  const cappedResult = await manyPresetAnalyzer.analyze({ managedPath: imagePath, project_type: '其他', project_name: '测试' });
  assert.equal(cappedResult.keywords.length, 8);
});

test('rejects more than five autonomous AI tags', async () => {
  const imagePath = await fixtureImage();
  const analyzer = new QwenArchitectureAnalyzer({
    apiKey: 'test-key',
    fetchImpl: async () => ({ ok: true, async json() { return { choices: [{ message: { content: '{"description":"测试","keywords":["庭院"],"new_keywords":["折板屋顶","漂浮体量","架空基座","连续坡道","下沉广场","屋顶花园"]}' } }] }; } }),
  });
  await assert.rejects(() => analyzer.analyze({ managedPath: imagePath, project_type: '其他', project_name: '测试' }), /最多自主新增 5 个/);
});

test('does not construct a Qwen analyzer without a developer credential', () => {
  assert.throws(() => new QwenArchitectureAnalyzer(), /开发者千问服务凭据/);
});

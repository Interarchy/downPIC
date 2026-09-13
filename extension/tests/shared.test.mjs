import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SYSTEM_PROMPT } from '../analysis-prompt.mjs';
import {
  PRINCIPLE,
  STORAGE,
  dataUrlParts,
  normalizeProjectType,
  parseAnalysisSections,
  sanitizePathSegment,
  serializeSections,
} from '../shared.mjs';

test('商店扩展提示词与已批准的唯一源逐字一致', async () => {
  const markdown = await readFile(new URL('../../plugin-prototype/analysis-instructions.md', import.meta.url), 'utf8');
  const start = '<!-- model:system:start -->';
  const end = '<!-- model:system:end -->';
  const extracted = markdown.slice(markdown.indexOf(start) + start.length, markdown.indexOf(end)).trim();
  assert.equal(SYSTEM_PROMPT.replace(/\r\n/g, '\n'), extracted.replace(/\r\n/g, '\n'));
});

test('解析模型分项并强制注入批准的整体准则', () => {
  const raw = `开场白
【整体生成准则】模型自己改写的版本
【核心视觉特征】冷灰体量与深绿山谷形成对比。
【场景与主体】低矮建筑嵌入山地。
【视角与构图】平视中远景，主体位于中下部。
【色彩与明暗】低饱和冷灰与深绿色。
【模型建议】不应保留。`;
  const sections = parseAnalysisSections(raw);
  assert.equal(sections[0].title, '整体生成准则');
  assert.equal(sections[0].text, PRINCIPLE);
  assert.equal(sections.length, 5);
  assert.ok(!serializeSections(sections).includes('模型建议'));
});

test('分类和下载路径不会越界或产生 Windows 非法文件名', () => {
  assert.equal(normalizeProjectType('  山地　酒店\n'), '山地 酒店');
  assert.equal(sanitizePathSegment('../方案:A*'), '方案 A');
  assert.equal(sanitizePathSegment('..'), '未命名项目');
});

test('浏览器存储模型中没有 DeepSeek Key', () => {
  assert.equal(Object.hasOwn(STORAGE, 'apiKey'), false);
});

test('图片 data URL 只接受允许的静态格式', () => {
  assert.deepEqual(dataUrlParts('data:image/png;base64,QUJD'), { mimeType: 'image/png', base64: 'QUJD' });
  assert.throws(() => dataUrlParts('data:text/html;base64,QUJD'));
});

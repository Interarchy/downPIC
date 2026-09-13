import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PRINCIPLE, REFERENCES, sectionsFor, serializePrompt, validateImage } from './prompt-model.mjs';

test('copied prompt starts with the exact approved principle and includes each dimension', async () => {
  const instructions = await readFile(new URL('./analysis-instructions.md',import.meta.url),'utf8');
  assert.ok(instructions.includes(PRINCIPLE));
  for (const ref of REFERENCES) {
    const sections = sectionsFor(ref);
    const text = serializePrompt(sections);
    assert.equal(sections.length,9);
    assert.ok(text.startsWith(`【整体生成准则】\n${PRINCIPLE}\n\n【核心视觉特征】`));
    assert.ok(text.includes('【图像表现】'));
  }
  assert.notEqual(serializePrompt(sectionsFor(REFERENCES[0])),serializePrompt(sectionsFor(REFERENCES[1])));
});
test('rejects unsupported, empty and oversized clipboard images without accepting URLs as files', () => {
  assert.equal(validateImage({type:'image/png',size:1024}), '');
  assert.equal(validateImage({type:'image/webp',size:10*1024*1024}), '');
  for (const input of [null, {type:'text/plain',size:20}, {type:'image/gif',size:20}, {type:'image/png',size:0}, {type:'image/png',size:10*1024*1024+1}]) assert.notEqual(validateImage(input),'');
});

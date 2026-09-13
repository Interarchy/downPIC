import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const taxonomyUrl = new URL('../../../config/tag-taxonomy.v1.json', import.meta.url);
const schemaUrl = new URL('../../../config/analysis-result.schema.v1.json', import.meta.url);
const promptUrl = new URL('../../../prompts/architecture-image-analysis.v1.md', import.meta.url);

test('analysis schema and taxonomy share the same active category IDs', async () => {
  const taxonomy = JSON.parse(await readFile(taxonomyUrl, 'utf8'));
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));
  const activeCategoryIds = taxonomy.categories
    .map((category) => category.id)
    .filter((id) => id !== 'image_type');
  assert.deepEqual(schema.$defs.categoryId.enum, activeCategoryIds);
  assert.equal(activeCategoryIds.includes('lighting'), false);
});

test('analysis schema gates deep output behind visualization support', async () => {
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));
  const condition = schema.allOf[0];
  assert.equal(condition.then.properties.image_type.properties.tag_id.const, 'image_visualization');
  assert.equal(condition.else.properties.description.const, '');
  assert.equal(condition.else.properties.preset_labels.maxItems, 0);
  assert.equal(schema.properties.candidate_labels.maxItems, 5);
});

test('prompt forbids lighting tags while preserving lighting in prose', async () => {
  const prompt = await readFile(promptUrl, 'utf8');
  assert.match(prompt, /光环境不是标签分类/);
  assert.match(prompt, /光线概念生成为预设标签或候选标签/);
  assert.match(prompt, /只进入描述/);
});

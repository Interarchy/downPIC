import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const taxonomyUrl = new URL('../../../config/tag-taxonomy.v1.json', import.meta.url);

async function loadTaxonomy() {
  return JSON.parse(await readFile(taxonomyUrl, 'utf8'));
}

test('taxonomy has nine categories and globally unique tag identities', async () => {
  const taxonomy = await loadTaxonomy();
  assert.equal(taxonomy.categories.length, 9);
  const tags = taxonomy.categories.flatMap((category) =>
    category.subcategories.flatMap((subcategory) => subcategory.tags));
  assert.equal(tags.length, 153);
  assert.equal(new Set(tags.map((tag) => tag.id)).size, tags.length);
  assert.equal(new Set(tags.map((tag) => tag.name)).size, tags.length);
  assert.ok(tags.every((tag) => tag.definition && Array.isArray(tag.aliases)));
});

test('lighting remains descriptive prose rather than a keyword category', async () => {
  const taxonomy = await loadTaxonomy();
  assert.equal(taxonomy.categories.some((category) => category.id === 'lighting'), false);
  const tagIds = taxonomy.categories.flatMap((category) =>
    category.subcategories.flatMap((subcategory) => subcategory.tags.map((tag) => tag.id)));
  assert.equal(tagIds.some((id) => id.startsWith('light_')), false);
});

test('only visualization images receive deep analysis in V1', async () => {
  const taxonomy = await loadTaxonomy();
  assert.equal(taxonomy.scope.deep_analysis_type_id, 'image_visualization');
  const imageTypes = taxonomy.categories.find((category) => category.id === 'image_type')
    .subcategories.flatMap((subcategory) => subcategory.tags);
  assert.deepEqual(imageTypes.map((tag) => tag.id), [
    'image_visualization', 'image_site_plan', 'image_floor_plan', 'image_analysis_diagram',
    'image_elevation', 'image_section', 'image_other',
  ]);
});

test('merged concepts appear only once in the canonical taxonomy', async () => {
  const taxonomy = await loadTaxonomy();
  const names = taxonomy.categories.flatMap((category) =>
    category.subcategories.flatMap((subcategory) => subcategory.tags.map((tag) => tag.name)));
  for (const name of ['入口', '阳台', '楼梯', '坡道', '平台', '架空', '下沉']) {
    assert.equal(names.filter((candidate) => candidate === name).length, 1, name);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';

import { assets } from '../src/data.mjs';
import { extractQueryTerms, getSuggestions, searchAssets, startNaturalLanguageSearch } from '../src/search.mjs';

test('extracts architectural concepts and maps synonyms', () => {
  assert.deepEqual(
    extractQueryTerms('有柔和天光的混凝土文化空间', assets).sort(),
    ['自然采光', '清水混凝土', '文化建筑'].sort(),
  );
});

test('natural language search ranks the concrete gallery first', () => {
  const results = searchAssets('有柔和天光的混凝土展览空间', assets);
  assert.equal(results[0].asset.id, 'asset-03');
  assert.ok(results[0].reasons.includes('关键词：自然采光'));
});

test('a new natural language search clears previously selected browse filters', () => {
  assert.deepEqual(startNaturalLanguageSearch('  安静的林间空间  ', {
    selectedProject: '文化建筑',
    selectedTags: ['清水混凝土'],
  }), {
    query: '安静的林间空间',
    selectedProject: '',
    selectedTags: [],
    clearedFilters: true,
  });
});

test('an empty search does not silently clear browse filters', () => {
  assert.deepEqual(startNaturalLanguageSearch('  ', {
    selectedProject: '文化建筑',
    selectedTags: ['清水混凝土'],
  }), {
    query: '',
    selectedProject: '文化建筑',
    selectedTags: ['清水混凝土'],
    clearedFilters: false,
  });
});

test('project and multiple keyword filters use AND', () => {
  const results = searchAssets('', assets, {
    projectTypes: ['文化建筑'],
    tags: ['清水混凝土', '自然采光'],
  });
  assert.deepEqual(results.map(({ asset }) => asset.id), ['asset-01', 'asset-03']);
});

test('unmatched natural language produces no results', () => {
  assert.equal(searchAssets('海边的彩色充气膜结构', assets).length, 0);
});

test('suggestions combine history and vocabulary without duplicates', () => {
  const suggestions = getSuggestions('混凝土', ['混凝土展厅'], assets);
  assert.deepEqual(suggestions, ['混凝土展厅', '清水混凝土', '混凝土']);
});

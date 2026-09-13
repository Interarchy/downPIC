import assert from 'node:assert/strict';
import test from 'node:test';
import { MockArchitectureAnalyzer, validateAnalysisResult } from '../src/analyzer.mjs';

test('normalizes and deduplicates an analysis result', () => {
  assert.deepEqual(validateAnalysisResult({ description: '  柔和天光  ', keywords: ['庭院', '庭院', ' 木构 '] }), {
    description: '柔和天光', keywords: ['庭院', '木构'],
  });
});

test('mock analyzer is explicitly non-visual queue plumbing', async () => {
  const result = await new MockArchitectureAnalyzer().analyze({ projectName: '林间学校', projectType: '教育建筑' });
  assert.match(result.description, /等待接入真实视觉模型/);
  assert.deepEqual(result.keywords, ['教育建筑', '待模型复核']);
});

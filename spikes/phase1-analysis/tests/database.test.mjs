import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { claimQueuedAnalysis, completeAnalysis, mergeAnalysisState, openAssetDatabase, upsertAssets } from '../src/database.mjs';

test('moves a queued asset through processing to completed analysis', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'archive-db-'));
  const database = openAssetDatabase(path.join(directory, 'library.sqlite'));
  const asset = {
    id: 'asset-a', managedPath: 'C:\\library\\a.jpg', projectType: '文化建筑', projectName: '美术馆', title: '展厅',
    sourceSite: 'example.com', sourcePageTitle: '美术馆', sourceUrl: 'https://example.com', sourceImageUrl: '',
    contentHash: 'sha256:a', capturedAt: '2026-01-01T00:00:00.000Z', byteSize: 10, status: '未解析', tags: [], description: '',
  };
  upsertAssets(database, [asset]);
  assert.equal(claimQueuedAnalysis(database).id, 'asset-a');
  completeAnalysis(database, 'asset-a', { provider: 'openai', model: 'vision-model', description: '自然光展厅', keywords: ['展览空间'] });
  const [merged] = mergeAnalysisState(database, [asset]);
  assert.equal(merged.status, '已解析');
  assert.equal(merged.description, '自然光展厅');
  assert.deepEqual(merged.tags, ['展览空间']);
  database.close();
});

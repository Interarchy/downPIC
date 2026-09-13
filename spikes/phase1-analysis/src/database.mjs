import { DatabaseSync } from 'node:sqlite';

export function openAssetDatabase(filename) {
  const database = new DatabaseSync(filename);
  database.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      managed_path TEXT NOT NULL UNIQUE,
      project_type TEXT NOT NULL,
      project_name TEXT NOT NULL,
      title TEXT NOT NULL,
      source_site TEXT,
      source_page_title TEXT,
      source_url TEXT,
      source_image_url TEXT,
      content_hash TEXT,
      captured_at TEXT NOT NULL,
      byte_size INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS ai_analyses (
      asset_id TEXT PRIMARY KEY REFERENCES assets(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'queued',
      provider TEXT,
      model TEXT,
      description TEXT NOT NULL DEFAULT '',
      keywords_json TEXT NOT NULL DEFAULT '[]',
      error TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  return database;
}

export function upsertAssets(database, assets) {
  const upsertAsset = database.prepare(`
    INSERT INTO assets (id, managed_path, project_type, project_name, title, source_site, source_page_title, source_url, source_image_url, content_hash, captured_at, byte_size)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      managed_path=excluded.managed_path, project_type=excluded.project_type,
      project_name=excluded.project_name, title=excluded.title, source_site=excluded.source_site,
      source_page_title=excluded.source_page_title, source_url=excluded.source_url,
      source_image_url=excluded.source_image_url, content_hash=excluded.content_hash,
      captured_at=excluded.captured_at, byte_size=excluded.byte_size, updated_at=CURRENT_TIMESTAMP
  `);
  const ensureAnalysis = database.prepare(`
    INSERT INTO ai_analyses (asset_id, status) VALUES (?, 'queued')
    ON CONFLICT(asset_id) DO NOTHING
  `);
  database.exec('BEGIN');
  try {
    for (const asset of assets) {
      upsertAsset.run(asset.id, asset.managedPath, asset.projectType, asset.projectName, asset.title,
        asset.sourceSite, asset.sourcePageTitle, asset.sourceUrl, asset.sourceImageUrl,
        asset.contentHash, asset.capturedAt, asset.byteSize);
      ensureAnalysis.run(asset.id);
    }
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

export function mergeAnalysisState(database, assets) {
  const analysisRows = database.prepare('SELECT * FROM ai_analyses').all();
  const byAsset = new Map(analysisRows.map((row) => [row.asset_id, row]));
  return assets.map((asset) => {
    const row = byAsset.get(asset.id);
    if (!row || row.status === 'queued') return asset;
    const status = row.status === 'completed' ? '已解析' : row.status === 'processing' ? '解析中' : '解析失败';
    return {
      ...asset,
      status,
      description: row.description,
      tags: JSON.parse(row.keywords_json || '[]'),
      analysis: {
        ...asset.analysis,
        stage: status === '已解析' ? 'AI 解析完成' : status === '解析中' ? 'AI 正在解析' : '自动重试已停止',
        error: row.error || '',
        retryCount: row.attempts,
      },
    };
  });
}

export function claimQueuedAnalysis(database, requestedAssetId = '') {
  const row = requestedAssetId
    ? database.prepare(`SELECT a.*, x.status AS analysis_status FROM assets a JOIN ai_analyses x ON x.asset_id=a.id WHERE a.id=? AND x.status IN ('queued','failed')`).get(requestedAssetId)
    : database.prepare(`SELECT a.*, x.status AS analysis_status FROM assets a JOIN ai_analyses x ON x.asset_id=a.id WHERE x.status='queued' ORDER BY a.captured_at ASC LIMIT 1`).get();
  if (!row) return null;
  const result = database.prepare(`UPDATE ai_analyses SET status='processing', error=NULL, attempts=attempts+1, updated_at=CURRENT_TIMESTAMP WHERE asset_id=? AND status IN ('queued','failed')`).run(row.id);
  return result.changes ? row : null;
}

export function completeAnalysis(database, assetId, { provider, model, description, keywords }) {
  database.prepare(`UPDATE ai_analyses SET status='completed', provider=?, model=?, description=?, keywords_json=?, error=NULL, updated_at=CURRENT_TIMESTAMP WHERE asset_id=?`)
    .run(provider, model, description, JSON.stringify(keywords), assetId);
}

export function failAnalysis(database, assetId, errorMessage) {
  database.prepare(`UPDATE ai_analyses SET status='failed', error=?, updated_at=CURRENT_TIMESTAMP WHERE asset_id=?`)
    .run(String(errorMessage).slice(0, 1000), assetId);
}

export function recoverInterruptedAnalyses(database) {
  return database.prepare(`UPDATE ai_analyses SET status='queued', error='上次解析被桌面端退出中断，已自动恢复', updated_at=CURRENT_TIMESTAMP WHERE status='processing'`).run().changes;
}

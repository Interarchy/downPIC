import { claimQueuedAnalysis, completeAnalysis, failAnalysis, openAssetDatabase } from './database.mjs';
import { QwenArchitectureAnalyzer } from './qwen-analyzer.mjs';
import { synchronizeLibrary } from './sync.mjs';

export function getAnalysisConfiguration(environment = process.env) {
  return {
    configured: Boolean(environment.DASHSCOPE_API_KEY),
    provider: 'qwen',
    model: environment.QWEN_MODEL || 'qwen3.7-plus',
    deploymentMode: 'developer-managed',
    autoAnalyze: environment.ARCHIVE_AI_AUTO_ANALYZE === '1',
  };
}

export async function processNextAnalysis({ syncOptions, environment = process.env, fetchImpl = globalThis.fetch, assetId = '' }) {
  const configuration = getAnalysisConfiguration(environment);
  if (!configuration.configured) return { processed: false, code: 'not_configured', message: '开发者 AI 服务尚未连接，普通用户无需配置 API Key' };

  await synchronizeLibrary(syncOptions);
  const database = openAssetDatabase(syncOptions.databasePath);
  const asset = claimQueuedAnalysis(database, assetId);
  database.close();
  if (!asset) return { processed: false, code: 'empty', message: '没有等待解析的图片' };

  try {
    const analyzer = new QwenArchitectureAnalyzer({
      apiKey: environment.DASHSCOPE_API_KEY,
      model: configuration.model,
      baseUrl: environment.DASHSCOPE_BASE_URL,
      fetchImpl,
    });
    const result = await analyzer.analyze({
      ...asset,
      managedPath: asset.managed_path,
      projectType: asset.project_type,
      projectName: asset.project_name,
    });
    const writeDatabase = openAssetDatabase(syncOptions.databasePath);
    completeAnalysis(writeDatabase, asset.id, { provider: 'qwen', model: configuration.model, ...result });
    writeDatabase.close();
    await synchronizeLibrary(syncOptions);
    return { processed: true, assetId: asset.id, status: 'completed', result };
  } catch (error) {
    const writeDatabase = openAssetDatabase(syncOptions.databasePath);
    failAnalysis(writeDatabase, asset.id, error.message);
    writeDatabase.close();
    await synchronizeLibrary(syncOptions);
    return { processed: true, assetId: asset.id, status: 'failed', message: error.message };
  }
}

export async function processAnalysisQueue({ syncOptions, environment = process.env, fetchImpl = globalThis.fetch, limit = 50 }) {
  const results = [];
  for (let index = 0; index < limit; index += 1) {
    const result = await processNextAnalysis({ syncOptions, environment, fetchImpl });
    if (!result.processed) break;
    results.push(result);
    // Authentication, quota and network failures should pause the queue instead of marking every image failed.
    if (result.status === 'failed') break;
  }
  return results;
}

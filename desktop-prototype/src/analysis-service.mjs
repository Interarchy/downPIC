export async function loadAnalysisServiceStatus(fetchImpl = globalThis.fetch) {
  try {
    const response = await fetchImpl('/api/analysis/status', { cache: 'no-store' });
    if (!response.ok) return { available: false, configured: false };
    return { available: true, ...await response.json() };
  } catch {
    return { available: false, configured: false };
  }
}

export async function runNextAnalysis(fetchImpl = globalThis.fetch) {
  const response = await fetchImpl('/api/analysis/run', { method: 'POST' });
  const result = await response.json().catch(() => ({ message: '本地分析服务没有返回结果' }));
  if (!response.ok) throw new Error(result.message || '无法启动图片解析');
  return result;
}

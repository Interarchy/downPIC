export const QUEUE_STATUSES = ['未解析', '解析中', '解析失败'];

export function isQueueAsset(asset) {
  return QUEUE_STATUSES.includes(asset.status);
}

export function getQueueSummary(assets) {
  const summary = {
    total: assets.length,
    completed: 0,
    outstanding: 0,
    waiting: 0,
    processing: 0,
    failed: 0,
  };

  for (const asset of assets) {
    if (asset.status === '已解析') summary.completed += 1;
    if (asset.status === '未解析') summary.waiting += 1;
    if (asset.status === '解析中') summary.processing += 1;
    if (asset.status === '解析失败') summary.failed += 1;
  }
  summary.outstanding = summary.waiting + summary.processing + summary.failed;
  return summary;
}

export function getQueueAssets(assets, filter = 'all') {
  return assets.filter((asset) => {
    if (!isQueueAsset(asset)) return false;
    if (filter === 'waiting') return asset.status === '未解析';
    if (filter === 'processing') return asset.status === '解析中';
    if (filter === 'failed') return asset.status === '解析失败';
    return true;
  });
}

export function retryFailedAsset(asset) {
  if (asset.status !== '解析失败') return { changed: false, asset };
  return {
    changed: true,
    asset: {
      ...asset,
      status: '未解析',
      analysis: {
        ...(asset.analysis ?? {}),
        stage: '已重新加入等待队列',
        error: '',
        retryCount: (asset.analysis?.retryCount ?? 0) + 1,
      },
    },
  };
}

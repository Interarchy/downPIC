export function toDesktopProjection(assets) {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: 'local-managed-library',
    assets: assets.map((asset, index) => ({
      ...asset,
      order: index + 1,
      ratio: 'standard',
      crop: '',
      source: `${asset.sourceSite} · ${new Date(asset.capturedAt).toLocaleString('zh-CN')}`,
    })),
  };
}

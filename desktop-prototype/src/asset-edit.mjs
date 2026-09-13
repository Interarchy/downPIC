export function normalizeAssetText(value) {
  return String(value ?? '').trim();
}

export function getExistingTagOptions(assets, currentTags = [], query = '') {
  const excluded = new Set(currentTags);
  const normalizedQuery = normalizeAssetText(query).toLocaleLowerCase('zh-CN');
  const counts = new Map();

  for (const asset of assets) {
    for (const tag of asset.tags ?? []) {
      const normalizedTag = normalizeAssetText(tag);
      if (!normalizedTag || excluded.has(normalizedTag)) continue;
      counts.set(normalizedTag, (counts.get(normalizedTag) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .filter(([tag]) => !normalizedQuery || tag.toLocaleLowerCase('zh-CN').includes(normalizedQuery))
    .sort(([tagA, countA], [tagB, countB]) => countB - countA || tagA.localeCompare(tagB, 'zh-CN'))
    .map(([value, count]) => ({ value, count }));
}

function withDerivedStatus(asset, updates) {
  const next = { ...asset, ...updates };
  return {
    ...next,
    status: normalizeAssetText(next.description) && next.tags.length ? '已解析' : '未解析',
  };
}

export function updateAssetDescription(asset, value) {
  const description = normalizeAssetText(value);
  if (!description) return { changed: false, asset, error: '图片描述不能为空' };
  if (description === asset.description) return { changed: false, asset, error: null };
  return { changed: true, asset: withDerivedStatus(asset, { description }), error: null };
}

export function addAssetTag(asset, value) {
  const tag = normalizeAssetText(value).replace(/\s+/g, ' ');
  if (!tag) return { changed: false, asset, error: '请输入关键词标签' };
  if (asset.tags.includes(tag)) return { changed: false, asset, error: '该关键词已存在' };
  return { changed: true, asset: withDerivedStatus(asset, { tags: [...asset.tags, tag] }), tag, error: null };
}

export function removeAssetTag(asset, value) {
  if (!asset.tags.includes(value)) return { changed: false, asset, error: '未找到该关键词' };
  return {
    changed: true,
    asset: withDerivedStatus(asset, { tags: asset.tags.filter((tag) => tag !== value) }),
    error: null,
  };
}

export function restoreAssetSnapshot(asset, snapshot) {
  return {
    ...asset,
    description: snapshot.description,
    tags: [...snapshot.tags],
    status: snapshot.status,
  };
}

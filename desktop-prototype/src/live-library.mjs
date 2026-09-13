const INDEX_URLS = ['/api/assets', '/spikes/phase0-capture/runtime/assets-index.json'];

export async function loadLiveLibrary(fetchImpl = globalThis.fetch) {
  for (const url of INDEX_URLS) {
    try {
      const response = await fetchImpl(url, { cache: 'no-store' });
      if (!response.ok) continue;
      const payload = await response.json();
      if (payload?.schemaVersion !== 1 || !Array.isArray(payload.assets)) continue;
      return payload.assets.filter((asset) => asset.id && asset.webPath).map((asset) => ({
        ...asset,
        tags: Array.isArray(asset.tags) ? asset.tags : [],
        description: asset.description || '',
        status: asset.status || '未解析',
        analysis: asset.analysis ?? { stage: '等待 AI 解析', retryCount: 0 },
      }));
    } catch {
      // The static prototype server has no API; try its generated JSON projection.
    }
  }
  return [];
}

export function projectTreeFromAssets(assets) {
  const groups = new Map();
  for (const asset of assets) {
    const group = groups.get(asset.projectType) ?? { type: asset.projectType, count: 0, projects: new Set() };
    group.count += 1;
    group.projects.add(asset.projectName);
    groups.set(asset.projectType, group);
  }
  return [...groups.values()].map((group) => ({
    type: group.type,
    count: group.count,
    projects: [...group.projects],
  }));
}

export function mergeUnknownTagsIntoGroups(groups, assets) {
  const nextGroups = groups.map((group) => ({ ...group, tags: [...group.tags] }));
  let otherGroup = nextGroups.find((group) => group.label === '其他');
  if (!otherGroup) {
    otherGroup = { label: '其他', tags: [] };
    nextGroups.push(otherGroup);
  }
  const knownTags = new Set(nextGroups.flatMap((group) => group.tags));
  for (const tag of assets.flatMap((asset) => asset.tags ?? [])) {
    if (!knownTags.has(tag)) {
      otherGroup.tags.push(tag);
      knownTags.add(tag);
    }
  }
  return nextGroups;
}

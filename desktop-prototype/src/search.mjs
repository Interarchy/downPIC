const SYNONYMS = {
  天光: '自然采光',
  柔和天光: '自然采光',
  木结构: '木构',
  混凝土: '清水混凝土',
  冥想: '静谧',
  阅读: '阅览空间',
  文化空间: '文化建筑',
};

export function normalizeText(value) {
  return String(value ?? '').trim().toLocaleLowerCase('zh-CN');
}

export function startNaturalLanguageSearch(query, {
  selectedProject = '',
  selectedTags = [],
} = {}) {
  const normalizedQuery = String(query ?? '').trim();
  if (!normalizedQuery) {
    return { query: '', selectedProject, selectedTags: [...selectedTags], clearedFilters: false };
  }
  return {
    query: normalizedQuery,
    selectedProject: '',
    selectedTags: [],
    clearedFilters: Boolean(selectedProject || selectedTags.length),
  };
}

function vocabularyFrom(assets) {
  return [...new Set(assets.flatMap((asset) => [
    ...asset.tags,
    asset.projectType,
    asset.projectName,
    ...Object.keys(SYNONYMS),
  ]))].sort((a, b) => b.length - a.length);
}

export function extractQueryTerms(query, assets) {
  const normalized = normalizeText(query);
  if (!normalized) return [];

  const matched = vocabularyFrom(assets)
    .filter((term) => normalized.includes(normalizeText(term)))
    .map((term) => SYNONYMS[term] ?? term);

  return [...new Set(matched)];
}

function extractTermPairs(query, assets) {
  const normalized = normalizeText(query);
  return vocabularyFrom(assets)
    .filter((term) => normalized.includes(normalizeText(term)))
    .map((term) => ({ raw: term, canonical: SYNONYMS[term] ?? term }))
    .filter((pair, index, pairs) => pairs.findIndex(({ canonical }) => canonical === pair.canonical) === index);
}

export function searchAssets(query, assets, {
  projectTypes = [],
  tags = [],
} = {}) {
  const pairs = extractTermPairs(query, assets);
  const terms = pairs.map(({ canonical }) => canonical);
  const normalizedQuery = normalizeText(query);

  return assets
    .filter((asset) => projectTypes.length === 0 || projectTypes.includes(asset.projectType))
    .filter((asset) => tags.every((tag) => asset.tags.includes(tag)))
    .map((asset) => {
      const searchable = normalizeText([
        asset.title,
        asset.projectType,
        asset.projectName,
        asset.description,
        ...asset.tags,
      ].join(' '));
      let score = 0;
      const reasons = [];

      for (const term of terms) {
        if (asset.tags.includes(term)) {
          score += 8;
          reasons.push(`关键词：${term}`);
        } else if (normalizeText(asset.description).includes(normalizeText(term))) {
          score += 5;
          reasons.push(`描述：${term}`);
        } else if (searchable.includes(normalizeText(term))) {
          score += 3;
          reasons.push(`项目：${term}`);
        }
      }

      for (const { raw, canonical } of pairs) {
        if (raw !== canonical && normalizeText(asset.description).includes(normalizeText(raw))) {
          score += 4;
          reasons.push(`描述：${raw}`);
        }
      }

      if (normalizedQuery && searchable.includes(normalizedQuery)) {
        score += 10;
        reasons.unshift('完整描述匹配');
      }

      return { asset, score, reasons: [...new Set(reasons)] };
    })
    .filter((result) => !normalizedQuery || result.score > 0)
    .sort((a, b) => b.score - a.score || a.asset.order - b.asset.order);
}

export function getSuggestions(query, history, assets, limit = 5) {
  const normalized = normalizeText(query);
  const candidates = [...history, ...vocabularyFrom(assets)];
  return [...new Set(candidates)]
    .filter((item) => !normalized || normalizeText(item).includes(normalized))
    .slice(0, limit);
}

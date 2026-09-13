export function normalizeKeyword(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

export function validateKeyword(value, existingKeywords = []) {
  const normalized = normalizeKeyword(value);
  if (!normalized) return { valid: false, value: '', error: '请输入关键词标签' };

  const duplicated = existingKeywords.some(
    (keyword) => normalizeKeyword(keyword).toLocaleLowerCase('zh-CN') === normalized.toLocaleLowerCase('zh-CN'),
  );
  if (duplicated) return { valid: false, value: normalized, error: '该关键词标签已存在' };

  return { valid: true, value: normalized, error: '' };
}

export function moveKeyword(groups, keyword, sourceLabel, targetLabel) {
  if (sourceLabel === targetLabel) return { moved: false, groups, error: '标签已在该分类中' };

  const source = groups.find(({ label }) => label === sourceLabel);
  const target = groups.find(({ label }) => label === targetLabel);
  if (!source || !target || !source.tags.includes(keyword)) {
    return { moved: false, groups, error: '无法找到标签或目标分类' };
  }
  if (target.tags.includes(keyword)) return { moved: false, groups, error: '目标分类已包含该标签' };

  return {
    moved: true,
    error: '',
    groups: groups.map((group) => {
      if (group.label === sourceLabel) return { ...group, tags: group.tags.filter((tag) => tag !== keyword) };
      if (group.label === targetLabel) return { ...group, tags: [...group.tags, keyword] };
      return { ...group, tags: [...group.tags] };
    }),
  };
}

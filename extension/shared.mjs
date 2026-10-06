export const PRESET_TYPES = ['文化建筑', '教育建筑', '办公建筑', '社区建筑'];

export const STORAGE = {
  captureEnabled: 'capture_enabled',
  projectType: 'default_project_type',
  customTypes: 'custom_project_types',
  importedAssetsV4: 'importedAssetsV4',
  systemViewerExportsV4: 'systemViewerExportsV4',
  hiddenProjectTypesV4: 'hiddenProjectTypesV4',
  projectTypeOrderV4: 'projectTypeOrderV4',
  projectTypeAliasesV4: 'projectTypeAliasesV4',
  captureHiddenV4: 'captureHiddenV4',
  requestedStageV4: 'requestedStageV4',
  privacyAccepted: 'privacy_accepted_v1',
  assetAIConsent: 'asset_ai_consent_v1',
  assetVectorConsent: 'asset_vector_consent_v1',
  installationId: 'anonymous_installation_id_v1',
  sessionToken: 'anonymous_session_token_v1',
  sessionExpiresAt: 'anonymous_session_expires_at_v1',
  selection: 'selected_image',
  result: 'analysis_result',
  lastDownload: 'last_download',
  intentDraftsV2: 'intentDraftsV2',
  activeIntentDraftIdV2: 'activeIntentDraftIdV2',
  promptSchemesV3: 'intentDraftsV2',
  activeSchemeIdV3: 'activeIntentDraftIdV2',
  workingDraftV3: 'workingDraftV3',
  generatedResultV3: 'generatedResultV3',
  evaluationSessionV3: 'evaluationSessionV3',
  builderV3: 'archbuddyBuilderV3',
  libraryHandoffV4: 'libraryHandoffV4',
  capturePreviewsV4: 'capturePreviewsV4',
  captureCatalogV4: 'captureCatalogV4',
  descriptionProgressV4: 'descriptionProgressV4',
  promptGroupsV4: 'promptGroupsV4',
  librarySearchHistoryV4: 'librarySearchHistoryV4',
  captureProjectViewV4: 'captureProjectViewV4',
  analyticsConsent: 'analytics_consent_v1',
  analyticsQueue: 'analytics_queue_v2',
  analyticsTasks: 'analytics_tasks_v2',
  analyticsDownloads: 'analytics_downloads_v2',
};

export const PRINCIPLE_TITLE = '整体生成准则';
export const PRINCIPLE = '保持待修改原图的视角与构图不变，保留原有画幅比例、透视关系、主体位置及空间布局。参考以下视觉特征进行效果表达，输出四千像素级（4K）高分辨率图像，呈现高品质建筑效果图效果：材质细腻可信、光影自然协调、画面清晰，避免明显失真、噪点与过度锐化。';
export const SECTION_TITLES = ['核心视觉特征', '场景与主体', '视角与构图', '色彩与明暗', '光照与氛围', '材料与表面', '环境与配景', '图像表现'];

export const INTENT_MODULES = Object.freeze([
  ['reference_summary', '参考摘要'],
  ['scene_subject', '场景与主体'],
  ['space_massing', '空间与体量'],
  ['facade_elements', '立面与构件'],
  ['materials_surfaces', '材料与表面'],
  ['landscape_context', '景观与配景'],
  ['view_composition', '视角与构图'],
  ['color_tone', '色彩与明暗'],
  ['lighting_atmosphere', '光线与氛围'],
  ['image_expression', '图像表现'],
  ['negative_constraints', '负向约束'],
].map(([key, title]) => Object.freeze({ key, title })));

export const MODULE_BASIS = Object.freeze(['observed', 'inferred', 'uncertain']);
export const MODULE_CONFIDENCE = Object.freeze(['high', 'medium', 'low', 'unknown']);
export const MODULE_REVIEW_STATES = Object.freeze(['suggested', 'confirmed', 'modified']);

const MODULE_BY_KEY = new Map(INTENT_MODULES.map(item => [item.key, item]));
const BASIS_SET = new Set(MODULE_BASIS);
const CONFIDENCE_SET = new Set(MODULE_CONFIDENCE);
const REVIEW_STATE_SET = new Set(MODULE_REVIEW_STATES);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VERSION_ORIGINS = new Set(['legacy-baseline', 'initial-copy', 'revision-copy', 'initial-confirm', 'revision-confirm']);
const SOURCE_STATES = new Set(['available', 'missing', 'save-failed']);
const EVALUATION_STATES = new Set(['idle', 'confirming', 'running', 'succeeded', 'failed']);
const EVALUATION_ERRORS = new Set(['invalid-input', 'network', 'timeout', 'unavailable', 'quota', 'parse']);

export const EVALUATION_MODULE_KEYS = Object.freeze(INTENT_MODULES
  .map(module => module.key)
  .filter(key => key !== 'reference_summary' && key !== 'negative_constraints'));

export function normalizeLibraryTags(values) {
  const seen = new Set();
  return (Array.isArray(values) ? values : [])
    .map(value => String(value ?? '').replaceAll('\u3000', ' ').trim().replace(/\s+/g, ' ').slice(0, 24))
    .filter(value => {
      const key = value.toLocaleLowerCase();
      if (!value || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 5);
}
export function normalizeProjectType(value) {
  return String(value ?? '').replaceAll('\u3000', ' ').trim().replace(/\s+/g, ' ');
}

export function sanitizePathSegment(value, fallback = '未命名项目') {
  const normalized = String(value ?? '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^\.+/g, '')
    .replace(/\.+$/g, '')
    .trim();
  const safe = normalized && normalized !== '.' && normalized !== '..' ? normalized : fallback;
  return safe.slice(0, 80);
}

export function extensionFromUrl(url, mimeType = '') {
  const mime = String(mimeType).toLowerCase();
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/gif') return 'gif';
  if (mime === 'image/jpeg') return 'jpg';
  try {
    const candidate = new URL(url).pathname.split('.').pop()?.toLowerCase();
    if (['png', 'webp', 'gif', 'jpg', 'jpeg'].includes(candidate)) return candidate === 'jpeg' ? 'jpg' : candidate;
  } catch {}
  return 'jpg';
}

export function dataUrlParts(dataUrl) {
  const match = String(dataUrl ?? '').match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error('图片数据格式无效');
  return { mimeType: match[1], base64: match[2] };
}

export function parseAnalysisSections(text, minimum = 4) {
  const cleaned = String(text ?? '').replace(/```[a-zA-Z]*\s*/g, '');
  const matches = [...cleaned.matchAll(/【([^】]{1,20})】/g)];
  const collected = new Map();
  for (let index = 0; index < matches.length; index += 1) {
    const start = matches[index].index + matches[index][0].length;
    const end = matches[index + 1]?.index ?? cleaned.length;
    const title = matches[index][1].trim();
    const body = cleaned.slice(start, end).trim();
    if (SECTION_TITLES.includes(title) && body && !collected.has(title)) collected.set(title, body);
  }
  const sections = SECTION_TITLES.filter(title => collected.has(title))
    .map(title => ({ title, text: collected.get(title) }));
  if (sections.length < minimum) throw new Error(`模型只返回了 ${sections.length} 个有效分项，请重试`);
  return [{ title: PRINCIPLE_TITLE, text: PRINCIPLE }, ...sections];
}

export function serializeSections(sections) {
  return (sections ?? []).map(section => `【${section.title}】\n${section.text}`).join('\n\n');
}

function cleanText(value, maxLength = 4000) {
  return String(value ?? '').replaceAll('\u0000', '').trim().slice(0, maxLength);
}

function safeReferenceName(value) {
  const name = cleanText(value, 80);
  if (!name || /^(?:https?:|data:|blob:)/i.test(name)) return '参考图';
  return name;
}

export function normalizeIntentModule(input, definition = MODULE_BY_KEY.get(input?.key)) {
  if (!definition) return null;
  const value = cleanText(input?.value);
  const basis = BASIS_SET.has(input?.basis) ? input.basis : 'uncertain';
  const confidence = CONFIDENCE_SET.has(input?.confidence) ? input.confidence : 'unknown';
  const reviewState = REVIEW_STATE_SET.has(input?.reviewState) ? input.reviewState : 'suggested';
  const sourceHint = input?.sourceHint && typeof input.sourceHint === 'object'
    ? {
      analysisId: cleanText(input.sourceHint.analysisId, 80) || null,
      displayName: safeReferenceName(input.sourceHint.displayName),
    }
    : null;
  return {
    key: definition.key,
    title: definition.title,
    value,
    basis,
    evidence: cleanText(input?.evidence, 1000),
    confidence,
    enabled: input?.enabled !== false,
    locked: input?.locked === true,
    changed: input?.changed === true,
    reviewState,
    source: input?.source === 'user' ? 'user' : 'ai',
    sourceHint,
  };
}

export function normalizeIntentModules(values = []) {
  const byKey = new Map((Array.isArray(values) ? values : []).map(item => [item?.key, item]));
  return INTENT_MODULES.map(definition => normalizeIntentModule(byKey.get(definition.key) ?? {}, definition));
}

export function createEmptyIntentModules() {
  return INTENT_MODULES.map(definition => normalizeIntentModule({
    key: definition.key,
    value: '',
    enabled: false,
  }, definition));
}

export function addCandidateToPlan(modules, candidate, sourceHint) {
  const incoming = normalizeIntentModule(candidate);
  if (!incoming?.value) throw new Error('这项候选意图没有可加入的内容');
  return normalizeIntentModules(modules).map(module => module.key === incoming.key
    ? {
      ...incoming,
      enabled: true,
      locked: false,
      changed: false,
      reviewState: 'suggested',
      source: 'ai',
      sourceHint: {
        analysisId: cleanText(sourceHint?.analysisId, 80) || null,
        displayName: safeReferenceName(sourceHint?.displayName),
      },
    }
    : module);
}

export function intentModuleStatus(module) {
  if (!module?.enabled) return 'disabled';
  if (module.locked) return 'locked';
  return REVIEW_STATE_SET.has(module.reviewState) ? module.reviewState : 'suggested';
}

export function editIntentModule(modules, key, value) {
  return normalizeIntentModules(modules).map(module => module.key === key
    ? {
      ...module,
      value: cleanText(value),
      basis: 'uncertain',
      evidence: '',
      confidence: 'unknown',
      reviewState: 'modified',
      source: 'user',
      changed: false,
    }
    : module);
}

export function setIntentModuleEnabled(modules, key, enabled) {
  return normalizeIntentModules(modules).map(module => module.key === key
    ? { ...module, enabled: Boolean(enabled), changed: false }
    : module);
}

export function setIntentModuleLocked(modules, key, locked) {
  return normalizeIntentModules(modules).map(module => module.key === key
    ? { ...module, locked: Boolean(locked) }
    : module);
}

export function confirmIntentModules(modules) {
  return normalizeIntentModules(modules).map(module => module.enabled && module.source === 'ai' && module.reviewState !== 'modified'
    ? { ...module, reviewState: 'confirmed', changed: false }
    : module);
}

export function mergeIntentModules(current, suggestions) {
  const existing = new Map(normalizeIntentModules(current).map(module => [module.key, module]));
  const incoming = new Map(normalizeIntentModules(suggestions).map(module => [module.key, module]));
  return INTENT_MODULES.map(({ key }) => {
    const previous = existing.get(key);
    if (previous?.locked || previous?.reviewState === 'modified' || previous?.enabled === false) return previous;
    const next = incoming.get(key);
    if (!next) return previous;
    const changed = ['value', 'basis', 'evidence', 'confidence'].some(field => previous?.[field] !== next[field]);
    return {
      ...next,
      enabled: previous?.enabled ?? true,
      locked: false,
      source: 'ai',
      reviewState: 'suggested',
      changed,
    };
  });
}

export function compileIntentPrompt(modules, principleText = PRINCIPLE) {
  const enabled = normalizeIntentModules(modules).filter(module => module.enabled && module.value);
  const sections = enabled.map(module => `【${module.title}】\n${module.value}`);
  const principle = cleanText(principleText);
  return [...(principle ? [`【${PRINCIPLE_TITLE}】\n${principle}`] : []), ...sections].join('\n\n');
}

export function normalizeIntentDraft(input = {}, now = new Date().toISOString()) {
  const createdAt = cleanText(input.createdAt, 40) || now;
  const updatedAt = cleanText(input.updatedAt, 40) || now;
  const hint = input.referenceHint && typeof input.referenceHint === 'object'
    ? {
      sourceType: ['page-image', 'screenshot', 'paste', 'file'].includes(input.referenceHint.sourceType)
        ? input.referenceHint.sourceType
        : 'file',
      displayName: safeReferenceName(input.referenceHint.displayName),
    }
    : null;
  return {
    schemaVersion: 2,
    draftId: cleanText(input.draftId, 80) || crypto.randomUUID(),
    name: safeReferenceName(input.name) || '未命名意图草稿',
    createdAt,
    updatedAt,
    lastAnalyzedAt: cleanText(input.lastAnalyzedAt, 40) || null,
    modules: normalizeIntentModules(input.modules),
    overallConfirmedAt: cleanText(input.overallConfirmedAt, 40) || null,
    referenceSelectionId: cleanText(input.referenceSelectionId, 80) || null,
    referenceHint: hint,
  };
}

function stableUuid(value, fallback = '') {
  const normalized = cleanText(value, 80);
  if (UUID_PATTERN.test(normalized)) return normalized;
  if (UUID_PATTERN.test(fallback)) return fallback;
  return crypto.randomUUID();
}

function normalizeSourceReference(input = {}, schemeId) {
  const sourceReferenceId = stableUuid(input.sourceReferenceId);
  return {
    sourceReferenceId,
    schemeId,
    analysisId: cleanText(input.analysisId, 80) || null,
    selectionId: cleanText(input.selectionId, 80) || null,
    displayName: safeReferenceName(input.displayName),
    tags: normalizeLibraryTags(input.tags),
    sourceType: ['page-image', 'screenshot', 'paste', 'file'].includes(input.sourceType) ? input.sourceType : 'file',
    mimeType: ['image/png', 'image/jpeg', 'image/webp'].includes(input.mimeType) ? input.mimeType : null,
    byteSize: Number.isInteger(Number(input.byteSize)) ? Number(input.byteSize) : 0,
    assetState: SOURCE_STATES.has(input.assetState) ? input.assetState : 'missing',
    createdAt: cleanText(input.createdAt, 40) || new Date().toISOString(),
    capturedAt: cleanText(input.capturedAt, 40) || null,
    failureCode: ['INVALID_IMAGE', 'QUOTA_EXCEEDED', 'NOT_FOUND', 'OWNERSHIP_MISMATCH', 'TRANSACTION_FAILED'].includes(input.failureCode)
      ? input.failureCode : null,
  };
}

export function normalizePromptVersion(input = {}, schemeId, fallbackNumber = 1) {
  const modulesSnapshot = normalizeIntentModules(input.modulesSnapshot ?? input.modules);
  const versionNumber = Math.max(1, Number.isInteger(Number(input.versionNumber))
    ? Number(input.versionNumber)
    : fallbackNumber);
  const changeTypes = new Set(['suggestion-applied', 'direct-edit', 'lock-changed']);
  const summaryItems = Array.isArray(input.changeSummary) ? input.changeSummary : [];
  return {
    versionId: stableUuid(input.versionId),
    schemeId,
    versionNumber,
    origin: VERSION_ORIGINS.has(input.origin) ? input.origin : 'initial-copy',
    createdAt: cleanText(input.createdAt, 40) || new Date().toISOString(),
    modulesSnapshot,
    principleText: cleanText(input.principleText ?? PRINCIPLE),
    compiledPrompt: cleanText(input.compiledPrompt, 60_000) || compileIntentPrompt(modulesSnapshot, input.principleText ?? PRINCIPLE),
    sourceReferenceIds: [...new Set((Array.isArray(input.sourceReferenceIds) ? input.sourceReferenceIds : [])
      .map(value => cleanText(value, 80)).filter(value => UUID_PATTERN.test(value)))],
    baselineVersionId: UUID_PATTERN.test(String(input.baselineVersionId || '')) ? input.baselineVersionId : null,
    evaluationId: UUID_PATTERN.test(String(input.evaluationId || '')) ? input.evaluationId : null,
    generatedResult: UUID_PATTERN.test(String(input.generatedResult?.generatedResultId || ''))
      ? {
        generatedResultId: input.generatedResult.generatedResultId,
        displayName: cleanText(input.generatedResult.displayName, 120) || '生成效果图',
        mimeType: ['image/png', 'image/jpeg', 'image/webp'].includes(input.generatedResult.mimeType)
          ? input.generatedResult.mimeType : 'image/png',
        createdAt: cleanText(input.generatedResult.createdAt, 40) || new Date().toISOString(),
      } : null,
    changeSummary: summaryItems.map(item => ({
      moduleKey: MODULE_BY_KEY.has(item?.moduleKey) ? item.moduleKey : null,
      changeType: changeTypes.has(item?.changeType) ? item.changeType : null,
    })).filter(item => item.moduleKey && item.changeType),
    readOnly: true,
  };
}

export function normalizePromptScheme(input = {}, now = new Date().toISOString()) {
  const legacyId = cleanText(input.schemeId ?? input.draftId, 80);
  const schemeId = stableUuid(legacyId);
  const rawVersions = Array.isArray(input.versions) ? input.versions : [];
  const byNumber = new Map();
  rawVersions.forEach((version, index) => {
    const normalized = normalizePromptVersion(version, schemeId, index + 1);
    byNumber.set(normalized.versionNumber, normalized);
  });
  const versions = [...byNumber.values()]
    .sort((left, right) => left.versionNumber - right.versionNumber);
  const current = versions.at(-1) ?? null;
  const modules = current ? normalizeIntentModules(current.modulesSnapshot) : normalizeIntentModules(input.modules);
  const references = (Array.isArray(input.sourceReferences) ? input.sourceReferences : [])
    .map(reference => normalizeSourceReference(reference, schemeId));
  return {
    schemaVersion: 3,
    schemeId,
    draftId: schemeId,
    name: cleanText(input.name, 80) || '未命名提示词方案',
    projectName: cleanText(input.projectName, 80),
    category: cleanText(input.category, 40),
    createdAt: cleanText(input.createdAt, 40) || now,
    updatedAt: cleanText(input.updatedAt, 40) || now,
    lastAnalyzedAt: cleanText(input.lastAnalyzedAt, 40) || null,
    modules,
    overallConfirmedAt: cleanText(input.overallConfirmedAt, 40) || null,
    referenceSelectionId: cleanText(input.referenceSelectionId, 80) || null,
    referenceHint: input.referenceHint && typeof input.referenceHint === 'object'
      ? {
        sourceType: ['page-image', 'screenshot', 'paste', 'file'].includes(input.referenceHint.sourceType)
          ? input.referenceHint.sourceType : 'file',
        displayName: safeReferenceName(input.referenceHint.displayName),
      }
      : null,
    sourceReferences: references,
    versions,
    currentVersionId: current?.versionId ?? null,
    principleText: current?.principleText ?? PRINCIPLE,
    currentPrompt: current?.compiledPrompt ?? compileIntentPrompt(modules),
    migration: input.migration && typeof input.migration === 'object'
      ? {
        fromSchemaVersion: Number(input.migration.fromSchemaVersion) || 2,
        migratedAt: cleanText(input.migration.migratedAt, 40) || now,
      }
      : null,
  };
}

export function createWorkingDraft(scheme, baseVersion = null) {
  const normalized = normalizePromptScheme(scheme);
  const version = baseVersion ?? normalized.versions.find(item => item.versionId === normalized.currentVersionId) ?? null;
  const modules = normalizeIntentModules(version?.modulesSnapshot ?? normalized.modules)
    .map(module => ({ ...module, sourceHint: module.sourceHint ? { ...module.sourceHint } : null }));
  return {
    schemeId: normalized.schemeId,
    baseVersionId: version?.versionId ?? null,
    principleText: version?.principleText ?? PRINCIPLE,
    modules,
    dirtyModuleKeys: [],
    selectedSuggestionIds: [],
    suggestions: [],
    updatedAt: new Date().toISOString(),
  };
}

export function normalizeWorkingDraft(input = {}, scheme) {
  const normalizedScheme = normalizePromptScheme(scheme);
  const base = normalizedScheme.versions.find(item => item.versionId === input.baseVersionId)
    ?? normalizedScheme.versions.at(-1)
    ?? null;
  const baseline = normalizeIntentModules(base?.modulesSnapshot ?? normalizedScheme.modules);
  const modules = normalizeIntentModules(input.modules ?? baseline);
  const dirtyModuleKeys = modules.filter((module, index) => {
    const before = baseline[index];
    return ['value', 'enabled', 'locked'].some(field => module[field] !== before[field]);
  }).map(module => module.key);
  const suggestions = (Array.isArray(input.suggestions) ? input.suggestions : []).map(item => {
    const original = baseline.find(module => module.key === item?.moduleKey);
    const proposedValue = cleanText(item?.proposedValue);
    if (!original || !proposedValue || proposedValue === original.value) return null;
    return {
      suggestionId: stableUuid(item.suggestionId),
      evaluationId: UUID_PATTERN.test(String(item.evaluationId || '')) ? item.evaluationId : null,
      moduleKey: original.key,
      originalValue: original.value,
      proposedValue,
      selected: item.selected === true,
      sourceFindingStatus: ['compliant', 'partial', 'deviation', 'unknown'].includes(item.sourceFindingStatus)
        ? item.sourceFindingStatus : 'unknown',
    };
  }).filter(Boolean);
  return {
    schemeId: normalizedScheme.schemeId,
    baseVersionId: base?.versionId ?? null,
    principleText: cleanText(input.principleText ?? base?.principleText ?? PRINCIPLE),
    modules,
    dirtyModuleKeys,
    suggestions,
    selectedSuggestionIds: suggestions.filter(item => item.selected).map(item => item.suggestionId),
    updatedAt: cleanText(input.updatedAt, 40) || new Date().toISOString(),
  };
}

export function revisionPreview(workingDraft, scheme) {
  const normalized = normalizeWorkingDraft(workingDraft, scheme);
  const parent = normalizePromptScheme(scheme);
  const base = parent.versions.find(item => item.versionId === normalized.baseVersionId);
  const baseline = normalizeIntentModules(base?.modulesSnapshot ?? parent.modules);
  return normalized.modules.map((module, index) => {
    const before = baseline[index];
    let blockedReason = null;
    if (before.locked && module.value !== before.value) blockedReason = '模块已锁定';
    else if (!module.value.trim()) blockedReason = '内容不能为空';
    else if (module.value === before.value && module.enabled === before.enabled && module.locked === before.locked) blockedReason = '没有变化';
    return { moduleKey: module.key, before: before.value, after: module.value, blockedReason };
  });
}

export function normalizeGeneratedResult(input = {}) {
  const byteSize = Number(input.byteSize);
  if (!UUID_PATTERN.test(String(input.generatedResultId || ''))
      || !['image/png', 'image/jpeg', 'image/webp'].includes(input.mimeType)
      || !Number.isInteger(byteSize) || byteSize < 1 || byteSize > 10 * 1024 * 1024) return null;
  return {
    generatedResultId: input.generatedResultId,
    displayName: safeReferenceName(input.displayName),
    mimeType: input.mimeType,
    byteSize,
    imagePayload: cleanText(input.imagePayload, 15_000_000),
    selectedAt: cleanText(input.selectedAt, 40) || new Date().toISOString(),
  };
}

export function normalizeEvaluationSession(input = {}) {
  return {
    requestId: UUID_PATTERN.test(String(input.requestId || '')) ? input.requestId : null,
    evaluationId: UUID_PATTERN.test(String(input.evaluationId || '')) ? input.evaluationId : null,
    schemeId: UUID_PATTERN.test(String(input.schemeId || '')) ? input.schemeId : null,
    baseVersionId: UUID_PATTERN.test(String(input.baseVersionId || '')) ? input.baseVersionId : null,
    generatedResultId: UUID_PATTERN.test(String(input.generatedResultId || '')) ? input.generatedResultId : null,
    status: EVALUATION_STATES.has(input.status) ? input.status : 'idle',
    errorCategory: EVALUATION_ERRORS.has(input.errorCategory) ? input.errorCategory : null,
    errorMessage: cleanText(input.errorMessage, 500) || null,
    result: input.result && typeof input.result === 'object' ? structuredClone(input.result) : null,
    consentConfirmed: input.consentConfirmed === true,
    updatedAt: cleanText(input.updatedAt, 40) || new Date().toISOString(),
  };
}

export function orderedProjectTypes(custom = [], hidden = [], order = []) {
  const available = [...new Set([...PRESET_TYPES, ...custom])].filter(type => !hidden.includes(type));
  return [...new Set([...order.filter(type => available.includes(type)), ...available])];
}
export function resolveProjectType(type, aliases = {}) {
  const visited = new Set();
  while (Object.hasOwn(aliases, type) && !visited.has(type)) {
    visited.add(type);
    type = aliases[type];
  }
  return type;
}

export const PRESET_TYPES = ['文化建筑', '教育建筑', '办公建筑', '社区建筑'];

export const STORAGE = {
  captureEnabled: 'capture_enabled',
  projectType: 'default_project_type',
  customTypes: 'custom_project_types',
  privacyAccepted: 'privacy_accepted_v1',
  installationId: 'anonymous_installation_id_v1',
  sessionToken: 'anonymous_session_token_v1',
  sessionExpiresAt: 'anonymous_session_expires_at_v1',
  selection: 'selected_image',
  result: 'analysis_result',
  lastDownload: 'last_download',
  intentDraftsV2: 'intentDraftsV2',
  activeIntentDraftIdV2: 'activeIntentDraftIdV2',
  analyticsConsent: 'analytics_consent_v1',
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

export function compileIntentPrompt(modules) {
  const enabled = normalizeIntentModules(modules).filter(module => module.enabled && module.value);
  const sections = enabled.map(module => `【${module.title}】\n${module.value}`);
  return [`【${PRINCIPLE_TITLE}】\n${PRINCIPLE}`, ...sections].join('\n\n');
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

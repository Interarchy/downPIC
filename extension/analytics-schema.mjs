// 前后端共同使用的固定白名单；不能接收任意属性或用户文本。
export const ANALYTICS_POLICY_VERSION = '2026-10-07';
export const ANALYTICS_SCHEMA_VERSION = 2;
export const ANALYTICS_BATCH_SIZE = 25;
export const ANALYTICS_QUEUE_AGE_MS = 24 * 60 * 60 * 1000;
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const names = new Set(['session_started', 'image_saved', 'task_started', 'task_result', 'prompt_confirmed', 'prompt_copied', 'material_reused', 'search_started', 'search_result']);
const legacyNames = new Set(['analysis_started', 'analysis_succeeded', 'analysis_failed', 'module_edited', 'module_disabled', 'prompt_confirmed', 'prompt_copied']);
const outcomes = new Set(['success', 'failed', 'cancelled', 'invalid_input', 'network_unavailable', 'timeout', 'service_unavailable', 'quota_exceeded', 'format_invalid', 'version_mismatch', 'not_configured', 'unknown_error']);
const fields = new Set(['schemaVersion', 'eventId', 'eventName', 'clientOccurredAt', 'policyVersion', 'consentId', 'extensionVersion', 'entry', 'scope', 'taskType', 'taskId', 'requestId', 'flow', 'source', 'materialType', 'outcome', 'errorCategory', 'durationMs', 'count']);
const enums = {
  entry: ['sidepanel', 'library', 'capture'], scope: ['task', 'ai'],
  taskType: ['prompt_build', 'evaluation', 'reference_analysis', 'description', 'embedding_query', 'embedding_index', 'semantic_search'],
  flow: ['initial', 'optimization', 'library'], source: ['download', 'import'], materialType: ['image', 'prompt'],
};
export function analyticsConsentValid(consent) {
  return consent?.enabled === true && consent.policyVersion === ANALYTICS_POLICY_VERSION && uuid(consent.consentId);
}
export function validateAnalyticsEvent(input, { now = Date.now(), allowLegacy = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid analytics event');
  const legacy = input.schemaVersion === undefined && allowLegacy;
  const allowed = legacy ? new Set(['eventId', 'eventName', 'outcome', 'clientOccurredAt']) : fields;
  if (Object.keys(input).some(key => !allowed.has(key)) || !uuid(input.eventId)
      || !(legacy ? legacyNames : names).has(input.eventName)
      || typeof input.clientOccurredAt !== 'string' || input.clientOccurredAt.length > 40
      || !Number.isFinite(Date.parse(input.clientOccurredAt))) throw new Error('Invalid analytics fields');
  if (input.outcome !== undefined && !outcomes.has(input.outcome)) throw new Error('Invalid analytics outcome');
  if (legacy) return { ...input };
  if (input.schemaVersion !== ANALYTICS_SCHEMA_VERSION || input.policyVersion !== ANALYTICS_POLICY_VERSION
      || !uuid(input.consentId) || !/^\d+\.\d+\.\d+(\.\d+)?$/.test(input.extensionVersion || '')
      || !enums.entry.includes(input.entry)) throw new Error('Invalid analytics version');
  const timestamp = Date.parse(input.clientOccurredAt);
  if (timestamp < now - ANALYTICS_QUEUE_AGE_MS || timestamp > now + 5 * 60 * 1000) throw new Error('Invalid analytics time');
  for (const [field, values] of Object.entries(enums)) {
    if (input[field] !== undefined && !values.includes(input[field])) throw new Error('Invalid analytics enum');
  }
  for (const field of ['taskId', 'requestId']) if (input[field] !== undefined && !uuid(input[field])) throw new Error('Invalid analytics ID');
  if (input.errorCategory !== undefined && !outcomes.has(input.errorCategory)) throw new Error('Invalid analytics category');
  if (input.durationMs !== undefined && (!Number.isSafeInteger(input.durationMs) || input.durationMs < 0 || input.durationMs > 3_600_000)) throw new Error('Invalid analytics duration');
  if (input.count !== undefined && (!Number.isSafeInteger(input.count) || input.count < 0 || input.count > 100_000)) throw new Error('Invalid analytics count');
  const required = {
    session_started: [], image_saved: ['source', 'count'], task_started: ['scope', 'taskType'],
    task_result: ['scope', 'taskType', 'outcome', 'durationMs'], prompt_confirmed: ['flow', 'taskId'],
    prompt_copied: ['flow'], material_reused: ['materialType'], search_started: ['requestId'],
    search_result: ['requestId', 'outcome', 'durationMs', 'count'],
  }[input.eventName];
  if (required.some(key => input[key] === undefined)) throw new Error('Missing analytics field');
  if (['task_started', 'task_result'].includes(input.eventName)) {
    if (!uuid(input[input.scope === 'ai' ? 'requestId' : 'taskId'])) throw new Error('Missing analytics task');
    if (input.scope === 'task' && !['prompt_build', 'evaluation'].includes(input.taskType)) throw new Error('Invalid logical task');
  }
  if (input.eventName === 'prompt_copied' && input.flow !== 'library' && !uuid(input.taskId)) throw new Error('Missing copy task');
  return { ...input, clientOccurredAt: new Date(timestamp).toISOString() };
}
export function isActiveAnalyticsEvent(event) {
  return event.schemaVersion === 2 && event.scope !== 'ai' && names.has(event.eventName)
    && !['task_result', 'search_result'].includes(event.eventName);
}

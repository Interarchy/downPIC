import { BACKEND_BASE_URL, BACKEND_MODE, backendUrl } from './runtime-config.mjs';
import {
  INTENT_MODULES,
  EVALUATION_MODULE_KEYS,
  PRESET_TYPES,
  STORAGE,
  addCandidateToPlan,
  createEmptyIntentModules,
  dataUrlParts,
  extensionFromUrl,
  normalizeIntentDraft,
  normalizeIntentModules,
  normalizeEvaluationSession,
  normalizeGeneratedResult,
  normalizePromptScheme,
  normalizePromptVersion,
  normalizeWorkingDraft,
  createWorkingDraft,
  revisionPreview,
  compileIntentPrompt,
  normalizeProjectType,
  normalizeSourcePageUrl,
  normalizeLibraryTags,
  sanitizePathSegment,
  orderedProjectTypes,
  resolveProjectType,
} from './shared.mjs';
import {
  deleteSourceImage,
  deleteSourceImagesByScheme,
  getSourceImage,
  putSourceImage,
} from './source-image-store.mjs';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
// CloudBase development instances can scale to zero. A cold start was measured at
// about 12.4 seconds, so status/session checks must not fail before the service wakes.
const STATUS_TIMEOUT_MS = 25_000;
const SESSION_TIMEOUT_MS = 30_000;
const ANALYSIS_TIMEOUT_MS = 135_000;
const ANALYTICS_POLICY_VERSION = '2026-09-20';
const ANALYTICS_EVENTS = new Set([
  'analysis_started', 'analysis_succeeded', 'analysis_failed', 'module_edited',
  'module_disabled', 'prompt_confirmed', 'prompt_copied',
]);
const ANALYTICS_OUTCOMES = new Set([
  'success', 'invalid_input', 'network_unavailable', 'timeout', 'service_unavailable',
  'quota_exceeded', 'format_invalid', 'version_mismatch', 'unknown_error',
]);

chrome.storage.session.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' });
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
// Remove the legacy BYOK value if this profile upgrades from 0.1.x.
chrome.storage.session.remove('deepseek_api_key').catch(() => {});

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get([
    STORAGE.captureEnabled,
    STORAGE.projectType,
    STORAGE.customTypes,
    STORAGE.analyticsConsent,
  ]);
  await chrome.storage.local.set({
    [STORAGE.captureEnabled]: Boolean(stored[STORAGE.captureEnabled]),
    [STORAGE.projectType]: normalizeProjectType(stored[STORAGE.projectType]) || PRESET_TYPES[0],
    [STORAGE.customTypes]: Array.isArray(stored[STORAGE.customTypes]) ? stored[STORAGE.customTypes] : [],
    [STORAGE.analyticsConsent]: stored[STORAGE.analyticsConsent]?.policyVersion === ANALYTICS_POLICY_VERSION
      ? {
        enabled: stored[STORAGE.analyticsConsent].enabled === true,
        updatedAt: String(stored[STORAGE.analyticsConsent].updatedAt || new Date().toISOString()),
        policyVersion: ANALYTICS_POLICY_VERSION,
      }
      : { enabled: false, updatedAt: new Date().toISOString(), policyVersion: ANALYTICS_POLICY_VERSION },
  });
  await ensureInstallationId();
});

function bytesAsBase64(bytes) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

async function blobAsDataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return `data:${blob.type};base64,${bytesAsBase64(bytes)}`;
}

async function fetchOriginalImage(payload) {
  const sourceUrl = String(payload.sourceUrl || '');
  if (!/^https?:\/\//i.test(sourceUrl)) return null;
  const response = await fetch(sourceUrl, { credentials: 'omit', cache: 'force-cache' });
  if (!response.ok) throw new Error(`原图请求失败：HTTP ${response.status}`);
  const blob = await response.blob();
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(blob.type) || !blob.size || blob.size > MAX_IMAGE_BYTES) {
    throw new Error('原图格式或大小不适合直接分析');
  }
  return { dataUrl: await blobAsDataUrl(blob), mimeType: blob.type };
}

function backendError(code, detail = '') {
  const messages = {
    NOT_CONFIGURED: 'ArchBuddy 云端服务尚未配置完成，请稍后再试。',
    INVALID_CONFIGURATION: 'ArchBuddy 云端服务配置无效，请联系开发者。',
    IMAGE_REJECTED: '服务无法读取这张图片，请换一张 PNG、JPEG 或 WebP。',
    ANALYSIS_FORMAT_INVALID: '模型没有按约定格式返回，请重试。',
    UPSTREAM_TIMEOUT: '模型分析超时，请稍后重试。',
    UPSTREAM_FAILED: 'DeepSeek 暂时不可用，请稍后重试。',
    BODY_TOO_LARGE: '图片超过服务允许的大小，请换一张较小的图片。',
    FORBIDDEN: 'ArchBuddy 服务拒绝了扩展请求，请更新本地服务后重试。',
    UNAUTHORIZED: '匿名访问凭据已失效，正在重新建立连接，请重试。',
    ANONYMOUS_SESSION_DISABLED: 'ArchBuddy 免登录服务尚未启用，请稍后再试。',
    INVALID_INSTALLATION_ID: '插件安装身份无效，请在扩展管理页重新加载 ArchBuddy。',
    USER_DAILY_LIMIT: '你今天的反推次数已用完，请明天再试。下载与分类仍可使用。',
    PROJECT_DAILY_LIMIT: 'ArchBuddy 今天的反推服务额度已用完，请明天再试。下载与分类仍可使用。',
    RATE_LIMITED: '请求过于频繁，请稍后再试。',
    BUSY: '当前分析请求较多，请稍后再试。',
    ANALYSIS_PAUSED: '反推服务暂时暂停，下载与分类仍可使用。',
    INVALID_INPUT: '评估输入无效，请换图或返回提示词构建检查方案。',
    AUTH_REQUIRED: '匿名会话已失效，请重试。',
    AUTH_INVALID: '匿名会话无效，请重试。',
    MODEL_TIMEOUT: '模型评估超时，请稍后重试。',
    QUOTA_REACHED: '今天暂时无法继续评估，请稍后再试。',
    MODEL_RESPONSE_INVALID: '模型评估结果无法解析，请重试。',
    SERVICE_UNAVAILABLE: '评估服务暂不可用，请稍后重试。',
    INTERNAL_ERROR: '评估服务暂不可用，请稍后重试。',
  };
  const error = new Error(messages[code] || detail || 'ArchBuddy 服务请求失败');
  error.code = code || 'BACKEND_ERROR';
  return error;
}

function categorizedError(code, message, category) {
  const error = new Error(message);
  error.code = code;
  error.category = category;
  return error;
}

function errorCategory(error) {
  if (error?.category) return error.category;
  if (['IMAGE_REJECTED', 'BODY_TOO_LARGE', 'INVALID_CONTENT_TYPE', 'MALFORMED_JSON', 'INVALID_INPUT'].includes(error?.code)) return 'invalid_input';
  if (error?.code === 'NETWORK_UNAVAILABLE') return 'network_unavailable';
  if (['PROCESS_TIMEOUT', 'UPSTREAM_TIMEOUT', 'MODEL_TIMEOUT'].includes(error?.code)) return 'timeout';
  if (['USER_DAILY_LIMIT', 'PROJECT_DAILY_LIMIT', 'RATE_LIMITED', 'TEST_LIMIT_REACHED'].includes(error?.code)) return 'quota_exceeded';
  if (error?.code === 'QUOTA_REACHED') return 'quota';
  if (error?.code === 'ANALYSIS_FORMAT_INVALID') return 'format_invalid';
  if (error?.code === 'MODEL_RESPONSE_INVALID') return 'parse';
  if (error?.code === 'VERSION_MISMATCH') return 'version_mismatch';
  if (['NOT_CONFIGURED', 'UPSTREAM_FAILED', 'BUSY', 'ANALYSIS_PAUSED', 'ANONYMOUS_SESSION_DISABLED'].includes(error?.code)) return 'service_unavailable';
  if (['AUTH_REQUIRED', 'AUTH_INVALID', 'SERVICE_UNAVAILABLE', 'INTERNAL_ERROR'].includes(error?.code)) return 'unavailable';
  return 'unknown_error';
}

function evaluationErrorCategory(error) {
  if (['INVALID_INPUT', 'IMAGE_REJECTED', 'BODY_TOO_LARGE', 'CONSENT_REQUIRED', 'INVALID_IMAGE'].includes(error?.code)) return 'invalid-input';
  if (error?.code === 'NETWORK_UNAVAILABLE') return 'network';
  if (['PROCESS_TIMEOUT', 'UPSTREAM_TIMEOUT', 'MODEL_TIMEOUT'].includes(error?.code)) return 'timeout';
  if (['QUOTA_REACHED', 'USER_DAILY_LIMIT', 'PROJECT_DAILY_LIMIT', 'RATE_LIMITED', 'TEST_LIMIT_REACHED'].includes(error?.code)) return 'quota';
  if (['MODEL_RESPONSE_INVALID', 'ANALYSIS_FORMAT_INVALID'].includes(error?.code)) return 'parse';
  return 'unavailable';
}

async function ensureInstallationId() {
  const stored = await chrome.storage.local.get(STORAGE.installationId);
  const current = stored[STORAGE.installationId];
  if (typeof current === 'string' && /^[0-9a-f-]{36}$/i.test(current)) return current;
  const installationId = crypto.randomUUID();
  await chrome.storage.local.set({ [STORAGE.installationId]: installationId });
  return installationId;
}

async function createAnonymousSession() {
  const installationId = await ensureInstallationId();
  const response = await fetchBackend('/api/session', {
    method: 'POST',
    body: { installationId },
    timeoutMs: SESSION_TIMEOUT_MS,
  });
  if (typeof response?.token !== 'string' || !Number.isFinite(Number(response?.expiresAt))) {
    throw new Error('ArchBuddy 云端返回了无效的匿名凭据');
  }
  await chrome.storage.session.set({
    [STORAGE.sessionToken]: response.token,
    [STORAGE.sessionExpiresAt]: Number(response.expiresAt),
  });
  return response.token;
}

let anonymousSessionPromise = null;
async function anonymousToken({ forceRefresh = false } = {}) {
  if (!forceRefresh) {
    const stored = await chrome.storage.session.get([STORAGE.sessionToken, STORAGE.sessionExpiresAt]);
    if (typeof stored[STORAGE.sessionToken] === 'string' && Number(stored[STORAGE.sessionExpiresAt]) > Date.now() + 60_000) {
      return stored[STORAGE.sessionToken];
    }
  }
  // 多张参考图首次同时分析时，共用一次安装身份与会话初始化。
  if (!anonymousSessionPromise) {
    anonymousSessionPromise = (async () => {
      await chrome.storage.session.remove([STORAGE.sessionToken, STORAGE.sessionExpiresAt]);
      return createAnonymousSession();
    })().finally(() => { anonymousSessionPromise = null; });
  }
  return anonymousSessionPromise;
}

async function fetchBackend(path, { method = 'GET', body, timeoutMs = ANALYSIS_TIMEOUT_MS, token, requestId } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    const headers = { 'x-downpic': '1' };
    if (body) headers['content-type'] = 'application/json';
    if (token) headers.authorization = `Bearer ${token}`;
    if (requestId) headers['x-archbuddy-request-id'] = requestId;
    response = await fetch(backendUrl(path), {
      method,
      signal: controller.signal,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw categorizedError('PROCESS_TIMEOUT', 'ArchBuddy 云端服务响应超时，请稍后再试', 'timeout');
    throw categorizedError('NETWORK_UNAVAILABLE', '无法连接 ArchBuddy 云端服务，请检查网络后重试', 'network_unavailable');
  } finally {
    clearTimeout(timeout);
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) throw backendError(payload?.error?.code || payload?.code, payload?.error?.message || payload?.message || `HTTP ${response.status}`);
  return payload;
}

async function requestBackend(path, options = {}) {
  const authenticatedPaths = ['/api/analyze', '/api/v2/analyze', '/api/v3/evaluate', '/api/library/search', '/api/library/describe', '/api/library/embed', '/api/events'];
  if (!authenticatedPaths.includes(path)) return fetchBackend(path, options);
  const requestId = options.requestId || (['/api/analyze', '/api/v2/analyze', '/api/v3/evaluate', '/api/library/search', '/api/library/describe', '/api/library/embed'].includes(path) ? crypto.randomUUID() : undefined);
  let token = await anonymousToken();
  try {
    return await fetchBackend(path, { ...options, token, requestId });
  } catch (error) {
    if (!['UNAUTHORIZED', 'AUTH_REQUIRED', 'AUTH_INVALID'].includes(error?.code)) throw error;
    token = await anonymousToken({ forceRefresh: true });
    return fetchBackend(path, { ...options, token, requestId });
  }
}

async function setAnalyticsConsent(enabled) {
  const consent = {
    enabled: enabled === true,
    updatedAt: new Date().toISOString(),
    policyVersion: ANALYTICS_POLICY_VERSION,
  };
  await chrome.storage.local.set({ [STORAGE.analyticsConsent]: consent });
  return { ok: true, consent };
}

async function recordAnalytics(payload = {}) {
  const local = await chrome.storage.local.get(STORAGE.analyticsConsent);
  const consent = local[STORAGE.analyticsConsent];
  if (consent?.enabled !== true || consent?.policyVersion !== ANALYTICS_POLICY_VERSION) {
    return { ok: true, accepted: false };
  }
  if (!ANALYTICS_EVENTS.has(payload.eventName)) return { ok: true, accepted: false };
  const event = {
    eventId: crypto.randomUUID(),
    eventName: payload.eventName,
    clientOccurredAt: new Date().toISOString(),
    ...(ANALYTICS_OUTCOMES.has(payload.outcome) ? { outcome: payload.outcome } : {}),
  };
  try {
    await requestBackend('/api/events', { method: 'POST', body: event, timeoutMs: 15_000 });
    return { ok: true, accepted: true };
  } catch {
    // 可选统计失败不得影响核心功能，也不保存重试队列。
    return { ok: true, accepted: false };
  }
}

async function backendStatus() {
  try {
    const status = await requestBackend('/api/status', { timeoutMs: STATUS_TIMEOUT_MS });
    return {
      ok: true,
      online: true,
      configured: Boolean(status?.configured && status?.anonymousSessionsEnabled),
      mode: BACKEND_MODE,
      quotaMode: status?.quotaMode,
    };
  } catch (error) {
    return {
      ok: true,
      online: false,
      configured: false,
      mode: BACKEND_MODE,
      message: error?.message || String(error),
    };
  }
}

// 旧页面的内容脚本可能因扩展重载失效；总开关同时处理DOM与样式。
const CAPTURE_DISABLED_CSS = '.downpic-toolbar { display: none !important; }';
let capturePagesSync = Promise.resolve();
function syncCapturePages() {
  capturePagesSync = capturePagesSync.catch(() => {}).then(async () => {
    const stored = await chrome.storage.local.get(STORAGE.captureEnabled);
    const enabled = Boolean(stored[STORAGE.captureEnabled]);
    const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
    await Promise.all(tabs.map(async tab => {
      const target = { tabId: tab.id };
      try {
        await chrome.scripting.removeCSS({ target, css: CAPTURE_DISABLED_CSS });
        if (!enabled) {
          // 隐藏仍由旧脚本创建的浮框；移除已存在的残留节点。
          await chrome.scripting.insertCSS({ target, css: CAPTURE_DISABLED_CSS });
          await chrome.tabs.sendMessage(tab.id, { type: 'capture.setEnabled', enabled: false }).catch(() => {});
          await chrome.scripting.executeScript({ target, func: () => {
            window.__downPicBetaDispose?.();
            document.querySelectorAll('.downpic-toolbar').forEach(element => element.remove());
          } });
        } else {
          const response = await chrome.tabs.sendMessage(tab.id, { type: 'capture.setEnabled', enabled: true }).catch(() => null);
          if (!response?.ok) await activatePage(tab.id);
        }
      } catch { /* 已关闭、权限受限的标签页不阻塞其他网页同步。 */ }
    }));
    return { ok: true };
  });
  return capturePagesSync;
}

async function activatePage(tabId) {
  const id = Number(tabId);
  if (!Number.isInteger(id) || id < 0) throw new Error('无法识别当前标签页');
  await chrome.scripting.insertCSS({ target: { tabId: id }, files: ['content.css'] });
  await chrome.scripting.executeScript({ target: { tabId: id }, files: ['content.js'] });
  return { ok: true };
}

async function captureImageFromTab(payload, sender) {
  const tab = sender.tab;
  if (!tab?.id || typeof tab.windowId !== 'number') throw new Error('无法识别当前网页');
  const screenshot = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
  const sourceBlob = await (await fetch(screenshot)).blob();
  const bitmap = await createImageBitmap(sourceBlob);
  const viewportWidth = Math.max(1, Number(payload.viewportWidth));
  const viewportHeight = Math.max(1, Number(payload.viewportHeight));
  const rect = payload.rect ?? {};
  const left = Math.max(0, Math.min(viewportWidth, Number(rect.left) || 0));
  const top = Math.max(0, Math.min(viewportHeight, Number(rect.top) || 0));
  const right = Math.max(left, Math.min(viewportWidth, Number(rect.right) || 0));
  const bottom = Math.max(top, Math.min(viewportHeight, Number(rect.bottom) || 0));
  if (right - left < 20 || bottom - top < 20) throw new Error('图片当前可见区域过小');

  const scaleX = bitmap.width / viewportWidth;
  const scaleY = bitmap.height / viewportHeight;
  const sx = Math.round(left * scaleX);
  const sy = Math.round(top * scaleY);
  const sw = Math.max(1, Math.round((right - left) * scaleX));
  const sh = Math.max(1, Math.round((bottom - top) * scaleY));
  const resize = Math.min(1, 1600 / Math.max(sw, sh));
  const width = Math.max(1, Math.round(sw * resize));
  const height = Math.max(1, Math.round(sh * resize));
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext('2d', { alpha: false }).drawImage(bitmap, sx, sy, sw, sh, 0, 0, width, height);
  bitmap.close();
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.92 });
  return {
    selectionId: crypto.randomUUID(),
    sourceType: 'screenshot',
    displayName: sanitizePathSegment(payload.title || payload.alt || tab.title, '网页参考图'),
    mimeType: blob.type,
    byteSize: blob.size,
    imagePayload: await blobAsDataUrl(blob),
    selectedAt: new Date().toISOString(),
  };
}

async function selectWebImage(payload, sender) {
  if (!sender.tab?.id) throw new Error('无法识别当前网页，请重新打开插件');
  chrome.sidePanel.open({ tabId: sender.tab.id }).catch(() => {});
  const local = await chrome.storage.local.get(STORAGE.captureEnabled);
  if (!local[STORAGE.captureEnabled]) throw new Error('图片工具已关闭，请先在插件弹窗中开启');
  let captured = null;
  try {
    captured = await fetchOriginalImage(payload);
  } catch {
    // 登录态、反盗链或特殊图片格式可能无法直接读取，回退到可见区域截图。
  }
  let fallbackPayload = payload;
  if (!captured) {
    await new Promise(resolve => setTimeout(resolve, 120));
    const geometry = await chrome.tabs.sendMessage(sender.tab.id, { type: 'capture.geometry' }).catch(() => null);
    if (geometry?.ok) fallbackPayload = { ...payload, ...geometry };
  }
  const selection = captured
    ? {
        selectionId: crypto.randomUUID(),
        sourceType: 'page-image',
        displayName: sanitizePathSegment(payload.title || payload.alt || sender.tab.title, '网页参考图'),
        mimeType: captured.mimeType,
        byteSize: Math.ceil(dataUrlParts(captured.dataUrl).base64.length * 0.75),
        imagePayload: captured.dataUrl,
        selectedAt: new Date().toISOString(),
      }
    : await captureImageFromTab(fallbackPayload, sender);
  await chrome.storage.session.set({ [STORAGE.selection]: selection, [STORAGE.result]: null });
  chrome.runtime.sendMessage({ type: 'selection.changed' }).catch(() => {});
  return { ok: true };
}

async function selectPastedImage(payload) {
  const { mimeType, base64 } = dataUrlParts(payload.dataUrl);
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(mimeType)) {
    throw categorizedError('IMAGE_REJECTED', '请选择 PNG、JPEG 或 WebP 图片', 'invalid_input');
  }
  const byteSize = Math.ceil(base64.length * 0.75);
  if (!byteSize || byteSize > MAX_IMAGE_BYTES) throw categorizedError('IMAGE_REJECTED', '请选择 1 字节到 10 MB 的图片', 'invalid_input');
  const sourceType = payload.sourceType === 'file' ? 'file' : 'paste';
  const selection = {
    selectionId: crypto.randomUUID(),
    sourceType,
    displayName: sanitizePathSegment(payload.title, sourceType === 'file' ? '本地参考图' : '粘贴的参考图'),
    mimeType,
    byteSize,
    imagePayload: payload.dataUrl,
    selectedAt: new Date().toISOString(),
  };
  await chrome.storage.session.set({ [STORAGE.selection]: selection, [STORAGE.result]: null });
  chrome.runtime.sendMessage({ type: 'selection.changed' }).catch(() => {});
  return { ok: true };
}

async function analyzeSelection(options = {}) {
  const local = await chrome.storage.local.get(STORAGE.privacyAccepted);
  if (!local[STORAGE.privacyAccepted]) throw categorizedError('IMAGE_CONSENT_REQUIRED', '请先确认图片处理与隐私说明', 'invalid_input');
  const session = await chrome.storage.session.get(STORAGE.selection);
  const selection = options.selection ?? session[STORAGE.selection];
  if (!selection?.imagePayload) throw categorizedError('IMAGE_REJECTED', '请先选择、粘贴或拖入一张参考图', 'invalid_input');
  const { mimeType, base64 } = dataUrlParts(selection.imagePayload);

  const requestBody = { image: { mimeType, base64 } };
  let payload;
  let modules;
  let sourceContractVersion = 2;
  try {
    payload = await requestBackend('/api/v2/analyze', { method: 'POST', body: requestBody });
    const keys = Array.isArray(payload?.modules) ? payload.modules.map(module => module?.key) : [];
    if (payload?.contractVersion !== 2 || keys.length !== INTENT_MODULES.length
        || keys.some((key, index) => key !== INTENT_MODULES[index].key)) {
      throw categorizedError('VERSION_MISMATCH', '服务版本与当前插件不匹配，请更新后重试', 'version_mismatch');
    }
    modules = normalizeIntentModules(payload.modules);
  } catch (error) {
    if (error?.code !== 'NOT_FOUND') throw error;
    sourceContractVersion = 1;
    payload = await requestBackend('/api/analyze', { method: 'POST', body: requestBody });
    const values = new Map((Array.isArray(payload?.sections) ? payload.sections : [])
      .map(section => [String(section?.title || ''), String(section?.text || '').trim()]));
    const titleByKey = {
      reference_summary: '核心视觉特征',
      scene_subject: '场景与主体',
      materials_surfaces: '材料与表面',
      landscape_context: '环境与配景',
      view_composition: '视角与构图',
      color_tone: '色彩与明暗',
      lighting_atmosphere: '光照与氛围',
      image_expression: '图像表现',
    };
    modules = normalizeIntentModules(INTENT_MODULES.map(definition => {
      const sourceTitle = titleByKey[definition.key];
      const value = sourceTitle ? values.get(sourceTitle) || '' : '';
      return {
        ...definition,
        value,
        basis: value ? 'inferred' : 'uncertain',
        evidence: value ? `兼容现有 V1 分项“${sourceTitle}”` : '',
        confidence: value ? 'medium' : 'unknown',
        enabled: Boolean(value),
        reviewState: 'suggested',
        source: 'ai',
      };
    }));
  }
  const result = {
    contractVersion: 2,
    sourceContractVersion,
    analysisId: crypto.randomUUID(),
    modules,
    durationMs: Number(payload.durationMs) || 0,
    model: String(payload.model || 'deepseek-flash'),
    cached: Boolean(payload.cached),
    selectionId: selection.selectionId,
    referenceHint: { sourceType: selection.sourceType, displayName: selection.displayName },
    completedAt: new Date().toISOString(),
  };
  if (options.transient) return { ok: true, result };
  await chrome.storage.session.set({
    [STORAGE.result]: result,
  });
  const saved = await prepareDraftForAnalysis(result, selection);
  return { ok: true, result, draft: saved.draft, drafts: saved.drafts };
}

async function draftState() {
  const stored = await chrome.storage.local.get([STORAGE.intentDraftsV2, STORAGE.activeIntentDraftIdV2]);
  const drafts = (Array.isArray(stored[STORAGE.intentDraftsV2]) ? stored[STORAGE.intentDraftsV2] : [])
    .map(item => normalizePromptScheme(item))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const activeDraftId = typeof stored[STORAGE.activeIntentDraftIdV2] === 'string'
    ? stored[STORAGE.activeIntentDraftIdV2]
    : null;
  return { drafts, activeDraftId };
}

async function saveDraft(input) {
  const { drafts } = await draftState();
  const now = new Date().toISOString();
  const existing = drafts.find(item => item.draftId === (input.draftId ?? input.schemeId));

  const draft = normalizePromptScheme({
    ...(existing ?? {}),
    ...input,
    schemeId: input.schemeId ?? input.draftId ?? existing?.schemeId,
    sourceReferences: input.sourceReferences ?? existing?.sourceReferences,
    versions: input.versions ?? existing?.versions,
    currentVersionId: input.currentVersionId ?? existing?.currentVersionId,
    updatedAt: now,
  }, now);
  const next = [draft, ...drafts.filter(item => item.draftId !== draft.draftId)]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  await chrome.storage.local.set({
    [STORAGE.intentDraftsV2]: next,
    [STORAGE.activeIntentDraftIdV2]: draft.draftId,
  });
  return { ok: true, draft, drafts: next, activeDraftId: draft.draftId };
}

async function createDraftContext() {
  await chrome.storage.local.remove(STORAGE.activeIntentDraftIdV2);
  await chrome.storage.session.set({ [STORAGE.result]: null });
  const { drafts } = await draftState();
  return { ok: true, drafts, activeDraftId: null };
}

async function restoreDraft(draftId) {
  const { drafts } = await draftState();
  const draft = drafts.find(item => item.draftId === draftId);
  if (!draft) throw categorizedError('DRAFT_NOT_FOUND', '这份草稿已不存在', 'invalid_input');
  await chrome.storage.local.set({ [STORAGE.activeIntentDraftIdV2]: draft.draftId });
  return { ok: true, draft, drafts, activeDraftId: draft.draftId };
}

async function deleteDraft(draftId) {
  const { drafts, activeDraftId } = await draftState();
  const next = drafts.filter(item => item.draftId !== draftId);
  const nextActive = activeDraftId === draftId ? null : activeDraftId;
  await chrome.storage.local.set({ [STORAGE.intentDraftsV2]: next });
  if (nextActive) await chrome.storage.local.set({ [STORAGE.activeIntentDraftIdV2]: nextActive });
  else await chrome.storage.local.remove(STORAGE.activeIntentDraftIdV2);
  return { ok: true, drafts: next, activeDraftId: nextActive };
}

async function prepareDraftForAnalysis(result, selection) {
  const { drafts, activeDraftId } = await draftState();
  const active = drafts.find(item => item.draftId === activeDraftId);
  const now = result.completedAt;
  const draft = normalizeIntentDraft({
    ...(active ?? {}),
    draftId: active?.draftId ?? crypto.randomUUID(),
    name: active?.name ?? `设计意图方案 · ${selection.displayName}`,
    createdAt: active?.createdAt ?? now,
    updatedAt: now,
    lastAnalyzedAt: now,
    modules: active?.modules ?? createEmptyIntentModules(),
    overallConfirmedAt: active?.overallConfirmedAt ?? null,
    referenceSelectionId: selection.selectionId,
    referenceHint: { sourceType: selection.sourceType, displayName: selection.displayName },
  }, now);
  return saveDraft(draft);
}

async function addCandidate(payload = {}) {
  const [{ drafts, activeDraftId }, session] = await Promise.all([
    draftState(),
    chrome.storage.session.get(STORAGE.result),
  ]);
  const draft = drafts.find(item => item.draftId === activeDraftId);
  const result = session[STORAGE.result];
  if (!draft) throw categorizedError('DRAFT_NOT_FOUND', '请先完成一次图片分析', 'invalid_input');
  if (!result || payload.analysisId !== result.analysisId) {
    throw categorizedError('ANALYSIS_NOT_FOUND', '这组候选意图已经失效，请重新分析当前图片', 'invalid_input');
  }
  const candidate = result.modules.find(module => module.key === payload.key);
  if (!candidate) throw categorizedError('MODULE_NOT_FOUND', '没有找到这项候选意图', 'invalid_input');
  const current = draft.modules.find(module => module.key === candidate.key);
  const replacing = Boolean(current?.value && current.value !== candidate.value);
  if (replacing && payload.replace !== true) {
    throw categorizedError('REPLACE_REQUIRED', '当前方案已有这一方面，请确认替换', 'invalid_input');
  }
  const saved = await saveDraft({
    ...draft,
    modules: addCandidateToPlan(draft.modules, candidate, {
      analysisId: result.analysisId,
      displayName: result.referenceHint?.displayName,
    }),
    overallConfirmedAt: null,
  });
  const firstUse = !draft.modules.some(module => module.sourceHint?.analysisId === result.analysisId && module.value);
  if (firstUse) {
    const attached = await attachSchemeSource({
      schemeId: saved.draft.draftId,
      selectionId: selectionIdForResult(result),
      analysisId: result.analysisId,
      displayName: result.referenceHint?.displayName,
    });
    saved.draft = attached.scheme;
    saved.drafts = attached.schemes;
  }
  return saved;
}

function selectionIdForResult(result) {
  return String(result?.selectionId || '');
}

async function readSchemeCollection() {
  const stored = await chrome.storage.local.get([STORAGE.promptSchemesV3, STORAGE.activeSchemeIdV3]);
  const raw = Array.isArray(stored[STORAGE.promptSchemesV3]) ? stored[STORAGE.promptSchemesV3] : [];
  const schemes = raw.map(item => normalizePromptScheme(item))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  return {
    raw,
    schemes,
    activeSchemeId: typeof stored[STORAGE.activeSchemeIdV3] === 'string' ? stored[STORAGE.activeSchemeIdV3] : null,
  };
}

async function writeSchemeInCollection(scheme) {
  const { raw } = await readSchemeCollection();
  const normalized = normalizePromptScheme(scheme);
  const next = [normalized, ...raw.filter(item => (item.schemeId ?? item.draftId) !== normalized.schemeId)]
    .map(item => item.schemeId === normalized.schemeId ? normalized : item)
    .sort((left, right) => String(right.updatedAt || '').localeCompare(String(left.updatedAt || '')));
  await chrome.storage.local.set({
    [STORAGE.promptSchemesV3]: next,
    [STORAGE.activeSchemeIdV3]: normalized.schemeId,
  });
  return { scheme: normalized, schemes: next.map(item => normalizePromptScheme(item)), activeSchemeId: normalized.schemeId };
}

function legacyMissingReference(scheme) {
  if (scheme.sourceReferences.length || !scheme.referenceHint) return scheme;
  const sourceReferenceId = crypto.randomUUID();
  return normalizePromptScheme({
    ...scheme,
    sourceReferences: [{
      sourceReferenceId,
      schemeId: scheme.schemeId,
      analysisId: null,
      selectionId: scheme.referenceSelectionId,
      displayName: scheme.referenceHint.displayName,
      sourceType: scheme.referenceHint.sourceType,
      mimeType: null,
      byteSize: 0,
      assetState: 'missing',
      createdAt: scheme.createdAt,
    }],
    migration: { fromSchemaVersion: 2, migratedAt: new Date().toISOString() },
  });
}

async function openScheme(schemeId) {
  const { raw } = await readSchemeCollection();
  const source = raw.find(item => (item.schemeId ?? item.draftId) === schemeId);
  if (!source) throw categorizedError('SCHEME_NOT_FOUND', '这份方案已不存在', 'invalid_input');
  let scheme = normalizePromptScheme(source);
  if (Number(source.schemaVersion) < 3) scheme = legacyMissingReference(scheme);
  if (!scheme.versions.length) {
    const baseline = normalizePromptVersion({
      versionId: crypto.randomUUID(),
      versionNumber: 1,
      origin: 'legacy-baseline',
      createdAt: scheme.updatedAt,
      modulesSnapshot: scheme.modules,
      compiledPrompt: compileIntentPrompt(scheme.modules),
      sourceReferenceIds: scheme.sourceReferences.map(reference => reference.sourceReferenceId),
      changeSummary: [],
    }, scheme.schemeId, 1);
    scheme = normalizePromptScheme({ ...scheme, versions: [baseline], currentVersionId: baseline.versionId });
  }
  const saved = await writeSchemeInCollection(scheme);
  const session = await chrome.storage.session.get(STORAGE.workingDraftV3);
  const workingDraft = session[STORAGE.workingDraftV3]?.schemeId === saved.scheme.schemeId
    && session[STORAGE.workingDraftV3]?.baseVersionId === saved.scheme.currentVersionId
    ? normalizeWorkingDraft(session[STORAGE.workingDraftV3], saved.scheme)
    : createWorkingDraft(saved.scheme);
  await chrome.storage.session.set({ [STORAGE.workingDraftV3]: workingDraft });
  return { ok: true, ...saved, workingDraft };
}

async function listSchemes() {
  const { schemes, activeSchemeId } = await readSchemeCollection();
  return {
    ok: true,
    schemes: schemes.filter(scheme => scheme.overallConfirmedAt || scheme.versions.some(version => version.origin !== 'legacy-baseline')).map(scheme => ({
      schemeId: scheme.schemeId,
      name: scheme.name,
      updatedAt: scheme.updatedAt,
      currentVersionId: scheme.currentVersionId,
      versionCount: scheme.versions.length,
      sourceCount: scheme.sourceReferences.length,
    })),
    activeSchemeId,
  };
}

async function saveLibraryMetadata(payload = {}) {
  const schemeId = String(payload.schemeId || '');
  const projectName = String(payload.projectName ?? '').trim();
  const category = String(payload.category ?? '').trim();
  const rawTags = Array.isArray(payload.tags) ? payload.tags : [];
  if (projectName.length > 80 || category.length > 40 || rawTags.length > 5
      || rawTags.some(tag => typeof tag !== 'string' || tag.trim().length > 24)) {
    throw categorizedError('INVALID_INPUT', '项目、分类或标签超出允许长度', 'invalid_input');
  }
  const stored = await chrome.storage.local.get(STORAGE.promptSchemesV3);
  const raw = Array.isArray(stored[STORAGE.promptSchemesV3]) ? stored[STORAGE.promptSchemesV3] : [];
  const source = raw.find(item => (item.schemeId ?? item.draftId) === schemeId);
  if (!source) throw categorizedError('SCHEME_NOT_FOUND', '这份方案已不存在', 'invalid_input');
  const scheme = normalizePromptScheme(source);
  if (!scheme.overallConfirmedAt && !scheme.versions.some(version => version.origin !== 'legacy-baseline')) {
    throw categorizedError('SCHEME_NOT_FOUND', '这份方案尚未确认', 'invalid_input');
  }
  const sourceReferenceId = String(payload.sourceReferenceId || '');
  if (sourceReferenceId && !scheme.sourceReferences.some(ref => ref.sourceReferenceId === sourceReferenceId)) {
    throw categorizedError('OWNERSHIP_MISMATCH', '这张图片不属于所选方案', 'invalid_input');
  }
  const updated = normalizePromptScheme({
    ...scheme,
    projectName,
    category,
    sourceReferences: scheme.sourceReferences.map(ref => ref.sourceReferenceId === sourceReferenceId
      ? { ...ref, tags: normalizeLibraryTags(rawTags) } : ref),
  });
  await chrome.storage.local.set({
    [STORAGE.promptSchemesV3]: raw.map(item => (item.schemeId ?? item.draftId) === schemeId ? updated : item),
  });
  return { ok: true, scheme: updated };
}

async function resumeLibraryScheme(payload = {}) {
  const schemeId = String(payload.schemeId || '');
  const mode = payload.mode === 'builder' ? 'builder' : 'optimize';
  const { raw } = await readSchemeCollection();
  const source = raw.find(item => (item.schemeId ?? item.draftId) === schemeId);
  if (!source) throw categorizedError('SCHEME_NOT_FOUND', '这份方案已不存在', 'invalid_input');
  const scheme = normalizePromptScheme(source);
  if (!scheme.overallConfirmedAt && !scheme.versions.some(version => version.origin !== 'legacy-baseline')) {
    throw categorizedError('SCHEME_NOT_FOUND', '这份方案尚未确认', 'invalid_input');
  }
  await chrome.storage.session.set({
    [STORAGE.libraryHandoffV4]: { schemeId, mode, nonce: crypto.randomUUID() },
  });
  return { ok: true, schemeId, mode };
}
async function attachSchemeSource(payload = {}) {
  const collection = await readSchemeCollection();
  const found = collection.raw.find(item => (item.schemeId ?? item.draftId) === payload.schemeId);
  if (!found) throw categorizedError('SCHEME_NOT_FOUND', '这份方案已不存在', 'invalid_input');
  let scheme = normalizePromptScheme(found);
  if (Number(found.schemaVersion) < 3) scheme = legacyMissingReference(scheme);
  const session = await chrome.storage.session.get(STORAGE.selection);
  const selection = session[STORAGE.selection];
  if (!selection?.imagePayload || (payload.selectionId && payload.selectionId !== selection.selectionId)) {
    throw categorizedError('SOURCE_IMAGE_REQUIRED', '请回到提示词构建，重新选择对应参考图后再补图', 'invalid_input');
  }
  const duplicate = scheme.sourceReferences.find(reference => (
    payload.analysisId && reference.analysisId === payload.analysisId && reference.selectionId === selection.selectionId
  ) || (!payload.analysisId && reference.selectionId === selection.selectionId));
  if (duplicate?.assetState === 'available' && !payload.replaceSourceReferenceId) {
    return { ok: true, scheme, schemes: collection.schemes, sourceReference: duplicate, reused: true };
  }
  let target = payload.replaceSourceReferenceId
    ? scheme.sourceReferences.find(reference => reference.sourceReferenceId === payload.replaceSourceReferenceId)
    : null;
  if (!target && !payload.replaceSourceReferenceId) {
    target = scheme.sourceReferences.find(reference => reference.assetState !== 'available'
      && (reference.selectionId === selection.selectionId || reference.displayName === selection.displayName)) ?? null;
  }
  if (payload.replaceSourceReferenceId && (!target || !['missing', 'save-failed'].includes(target.assetState))) {
    throw categorizedError('OWNERSHIP_MISMATCH', '只能补充当前方案中缺失或保存失败的原图', 'invalid_input');
  }
  const sourceReferenceId = target?.sourceReferenceId ?? crypto.randomUUID();
  const blob = await (await fetch(selection.imagePayload)).blob();
  const baseReference = {
    sourceReferenceId,
    schemeId: scheme.schemeId,
    analysisId: String(payload.analysisId || target?.analysisId || '') || null,
    selectionId: selection.selectionId,
    displayName: String(payload.displayName || selection.displayName || target?.displayName || '参考图'),
    tags: target?.tags || [],
    sourceType: selection.sourceType,
    mimeType: selection.mimeType,
    byteSize: selection.byteSize,
    createdAt: target?.createdAt || new Date().toISOString(),
  };
  try {
    await putSourceImage({ sourceReferenceId, schemeId: scheme.schemeId, blob });
    target = { ...baseReference, assetState: 'available', capturedAt: new Date().toISOString(), failureCode: null };
  } catch (error) {
    target = { ...baseReference, assetState: 'save-failed', capturedAt: null, failureCode: error?.code || 'TRANSACTION_FAILED' };
  }
  const sourceReferences = [target, ...scheme.sourceReferences.filter(reference => reference.sourceReferenceId !== sourceReferenceId)];
  scheme = normalizePromptScheme({ ...scheme, sourceReferences, updatedAt: new Date().toISOString() });
  const saved = await writeSchemeInCollection(scheme);
  if (target.assetState !== 'available') {
    const error = categorizedError(target.failureCode, '来源图未能完整保存，请清理空间后重试补图', 'invalid_input');
    error.saved = saved;
    throw error;
  }
  return { ok: true, ...saved, sourceReference: target, reused: false };
}

async function deleteScheme(payload = {}) {
  if (payload.confirmed !== true) throw categorizedError('CONFIRMATION_REQUIRED', '删除方案前需要确认', 'invalid_input');
  const schemeId = String(payload.schemeId || '');
  if (!/^[0-9a-f-]{36}$/i.test(schemeId)) throw categorizedError('SCHEME_NOT_FOUND', '方案标识无效', 'invalid_input');
  const { raw, activeSchemeId } = await readSchemeCollection();
  if (!raw.some(item => (item.schemeId ?? item.draftId) === schemeId)) throw categorizedError('SCHEME_NOT_FOUND', '这份方案已不存在', 'invalid_input');
  await deleteSourceImagesByScheme(schemeId);
  const next = raw.filter(item => (item.schemeId ?? item.draftId) !== schemeId);
  const update = { [STORAGE.promptSchemesV3]: next };
  if (activeSchemeId === schemeId) update[STORAGE.activeSchemeIdV3] = null;
  await chrome.storage.local.set(update);
  const session = await chrome.storage.session.get([STORAGE.workingDraftV3, STORAGE.evaluationSessionV3]);
  const remove = [];
  if (session[STORAGE.workingDraftV3]?.schemeId === schemeId) remove.push(STORAGE.workingDraftV3);
  if (session[STORAGE.evaluationSessionV3]?.schemeId === schemeId) remove.push(STORAGE.evaluationSessionV3, STORAGE.generatedResultV3);
  if (remove.length) await chrome.storage.session.remove([...new Set(remove)]);
  return { ok: true, schemes: next.map(item => normalizePromptScheme(item)) };
}

async function getWorkingDraft(schemeId) {
  const opened = await openScheme(schemeId);
  const session = await chrome.storage.session.get(STORAGE.workingDraftV3);
  let workingDraft = session[STORAGE.workingDraftV3];
  if (workingDraft?.schemeId !== opened.scheme.schemeId || workingDraft?.baseVersionId !== opened.scheme.currentVersionId) {
    workingDraft = createWorkingDraft(opened.scheme);
    await chrome.storage.session.set({ [STORAGE.workingDraftV3]: workingDraft });
  } else {
    workingDraft = normalizeWorkingDraft(workingDraft, opened.scheme);
  }
  return { ok: true, scheme: opened.scheme, workingDraft, preview: revisionPreview(workingDraft, opened.scheme) };
}

async function saveWorkingDraft(payload = {}) {
  const opened = await openScheme(payload.schemeId);
  if (payload.baseVersionId !== opened.scheme.currentVersionId) throw categorizedError('STALE_DRAFT', '当前方案已有新版本，请重新打开', 'invalid_input');
  let workingDraft = normalizeWorkingDraft({
    ...payload,
    schemeId: opened.scheme.schemeId,
    baseVersionId: opened.scheme.currentVersionId,
  }, opened.scheme);
  const version = opened.scheme.versions.find(item => item.versionId === workingDraft.baseVersionId);
  const baseline = normalizeIntentModules(version?.modulesSnapshot ?? opened.scheme.modules);
  workingDraft = normalizeWorkingDraft({
    ...workingDraft,
    modules: workingDraft.modules.map((module, index) => {
      const before = baseline[index];
      if ((before.locked && module.value !== before.value) || !module.value.trim()) return { ...before };
      return module;
    }),
  }, opened.scheme);
  await chrome.storage.session.set({ [STORAGE.workingDraftV3]: workingDraft });
  return { ok: true, workingDraft, preview: revisionPreview(workingDraft, opened.scheme) };
}

function modulesDiffer(left, right) {
  const before = normalizeIntentModules(left);
  const after = normalizeIntentModules(right);
  return after.some((module, index) => ['value', 'enabled', 'locked'].some(field => module[field] !== before[index][field]));
}

async function commitSchemeVersion(payload = {}) {
  const collection = await readSchemeCollection();
  const raw = collection.raw.find(item => (item.schemeId ?? item.draftId) === payload.schemeId);
  if (!raw) throw categorizedError('SCHEME_NOT_FOUND', '这份方案已不存在', 'invalid_input');
  let scheme = normalizePromptScheme(raw);
  if (Number(raw.schemaVersion) < 3) scheme = legacyMissingReference(scheme);
  const initialCopy = scheme.versions.length === 0;
  if ((!initialCopy && payload.baseVersionId !== scheme.currentVersionId) || (initialCopy && payload.baseVersionId)) {
    throw categorizedError('STALE_DRAFT', '当前方案已有新版本，请重新打开', 'invalid_input');
  }
  const current = scheme.versions.find(version => version.versionId === scheme.currentVersionId) ?? null;
  const modules = normalizeIntentModules(payload.modules);
  const principleText = payload.principleText ?? scheme.principleText;
  const compiledPrompt = compileIntentPrompt(modules, principleText);
  if (String(payload.compiledPrompt || '') !== compiledPrompt) throw categorizedError('PROMPT_MISMATCH', '复制内容与当前草稿不一致，请重新复制', 'invalid_input');
  if (payload.confirmed === true && modules.some(module => module.enabled && !module.value)) {
    throw categorizedError('INVALID_INPUT', '启用维度不能为空，请补充后确认', 'invalid_input');
  }
  const session = await chrome.storage.session.get([STORAGE.generatedResultV3, STORAGE.evaluationSessionV3]);
  const evaluation = normalizeEvaluationSession(session[STORAGE.evaluationSessionV3]);
  const generated = normalizeGeneratedResult(session[STORAGE.generatedResultV3]);
  const evaluatedImage = payload.confirmed === true && evaluation.status === 'succeeded'
    && evaluation.schemeId === scheme.schemeId && evaluation.baseVersionId === current?.versionId
    && generated?.generatedResultId === evaluation.generatedResultId ? generated : null;
  if (!initialCopy && !modulesDiffer(current.modulesSnapshot, modules) && current.compiledPrompt === compiledPrompt && !evaluatedImage) throw categorizedError('NO_CHANGES', '当前草稿没有有效变化，不会创建重复版本', 'invalid_input');
  if (!payload.confirmed && (!scheme.sourceReferences.length || scheme.sourceReferences.some(reference => reference.assetState !== 'available'))) {
    throw categorizedError('VERSION_INCOMPLETE', '文本已复制，但来源图未完整保存；请补图后再保存版本', 'invalid_input');
  }
  for (const reference of payload.confirmed ? [] : scheme.sourceReferences) {
    try {
      const record = await getSourceImage(reference.sourceReferenceId);
      if (record.schemeId !== scheme.schemeId) throw new Error('ownership');
    } catch {
      throw categorizedError('VERSION_INCOMPLETE', '文本已复制，但有来源图无法读取；请补图后重试', 'invalid_input');
    }
  }
  const versionNumber = Math.max(...scheme.versions.map(version => version.versionNumber), 0) + 1;
  const version = normalizePromptVersion({
    versionId: crypto.randomUUID(),
    versionNumber,
    origin: payload.confirmed ? (initialCopy ? 'initial-confirm' : 'revision-confirm') : (initialCopy ? 'initial-copy' : 'revision-copy'),
    createdAt: new Date().toISOString(),
    modulesSnapshot: modules,
    principleText,
    compiledPrompt,
    sourceReferenceIds: scheme.sourceReferences.map(reference => reference.sourceReferenceId),
    baselineVersionId: evaluatedImage ? current?.versionId : null,
    evaluationId: evaluatedImage ? evaluation.evaluationId : null,
    generatedResult: evaluatedImage ? {
      generatedResultId: evaluatedImage.generatedResultId,
      displayName: evaluatedImage.displayName,
      mimeType: evaluatedImage.mimeType,
      createdAt: evaluatedImage.selectedAt,
    } : null,
    changeSummary: payload.changeSummary,
  }, scheme.schemeId, versionNumber);
  const nextScheme = normalizePromptScheme({
    ...scheme,
    modules,
    versions: [...scheme.versions, version],
    currentVersionId: version.versionId,
    updatedAt: version.createdAt,
    overallConfirmedAt: payload.confirmed ? version.createdAt : scheme.overallConfirmedAt,
  });
  if (evaluatedImage) {
    const bytes = Uint8Array.from(atob(evaluatedImage.imagePayload), character => character.charCodeAt(0));
    const imageBlob = new Blob([bytes], { type: evaluatedImage.mimeType });
    if (imageBlob.size !== evaluatedImage.byteSize) throw categorizedError('INVALID_IMAGE', '生成图大小校验失败，请重新选择', 'invalid_input');
    await putSourceImage({ sourceReferenceId: evaluatedImage.generatedResultId, schemeId: scheme.schemeId, blob: imageBlob });
  }
  let saved;
  try { saved = await writeSchemeInCollection(nextScheme); }
  catch (error) {
    if (evaluatedImage) await deleteSourceImage(evaluatedImage.generatedResultId, scheme.schemeId).catch(() => {});
    throw error;
  }
  const workingDraft = createWorkingDraft(saved.scheme);
  await chrome.storage.session.set({ [STORAGE.workingDraftV3]: workingDraft });
  await chrome.storage.session.remove(STORAGE.evaluationSessionV3);
  return { ok: true, ...saved, version, workingDraft };
}

async function readVersionForCopy(payload = {}) {
  const opened = await openScheme(payload.schemeId);
  const version = opened.scheme.versions.find(item => item.versionId === payload.versionId);
  if (!version) throw categorizedError('VERSION_NOT_FOUND', '这个历史版本已不存在', 'invalid_input');
  return { ok: true, compiledPrompt: version.compiledPrompt, version };
}

async function setEvaluationImage(payload = {}) {
  const image = payload.image ?? {};
  const generated = normalizeGeneratedResult({
    generatedResultId: crypto.randomUUID(),
    displayName: image.displayName || '生成结果图',
    mimeType: image.mimeType,
    byteSize: Number(image.byteSize),
    imagePayload: String(image.base64 || ''),
    selectedAt: new Date().toISOString(),
  });
  if (!generated?.imagePayload) throw categorizedError('INVALID_IMAGE', '请选择 1 字节至 10 MB 的 PNG、JPEG 或 WebP', 'invalid_input');
  await chrome.storage.session.set({ [STORAGE.generatedResultV3]: generated });
  await chrome.storage.session.remove(STORAGE.evaluationSessionV3);
  return { ok: true, generatedResult: generated };
}

async function runEvaluation(payload = {}) {
  if (payload.consentConfirmed !== true) throw categorizedError('CONSENT_REQUIRED', '请确认发送这张生成图后再开始评估', 'invalid_input');
  const opened = await openScheme(payload.schemeId);
  const scheme = opened.scheme;
  if (!scheme.overallConfirmedAt && !scheme.versions.some(version => version.origin !== 'legacy-baseline')) {
    throw categorizedError('CONFIRMATION_REQUIRED', '请先在提示词构建中整体确认', 'invalid_input');
  }
  if (!scheme.currentVersionId || scheme.currentVersionId !== payload.versionId) throw categorizedError('STALE_EVALUATION', '当前方案版本已变化，请重新评估', 'invalid_input');
  const version = scheme.versions.find(item => item.versionId === scheme.currentVersionId);
  const session = await chrome.storage.session.get([STORAGE.generatedResultV3, STORAGE.evaluationSessionV3]);
  const generated = normalizeGeneratedResult(session[STORAGE.generatedResultV3]);
  if (!generated || generated.generatedResultId !== payload.generatedResultId) throw categorizedError('INVALID_IMAGE', '生成图已变化，请重新选择', 'invalid_input');
  if (session[STORAGE.evaluationSessionV3]?.status === 'running') throw categorizedError('EVALUATION_IN_PROGRESS', '当前评估仍在处理中', 'unavailable');
  const modules = normalizeIntentModules(version.modulesSnapshot)
    .filter(module => module.enabled && module.value && EVALUATION_MODULE_KEYS.includes(module.key))
    .map(module => ({ key: module.key, title: module.title, value: module.value }));
  if (!modules.length) throw categorizedError('INVALID_INPUT', '当前版本没有可评估的启用维度', 'invalid_input');
  const snapshot = {
    requestId: crypto.randomUUID(),
    schemeId: scheme.schemeId,
    baseVersionId: version.versionId,
    generatedResultId: generated.generatedResultId,
  };
  const running = normalizeEvaluationSession({ ...snapshot, status: 'running', consentConfirmed: true, updatedAt: new Date().toISOString() });
  await chrome.storage.session.set({ [STORAGE.evaluationSessionV3]: running });
  const referenceSummary = version.modulesSnapshot.find(module => module.key === 'reference_summary' && module.enabled)?.value || '';
  const negativeConstraints = version.modulesSnapshot.find(module => module.key === 'negative_constraints' && module.enabled)?.value || '';
  try {
    const result = await requestBackend('/api/v3/evaluate', {
      method: 'POST',
      requestId: snapshot.requestId,
      body: {
        contractVersion: 3,
        requestId: snapshot.requestId,
        image: { mimeType: generated.mimeType, base64: generated.imagePayload },
        target: {
          versionId: version.versionId,
          modules,
          context: {
            ...(referenceSummary ? { referenceSummary } : {}),
            ...(negativeConstraints ? { negativeConstraints } : {}),
          },
        },
      },
    });
    const [latestLocal, latestSession] = await Promise.all([
      readSchemeCollection(),
      chrome.storage.session.get([STORAGE.generatedResultV3, STORAGE.evaluationSessionV3]),
    ]);
    const latestScheme = latestLocal.schemes.find(item => item.schemeId === snapshot.schemeId);
    const latestGenerated = latestSession[STORAGE.generatedResultV3];
    const latestEvaluation = latestSession[STORAGE.evaluationSessionV3];
    if (latestScheme?.currentVersionId !== snapshot.baseVersionId
        || latestGenerated?.generatedResultId !== snapshot.generatedResultId
        || latestEvaluation?.requestId !== snapshot.requestId) {
      throw categorizedError('STALE_EVALUATION', '方案、版本或生成图已变化，旧结果已丢弃', 'invalid_input');
    }
    const succeeded = normalizeEvaluationSession({
      ...snapshot,
      evaluationId: result.evaluationId,
      status: 'succeeded',
      consentConfirmed: true,
      result,
      updatedAt: new Date().toISOString(),
    });
    await chrome.storage.session.set({ [STORAGE.evaluationSessionV3]: succeeded });
    return { ok: true, evaluationSession: succeeded };
  } catch (error) {
    if (error?.code === 'STALE_EVALUATION') throw error;
    const failed = normalizeEvaluationSession({
      ...snapshot,
      status: 'failed',
      consentConfirmed: true,
      errorCategory: evaluationErrorCategory(error),
      errorMessage: error?.message || '评估失败',
      updatedAt: new Date().toISOString(),
    });
    await chrome.storage.session.set({ [STORAGE.evaluationSessionV3]: failed });
    error.category = evaluationErrorCategory(error);
    throw error;
  }
}

async function getEvaluation(payload = {}) {
  const [collection, session] = await Promise.all([
    readSchemeCollection(),
    chrome.storage.session.get([STORAGE.generatedResultV3, STORAGE.evaluationSessionV3]),
  ]);
  const scheme = collection.schemes.find(item => item.schemeId === payload.schemeId);
  const generatedResult = normalizeGeneratedResult(session[STORAGE.generatedResultV3]);
  const evaluationSession = normalizeEvaluationSession(session[STORAGE.evaluationSessionV3]);
  if (!scheme || evaluationSession.schemeId !== scheme.schemeId || evaluationSession.baseVersionId !== scheme.currentVersionId
      || evaluationSession.generatedResultId !== generatedResult?.generatedResultId) {
    return { ok: true, generatedResult, evaluationSession: null };
  }
  return { ok: true, generatedResult, evaluationSession };
}

async function clearEvaluation(payload = {}) {
  const session = await chrome.storage.session.get(STORAGE.evaluationSessionV3);
  if (!payload.schemeId || !session[STORAGE.evaluationSessionV3] || session[STORAGE.evaluationSessionV3].schemeId === payload.schemeId) {
    await chrome.storage.session.remove([STORAGE.generatedResultV3, STORAGE.evaluationSessionV3]);
  }
  return { ok: true };
}

let captureArchiveQueue = Promise.resolve();

async function recordCaptureDownload(downloadId, entry) {
  const stored = await chrome.storage.local.get(STORAGE.captureCatalogV4);
  const catalog = stored[STORAGE.captureCatalogV4] && typeof stored[STORAGE.captureCatalogV4] === 'object'
    ? stored[STORAGE.captureCatalogV4] : {};
  await chrome.storage.local.set({ [STORAGE.captureCatalogV4]: { ...catalog, [downloadId]: entry } });
}

async function archiveCapturedImage(downloadId, url) {
  if (!/^https?:\/\//i.test(url) && !/^data:image\/(?:png|jpeg|webp|gif|avif);base64,/i.test(url)) return;
  const response = await fetch(url, {
    credentials: 'omit',
    cache: 'force-cache',
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) return;
  const blob = await response.blob();
  if (blob.size < 1 || blob.size > MAX_IMAGE_BYTES) return;
  const bitmap = await createImageBitmap(blob);
  const ratio = Math.min(1, 640 / Math.max(bitmap.width, bitmap.height));
  const canvas = new OffscreenCanvas(Math.max(1, Math.round(bitmap.width * ratio)), Math.max(1, Math.round(bitmap.height * ratio)));
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const previewBlob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.72 });
  const captureId = crypto.randomUUID();
  await putSourceImage({ sourceReferenceId: captureId, schemeId: captureId, blob: previewBlob });
  const stored = await chrome.storage.local.get(STORAGE.capturePreviewsV4);
  const previews = stored[STORAGE.capturePreviewsV4] && typeof stored[STORAGE.capturePreviewsV4] === 'object'
    ? stored[STORAGE.capturePreviewsV4] : {};
  await chrome.storage.local.set({ [STORAGE.capturePreviewsV4]: { ...previews, [downloadId]: captureId } });
}

async function downloadImage(payload) {
  const category = normalizeProjectType(payload.category) || PRESET_TYPES[0];
  const project = sanitizePathSegment(payload.pageTitle || payload.title, '未命名项目');
  const title = sanitizePathSegment(payload.title, '参考图');
  const extension = extensionFromUrl(payload.url, payload.mimeType);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/T/, '-').slice(0, 15);
  const filename = `ArchBuddy/${sanitizePathSegment(category, '未分类')}/${project}/${stamp}_${title}.${extension}`;
  const url = String(payload.dataUrl || payload.url || '');
  if (!url) throw new Error('没有可下载的图片地址');
  const downloadId = await chrome.downloads.download({ url, filename, conflictAction: 'uniquify', saveAs: false });
  const download = { downloadId, filename, category, createdAt: new Date().toISOString() };
  await chrome.storage.session.set({ [STORAGE.lastDownload]: download });
  captureArchiveQueue = captureArchiveQueue.catch(() => {}).then(async () => {
    await recordCaptureDownload(downloadId, {
      category: sanitizePathSegment(category, '未分类'), project, name: title, filename,
      sourcePageUrl: normalizeSourcePageUrl(payload.pageUrl),
      createdAt: download.createdAt, descriptionStatus: 'pending',
    });
    await archiveCapturedImage(downloadId, url).catch(() => {});
    const saved = await chrome.storage.local.get(STORAGE.capturePreviewsV4);
    if (!saved[STORAGE.capturePreviewsV4]?.[downloadId]) {
      await patchCaptureStatus(downloadId, { descriptionStatus: 'preview-missing', descriptionError: '图片预览未能保存，请先关联图片预览；原文件下载不受影响' });
    }
  });
  await captureArchiveQueue.catch(() => {});
  void drainCaptureDescriptions();
  chrome.runtime.sendMessage({ type: 'download.changed', download }).catch(() => {});
  return { ok: true, downloadId, filename, download };
}

async function forgetCapturedDownload(downloadId) {
  const stored = await chrome.storage.local.get([STORAGE.captureCatalogV4, STORAGE.capturePreviewsV4]);
  const catalog = stored[STORAGE.captureCatalogV4] || {};
  const previews = stored[STORAGE.capturePreviewsV4] || {};
  const captureId = previews[downloadId];
  if (!catalog[downloadId] && !captureId) return;
  if (captureId) await deleteSourceImagesByScheme(captureId);
  const nextCatalog = { ...catalog };
  const nextPreviews = { ...previews };
  delete nextCatalog[downloadId];
  delete nextPreviews[downloadId];
  await chrome.storage.local.set({
    [STORAGE.captureCatalogV4]: nextCatalog,
    [STORAGE.capturePreviewsV4]: nextPreviews,
  });
}

chrome.downloads.onErased.addListener(downloadId => {
  captureArchiveQueue = captureArchiveQueue.catch(() => {}).then(() => forgetCapturedDownload(downloadId));
  void captureArchiveQueue.catch(() => {});
});

async function showDownload(payload) {
  const downloadId = Number(payload.downloadId);
  if (!Number.isInteger(downloadId) || downloadId < 0) throw new Error('没有可定位的下载文件');
  await chrome.downloads.show(downloadId);
  return { ok: true };
}


async function analyzeBuilderReference(payload = {}) {
  const record = await getSourceImage(payload.sourceReferenceId);
  if (record.schemeId !== payload.builderId) throw categorizedError('OWNERSHIP_MISMATCH', '参考图不属于当前编辑内容', 'invalid_input');
  const bytes = new Uint8Array(await record.blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return analyzeSelection({
    transient: true,
    selection: {
      selectionId: record.sourceReferenceId,
      imagePayload: `data:${record.mimeType};base64,${btoa(binary)}`,
      sourceType: 'file',
      displayName: String(payload.displayName || '参考图').slice(0, 80),
    },
  });
}

async function confirmBuilder(payload = {}) {
  if (payload.confirmed !== true) throw categorizedError('CONFIRMATION_REQUIRED', '请先整体确认', 'invalid_input');
  const session = await chrome.storage.session.get(STORAGE.builderV3);
  const builder = session[STORAGE.builderV3];
  if (!builder || builder.builderId !== payload.builderId) throw categorizedError('STALE_DRAFT', '编辑内容已变化，请重新打开', 'invalid_input');
  const modules = normalizeIntentModules(builder.modules);
  if (!modules.some(module => module.enabled && module.value)) throw categorizedError('INVALID_INPUT', '请先加入需要的提示词', 'invalid_input');
  const prompt = compileIntentPrompt(modules, builder.principleText);
  if (payload.compiledPrompt !== prompt) throw categorizedError('PROMPT_MISMATCH', '预览已变化，请重新确认', 'invalid_input');
  const collection = await readSchemeCollection();
  const existing = collection.schemes.find(scheme => scheme.schemeId === builder.builderId);

  const now = new Date().toISOString();
  const references = [];
  for (const ref of (builder.references || []).slice(0, 3)) {
    if (!ref.sourceReferenceId) throw categorizedError('VERSION_INCOMPLETE', '有参考图尚未保存完成，请稍后再确认', 'invalid_input');
    const record = await getSourceImage(ref.sourceReferenceId);
    if (record.schemeId !== builder.builderId) throw categorizedError('OWNERSHIP_MISMATCH', '参考图归属不一致', 'invalid_input');
    references.push({
      sourceReferenceId: ref.sourceReferenceId, schemeId: builder.builderId,
      analysisId: ref.result?.analysisId, selectionId: ref.sourceReferenceId,
      displayName: ref.name, tags: existing?.sourceReferences.find(old => old.sourceReferenceId === ref.sourceReferenceId)?.tags || [],
      sourceType: 'file', mimeType: record.mimeType,
      byteSize: record.byteSize, assetState: 'available', createdAt: record.createdAt, capturedAt: now,
    });
  }
  const current = existing?.versions.at(-1);
  if (current && payload.baseVersionId !== current.versionId) throw categorizedError('STALE_DRAFT', '已确认提示词已有新版本，请重新打开', 'invalid_input');
  if (current && current.compiledPrompt === prompt
      && references.every(ref => current.sourceReferenceIds.includes(ref.sourceReferenceId))) {
    const saved = await writeSchemeInCollection({
      ...existing, name: String(builder.name || '未命名提示词').slice(0, 80),
      overallConfirmedAt: now, updatedAt: now,
    });
    return { ok: true, scheme: saved.scheme, version: current };
  }
  const version = normalizePromptVersion({
    versionId: crypto.randomUUID(), versionNumber: (current?.versionNumber || 0) + 1,
    origin: current ? 'revision-confirm' : 'initial-confirm', createdAt: now,
    modulesSnapshot: modules, principleText: builder.principleText, compiledPrompt: prompt,
    sourceReferenceIds: references.map(ref => ref.sourceReferenceId), changeSummary: [],
  }, builder.builderId);
  const scheme = normalizePromptScheme({
    ...(existing || {}), schemeId: builder.builderId,
    name: String(builder.name || '未命名提示词').slice(0, 80),
    modules, overallConfirmedAt: now, updatedAt: now,
    sourceReferences: [...(existing?.sourceReferences || []).filter(old => !references.some(ref => ref.sourceReferenceId === old.sourceReferenceId)), ...references],
    versions: [...(existing?.versions || []), version], currentVersionId: version.versionId,
  });
  const saved = await writeSchemeInCollection(scheme);
  return { ok: true, scheme: saved.scheme, version };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const run = async () => {
    if (['capture.describe', 'capture.describe.missing', 'capture.description.save', 'capture.delete', 'capture.folder.move', 'project-types.rename', 'capture.resume', 'library.image.resume', 'library.semantic', 'library.embed', 'assets.consent', 'assets.vectorConsent'].includes(message?.type)
        && ![chrome.runtime.getURL('library.html'), chrome.runtime.getURL('sidepanel.html')].includes(sender.url?.split('?')[0])) {
      throw new Error('请在 ArchBuddy 图词库中操作');
    }
    switch (message?.type) {
      case 'assets.consent':
        await chrome.storage.local.set({ [STORAGE.assetAIConsent]: message.payload?.enabled === true, ...(!message.payload?.enabled ? { [STORAGE.assetVectorConsent]: false } : { [STORAGE.privacyAccepted]: true }) });
        void drainCaptureDescriptions();
        return { ok: true };
      case 'assets.vectorConsent': {
        const consent = await chrome.storage.local.get(STORAGE.assetAIConsent);
        if (!consent[STORAGE.assetAIConsent] || message.payload?.enabled !== true) throw new Error('请先开启图库 AI 并确认向量处理范围');
        await chrome.storage.local.set({ [STORAGE.assetVectorConsent]: true });
        return { ok: true };
      }
      case 'library.embed': {
        const consent = await chrome.storage.local.get([STORAGE.assetAIConsent, STORAGE.assetVectorConsent]);
        if (!consent[STORAGE.assetAIConsent] || !consent[STORAGE.assetVectorConsent]) throw new Error('请先确认本地向量检索处理说明');
        const result = await requestBackend('/api/library/embed', { method: 'POST', body: message.payload });
        return { ok: true, model: result.model, vectors: result.vectors };
      }
      case 'library.semantic': {
        const consent = await chrome.storage.local.get(STORAGE.assetAIConsent);
        if (!consent[STORAGE.assetAIConsent]) throw new Error('请先确认图库 AI 处理说明');
        const result = await requestBackend('/api/library/search', { method: 'POST', body: message.payload });
        return { ok: true, matches: result.matches };
      }
      case 'library.image.resume': {
        const { schemes } = await readSchemeCollection();
        const scheme = schemes.find(item => item.schemeId === message.payload?.schemeId);
        const ref = scheme?.sourceReferences.find(item => item.sourceReferenceId === message.payload?.sourceReferenceId);
        if (!ref) throw new Error('来源图已不存在');
        const record = await getSourceImage(ref.sourceReferenceId);
        if (record.schemeId !== scheme.schemeId) throw new Error('图片归属不一致');
        await chrome.storage.session.set({ [STORAGE.libraryHandoffV4]: {
          mode: 'capture', sourceReferenceId: ref.sourceReferenceId, name: ref.displayName, nonce: crypto.randomUUID(),
        } });
        return { ok: true };
      }
      case 'capture.resume': {
        if (typeof message.payload?.downloadId === 'string' && message.payload.downloadId.startsWith('local:')) {
          const imported = await importedCaptureRecord(message.payload.downloadId);
          await chrome.storage.session.set({ [STORAGE.libraryHandoffV4]: {
            mode: 'capture', sourceReferenceId: imported.id, name: imported.name, nonce: crypto.randomUUID(),
          } });
          return { ok: true };
        }
        const id = Number(message.payload?.downloadId);
        const { stored } = await captureRecord(id);
        const sourceReferenceId = stored[STORAGE.capturePreviewsV4]?.[id];
        if (!sourceReferenceId) throw new Error('请先关联图片预览');
        await chrome.storage.session.set({ [STORAGE.libraryHandoffV4]: {
          mode: 'capture', downloadId: id, sourceReferenceId, name: stored[STORAGE.captureCatalogV4]?.[id]?.name || '图库参考图', nonce: crypto.randomUUID(),
        } });
        return { ok: true };
      }
      case 'capture.describe': return describeCapture(message.payload ?? {});
      case 'capture.describe.missing': return describeMissingCaptureDescriptions();
      case 'capture.description.save': return queueCaptureMutation(() => saveCaptureDescription(message.payload ?? {}));
      case 'capture.delete': return queueCaptureMutation(() => deleteCaptures(message.payload ?? {}));
      case 'capture.folder.move': return queueCaptureMutation(() => moveCaptureFolder(message.payload ?? {}));
      case 'project-types.rename': return queueCaptureMutation(() => renameProjectType(message.payload ?? {}));
      case 'builder.analyze': return analyzeBuilderReference(message.payload ?? {});
      case 'builder.confirm': return confirmBuilder(message.payload ?? {});
      case 'page.activate': return activatePage(message.tabId);
      case 'capture.syncPages': return syncCapturePages();
      case 'backend.status': return backendStatus();
      case 'image.select': return selectWebImage(message.payload ?? {}, sender);
      case 'image.paste': return selectPastedImage(message.payload ?? {});
      case 'analysis.run': return analyzeSelection(message.payload ?? {});
      case 'intent.add': return addCandidate(message.payload ?? {});
      case 'library.open': {
        const tab = await chrome.tabs.create({
          url: chrome.runtime.getURL('library.html'),
          ...(Number.isInteger(sender.tab?.windowId) ? { windowId: sender.tab.windowId } : {}),
        });
        await chrome.sidePanel.close({ windowId: tab.windowId }).catch(() => {});
        return { ok: true };
      }
      case 'library.metadata.save': return saveLibraryMetadata(message.payload ?? {});
      case 'library.resume': return resumeLibraryScheme(message.payload ?? {});
      case 'scheme.list': return listSchemes();
      case 'scheme.open': return openScheme(message.schemeId ?? message.payload?.schemeId);
      case 'scheme.delete': return deleteScheme(message.payload ?? message);
      case 'scheme.source.attach': return attachSchemeSource(message.payload ?? {});
      case 'scheme.working.get': return getWorkingDraft(message.payload?.schemeId);
      case 'scheme.working.save': return saveWorkingDraft(message.payload ?? {});
      case 'scheme.version.commit': return commitSchemeVersion(message.payload ?? {});
      case 'scheme.version.copy-read': return readVersionForCopy(message.payload ?? {});
      case 'evaluation.image.set': return setEvaluationImage(message.payload ?? {});
      case 'evaluation.run': return runEvaluation(message.payload ?? {});
      case 'evaluation.get': return getEvaluation(message.payload ?? {});
      case 'evaluation.clear': return clearEvaluation(message.payload ?? {});
      case 'draft.save': return saveDraft(message.payload?.draft ?? {});
      case 'draft.create': return createDraftContext();
      case 'draft.restore': return restoreDraft(message.payload?.draftId);
      case 'draft.delete': return deleteDraft(message.payload?.draftId);
      case 'analytics.consent.set': return setAnalyticsConsent(message.payload?.enabled);
      case 'analytics.record': return recordAnalytics(message.payload ?? {});
      case 'download.image': return downloadImage(message.payload ?? {});
      case 'download.show': return showDownload(message.payload ?? {});
      case 'state.get': {
        const [local, session] = await Promise.all([
          chrome.storage.local.get([
            STORAGE.captureEnabled,
            STORAGE.projectType,
            STORAGE.customTypes,
            STORAGE.privacyAccepted,
            STORAGE.installationId,
            STORAGE.intentDraftsV2,
            STORAGE.activeIntentDraftIdV2,
            STORAGE.analyticsConsent,
          ]),
          chrome.storage.session.get([
            STORAGE.selection,
            STORAGE.result,
            STORAGE.lastDownload,
            STORAGE.workingDraftV3,
            STORAGE.generatedResultV3,
            STORAGE.evaluationSessionV3,
          ]),
        ]);
        return {
          ok: true,
          captureEnabled: Boolean(local[STORAGE.captureEnabled]),
          projectType: normalizeProjectType(local[STORAGE.projectType]) || PRESET_TYPES[0],
          customTypes: Array.isArray(local[STORAGE.customTypes]) ? local[STORAGE.customTypes] : [],
          privacyAccepted: Boolean(local[STORAGE.privacyAccepted]),
          drafts: (Array.isArray(local[STORAGE.intentDraftsV2]) ? local[STORAGE.intentDraftsV2] : [])
            .map(item => normalizePromptScheme(item))
            .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
          activeDraftId: typeof local[STORAGE.activeIntentDraftIdV2] === 'string'
            ? local[STORAGE.activeIntentDraftIdV2]
            : null,
          analyticsConsent: local[STORAGE.analyticsConsent]?.policyVersion === ANALYTICS_POLICY_VERSION
            ? {
              enabled: local[STORAGE.analyticsConsent].enabled === true,
              updatedAt: String(local[STORAGE.analyticsConsent].updatedAt || ''),
              policyVersion: ANALYTICS_POLICY_VERSION,
            }
            : { enabled: false, updatedAt: '', policyVersion: ANALYTICS_POLICY_VERSION },
          selection: session[STORAGE.selection] ?? null,
          result: session[STORAGE.result] ?? null,
          lastDownload: session[STORAGE.lastDownload] ?? null,
          workingDraft: session[STORAGE.workingDraftV3] ?? null,
          generatedResult: session[STORAGE.generatedResultV3] ?? null,
          evaluationSession: session[STORAGE.evaluationSessionV3] ?? null,
        };
      }
      default: return { ok: false, error: '未知操作' };
    }
  };
  run().then(sendResponse).catch(error => sendResponse({
    ok: false,
    error: error?.message || String(error),
    code: error?.code || 'UNKNOWN_ERROR',
    category: errorCategory(error),
  }));
  return true;
});

function queueCaptureMutation(operation) {
  const pending = captureArchiveQueue.catch(() => {}).then(operation);
  captureArchiveQueue = pending;
  return pending;
}

async function renameProjectType(payload) {
  const from = normalizeProjectType(payload.from);
  const name = normalizeProjectType(payload.name);
  if (!name || name.length > 40 || /[<>:"/\\|?*\x00-\x1f]/.test(name)) throw new Error('请输入 1–40 字的有效分类名称');
  const stored = await chrome.storage.local.get([STORAGE.customTypes, STORAGE.hiddenProjectTypesV4, STORAGE.projectTypeOrderV4, STORAGE.projectTypeAliasesV4, STORAGE.projectType]);
  const custom = stored[STORAGE.customTypes] || [];
  const hidden = stored[STORAGE.hiddenProjectTypesV4] || [];
  const types = orderedProjectTypes(custom, hidden, stored[STORAGE.projectTypeOrderV4] || []);
  if (!types.includes(from)) throw new Error('这个分类已变化，请刷新后重试');
  if (name === from) return { ok: true };
  if (types.some(type => type.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error('已有同名分类');
  const oldAliases = stored[STORAGE.projectTypeAliasesV4] || {};
  const aliases = Object.fromEntries(Object.keys(oldAliases).filter(key => key !== name)
    .map(key => [key, resolveProjectType(key, oldAliases) === from ? name : resolveProjectType(key, oldAliases)]));
  Object.defineProperty(aliases, from, { value: name, enumerable: true, configurable: true, writable: true });
  await chrome.storage.local.set({
    [STORAGE.customTypes]: [...new Set([...custom.filter(type => type !== from), ...(!PRESET_TYPES.includes(name) ? [name] : [])])],
    [STORAGE.hiddenProjectTypesV4]: [...new Set([...hidden.filter(type => type !== name), ...(PRESET_TYPES.includes(from) ? [from] : [])])],
    [STORAGE.projectTypeOrderV4]: types.map(type => type === from ? name : type),
    [STORAGE.projectTypeAliasesV4]: aliases,
    [STORAGE.projectType]: stored[STORAGE.projectType] === from ? name : stored[STORAGE.projectType] || types[0],
  });
  return { ok: true };
}

async function captureRecord(downloadId) {
  if (!Number.isSafeInteger(downloadId) || downloadId < 0) throw new Error('图片标识无效');
  const [download] = await chrome.downloads.search({ id: downloadId });
  if (!download) throw new Error('下载记录已不存在，请重新保存图片');
  if (download.byExtensionId !== chrome.runtime.id) throw new Error('图片不属于当前 ArchBuddy 安装的下载');
  if (download.state === 'in_progress') throw categorizedError('DOWNLOAD_PENDING', '图片仍在下载，完成后会自动生成概要描述');
  if (download.state !== 'complete') throw new Error('图片下载已中断，请重新保存图片');
  if (!String(download.filename).split(/[\\/]/).includes('ArchBuddy')) throw new Error('图片不在 ArchBuddy 下载目录中');
  const stored = await chrome.storage.local.get([STORAGE.captureCatalogV4, STORAGE.capturePreviewsV4, STORAGE.captureHiddenV4]);
  if ((stored[STORAGE.captureHiddenV4] || []).includes(downloadId)) throw new Error('图片已移出图库');
  return { download, stored };
}

async function importedCaptureRecord(value) {
  const id = String(value || '').replace(/^local:/, '');
  if (!/^local:[0-9a-f-]{36}$/i.test(String(value || ''))) throw new Error('导入图片标识无效');
  const stored = await chrome.storage.local.get(STORAGE.importedAssetsV4);
  const imported = (stored[STORAGE.importedAssetsV4] || []).find(item => item.id === id);
  if (!imported) throw new Error('导入图片已不存在');
  const image = await getSourceImage(id);
  if (image.schemeId !== id) throw new Error('导入图片归属不一致');
  return imported;
}

async function saveCaptureDescription(payload) {
  if (typeof payload.downloadId === 'string' && payload.downloadId.startsWith('local:')) {
    const imported = await importedCaptureRecord(payload.downloadId);
    const description = String(payload.description || '').trim();
    if (description.length > 4000) throw new Error('视觉描述最多 4000 字');
    if (payload.previousDescription !== undefined && String(imported.description || '') !== payload.previousDescription)
      throw new Error('描述已在其他窗口更新，请刷新后再保存');
    const stored = await chrome.storage.local.get(STORAGE.importedAssetsV4);
    const next = (stored[STORAGE.importedAssetsV4] || []).map(item => item.id === imported.id
      ? { ...item, description, descriptionUpdatedAt: new Date().toISOString() } : item);
    await chrome.storage.local.set({ [STORAGE.importedAssetsV4]: next });
    return { ok: true, description };
  }
  const id = Number(payload.downloadId);
  const { stored } = await captureRecord(id);
  const description = String(payload.description || '').trim();
  if (description.length > 4000) throw new Error('视觉描述最多 4000 字');
  const catalog = stored[STORAGE.captureCatalogV4] || {};
  const current = catalog[id] || {};
  if (payload.previousDescription !== undefined && String(current.description || '') !== payload.previousDescription) {
    throw new Error('描述已在其他窗口更新，请刷新后再保存');
  }
  await chrome.storage.local.set({ [STORAGE.captureCatalogV4]: {
    ...catalog, [id]: { ...current, description, descriptionUpdatedAt: new Date().toISOString() },
  } });
  return { ok: true, description };
}

// Visual descriptions do not need original resolution. Smaller uploads reduce network latency.
async function compressImageForDescription(blob, { maxEdge = 1536, quality = 0.85 } = {}) {
  try {
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    if (!(scale > 0) || scale >= 1) {
      bitmap.close();
      return blob;
    }
    const canvas = new OffscreenCanvas(
      Math.max(1, Math.round(bitmap.width * scale)),
      Math.max(1, Math.round(bitmap.height * scale)),
    );
    const context = canvas.getContext('2d');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const compressed = await canvas.convertToBlob({ type: 'image/webp', quality });
    return compressed.size < blob.size ? compressed : blob;
  } catch {
    return blob;
  }
}

const captureDescriptionJobs = new Set();
const descriptionJobKey = value => 'capture-description:' + value;
async function patchImportedStatus(id, fields) {
  const stored = await chrome.storage.local.get(STORAGE.importedAssetsV4);
  await chrome.storage.local.set({ [STORAGE.importedAssetsV4]: (stored[STORAGE.importedAssetsV4] || []).map(item => item.id === id
    ? { ...item, ...fields } : item) });
}
async function describeCapture(payload) {
  const value = payload.downloadId;
  const importedId = typeof value === 'string' && value.startsWith('local:') ? value : null;
  const id = importedId ?? Number(value);
  const jobKey = descriptionJobKey(id);
  const consent = await chrome.storage.local.get(STORAGE.assetAIConsent);
  if (!consent[STORAGE.assetAIConsent]) throw new Error('请先确认图库 AI 处理说明');
  if (captureDescriptionJobs.has(jobKey)) throw new Error('这张图片正在生成描述');
  captureDescriptionJobs.add(jobKey);
  try {
    let image, previousDescription = '', sourceReferenceId;
    if (importedId) {
      const imported = await importedCaptureRecord(importedId);
      previousDescription = imported.description || '';
      sourceReferenceId = imported.id;
      image = await getSourceImage(imported.id);
      if (image.schemeId !== imported.id) throw new Error('图片归属不一致');
    } else {
      const { stored } = await captureRecord(id);
      sourceReferenceId = stored[STORAGE.capturePreviewsV4]?.[id];
      if (!sourceReferenceId) throw new Error('请先补齐这张图片的本地预览');
      previousDescription = stored[STORAGE.captureCatalogV4]?.[id]?.description || '';
      image = await getSourceImage(sourceReferenceId);
      if (image.schemeId !== sourceReferenceId) throw new Error('图片归属不一致');
    }
    const uploadBlob = await compressImageForDescription(image.blob);
    const data = await blobAsDataUrl(uploadBlob);
    const result = await requestBackend('/api/library/describe', { method: 'POST', body: {
      image: { mimeType: uploadBlob.type, base64: data.split(',')[1] },
    } });
    if (!result.description?.trim()) throw new Error('未取得有效视觉描述');
    await queueCaptureMutation(async () => {
      await saveCaptureDescription({ downloadId: id, description: result.description,
        previousDescription });
      if (importedId) await patchImportedStatus(importedId, {
        descriptionStatus: 'ready', descriptionError: null, descriptionCompletedAt: Date.now(),
      });
      else await patchCaptureStatus(id, { descriptionStatus: 'ready', descriptionError: null, descriptionCompletedAt: Date.now() });
    });
    await queueCaptureMutation(() => bumpDescriptionProgress({ id }));
    return { ok: true, description: result.description };
  } finally { captureDescriptionJobs.delete(jobKey); }
}
const DESCRIPTION_MAX_ATTEMPTS = 2;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function bumpDescriptionProgress({ id = null, failed = 0, failedId = null } = {}) {
  const stored = await chrome.storage.local.get(STORAGE.descriptionProgressV4);
  const progress = stored[STORAGE.descriptionProgressV4];
  const itemId = String(failedId ?? id);
  if (!Array.isArray(progress?.ids) || !progress.ids.includes(itemId)) return;
  const completedIds = Array.isArray(progress.completedIds) ? progress.completedIds : [];
  if (completedIds.includes(itemId)) return;
  const nextCompletedIds = [...completedIds, itemId];
  const failedIds = failed > 0
    ? [...new Set([...(Array.isArray(progress.failedIds) ? progress.failedIds : []), itemId])]
    : (Array.isArray(progress.failedIds) ? progress.failedIds : []);
  await chrome.storage.local.set({ [STORAGE.descriptionProgressV4]: {
    ...progress, completedIds: nextCompletedIds, failedIds,
    done: nextCompletedIds.length, failed: failedIds.length, updatedAt: Date.now(),
    ...(nextCompletedIds.length >= progress.total ? { finishedAt: Date.now() } : {}),
  } });
}
async function describeMissingCaptureDescriptions() {
  if (descriptionsRunning) throw new Error('已有描述生成任务正在运行，请稍后查看');
  const consent = await chrome.storage.local.get(STORAGE.assetAIConsent);
  if (!consent[STORAGE.assetAIConsent]) throw new Error('请先开启图库 AI');
  const stored = await chrome.storage.local.get([STORAGE.captureCatalogV4, STORAGE.capturePreviewsV4, STORAGE.importedAssetsV4]);
  const queuedIds = [];
  for (const [id, item] of Object.entries(stored[STORAGE.captureCatalogV4] || {})) {
    if (item.description || !stored[STORAGE.capturePreviewsV4]?.[id]
        || !['none', 'failed'].includes(item.descriptionStatus || 'none')) continue;
    await queueCaptureMutation(() => patchCaptureStatus(Number(id), {
      descriptionStatus: 'pending', descriptionError: null, descriptionRetryAt: null,
    }));
    queuedIds.push(String(id));
  }
  for (const item of stored[STORAGE.importedAssetsV4] || []) {
    if (item.description || !['none', 'failed'].includes(item.descriptionStatus || 'none')) continue;
    await queueCaptureMutation(() => patchImportedStatus(item.id, {
      descriptionStatus: 'pending', descriptionError: null, descriptionRetryAt: null,
    }));
    queuedIds.push('local:' + item.id);
  }
  if (queuedIds.length) {
    await queueCaptureMutation(() => chrome.storage.local.set({
      [STORAGE.descriptionProgressV4]: {
        ids: queuedIds, completedIds: [], failedIds: [],
        total: queuedIds.length, done: 0, failed: 0, startedAt: Date.now(), updatedAt: Date.now(),
      },
    }));
    void drainCaptureDescriptions();
  }
  return { ok: true, queued: queuedIds.length };
}

// 所有目录更新串行；模型调用在队列外，不阻塞下载、删除或手工描述编辑。
async function patchCaptureStatus(id, fields) {
  const stored = await chrome.storage.local.get(STORAGE.captureCatalogV4);
  const catalog = stored[STORAGE.captureCatalogV4] || {};
  if (!catalog[id]) return;
  await chrome.storage.local.set({ [STORAGE.captureCatalogV4]: { ...catalog, [id]: { ...catalog[id], ...fields } } });
}
let descriptionsRunning = false;
let descriptionsRerun = false;
async function drainCaptureDescriptions() {
  if (descriptionsRunning) { descriptionsRerun = true; return; }
  descriptionsRunning = true;
  try {
    const consent = await chrome.storage.local.get(STORAGE.assetAIConsent);
    if (!consent[STORAGE.assetAIConsent]) return;
    const stored = await chrome.storage.local.get([STORAGE.captureCatalogV4, STORAGE.capturePreviewsV4, STORAGE.importedAssetsV4]);
    const tasks = [];
    for (const [id, item] of Object.entries(stored[STORAGE.captureCatalogV4] || {})) {
      if (item.description || !['pending', 'preview-missing'].includes(item.descriptionStatus) || !stored[STORAGE.capturePreviewsV4]?.[id]
          || (item.descriptionRetryAt || 0) > Date.now()) continue;
      tasks.push({ downloadId: Number(id), imported: false });
    }
    for (const item of stored[STORAGE.importedAssetsV4] || []) {
      if (item.description || !['pending'].includes(item.descriptionStatus)
          || (item.descriptionRetryAt || 0) > Date.now()) continue;
      tasks.push({ downloadId: 'local:' + item.id, imported: true, importedId: item.id });
    }
    if (!tasks.length) return;

    // Six parallel calls; local development service uses the same cap; saves remain serialized.
    const descriptionConcurrency = 6;
    const nonRetryableCodes = new Set(['USER_DAILY_LIMIT', 'PROJECT_DAILY_LIMIT', 'TEST_LIMIT_REACHED',
      'QUOTA_REACHED', 'NOT_CONFIGURED', 'ANALYSIS_PAUSED', 'INVALID_IMAGE', 'IMAGE_TOO_LARGE']);
    let cursor = 0, stop = false;
    const runTask = async () => {
      while (cursor < tasks.length && !stop) {
        const task = tasks[cursor++];
        const markStatus = fields => queueCaptureMutation(() => task.imported
          ? patchImportedStatus(task.importedId, fields)
          : patchCaptureStatus(task.downloadId, fields));
        for (let attempt = 1; attempt <= DESCRIPTION_MAX_ATTEMPTS; attempt++) {
          const currentConsent = await chrome.storage.local.get(STORAGE.assetAIConsent);
          if (!currentConsent[STORAGE.assetAIConsent]) { stop = true; return; }
          try {
            if (task.imported) await importedCaptureRecord(task.downloadId);
            else await captureRecord(task.downloadId);
          } catch (error) {
            // The preview can be ready before Chrome finishes the original download.
            // Keep it pending so completion (or the recovery alarm) can resume it.
            if (error?.code === 'DOWNLOAD_PENDING') break;
            await markStatus({ descriptionStatus: 'failed', descriptionError: error.message });
            await queueCaptureMutation(() => bumpDescriptionProgress({ failed: 1, failedId: task.downloadId }));
            break;
          }
          await markStatus({ descriptionStatus: 'processing', descriptionStartedAt: Date.now() });
          try {
            await describeCapture({ downloadId: task.downloadId });
            break;
          } catch (error) {
            const nonRetryable = nonRetryableCodes.has(error?.code);
            if (nonRetryable || attempt >= DESCRIPTION_MAX_ATTEMPTS) {
              await markStatus({
                descriptionStatus: 'failed', descriptionError: error.message, descriptionRetryAt: null,
              });
              await queueCaptureMutation(() => bumpDescriptionProgress({ failed: 1, failedId: task.downloadId }));
              if (nonRetryable && ['USER_DAILY_LIMIT', 'PROJECT_DAILY_LIMIT', 'TEST_LIMIT_REACHED', 'QUOTA_REACHED'].includes(error?.code)) stop = true;
              break;
            }
            await markStatus({
              descriptionStatus: 'pending', descriptionError: error.message, descriptionRetryAt: null,
            });
            await delay(['RATE_LIMITED', 'BUSY'].includes(error?.code) ? 2500 : 1200);
          }
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(descriptionConcurrency, tasks.length) }, runTask));
  } catch { /* 保留已持久化任务，下次唤醒恢复。 */ }
  finally {
    descriptionsRunning = false;
    if (descriptionsRerun) { descriptionsRerun = false; void drainCaptureDescriptions(); }
  }
}
chrome.downloads.onChanged.addListener(change => {
  if (change.state?.current === 'complete') void drainCaptureDescriptions();
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[STORAGE.captureEnabled]) void syncCapturePages();
  if (area === 'local' && (changes[STORAGE.assetAIConsent]?.newValue || changes[STORAGE.capturePreviewsV4])) void drainCaptureDescriptions();
});
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'archbuddy-descriptions') void recoverDescriptionQueue(); });
async function recoverDescriptionQueue() {
  if (descriptionsRunning) return;
  await queueCaptureMutation(async () => {
    const stored = await chrome.storage.local.get([STORAGE.captureCatalogV4, STORAGE.importedAssetsV4]);
    for (const [id, item] of Object.entries(stored[STORAGE.captureCatalogV4] || {})) {
      if (item.descriptionStatus === 'processing' && Date.now() - item.descriptionStartedAt > 180000) {
        // 中断的付费请求结果未知：有结果则收尾，没有结果不自动重复计费。
        await patchCaptureStatus(id, item.description
          ? { descriptionStatus: 'ready', descriptionError: null }
          : { descriptionStatus: 'failed', descriptionError: '生成中断，可重新生成或填写视觉描述' });
      }
    }
    const imported = [...(stored[STORAGE.importedAssetsV4] || [])];
    let importedChanged = false;
    for (const [index, item] of imported.entries()) {
      if (item.descriptionStatus === 'processing' && Date.now() - item.descriptionStartedAt > 180000) {
        imported[index] = item.description
          ? { ...item, descriptionStatus: 'ready', descriptionError: null }
          : { ...item, descriptionStatus: 'failed', descriptionError: '生成中断，可重新生成或填写视觉描述' };
        importedChanged = true;
      }
    }
    if (importedChanged) await chrome.storage.local.set({ [STORAGE.importedAssetsV4]: imported });
  });
  await drainCaptureDescriptions();
}
void chrome.alarms.create('archbuddy-descriptions', { periodInMinutes: 1 }).then(() => recoverDescriptionQueue());

async function moveCaptureFolder(payload) {
  const { fromType, project, targetType } = payload;
  const ids = [...new Set(Array.isArray(payload.ids) ? payload.ids : [])];
  if (!ids.length || typeof project !== 'string' || !project || fromType === targetType) throw new Error('项目文件夹无效');
  const stored = await chrome.storage.local.get([STORAGE.captureCatalogV4, STORAGE.importedAssetsV4, STORAGE.customTypes,
    STORAGE.hiddenProjectTypesV4, STORAGE.projectTypeOrderV4, STORAGE.projectTypeAliasesV4]);
  const aliases = stored[STORAGE.projectTypeAliasesV4] || {};
  const types = orderedProjectTypes(stored[STORAGE.customTypes] || [], stored[STORAGE.hiddenProjectTypesV4] || [], stored[STORAGE.projectTypeOrderV4] || []);
  if (!types.includes(targetType) || !types.includes(fromType)) throw new Error('项目类型已变化，请刷新后再试');
  const catalog = { ...(stored[STORAGE.captureCatalogV4] || {}) };
  const imported = [...(stored[STORAGE.importedAssetsV4] || [])];
  for (const id of ids) {
    if (typeof id === 'string' && id.startsWith('local:')) {
      const item = await importedCaptureRecord(id);
      if (resolveProjectType(item.type, aliases) !== fromType || item.project !== project) throw new Error('项目内容已变化，请刷新后再试');
      const index = imported.findIndex(row => row.id === item.id);
      imported[index] = { ...imported[index], type: targetType };
    } else {
      const { download } = await captureRecord(id);
      const parts = String(download.filename || '').split(/[\\/]/).filter(Boolean);
      const root = parts.lastIndexOf('ArchBuddy');
      const saved = catalog[id] || {};
      const currentType = resolveProjectType(saved.virtualType || saved.category || parts[root + 1], aliases);
      const currentProject = saved.project || parts[root + 2];
      if (currentType !== fromType || currentProject !== project) throw new Error('项目内容已变化，请刷新后再试');
      catalog[id] = { ...saved, category: saved.category || parts[root + 1], project: currentProject,
        name: saved.name || parts.slice(root + 3).join(' / ').replace(/^[0-9]{8}-[0-9]{6}_/, ''), virtualType: targetType };
    }
  }
  await chrome.storage.local.set({ [STORAGE.captureCatalogV4]: catalog, [STORAGE.importedAssetsV4]: imported });
  return { ok: true, moved: ids.length };
}

async function deleteCaptures(payload) {
  if (payload.confirmed !== true) throw new Error('请确认删除范围');
  const ids = [...new Set(Array.isArray(payload.downloadIds) ? payload.downloadIds : [])];
  if (!ids.length || ids.some(id => !(Number.isSafeInteger(id) && id >= 0)
      && !(typeof id === 'string' && /^local:[0-9a-f-]{36}$/i.test(id)))) throw new Error('请选择要删除的图片');
  const deleted = [], failed = [], viewerCopiesKept = [];
  for (const id of ids) {
    try {
      if (typeof id === 'string') {
        const item = await importedCaptureRecord(id);
        const stored = await chrome.storage.local.get([STORAGE.importedAssetsV4, STORAGE.systemViewerExportsV4]);
        const exports = { ...(stored[STORAGE.systemViewerExportsV4] || {}) };
        const viewerId = exports[id]?.downloadId;
        await chrome.storage.local.set({ [STORAGE.importedAssetsV4]: (stored[STORAGE.importedAssetsV4] || []).filter(row => row.id !== item.id) });
        await deleteSourceImagesByScheme(item.id);
        if (Number.isSafeInteger(viewerId)) {
          try {
            const [download] = await chrome.downloads.search({ id: viewerId });
            const ownedViewer = download?.byExtensionId === chrome.runtime.id
              && String(download.url || '').startsWith('blob:' + chrome.runtime.getURL(''));
            if (ownedViewer && download.exists !== false) await chrome.downloads.removeFile(viewerId);
            if (ownedViewer) await chrome.downloads.erase({ id: viewerId });
          } catch { viewerCopiesKept.push(id); }
          delete exports[id];
          await chrome.storage.local.set({ [STORAGE.systemViewerExportsV4]: exports });
        }
        deleted.push(id);
        continue;
      }
      const { download } = await captureRecord(id);
      if (payload.deleteOriginal === true && download.exists !== false) {
        await chrome.downloads.removeFile(id);
      }
      const stored = await chrome.storage.local.get(STORAGE.captureHiddenV4);
      await chrome.storage.local.set({ [STORAGE.captureHiddenV4]: [...new Set([...(stored[STORAGE.captureHiddenV4] || []), id])] });
      await forgetCapturedDownload(id);
      deleted.push(id);
    } catch (error) { failed.push({ id, error: error.message }); }
  }
  return { ok: true, deleted, failed, viewerCopiesKept };
}

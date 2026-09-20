import { BACKEND_BASE_URL, BACKEND_MODE, backendUrl } from './runtime-config.mjs';
import {
  INTENT_MODULES,
  PRESET_TYPES,
  STORAGE,
  addCandidateToPlan,
  createEmptyIntentModules,
  dataUrlParts,
  extensionFromUrl,
  normalizeIntentDraft,
  normalizeIntentModules,
  normalizeProjectType,
  sanitizePathSegment,
} from './shared.mjs';

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
  if (['IMAGE_REJECTED', 'BODY_TOO_LARGE', 'INVALID_CONTENT_TYPE', 'MALFORMED_JSON'].includes(error?.code)) return 'invalid_input';
  if (error?.code === 'NETWORK_UNAVAILABLE') return 'network_unavailable';
  if (['PROCESS_TIMEOUT', 'UPSTREAM_TIMEOUT'].includes(error?.code)) return 'timeout';
  if (['USER_DAILY_LIMIT', 'PROJECT_DAILY_LIMIT', 'RATE_LIMITED', 'TEST_LIMIT_REACHED'].includes(error?.code)) return 'quota_exceeded';
  if (error?.code === 'ANALYSIS_FORMAT_INVALID') return 'format_invalid';
  if (error?.code === 'VERSION_MISMATCH') return 'version_mismatch';
  if (['NOT_CONFIGURED', 'UPSTREAM_FAILED', 'BUSY', 'ANALYSIS_PAUSED', 'ANONYMOUS_SESSION_DISABLED'].includes(error?.code)) return 'service_unavailable';
  return 'unknown_error';
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

async function anonymousToken({ forceRefresh = false } = {}) {
  if (!forceRefresh) {
    const stored = await chrome.storage.session.get([STORAGE.sessionToken, STORAGE.sessionExpiresAt]);
    if (typeof stored[STORAGE.sessionToken] === 'string' && Number(stored[STORAGE.sessionExpiresAt]) > Date.now() + 60_000) {
      return stored[STORAGE.sessionToken];
    }
  }
  await chrome.storage.session.remove([STORAGE.sessionToken, STORAGE.sessionExpiresAt]);
  return createAnonymousSession();
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
  if (!response.ok) throw backendError(payload?.code, payload?.message || `HTTP ${response.status}`);
  return payload;
}

async function requestBackend(path, options = {}) {
  const authenticatedPaths = ['/api/analyze', '/api/v2/analyze', '/api/events'];
  if (!authenticatedPaths.includes(path)) return fetchBackend(path, options);
  const requestId = ['/api/analyze', '/api/v2/analyze'].includes(path) ? crypto.randomUUID() : undefined;
  let token = await anonymousToken();
  try {
    return await fetchBackend(path, { ...options, token, requestId });
  } catch (error) {
    if (error?.code !== 'UNAUTHORIZED') throw error;
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

async function analyzeSelection() {
  const local = await chrome.storage.local.get(STORAGE.privacyAccepted);
  if (!local[STORAGE.privacyAccepted]) throw categorizedError('IMAGE_CONSENT_REQUIRED', '请先确认图片处理与隐私说明', 'invalid_input');
  const session = await chrome.storage.session.get(STORAGE.selection);
  const selection = session[STORAGE.selection];
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
  await chrome.storage.session.set({
    [STORAGE.result]: result,
  });
  const saved = await prepareDraftForAnalysis(result, selection);
  return { ok: true, result, draft: saved.draft, drafts: saved.drafts };
}

async function draftState() {
  const stored = await chrome.storage.local.get([STORAGE.intentDraftsV2, STORAGE.activeIntentDraftIdV2]);
  const drafts = (Array.isArray(stored[STORAGE.intentDraftsV2]) ? stored[STORAGE.intentDraftsV2] : [])
    .map(item => normalizeIntentDraft(item))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 5);
  const activeDraftId = typeof stored[STORAGE.activeIntentDraftIdV2] === 'string'
    ? stored[STORAGE.activeIntentDraftIdV2]
    : null;
  return { drafts, activeDraftId };
}

async function saveDraft(input) {
  const { drafts } = await draftState();
  const now = new Date().toISOString();
  const draft = normalizeIntentDraft({ ...input, updatedAt: now }, now);
  const next = [draft, ...drafts.filter(item => item.draftId !== draft.draftId)]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 5);
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
  return saveDraft({
    ...draft,
    modules: addCandidateToPlan(draft.modules, candidate, {
      analysisId: result.analysisId,
      displayName: result.referenceHint?.displayName,
    }),
    overallConfirmedAt: null,
  });
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
  chrome.runtime.sendMessage({ type: 'download.changed', download }).catch(() => {});
  return { ok: true, downloadId, filename, download };
}

async function showDownload(payload) {
  const downloadId = Number(payload.downloadId);
  if (!Number.isInteger(downloadId) || downloadId < 0) throw new Error('没有可定位的下载文件');
  await chrome.downloads.show(downloadId);
  return { ok: true };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const run = async () => {
    switch (message?.type) {
      case 'page.activate': return activatePage(message.tabId);
      case 'backend.status': return backendStatus();
      case 'image.select': return selectWebImage(message.payload ?? {}, sender);
      case 'image.paste': return selectPastedImage(message.payload ?? {});
      case 'analysis.run': return analyzeSelection(message.payload ?? {});
      case 'intent.add': return addCandidate(message.payload ?? {});
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
          chrome.storage.session.get([STORAGE.selection, STORAGE.result, STORAGE.lastDownload]),
        ]);
        return {
          ok: true,
          captureEnabled: Boolean(local[STORAGE.captureEnabled]),
          projectType: normalizeProjectType(local[STORAGE.projectType]) || PRESET_TYPES[0],
          customTypes: Array.isArray(local[STORAGE.customTypes]) ? local[STORAGE.customTypes] : [],
          privacyAccepted: Boolean(local[STORAGE.privacyAccepted]),
          drafts: (Array.isArray(local[STORAGE.intentDraftsV2]) ? local[STORAGE.intentDraftsV2] : [])
            .map(item => normalizeIntentDraft(item))
            .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
            .slice(0, 5),
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

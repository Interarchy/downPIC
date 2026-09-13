import { BACKEND_BASE_URL, BACKEND_MODE, backendUrl } from './runtime-config.mjs';
import {
  PRESET_TYPES,
  STORAGE,
  dataUrlParts,
  extensionFromUrl,
  normalizeProjectType,
  sanitizePathSegment,
  serializeSections,
} from './shared.mjs';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ANALYSIS_TIMEOUT_MS = 70_000;

chrome.storage.session.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' });
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
// Remove the legacy BYOK value if this profile upgrades from 0.1.x.
chrome.storage.session.remove('deepseek_api_key').catch(() => {});

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get([
    STORAGE.captureEnabled,
    STORAGE.projectType,
    STORAGE.customTypes,
  ]);
  await chrome.storage.local.set({
    [STORAGE.captureEnabled]: Boolean(stored[STORAGE.captureEnabled]),
    [STORAGE.projectType]: normalizeProjectType(stored[STORAGE.projectType]) || PRESET_TYPES[0],
    [STORAGE.customTypes]: Array.isArray(stored[STORAGE.customTypes]) ? stored[STORAGE.customTypes] : [],
  });
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
    NOT_CONFIGURED: 'downPIC 服务尚未配置 DeepSeek，请先启动已配置密钥的本地服务。',
    INVALID_CONFIGURATION: 'downPIC 服务的 DeepSeek 配置无效，请重新配置并重启服务。',
    IMAGE_REJECTED: '服务无法读取这张图片，请换一张 PNG、JPEG 或 WebP。',
    ANALYSIS_FORMAT_INVALID: '模型没有按约定格式返回，请重试。',
    UPSTREAM_TIMEOUT: '模型分析超时，请稍后重试。',
    UPSTREAM_FAILED: 'DeepSeek 暂时不可用，请稍后重试。',
    BODY_TOO_LARGE: '图片超过服务允许的大小，请换一张较小的图片。',
    FORBIDDEN: 'downPIC 服务拒绝了扩展请求，请更新本地服务后重试。',
  };
  return new Error(messages[code] || detail || 'downPIC 服务请求失败');
}

async function requestBackend(path, { method = 'GET', body, timeoutMs = ANALYSIS_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(backendUrl(path), {
      method,
      signal: controller.signal,
      headers: body
        ? { 'content-type': 'application/json', 'x-downpic': '1' }
        : { 'x-downpic': '1' },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('downPIC 服务响应超时，请确认服务正在运行');
    throw new Error(`无法连接 downPIC 服务（${BACKEND_BASE_URL}），请先启动本地服务`);
  } finally {
    clearTimeout(timeout);
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) throw backendError(payload?.code, payload?.message || `HTTP ${response.status}`);
  return payload;
}

async function backendStatus() {
  try {
    const status = await requestBackend('/api/status', { timeoutMs: 2500 });
    return { ok: true, online: true, configured: Boolean(status?.configured), mode: BACKEND_MODE };
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
    id: crypto.randomUUID(),
    dataUrl: await blobAsDataUrl(blob),
    mimeType: blob.type,
    title: String(payload.title || payload.alt || tab.title || '网页参考图'),
    sourceUrl: String(payload.sourceUrl || tab.url || ''),
    pageUrl: String(tab.url || ''),
    pageTitle: String(tab.title || ''),
    pendingAnalysis: true,
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
        id: crypto.randomUUID(),
        dataUrl: captured.dataUrl,
        mimeType: captured.mimeType,
        title: String(payload.title || payload.alt || sender.tab.title || '网页参考图'),
        sourceUrl: String(payload.sourceUrl || sender.tab.url || ''),
        pageUrl: String(sender.tab.url || ''),
        pageTitle: String(sender.tab.title || ''),
        pendingAnalysis: true,
        selectedAt: new Date().toISOString(),
      }
    : await captureImageFromTab(fallbackPayload, sender);
  await chrome.storage.session.set({ [STORAGE.selection]: selection, [STORAGE.result]: null });
  chrome.runtime.sendMessage({ type: 'selection.changed' }).catch(() => {});
  return { ok: true };
}

async function selectPastedImage(payload) {
  const { mimeType, base64 } = dataUrlParts(payload.dataUrl);
  if (Math.ceil(base64.length * 0.75) > MAX_IMAGE_BYTES) throw new Error('图片超过 10 MB');
  const selection = {
    id: crypto.randomUUID(),
    dataUrl: payload.dataUrl,
    mimeType,
    title: String(payload.title || '粘贴的参考图'),
    sourceUrl: '',
    pageUrl: '',
    pageTitle: '',
    pendingAnalysis: false,
    selectedAt: new Date().toISOString(),
  };
  await chrome.storage.session.set({ [STORAGE.selection]: selection, [STORAGE.result]: null });
  chrome.runtime.sendMessage({ type: 'selection.changed' }).catch(() => {});
  return { ok: true };
}

async function analyzeSelection() {
  const local = await chrome.storage.local.get(STORAGE.privacyAccepted);
  if (!local[STORAGE.privacyAccepted]) throw new Error('请先确认图片处理与隐私说明');
  const session = await chrome.storage.session.get(STORAGE.selection);
  const selection = session[STORAGE.selection];
  if (!selection?.dataUrl) throw new Error('请先选择或粘贴一张参考图');
  const { mimeType, base64 } = dataUrlParts(selection.dataUrl);

  const payload = await requestBackend('/api/analyze', {
    method: 'POST',
    body: { image: { mimeType, base64 } },
  });
  const sections = Array.isArray(payload?.sections)
    ? payload.sections
      .filter(section => section?.title && section?.text)
      .map(section => ({ title: String(section.title), text: String(section.text) }))
    : [];
  if (sections.length < 5) throw new Error('服务返回的提示词分项不完整，请重试');
  const result = {
    sections,
    text: serializeSections(sections),
    durationMs: Number(payload.durationMs) || 0,
    model: String(payload.model || 'deepseek-flash'),
    cached: Boolean(payload.cached),
    selectionId: selection.id,
    completedAt: new Date().toISOString(),
  };
  await chrome.storage.session.set({
    [STORAGE.result]: result,
    [STORAGE.selection]: { ...selection, pendingAnalysis: false },
  });
  return { ok: true, result };
}

async function downloadImage(payload) {
  const category = normalizeProjectType(payload.category) || PRESET_TYPES[0];
  const project = sanitizePathSegment(payload.pageTitle || payload.title, '未命名项目');
  const title = sanitizePathSegment(payload.title, '参考图');
  const extension = extensionFromUrl(payload.url, payload.mimeType);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/T/, '-').slice(0, 15);
  const filename = `downPIC/${sanitizePathSegment(category, '未分类')}/${project}/${stamp}_${title}.${extension}`;
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
      case 'analysis.run': return analyzeSelection();
      case 'download.image': return downloadImage(message.payload ?? {});
      case 'download.show': return showDownload(message.payload ?? {});
      case 'state.get': {
        const [local, session] = await Promise.all([
          chrome.storage.local.get([
            STORAGE.captureEnabled,
            STORAGE.projectType,
            STORAGE.customTypes,
            STORAGE.privacyAccepted,
          ]),
          chrome.storage.session.get([STORAGE.selection, STORAGE.result, STORAGE.lastDownload]),
        ]);
        return {
          ok: true,
          captureEnabled: Boolean(local[STORAGE.captureEnabled]),
          projectType: normalizeProjectType(local[STORAGE.projectType]) || PRESET_TYPES[0],
          customTypes: Array.isArray(local[STORAGE.customTypes]) ? local[STORAGE.customTypes] : [],
          privacyAccepted: Boolean(local[STORAGE.privacyAccepted]),
          selection: session[STORAGE.selection] ?? null,
          result: session[STORAGE.result] ?? null,
          lastDownload: session[STORAGE.lastDownload] ?? null,
        };
      }
      default: return { ok: false, error: '未知操作' };
    }
  };
  run().then(sendResponse).catch(error => sendResponse({ ok: false, error: error?.message || String(error) }));
  return true;
});

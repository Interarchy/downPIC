import {
  STORAGE_KEYS,
  captureSuccessMessage,
  createPendingCapture,
  nativeEnvelope,
  stagingFilename,
} from './capture-model.mjs';

const HOST_NAME = 'com.suoyinshi.capture';

async function getPending() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.pending);
  return result[STORAGE_KEYS.pending] ?? {};
}

async function putPending(records) {
  await chrome.storage.local.set({ [STORAGE_KEYS.pending]: records });
}

async function cleanupStagingDownloadHistory() {
  try {
    const items = await chrome.downloads.search({ query: ['索引室待导入'] });
    const stagingItems = items.filter((item) => String(item.filename ?? '').includes('索引室待导入'));
    await Promise.allSettled(stagingItems.map((item) => chrome.downloads.erase({ id: item.id })));
  } catch {
    // History cleanup is cosmetic and must not affect capture recovery.
  }
}

async function updatePending(captureId, patch) {
  const records = await getPending();
  if (!records[captureId]) return null;
  records[captureId] = { ...records[captureId], ...patch };
  await putPending(records);
  return records[captureId];
}

async function removePending(captureId) {
  const records = await getPending();
  delete records[captureId];
  await putPending(records);
}

async function rememberCaptureStatus(record, state, message, managedPath = '') {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.statuses);
  const statuses = stored[STORAGE_KEYS.statuses] ?? {};
  statuses[record.capture_id] = {
    type: 'capture.status',
    captureId: record.capture_id,
    state,
    message,
    managedPath,
    updatedAt: new Date().toISOString(),
  };
  const recent = Object.values(statuses)
    .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
    .slice(0, 50);
  await chrome.storage.local.set({
    [STORAGE_KEYS.statuses]: Object.fromEntries(recent.map((item) => [item.captureId, item])),
  });
  return statuses[record.capture_id];
}

async function notifyTab(record, state, message, managedPath = '') {
  const latest = await rememberCaptureStatus(record, state, message, managedPath);
  if (!record?.tab_id) return;
  try {
    await chrome.tabs.sendMessage(record.tab_id, latest);
  } catch {
    // The source tab may already be closed; the pending record remains authoritative.
  }
}

async function sendToDesktop(record) {
  if (!record?.temporary_path) return;
  const response = await new Promise((resolve) => {
    chrome.runtime.sendNativeMessage(
      HOST_NAME,
      nativeEnvelope('capture.enqueue', record),
      (value) => resolve(chrome.runtime.lastError ? null : value),
    );
  });

  if (!response) {
    await notifyTab(record, 'staged', '已下载并暂存，打开桌面端后自动整理');
    return;
  }

  const result = response.payload ?? {};
  if (result.state === 'imported' || result.state === 'duplicate') {
    if (record.download_id != null) {
      try {
        await chrome.downloads.erase({ id: record.download_id });
      } catch {
        // Import is already complete; a history-cleanup failure must not undo it.
      }
    }
    const records = await getPending();
    delete records[record.capture_id];
    await putPending(records);
    await notifyTab(
      record,
      result.state,
      captureSuccessMessage(record, result.state),
      result.managed_path,
    );
    return;
  }

  const failed = await updatePending(record.capture_id, {
    status: 'import_failed',
    error_code: result.error_code ?? 'NATIVE_HOST_ERROR',
  });
  await notifyTab(failed, 'failed', result.message ?? '导入失败，可打开桌面端后重试');
}

async function fetchWithDesktop(record) {
  const response = await new Promise((resolve) => {
    chrome.runtime.sendNativeMessage(
      HOST_NAME,
      nativeEnvelope('capture.fetch', record),
      (value) => resolve(chrome.runtime.lastError ? null : value),
    );
  });
  const result = response?.payload;
  if (!response) return { handled: false };
  if (!['imported', 'duplicate'].includes(result?.state)) {
    await removePending(record.capture_id);
    return {
      handled: true,
      ok: false,
      errorCode: result?.error_code ?? 'SITE_IMAGE_FETCH_FAILED',
      message: result?.message ?? '小红书图片获取失败',
    };
  }
  await removePending(record.capture_id);
  await notifyTab(
    record,
    result.state,
    captureSuccessMessage(record, result.state),
    result.managed_path,
  );
  return { handled: true, ok: true };
}

async function getDesktopStatus() {
  const response = await new Promise((resolve) => {
    chrome.runtime.sendNativeMessage(
      HOST_NAME,
      nativeEnvelope('app.hello', { extension_version: chrome.runtime.getManifest().version }),
      (value) => resolve(chrome.runtime.lastError ? null : value),
    );
  });
  return response?.payload?.state === 'connected'
    ? { connected: true, state: 'connected', pendingCount: Object.keys(await getPending()).length }
    : { connected: false, state: 'offline', pendingCount: Object.keys(await getPending()).length };
}

function arrayBufferAsDataUrl(buffer, mimeType) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

async function fetchSiteImage(imageUrl) {
  if (!/(?:pinimg\.com)/i.test(imageUrl)) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(imageUrl, { credentials: 'include', signal: controller.signal });
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type')?.split(';')[0] ?? '';
    const buffer = await response.arrayBuffer();
    if (!contentType.startsWith('image/') || buffer.byteLength <= 0 || buffer.byteLength > 20 * 1024 * 1024) return null;
    return { downloadUrl: arrayBufferAsDataUrl(buffer, contentType), mimeType: contentType };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function revealAsset(managedPath) {
  const response = await new Promise((resolve) => {
    chrome.runtime.sendNativeMessage(
      HOST_NAME,
      nativeEnvelope('asset.reveal', { managed_path: managedPath }),
      (value) => resolve(chrome.runtime.lastError ? null : value),
    );
  });
  const result = response?.payload;
  return result?.state === 'opened'
    ? { ok: true }
    : { ok: false, errorCode: result?.error_code ?? 'DESKTOP_UNAVAILABLE' };
}

async function revealLibrary() {
  const response = await new Promise((resolve) => {
    chrome.runtime.sendNativeMessage(
      HOST_NAME,
      nativeEnvelope('library.reveal', {}),
      (value) => resolve(chrome.runtime.lastError ? null : value),
    );
  });
  const result = response?.payload;
  return result?.state === 'opened'
    ? { ok: true }
    : { ok: false, errorCode: result?.error_code ?? 'DESKTOP_UNAVAILABLE' };
}

async function beginDownload(request, sender) {
  const fetched = request.downloadUrl ? null : await fetchSiteImage(request.imageUrl);
  const resolvedRequest = fetched
    ? { ...request, downloadUrl: fetched.downloadUrl, mimeType: fetched.mimeType }
    : request;
  let record;
  try {
    record = createPendingCapture({ ...resolvedRequest, tabId: sender.tab?.id ?? null });
  } catch (error) {
    return { ok: false, errorCode: error.message };
  }

  const records = await getPending();
  records[record.capture_id] = record;
  await putPending(records);

  if (/(?:xhscdn\.com|xiaohongshu\.com)/i.test(record.image_url)) {
    const nativeFetch = await fetchWithDesktop(record);
    if (nativeFetch.handled) {
      return nativeFetch.ok
        ? { ok: true, captureId: record.capture_id, state: 'imported' }
        : { ...nativeFetch, captureId: record.capture_id };
    }
  }

  try {
    const downloadId = await chrome.downloads.download({
      url: resolvedRequest.downloadUrl || record.image_url,
      filename: stagingFilename(record.capture_id, record.extension, new Date(record.captured_at)),
      conflictAction: 'uniquify',
      saveAs: false,
    });
    await updatePending(record.capture_id, { download_id: downloadId });
    return { ok: true, captureId: record.capture_id, state: 'downloading' };
  } catch (error) {
    await updatePending(record.capture_id, {
      status: 'download_failed',
      error_code: 'DOWNLOAD_START_FAILED',
      error_message: String(error?.message ?? error),
    });
    await removePending(record.capture_id);
    return { ok: false, captureId: record.capture_id, errorCode: 'DOWNLOAD_START_FAILED' };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'capture.request') {
    beginDownload(message.payload, sender).then(sendResponse);
    return true;
  }

  if (message?.type === 'capture.retry-import') {
    getPending().then((records) => sendToDesktop(records[message.captureId])).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message?.type === 'capture.get-status') {
    chrome.storage.local.get(STORAGE_KEYS.statuses).then((stored) => {
      sendResponse(stored[STORAGE_KEYS.statuses]?.[message.captureId] ?? null);
    });
    return true;
  }

  if (message?.type === 'app.get-status') {
    getDesktopStatus().then(sendResponse);
    return true;
  }


  if (message?.type === 'asset.reveal') {
    revealAsset(message.managedPath).then(sendResponse);
    return true;
  }


  if (message?.type === 'library.reveal') {
    revealLibrary().then(sendResponse);
    return true;
  }

  return false;
});

chrome.downloads.onChanged.addListener(async (delta) => {
  if (!delta.state && !delta.error) return;
  const records = await getPending();
  const record = Object.values(records).find((item) => item.download_id === delta.id);
  if (!record) return;

  if (delta.error) {
    const failed = await updatePending(record.capture_id, {
      status: 'download_failed',
      error_code: delta.error.current || 'DOWNLOAD_INTERRUPTED',
    });
    await notifyTab(failed, 'failed', '下载中断，图片尚未保存');
    await removePending(record.capture_id);
    return;
  }

  if (delta.state?.current !== 'complete') return;
  const items = await chrome.downloads.search({ id: delta.id });
  await finishDownloadedRecord(record, delta.id, items[0]);
});

async function finishDownloadedRecord(record, downloadId, item) {
  const downloaded = await updatePending(record.capture_id, {
    status: 'downloaded_pending_import',
    temporary_path: item?.filename ?? null,
    byte_size: item?.fileSize ?? null,
  });
  try {
    // The download is an internal staging step. Remove its history entry before
    // the native host moves the file, so Chrome never presents it as deleted.
    await chrome.downloads.erase({ id: downloadId });
  } catch {
    // The pending record and staging file remain authoritative if cleanup fails.
  }
  await sendToDesktop(downloaded);
}

async function reconcilePendingDownloads() {
  const records = await getPending();
  for (const record of Object.values(records)) {
    if (record.status !== 'downloading' || record.download_id == null) continue;
    const item = (await chrome.downloads.search({ id: record.download_id }))[0];
    if (item?.state === 'complete') {
      await finishDownloadedRecord(record, record.download_id, item);
      continue;
    }
    const age = Date.now() - new Date(record.captured_at).getTime();
    if (item?.state === 'in_progress' && age < 2 * 60 * 1000) continue;
    if (item?.state === 'in_progress') {
      try { await chrome.downloads.cancel(record.download_id); } catch {}
    }
    const failed = await updatePending(record.capture_id, {
      status: 'download_failed',
      error_code: item?.error || 'DOWNLOAD_TIMEOUT',
    });
    await notifyTab(failed, 'failed', '下载未完成，请刷新页面后重试');
    await removePending(record.capture_id);
  }
}

async function flushPending() {
  const records = await getPending();
  for (const record of Object.values(records)) {
    if (record.status === 'downloaded_pending_import' || record.status === 'import_failed') {
      await sendToDesktop(record);
    }
  }
}

chrome.runtime.onStartup.addListener(async () => {
  await cleanupStagingDownloadHistory();
  await reconcilePendingDownloads();
  await flushPending();
});
chrome.runtime.onInstalled.addListener(async () => {
  await cleanupStagingDownloadHistory();
  await reconcilePendingDownloads();
  await flushPending();
});

export const STORAGE_KEYS = {
  enabled: 'capture_enabled',
  projectType: 'default_project_type',
  pending: 'pending_captures',
  statuses: 'capture_statuses',
  copyrightAcknowledged: 'copyright_ack_v1',
  customProjectTypes: 'custom_project_types_cache',
};

export const SUPPORTED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp']);

export function createCaptureId(now = Date.now(), random = crypto.getRandomValues(new Uint32Array(2))) {
  const time = now.toString(16).padStart(12, '0');
  return `${time}-${random[0].toString(16).padStart(8, '0')}${random[1].toString(16).padStart(8, '0')}`;
}

export function normalizeProjectType(value) {
  return String(value ?? '').replaceAll('\u3000', ' ').trim().replace(/\s+/g, ' ');
}

export function projectNameFromCapture(record) {
  const pageTitle = String(record?.page_title ?? '').trim();
  const siteName = String(record?.site_name ?? '').trim();
  return pageTitle || siteName || '未命名项目';
}

export function captureSuccessMessage(record, state) {
  const location = `${record.project_type_name} / ${projectNameFromCapture(record)}`;
  return state === 'duplicate' ? `当前项目已存在：${location}` : `已整理到：${location}`;
}

export function extensionFromUrl(url, mimeType = '') {
  const mimeMap = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };
  if (mimeMap[mimeType.toLowerCase()]) return mimeMap[mimeType.toLowerCase()];

  try {
    const pathname = new URL(url).pathname;
    const candidate = pathname.split('.').pop()?.toLowerCase() ?? '';
    if (SUPPORTED_EXTENSIONS.has(candidate)) return candidate === 'jpeg' ? 'jpg' : candidate;
    const encodedFormat = String(url).match(/(?:format[\/=]|[_!])(webp|jpe?g|png)(?:[_/?|&#]|$)/i)?.[1]?.toLowerCase();
    return encodedFormat ? (encodedFormat === 'jpeg' ? 'jpg' : encodedFormat) : null;
  } catch {
    return null;
  }
}

export function monthBucket(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function stagingFilename(captureId, extension, date = new Date()) {
  if (!SUPPORTED_EXTENSIONS.has(extension)) throw new Error('UNSUPPORTED_FORMAT');
  return `索引室待导入/${monthBucket(date)}/${captureId}.${extension === 'jpeg' ? 'jpg' : extension}`;
}

export function createPendingCapture(input, now = new Date()) {
  const projectTypeName = normalizeProjectType(input.projectTypeName);
  if (!projectTypeName) throw new Error('PROJECT_TYPE_REQUIRED');
  const extension = extensionFromUrl(input.imageUrl, input.mimeType);
  if (!extension) throw new Error('UNSUPPORTED_FORMAT');
  const captureId = input.captureId ?? createCaptureId(now.getTime());
  return {
    schema_version: 1,
    capture_id: captureId,
    status: 'downloading',
    download_id: null,
    temporary_path: null,
    content_hash: null,
    mime_type: input.mimeType || `image/${extension === 'jpg' ? 'jpeg' : extension}`,
    project_type_name: projectTypeName,
    page_title: String(input.pageTitle ?? '').trim(),
    page_url: String(input.pageUrl ?? ''),
    image_url: String(input.imageUrl ?? ''),
    site_name: String(input.siteName ?? ''),
    original_filename: String(input.originalFilename ?? ''),
    captured_at: now.toISOString(),
    tab_id: input.tabId ?? null,
    extension,
  };
}

export function nativeEnvelope(type, payload, messageId = createCaptureId()) {
  return {
    schema_version: 1,
    message_id: messageId,
    type,
    sent_at: new Date().toISOString(),
    payload,
  };
}

// 浏览器侧唯一与本地服务通信的地方。
// 这里不持有任何密钥——密钥只在服务进程里，浏览器侧连它的影子都看不到。

// 自定义头有两个作用：让服务端能识别「是自家页面发的」，
// 以及强制浏览器发预检（预检不通过，跨站页面就发不出这个请求）。
const HEADERS = { 'x-downpic': '1' };

export class ApiError extends Error {
  constructor(code, message, { status = 0, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

export const ERROR_HINTS = {
  NOT_CONFIGURED: '服务端还没配置 DeepSeek 密钥。运行 scripts/configure-deepseek.ps1，或在环境变量里设置 DEEPSEEK_API_KEY，然后重启服务。',
  IMAGE_REJECTED: '服务端拒绝了这张图片，请换一张 PNG、JPEG 或 WebP。',
  ANALYSIS_FORMAT_INVALID: '模型这次没有按格式输出，可以直接重试。',
  UPSTREAM_TIMEOUT: '模型超时了，稍后重试通常就好。',
  UPSTREAM_FAILED: '模型服务暂时不可用，稍后重试。',
  FORMAT_MISMATCH: '图片内容与声明的格式不一致，请重新复制原图。',
  UNSUPPORTED_FORMAT: '这个格式暂不支持，请使用 PNG、JPEG 或 WebP。',
  BODY_TOO_LARGE: '图片太大了，请换一张更小的。',
  LIBRARY_ROOT_MISSING: '启动服务时没有指定 --library-root，无法保存到磁盘。',
  FORBIDDEN: '请求被本地服务拒绝（同源校验未通过），请刷新页面重试。',
  NETWORK: '连不上本地服务。请确认 node plugin-prototype/serve.mjs 还在运行。',
};

export function describeApiError(error) {
  if (error instanceof ApiError) return ERROR_HINTS[error.code] || error.message || '未知错误';
  return '出现未预期的错误，请重试。';
}

async function request(path, { method = 'GET', body, signal } = {}) {
  let response;
  try {
    response = await fetch(path, {
      method,
      signal,
      headers: body ? { ...HEADERS, 'content-type': 'application/json' } : HEADERS,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    // 主动取消不算故障，原样抛出去让调用方识别
    if (error?.name === 'AbortError') throw error;
    throw new ApiError('NETWORK', String(error?.message ?? error), { cause: error });
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(payload?.code || 'INTERNAL_ERROR', payload?.message || `HTTP ${response.status}`, {
      status: response.status,
    });
  }
  return payload;
}

export function fetchStatus(options) {
  return request('/api/status', options);
}

export function requestAnalysis({ base64, mimeType, signal }) {
  return request('/api/analyze', { method: 'POST', body: { image: { mimeType, base64 } }, signal });
}

export function requestCapture({ base64, mimeType, meta }) {
  return request('/api/capture', { method: 'POST', body: { meta, image: { mimeType, base64 } } });
}

export function revealLibrary() {
  return request('/api/library/reveal', { method: 'POST', body: {} });
}

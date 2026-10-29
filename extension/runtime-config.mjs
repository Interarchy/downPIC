// Public runtime configuration only. Never put a DeepSeek API key, administrator
// token or session-signing secret in this file.
// 源码与商店构建固定访问统一 ArchBuddy 服务。仅做本地联调时可临时
// 改为 local；开始提交、打包或部署前必须恢复 cloud，且不得提交 local 配置。
export const BACKEND_MODE = 'cloud';

const PUBLIC_BACKENDS = Object.freeze({
  cloud: 'https://canvas.archbuddy.top',
  local: 'http://127.0.0.1:8080',
});

if (!Object.hasOwn(PUBLIC_BACKENDS, BACKEND_MODE)) {
  throw new Error('BACKEND_MODE must be cloud or local');
}

export const BACKEND_BASE_URL = PUBLIC_BACKENDS[BACKEND_MODE];

export function backendUrl(path) {
  const suffix = String(path || '').startsWith('/') ? String(path) : `/${path}`;
  return `${BACKEND_BASE_URL}${suffix}`;
}

// 普通文件下载免费；预占模块保留兼容，但不接入普通下载。
export const METER_FILE_DOWNLOADS = false;

// 已确认：200次为简析权益，成功生成描述才扣1次，由统一服务端结算。
export const ENABLE_UNIFIED_DESCRIBE = true;

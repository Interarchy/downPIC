// Public runtime configuration only. Never put a DeepSeek API key, administrator
// token or session-signing secret in this file.
// 源码与商店构建默认访问已登记的 ArchBuddy 云端服务。仅做本地联调时可临时
// 改为 local；开始提交、打包或部署前必须恢复 cloud，且不得提交 local 配置。
export const BACKEND_MODE = 'cloud';

const PUBLIC_BACKENDS = Object.freeze({
  cloud: 'https://archbuddy-api-313819-12-1419174875.sh.run.tcloudbase.com',
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

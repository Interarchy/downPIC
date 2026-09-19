// Public runtime configuration only. Never put a DeepSeek API key in this file.
// Public service URL only. The DeepSeek key and session-signing secret remain in
// the CloudBase service environment and must never be included in the extension.
export const BACKEND_BASE_URL = 'https://archbuddy-api-313819-12-1419174875.sh.run.tcloudbase.com';
export const BACKEND_MODE = 'cloud';

export function backendUrl(path) {
  const suffix = String(path || '').startsWith('/') ? String(path) : `/${path}`;
  return `${BACKEND_BASE_URL}${suffix}`;
}

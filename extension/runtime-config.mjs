// Public runtime configuration only. Never put a DeepSeek API key in this file.
// Local beta: the extension calls the developer service that already holds the key.
// Production: replace this URL with the HTTPS Tencent Cloud API endpoint and update
// manifest host_permissions. The server remains the only holder of the model key.
export const BACKEND_BASE_URL = 'http://127.0.0.1:4186';
export const BACKEND_MODE = 'local';

export function backendUrl(path) {
  const suffix = String(path || '').startsWith('/') ? String(path) : `/${path}`;
  return `${BACKEND_BASE_URL}${suffix}`;
}

import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 凭据加载：整条链路上唯一会碰到 API key 的地方。
//
// 明文 key 只存在于本进程的环境变量里，绝不出现在 HTTP 响应、日志或错误文案中。
// 落盘的只有 DPAPI 密文（只有当前 Windows 用户能解），所以 runtime/ 必须在 .gitignore 里。

export const PROVIDER = 'deepseek';
export const DEFAULT_BASE_URL = 'https://api.deepseek.com/anthropic';
export const DEFAULT_MODEL = 'deepseek-flash';
export const SETTINGS_FILENAME = 'developer-ai-settings.json';

export function defaultRuntimeRoot() {
  return fileURLToPath(new URL('./runtime/', import.meta.url));
}

// 用 PowerShell 的 DPAPI 解密：ConvertFrom-SecureString 的密文绑定当前用户，
// 换台机器或换个用户都解不开。零 npm 依赖，代价是每次启动 spawn 一次 powershell。
function decryptWindowsSecureString(encryptedValue) {
  return new Promise((resolve, reject) => {
    const script = `$encrypted = [Console]::In.ReadToEnd()
$secure = ConvertTo-SecureString $encrypted
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { [Console]::Out.Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }`;
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => (code === 0
      ? resolve(stdout)
      : reject(new Error(stderr || 'Unable to decrypt DeepSeek credentials'))));
    child.stdin.end(encryptedValue);
  });
}

// 回落路径也走这里，保证「返回值里 baseUrl/model 总是有值」这一条对调用方成立，
// 于是 server 和 analyzer 都不必再各自 `|| DEFAULT_...` 兜一次底。
function withDefaults(environment) {
  return {
    ...environment,
    DEEPSEEK_BASE_URL: environment.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL,
    DEEPSEEK_MODEL: environment.DEEPSEEK_MODEL || DEFAULT_MODEL,
  };
}

export function settingsToEnvironment(settings, apiKey, environment = {}) {
  return {
    ...withDefaults(environment),
    DEEPSEEK_API_KEY: environment.DEEPSEEK_API_KEY || apiKey,
    DEEPSEEK_BASE_URL: environment.DEEPSEEK_BASE_URL || settings.baseUrl || DEFAULT_BASE_URL,
    DEEPSEEK_MODEL: environment.DEEPSEEK_MODEL || settings.model || DEFAULT_MODEL,
  };
}

// 给 /api/status 用的摘要：只描述「配没配上」，绝不带上 key 本身。
export function credentialSummary(environment = {}) {
  return {
    configured: Boolean(environment.DEEPSEEK_API_KEY),
    provider: PROVIDER,
    model: environment.DEEPSEEK_MODEL || DEFAULT_MODEL,
    baseUrl: environment.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL,
  };
}

// 解析顺序：DEEPSEEK_API_KEY 环境变量 → runtime 里的 DPAPI 密文 → 静默回落。
// 永远不抛：密钥没配是正常的首次运行状态，不该让服务起不来。
export async function loadDeepSeekEnvironment(
  runtimeRoot = defaultRuntimeRoot(),
  environment = process.env,
  { decrypt = decryptWindowsSecureString } = {},
) {
  if (environment.DEEPSEEK_API_KEY) return withDefaults(environment);

  try {
    const raw = await readFile(path.join(runtimeRoot, SETTINGS_FILENAME), 'utf8');
    const settings = JSON.parse(raw.replace(/^﻿/, ''));
    if (settings.provider !== PROVIDER) {
      console.error(`DeepSeek 凭据被忽略：provider 是 ${settings.provider ?? '(缺失)'}，不是 ${PROVIDER}`);
      return withDefaults(environment);
    }
    if (settings.schemaVersion !== 1 || !settings.encryptedApiKey || !settings.baseUrl) {
      return withDefaults(environment);
    }
    return settingsToEnvironment(settings, await decrypt(settings.encryptedApiKey), environment);
  } catch (error) {
    if (error.code === 'ENOENT') return withDefaults(environment);
    console.error(`DeepSeek 凭据被忽略：${error.message}`);
    return withDefaults(environment);
  }
}

export { decryptWindowsSecureString };

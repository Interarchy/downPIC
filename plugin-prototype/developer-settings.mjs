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

export function normalizeApiKey(value) {
  if (typeof value !== 'string') return value;

  // DeepSeek Key 只由可打印 ASCII 字符组成。从网页、密码管理器或聊天窗口
  // 复制时，文本可能混入换行、空格、BOM、零宽/方向控制字符；它们肉眼
  // 看不见，却会让 Node 在真正发请求前以 invalid header 拒绝。
  // 只保留 HTTP header 能安全承载的可打印 ASCII，覆盖所有这类复制噪声。
  let normalized = Array.from(value)
    .filter(character => {
      const codePoint = character.codePointAt(0);
      return codePoint >= 0x21 && codePoint <= 0x7e;
    })
    .join('');
  const quotePairs = [['"', '"'], ["'", "'"], ['“', '”'], ['‘', '’']];
  for (const [opening, closing] of quotePairs) {
    if (normalized.startsWith(opening) && normalized.endsWith(closing)) {
      normalized = normalized.slice(opening.length, -closing.length);
      break;
    }
  }
  return normalized;
}

export function defaultRuntimeRoot() {
  return fileURLToPath(new URL('./runtime/', import.meta.url));
}

export function windowsPowerShellEnvironment(environment = process.env) {
  const windowsRoot = environment.WINDIR || 'C:\\Windows';
  const programFiles = environment.ProgramFiles || 'C:\\Program Files';
  return {
    ...environment,
    // PowerShell 7 会把自己的模块目录放在最前面；Windows PowerShell 5.1
    // 继承后会误加载不兼容的 Security 模块。这里只保留系统自带模块路径。
    PSModulePath: [
      path.join(windowsRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'Modules'),
      path.join(programFiles, 'WindowsPowerShell', 'Modules'),
    ].join(path.delimiter),
  };
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
      env: windowsPowerShellEnvironment(),
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
  const apiKey = normalizeApiKey(environment.DEEPSEEK_API_KEY);
  return {
    ...environment,
    DEEPSEEK_API_KEY: apiKey || undefined,
    DEEPSEEK_BASE_URL: environment.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL,
    DEEPSEEK_MODEL: environment.DEEPSEEK_MODEL || DEFAULT_MODEL,
  };
}

export function settingsToEnvironment(settings, apiKey, environment = {}) {
  return {
    ...withDefaults(environment),
    DEEPSEEK_API_KEY: normalizeApiKey(environment.DEEPSEEK_API_KEY || apiKey),
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

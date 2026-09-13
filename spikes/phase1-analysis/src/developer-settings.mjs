import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

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
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => code === 0
      ? resolve(stdout)
      : reject(new Error(stderr || 'Unable to decrypt developer AI credentials')));
    child.stdin.end(encryptedValue);
  });
}

export function settingsToEnvironment(settings, apiKey, environment = {}) {
  return {
    ...environment,
    DASHSCOPE_API_KEY: environment.DASHSCOPE_API_KEY || apiKey,
    DASHSCOPE_BASE_URL: environment.DASHSCOPE_BASE_URL || settings.baseUrl,
    QWEN_MODEL: environment.QWEN_MODEL || settings.model || 'qwen3.7-plus',
  };
}

export async function loadDeveloperAIEnvironment(runtimeRoot, environment = process.env) {
  if (environment.DASHSCOPE_API_KEY) return { ...environment };
  const settingsPath = path.join(runtimeRoot, 'developer-ai-settings.json');
  try {
    const rawSettings = await readFile(settingsPath, 'utf8');
    const settings = JSON.parse(rawSettings.replace(/^\uFEFF/, ''));
    if (settings.schemaVersion !== 1 || !settings.encryptedApiKey || !settings.baseUrl) {
      return { ...environment };
    }
    const apiKey = await decryptWindowsSecureString(settings.encryptedApiKey);
    return settingsToEnvironment(settings, apiKey, environment);
  } catch (error) {
    if (error.code === 'ENOENT') return { ...environment };
    console.error(`Developer AI settings were ignored: ${error.message}`);
    return { ...environment };
  }
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  DEFAULT_BASE_URL,
  DEFAULT_MODEL,
  SETTINGS_FILENAME,
  credentialSummary,
  loadDeepSeekEnvironment,
  normalizeApiKey,
  settingsToEnvironment,
  windowsPowerShellEnvironment,
} from '../developer-settings.mjs';

const FAKE_KEY = 'sk-this-is-a-fake-key-for-tests';

async function withRuntime(run) {
  const runtimeRoot = await mkdtemp(path.join(tmpdir(), 'downpic-settings-'));
  try {
    return await run(runtimeRoot);
  } finally {
    await rm(runtimeRoot, { recursive: true, force: true });
  }
}

async function writeSettings(runtimeRoot, settings, { bom = false } = {}) {
  const body = JSON.stringify({ schemaVersion: 1, baseUrl: DEFAULT_BASE_URL, ...settings });
  await writeFile(path.join(runtimeRoot, SETTINGS_FILENAME), (bom ? '﻿' : '') + body, 'utf8');
}

// 凭据被忽略是正常路径，但会往 stderr 写一行；测试里不想让它污染输出。
async function quietly(run) {
  const original = console.error;
  const lines = [];
  console.error = message => lines.push(String(message));
  try {
    return { value: await run(), lines };
  } finally {
    console.error = original;
  }
}

const VALID = {
  provider: 'deepseek',
  model: 'deepseek-flash',
  baseUrl: 'https://api.deepseek.com/anthropic',
  encryptedApiKey: 'ciphertext-not-decrypted-in-this-test',
};

// 注入假的解密函数，测试就不必每次 spawn 一次 PowerShell。
const fakeDecrypt = async value => `decrypted:${value}`;

test('环境变量优先，且不读磁盘', async () => {
  await withRuntime(async runtimeRoot => {
    const environment = { DEEPSEEK_API_KEY: FAKE_KEY };
    const loaded = await loadDeepSeekEnvironment(runtimeRoot, environment);

    assert.equal(loaded.DEEPSEEK_API_KEY, FAKE_KEY);
    // 环境变量没给的字段才由默认值补齐
    assert.equal(loaded.DEEPSEEK_BASE_URL, DEFAULT_BASE_URL);
    assert.equal(loaded.DEEPSEEK_MODEL, DEFAULT_MODEL);
  });
});

test('没有配置文件时静默回落，不抛异常也不刷日志', async () => {
  await withRuntime(async runtimeRoot => {
    const { value, lines } = await quietly(() => loadDeepSeekEnvironment(runtimeRoot, {}, { decrypt: fakeDecrypt }));

    assert.equal(value.DEEPSEEK_API_KEY, undefined);
    assert.equal(value.DEEPSEEK_MODEL, DEFAULT_MODEL);
    assert.deepEqual(lines, [], '首次运行没有密钥是正常状态，不该报错');
  });
});

test('配置文件的 provider 不是 deepseek 时整份忽略', async () => {
  await withRuntime(async runtimeRoot => {
    await writeSettings(runtimeRoot, { ...VALID, provider: 'qwen' });
    const { value, lines } = await quietly(
      () => loadDeepSeekEnvironment(runtimeRoot, {}, { decrypt: fakeDecrypt }),
    );

    assert.equal(value.DEEPSEEK_API_KEY, undefined, '别的 provider 的密文不该被当成 DeepSeek 的密钥');
    assert.match(lines.join('\n'), /provider/);
  });
});

test('配置文件损坏时忽略而不是让服务起不来', async () => {
  await withRuntime(async runtimeRoot => {
    for (const body of ['{ 这不是 JSON', '[]', 'null', JSON.stringify({ schemaVersion: 2 })]) {
      await writeFile(path.join(runtimeRoot, SETTINGS_FILENAME), body, 'utf8');
      const { value } = await quietly(
        () => loadDeepSeekEnvironment(runtimeRoot, {}, { decrypt: fakeDecrypt }),
      );
      assert.equal(value.DEEPSEEK_API_KEY, undefined);
    }
  });
});

test('缺失字段的配置被忽略，不会拿半个配置去发请求', async () => {
  await withRuntime(async runtimeRoot => {
    await writeSettings(runtimeRoot, { provider: 'deepseek', model: 'deepseek-flash' }); // 没有密文
    const { value } = await quietly(
      () => loadDeepSeekEnvironment(runtimeRoot, {}, { decrypt: fakeDecrypt }),
    );
    assert.equal(value.DEEPSEEK_API_KEY, undefined);
  });
});

test('解不开的密文只降级为「未配置」，不抛到调用方', async () => {
  await withRuntime(async runtimeRoot => {
    await writeSettings(runtimeRoot, VALID);
    const exploding = async () => { throw new Error('ConvertTo-SecureString failed'); };
    const { value, lines } = await quietly(
      () => loadDeepSeekEnvironment(runtimeRoot, {}, { decrypt: exploding }),
    );

    assert.equal(value.DEEPSEEK_API_KEY, undefined);
    assert.match(lines.join('\n'), /ConvertTo-SecureString/);
  });
});

test('读到有效配置时解出密钥，并带上 baseUrl 与模型', async () => {
  await withRuntime(async runtimeRoot => {
    await writeSettings(runtimeRoot, { ...VALID, encryptedApiKey: 'CIPHER' });
    const loaded = await loadDeepSeekEnvironment(runtimeRoot, {}, { decrypt: fakeDecrypt });

    assert.equal(loaded.DEEPSEEK_API_KEY, 'decrypted:CIPHER');
    assert.equal(loaded.DEEPSEEK_BASE_URL, 'https://api.deepseek.com/anthropic');
    assert.equal(loaded.DEEPSEEK_MODEL, 'deepseek-flash');
  });
});

test('配置文件带 BOM 也能解析', async () => {
  await withRuntime(async runtimeRoot => {
    await writeSettings(runtimeRoot, { ...VALID, encryptedApiKey: 'CIPHER' }, { bom: true });
    const loaded = await loadDeepSeekEnvironment(runtimeRoot, {}, { decrypt: fakeDecrypt });
    assert.equal(loaded.DEEPSEEK_API_KEY, 'decrypted:CIPHER');
  });
});

test('环境变量里的单项覆盖文件里的同名项', async () => {
  await withRuntime(async runtimeRoot => {
    await writeSettings(runtimeRoot, { ...VALID, encryptedApiKey: 'CIPHER', model: 'deepseek-v4-pro' });
    const loaded = await loadDeepSeekEnvironment(
      runtimeRoot,
      { DEEPSEEK_MODEL: 'deepseek-flash' },
      { decrypt: fakeDecrypt },
    );
    assert.equal(loaded.DEEPSEEK_MODEL, 'deepseek-flash');
  });
});

test('credentialSummary 只报告状态，绝不带出密钥', () => {
  const summary = credentialSummary({ DEEPSEEK_API_KEY: FAKE_KEY });

  assert.deepEqual(summary, {
    configured: true,
    provider: 'deepseek',
    model: DEFAULT_MODEL,
    baseUrl: DEFAULT_BASE_URL,
  });
  // 整个对象序列化后也不能出现密钥的任何片段
  const serialized = JSON.stringify(summary);
  assert.ok(!serialized.includes(FAKE_KEY));
  assert.ok(!serialized.includes('sk-'));
});

test('未配置时 credentialSummary 明确报 false', () => {
  assert.equal(credentialSummary({}).configured, false);
});

test('settingsToEnvironment 不会覆盖已有的环境变量', () => {
  const merged = settingsToEnvironment(
    { baseUrl: 'https://from-file', model: 'from-file' },
    'from-file-key',
    { DEEPSEEK_API_KEY: FAKE_KEY },
  );
  assert.equal(merged.DEEPSEEK_API_KEY, FAKE_KEY);
});

test('环境变量里的 Key 会清理复制时带入的空白、Unicode 控制字符和外层引号', async () => {
  const loaded = await loadDeepSeekEnvironment('/not-used', {
    DEEPSEEK_API_KEY: `  ${FAKE_KEY}\r\n`,
  });
  assert.equal(loaded.DEEPSEEK_API_KEY, FAKE_KEY);
  assert.equal(normalizeApiKey(`\t${FAKE_KEY}\n`), FAKE_KEY);
  assert.equal(normalizeApiKey(`“${FAKE_KEY.slice(0, 8)}\u200b\r\n${FAKE_KEY.slice(8)}”`), FAKE_KEY);
  assert.equal(normalizeApiKey(`\u202a${FAKE_KEY.slice(0, 8)}\u200e${FAKE_KEY.slice(8)}\u202c`), FAKE_KEY);
});

// 上面所有用例都注入了假解密函数，这条走真实的 DPAPI 往返：
// PowerShell 脚本是那种会静默失效的东西，必须至少真正跑一次。
test('真实 DPAPI 往返：脚本写入的密文能被读回', { skip: process.platform !== 'win32' }, async t => {
  await withRuntime(async runtimeRoot => {
    const encrypt = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      '$s = ConvertTo-SecureString $env:DOWNPIC_TEST_SECRET -AsPlainText -Force; ConvertFrom-SecureString $s'],
    {
      encoding: 'utf8',
      windowsHide: true,
      env: windowsPowerShellEnvironment({ ...process.env, DOWNPIC_TEST_SECRET: FAKE_KEY }),
    });

    if (encrypt.status !== 0 && /CryptographicException/.test(encrypt.stderr)) {
      t.skip('当前宿主没有可用的 Windows 用户 DPAPI 配置文件；环境变量配置不受影响');
      return;
    }
    assert.equal(encrypt.status, 0, encrypt.stderr);
    await writeSettings(runtimeRoot, { ...VALID, encryptedApiKey: encrypt.stdout.trim() });

    const loaded = await loadDeepSeekEnvironment(runtimeRoot, {});
    assert.equal(loaded.DEEPSEEK_API_KEY, FAKE_KEY);
  });
});

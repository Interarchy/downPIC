import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../hosting/archbuddy/privacy/index.html', import.meta.url), 'utf8');

test('公开隐私政策包含产品、联系邮箱与核心数据说明', () => {
  for (const text of ['ArchBuddy 隐私政策', '19822692515@163.com', 'DeepSeek', '匿名身份与额度记录', '不持久化保存原图']) {
    assert.ok(html.includes(text), `隐私政策缺少：${text}`);
  }
});

test('隐私政策是无采集能力的独立静态页面', () => {
  assert.doesNotMatch(html, /<script\b|<form\b|https?:\/\/(?!www\.w3\.org)/i);
  assert.match(html, /mailto:19822692515@163\.com/);
});

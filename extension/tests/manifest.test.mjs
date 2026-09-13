import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));

test('商店包使用 Manifest V3，Logo 打开功能开关弹窗', () => {
  assert.equal(manifest.manifest_version, 3);
  assert.ok(manifest.permissions.includes('activeTab'));
  assert.ok(manifest.permissions.includes('sidePanel'));
  assert.ok(!manifest.permissions.includes('nativeMessaging'));
  assert.equal(manifest.action.default_popup, 'popup.html');
  assert.deepEqual(manifest.content_scripts[0].matches, ['http://*/*', 'https://*/*']);
});

test('扩展不再直接访问 DeepSeek，网页权限只服务于用户开启后的图片工具', () => {
  assert.deepEqual(manifest.host_permissions, ['http://*/*', 'https://*/*']);
  assert.ok(!JSON.stringify(manifest).includes('api.deepseek.com'));
});

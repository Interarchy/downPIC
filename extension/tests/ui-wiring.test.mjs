import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const files = await Promise.all([
  'popup.html', 'popup.mjs', 'sidepanel.html', 'sidepanel.mjs',
  'content.js', 'content.css', 'background.mjs', 'runtime-config.mjs',
].map(async name => [name, await readFile(new URL(`../${name}`, import.meta.url), 'utf8')]));
const source = Object.fromEntries(files);

function htmlIds(html) {
  return new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
}

test('弹窗和侧栏脚本引用的静态元素都真实存在', () => {
  for (const [scriptName, htmlName] of [['popup.mjs', 'popup.html'], ['sidepanel.mjs', 'sidepanel.html']]) {
    const ids = htmlIds(source[htmlName]);
    const list = source[scriptName].match(/Object\.fromEntries\(\[([\s\S]*?)\]\.map/)?.[1] || '';
    for (const match of list.matchAll(/'([^']+)'/g)) {
      assert.ok(ids.has(match[1]), `${scriptName} 引用了不存在的 #${match[1]}`);
    }
  }
});

test('Logo 弹窗包含总开关、项目类型和反推侧栏入口', () => {
  for (const id of ['capture-enabled', 'preset-type', 'custom-type', 'open-analysis']) {
    assert.match(source['popup.html'], new RegExp(`id="${id}"`), `弹窗缺少 ${id}`);
  }
  assert.match(source['popup.mjs'], /STORAGE\.captureEnabled/);
  assert.match(source['popup.mjs'], /capture\.setEnabled/);
});

test('网页工具条只在总开关开启时响应图片悬浮', () => {
  assert.match(source['content.js'], /if \(!captureEnabled\) return;/);
  assert.match(source['content.js'], /capture\.setEnabled/);
  assert.match(source['content.js'], /data-action="save"/);
  assert.match(source['content.js'], /data-action="analyze"/);
  assert.match(source['content.js'], /data-role="category"/);
  assert.match(source['content.js'], /data-action="apply-custom"/);
  assert.match(source['content.js'], /download\.show/);
  assert.match(source['content.js'], /toolbar\.style\.visibility = 'hidden'/);
  assert.match(source['content.js'], /capture\.geometry/);
  assert.match(source['content.js'], /toolbarPinned = true/);
  assert.match(source['content.js'], /if \(toolbarPinned\) return/);
});

test('网页浮栏初始无空状态行，主要控件使用统一视觉尺寸', () => {
  assert.match(source['content.js'], /class="downpic-feedback-row" hidden/);
  assert.match(source['content.css'], /\.downpic-toolbar-row > button \{ width: 104px; flex: 0 0 104px; \}/);
  assert.match(source['content.css'], /\.downpic-toolbar button \{[\s\S]*?height: 36px;[\s\S]*?font: 600 14px/);
  assert.match(source['content.css'], /\.downpic-category-label select \{[\s\S]*?height: 36px;[\s\S]*?font: 500 14px/);
});

test('侧栏下载区提供最近下载路径和文件夹定位按钮', () => {
  assert.match(source['sidepanel.html'], /id="last-download-path"/);
  assert.match(source['sidepanel.html'], /id="show-download"/);
  assert.match(source['sidepanel.mjs'], /STORAGE\.lastDownload|lastDownload/);
  assert.match(source['sidepanel.mjs'], /download\.show/);
});

test('扩展端没有 Key 输入、DeepSeek 地址或上游鉴权头', () => {
  const packagedClient = [
    source['popup.html'], source['popup.mjs'], source['sidepanel.html'],
    source['sidepanel.mjs'], source['content.js'], source['background.mjs'],
    source['runtime-config.mjs'],
  ].join('\n');
  assert.ok(!packagedClient.includes('id="api-key"'));
  assert.ok(!packagedClient.includes('api.deepseek.com'));
  assert.ok(!packagedClient.includes("'x-api-key'"));
  assert.ok(!packagedClient.includes('authorization:'));
  assert.match(source['runtime-config.mjs'], /http:\/\/127\.0\.0\.1:4186/);
});

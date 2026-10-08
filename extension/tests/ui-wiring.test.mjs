import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const files = await Promise.all([
  'popup.html', 'popup.mjs', 'sidepanel.html', 'sidepanel.mjs',
  'content.js', 'content.css', 'background.mjs', 'runtime-config.mjs', 'library.html', 'library.mjs',
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

test('Logo 弹窗提供图库和侧栏两个入口及网页图片工具开关', () => {
  for (const id of ['capture-enabled', 'open-sidepanel', 'open-library']) {
    assert.match(source['popup.html'], new RegExp('id="' + id + '"'), '弹窗缺少 ' + id);
  }
  assert.match(source['popup.mjs'], /chrome\.sidePanel\.open/);
  assert.match(source['popup.mjs'], /capture\.setEnabled/);
});

test('网页工具条只在总开关开启时响应图片悬浮', () => {
  assert.match(source['content.js'], /if \(!captureEnabled \|\| event\.target/);
  assert.match(source['content.js'], /capture\.setEnabled/);
  assert.match(source['content.js'], /data-action="save"/);
  assert.match(source['content.js'], /data-action="analyze"/);
  assert.match(source['content.js'], /data-role="category"/);
  assert.match(source['content.js'], /data-action="apply-custom"/);
  assert.match(source['content.js'], /download\.show/);
  assert.match(source['content.js'], /toolbar\.style\.visibility = 'hidden'/);
  assert.match(source['content.js'], /capture\.geometry/);
  assert.match(source['content.js'], /toolbarPinned = true/);
  assert.match(source['content.js'], /if \(toolbarPinned \|\| toolbarCollapsed\) return/);
});

test('网页浮栏初始无空状态行，操作紧凑且能收起展开', () => {
  assert.match(source['content.js'], /class="downpic-feedback-row" hidden/);
  assert.match(source['content.js'], /data-action="collapse"/);
  assert.match(source['content.js'], /data-action="expand"/);
  assert.doesNotMatch(source['content.js'], /<span>分类<\/span>/);
  assert.match(source['content.css'], /\.downpic-toolbar button \{[\s\S]*?height: 36px;[\s\S]*?font: 600 13px/);
  assert.match(source['content.css'], /\.downpic-category-label select \{[\s\S]*?height: 36px;[\s\S]*?font: 500 14px/);
});

test('侧栏图库直达，分类管理集中在完整图库', () => {
  assert.match(source['sidepanel.html'], /id="open-library"[^>]*>图词库<\/button>/);
  assert.doesNotMatch(source['sidepanel.html'], /id="(?:download-panel|project-type-list|custom-type|save-type)"/);
  for (const id of ['custom-type', 'save-type']) {
    assert.match(source['library.html'], new RegExp('id="' + id + '"'), '图库缺少 ' + id);
  }
  assert.match(source['library.mjs'], /project-types\.rename/);
});

test('扩展端没有模型 Key、DeepSeek 地址或管理员测试凭据', () => {
  const packagedClient = [
    source['popup.html'], source['popup.mjs'], source['sidepanel.html'],
    source['sidepanel.mjs'], source['content.js'], source['background.mjs'],
    source['runtime-config.mjs'],
  ].join('\n');
  assert.ok(!packagedClient.includes('id="api-key"'));
  assert.ok(!packagedClient.includes('api.deepseek.com'));
  assert.ok(!packagedClient.includes("'x-api-key'"));
  assert.ok(!packagedClient.includes('ARCHBUDDY_TEST_TOKEN'));
  assert.match(source['runtime-config.mjs'], /https:\/\/archbuddy-api-[^']+\.sh\.run\.tcloudbase\.com/);
  assert.match(source['background.mjs'], /\/api\/session/);
  assert.match(source['background.mjs'], /crypto\.randomUUID\(\)/);
});

test('普通用户界面和匿名请求结果不展示具体额度', () => {
  const packagedClient = [source['sidepanel.mjs'], source['background.mjs']].join('\n');
  assert.ok(!packagedClient.includes('今日剩余'));
  assert.ok(!packagedClient.includes('userRemaining'));
  assert.ok(!packagedClient.includes('projectRemaining'));
});

test('云端状态与匿名会话超时覆盖 CloudBase 冷启动', () => {
  assert.match(source['background.mjs'], /const STATUS_TIMEOUT_MS = 25_000/);
  assert.match(source['background.mjs'], /const SESSION_TIMEOUT_MS = 30_000/);
  assert.match(source['background.mjs'], /const ANALYSIS_TIMEOUT_MS = 135_000/);
  assert.match(source['background.mjs'], /timeoutMs: SESSION_TIMEOUT_MS/);
  assert.match(source['background.mjs'], /timeoutMs: STATUS_TIMEOUT_MS/);
});

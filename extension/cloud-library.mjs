import { mountAccountUI, ensureAccount } from './account-ui.mjs';
const $ = id => document.getElementById(id);
mountAccountUI($('account-area'));
let accountId, scope = 'remote', epoch = 0, busy = false;
let newPromptId = crypto.randomUUID();
function el(tag, text, className = '') { const n = document.createElement(tag); n.textContent = text; n.className = className; return n; }
async function request(type, payload = {}) {
  const result = await chrome.runtime.sendMessage({ type, payload });
  if (!result?.ok) throw new Error(result?.message || '操作未完成，请稍后重试');
  return result;
}
async function run(operation) {
  if (busy) return;
  busy = true; $('notice').textContent = '';
  try { await operation(); } catch (error) { $('notice').textContent = error.message; }
  finally { busy = false; }
}
async function load(next = scope) {
  const version = ++epoch; scope = next; $('items').replaceChildren();
  const view = await request('account.get');
  accountId = view.account?.id;
  if (!accountId) { $('notice').textContent = '请先登录 ArchBuddy，使用官网、Canvas 的同一个账号。'; return; }
  const result = scope === 'remote' ? await request('account.library.list') : await request('account.local.list', { scope });
  if (version !== epoch) return;
  $('scope-note').textContent = scope === 'legacy'
    ? '这些素材来自升级前的浏览器本机历史，尚未属于任何云端账号。仅在你点击“保存到当前账号”时上传所选内容。'
    : scope === 'current' ? '当前账号的本机素材尚未自动上传。勾选图片时只上传明确标注的本地副本。' : '当前账号的云端素材可在 Canvas 使用；本机历史不会自动导入。';
  $('prompt-form').hidden = scope !== 'remote';
  if (!result.items?.length) { $('items').append(el('p', scope === 'remote' ? '还没有云素材，可以从本机选择导入，或保存一条提示词。' : '这里暂时没有素材。')); return; }
  for (const item of result.items) {
    const card = el('article', '', 'item');
    card.append(el('h2', item.title || '未命名素材'), el('small', item.kind === 'prompt' ? '提示词' : '图片素材'), el('p', item.prompt || ''));
    const actions = el('div', '', 'actions');
    if (scope === 'remote') {
      if (item.assetId) {
        const preview = el('button', '查看图片', 'account-button account-secondary');
        preview.onclick = () => void run(async () => {
          const image = await request('account.library.media', { id: item.id, expectedAccountId: accountId });
          if (version !== epoch) return;
          const img = document.createElement('img'); img.src = image.dataUrl; img.alt = item.title || '素材预览';
          card.querySelector('img')?.remove(); card.insertBefore(img, actions);
        });
        actions.append(preview);
        card.append(el('small', item.imageQuality === 'preview' ? '已上传预览副本（非原始分辨率）' : '已上传图片副本'));
      } else if (item.kind === 'capture') card.append(el('small', '已保存文字信息，尚未上传图片'));
      if (item.projectId) {
        const open = el('button', '在 Canvas 使用', 'account-button account-primary');
        open.onclick = () => void run(async () => {
          const result = await request('account.library.canvas', { id: item.id, expectedAccountId: accountId });
          const target = new URL(result.href || ('/studio?project=' + encodeURIComponent(result.projectId)), 'https://canvas.archbuddy.top');
          if (target.origin !== 'https://canvas.archbuddy.top' || target.pathname !== '/studio') throw new Error('画布地址无效');
          await chrome.tabs.create({ url: target.href });
        }); actions.append(open);
      }
      const remove = el('button', '移出素材库', 'account-button account-secondary');
      remove.onclick = () => void run(async () => {
        if (!confirm('将这条素材移出云素材库？本机来源文件会保留，相关图片仍按存储规则到期清理。')) return;
        await request('account.library.delete', { id: item.id, expectedAccountId: accountId }); await load();
      });
      actions.append(remove);
    } else {
      const include = document.createElement('input'); include.type = 'checkbox';
      if (item.hasImage) {
        const label = el('label', '', 'include'); label.append(include, document.createTextNode(item.imageQuality === 'preview' ? '同时上传本地预览副本（非原图）' : '同时上传本地图片副本')); card.append(label);
      }
      const publish = el('button', '保存到当前账号', 'account-button account-primary');
      publish.onclick = () => void run(async () => {
        publish.disabled = true;
        try {
          const result = await request('account.local.publish', { scope, localId: item.localId, includeImage: include.checked, expectedAccountId: accountId });
          if (version !== epoch) return;
          publish.textContent = '已保存';
          card.append(el('small', result.imageUploaded ? '图片和文字已保存到当前账号' : '文字已保存；图片未上传'));
        } catch (error) { publish.disabled = false; throw error; }
      });
      actions.append(publish);
    }
    card.append(actions); $('items').append(card);
  }
}
$('remote-tab').onclick = () => void run(() => load('remote'));
$('current-tab').onclick = () => void run(() => load('current'));
$('legacy-tab').onclick = () => void run(() => load('legacy'));
$('refresh').onclick = () => void run(() => load());
$('prompt-form').onsubmit = event => {
  event.preventDefault();
  void run(async () => {
    if (!(await ensureAccount())) return;
    await request('account.library.put', { id: newPromptId, expectedAccountId: accountId,
      item: { kind: 'prompt', title: $('title').value.trim(), prompt: $('prompt').value.trim(), tags: [], sourceUrl: '', expectedRevision: 0 } });
    newPromptId = crypto.randomUUID(); $('prompt-form').reset(); await load('remote');
  });
};
void run(() => load());

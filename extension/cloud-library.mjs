import { t, setText, setLocalizedAttribute, localizedError } from './i18n.mjs';
import { mountAccountUI, ensureAccount } from './account-ui.mjs';

// 仅界面文案绑定语言；传入的名称、描述和提示词按原文展示。
function ui(zh, en) { return { zh, en }; }
function errorText(error) { return error?.zh !== undefined && error?.en !== undefined ? ui(error.zh, error.en) : error?.message || String(error); }
function clearUiText(target) { target.removeAttribute('data-i18n-zh'); target.removeAttribute('data-i18n-en'); return target; }
function writeUiText(target, value) {
  if (value && typeof value === 'object' && 'zh' in value) setText(target, value.zh, value.en);
  else clearUiText(target).textContent = value ?? '';
  return target;
}
const $ = id => document.getElementById(id);
mountAccountUI($('account-area'));
let accountId, scope = 'remote', epoch = 0, busy = false, nextCursor = null, library = {};
const renderedIds = new Set();
let newPromptId = crypto.randomUUID();
function el(tag, text, className = '') { const n = document.createElement(tag); writeUiText(n, text); n.className = className; return n; }
async function request(type, payload = {}) {
  const result = await chrome.runtime.sendMessage({ type, payload });
  if (!result?.ok) throw localizedError(result);
  return result;
}
async function run(operation) {
  if (busy) return;
  busy = true; delete $('notice').dataset.tone; writeUiText($('notice'), '');
  try { await operation(); } catch (error) { writeUiText($('notice'), errorText(error)); }
  finally { busy = false; }
}
function canWrite() { return library.canWrite === true; }
function deletionNotice(result) {
  if (result.deleted !== true) return ui('操作已完成，请刷新列表和容量确认最新状态。', 'The operation completed. Refresh the list and capacity to confirm the latest state.');
  if (result.retainedInCanvas === true) return ui('已移出素材库；画布项目和图片仍保留并占用空间。可在画布删除项目以释放空间。', 'Removed from the library. The Canvas project and images remain and still use storage. Delete the project in Canvas to release that space.');
  if (result.retainedInCanvas === false && result.cleanupPending === true) return ui('已删除，后台清理尚未完成；空间会在清理完成后释放，无需再次删除。', 'Deleted. Background cleanup is still pending; storage is released only after cleanup completes. You do not need to delete again.');
  if (result.retainedInCanvas === false && result.cleanupPending === false) return ui('已删除，后台清理已完成。可用空间以最新容量信息为准。', 'Deleted and background cleanup is complete. The latest capacity summary shows your available space.');
  return ui('已移出素材库，空间会在清理完成后释放；可刷新查看最新容量。', 'Removed from the library. Storage is released after cleanup completes; refresh to check the latest capacity.');
}
function bytesText(value) {
  if (!Number.isSafeInteger(value) || value < 0) return '—';
  if (value >= 1000000000) return (value / 1000000000).toFixed(2).replace(/\.00$/, '') + ' GB';
  if (value >= 1000000) return (value / 1000000).toFixed(1).replace(/\.0$/, '') + ' MB';
  return value.toLocaleString('en-US') + ' B';
}
function renderLibraryStatus() {
  const used = bytesText(library.usedBytes), limit = bytesText(library.limitBytes), reserved = bytesText(library.reservedBytes), maxFile = Number.isSafeInteger(library.maxFileBytes) ? (library.maxFileBytes / (1024 * 1024)).toFixed(0) + ' MiB' : '—';
  writeUiText($('library-summary'), ui('云空间：' + used + ' / ' + limit + '，待完成上传 ' + reserved + '，单张上限 ' + maxFile,
    'Cloud storage: ' + used + ' / ' + limit + '; pending uploads ' + reserved + '; per image ' + maxFile));
  const expiry = typeof library.expiresAt === 'string' ? library.expiresAt.slice(0, 10) : '—';
  const grace = typeof library.graceEndsAt === 'string' ? library.graceEndsAt.slice(0, 10) : '—';
  const copy = library.status === 'active'
    ? ui('专业版有效至 ' + expiry + '。有效期内云图词库持续保存；到期后保留 30 天供下载或续购。', 'Pro is active until ' + expiry + '. Cloud library files remain while your plan is active, followed by 30 days to download or renew.')
    : library.status === 'grace' ? ui('套餐已到期，新上传已暂停。请在 ' + grace + ' 前下载或续购。', 'Your plan has ended and new uploads are paused. Download or renew by ' + grace + '.')
    : library.status === 'expired' ? ui('云图词库保留期已结束，新上传已暂停。现有内容的可用性以服务端为准。', 'The cloud library retention period has ended. New uploads are paused; the server determines which existing files remain available.')
    : library.status === 'free' ? ui('云图词库需要有效的专业版套餐；本机素材整理与普通下载仍可使用。', 'An active Pro plan is required for cloud library uploads. Local organization and ordinary downloads remain available.')
    : library.status === 'unavailable' ? ui('云空间资格暂不可用，新增上传已暂停；已有素材可尝试下载。', 'Cloud storage eligibility is temporarily unavailable. New uploads are paused; you can try downloading existing assets.')
    : ui('正在核对云空间资格；未知数值不代表没有空间。', 'Cloud storage eligibility is being checked. Unknown values do not mean zero space.');
  writeUiText($('library-access'), copy);
  const proLink = $('library-pro-link');
  proLink.hidden = !['free', 'grace', 'expired'].includes(library.status);
  writeUiText(proLink, ['grace', 'expired'].includes(library.status) ? ui('续购', 'Renew') : ui('开通专业版', 'Get Pro'));
  for (const control of $('prompt-form').querySelectorAll('input,textarea,button')) control.disabled = !canWrite();
}
function imageUnavailable(item) {
  const expiry = item.imageExpiresAt;
  return item.imageAvailable === false || ['expired', 'deleted', 'unavailable'].includes(item.imageState)
    || (typeof expiry === 'string' && Number.isFinite(Date.parse(expiry)) && Date.parse(expiry) <= Date.now());
}
async function load(next = scope, append = false) {
  const version = append ? epoch : ++epoch;
  if (!append) { scope = next; nextCursor = null; $('load-more').hidden = true; }

  const view = await request('account.get');
  if (version !== epoch) return;
  accountId = view.account?.id; library = view.account?.library || {}; renderLibraryStatus();
  if (!accountId) { writeUiText($('notice'), ui('请先登录 ArchBuddy，使用官网、Canvas 的同一个账号。', "Sign in with the same ArchBuddy account you use on the website and Canvas.")); return; }
  const result = scope === 'remote' ? await request('account.library.list', { cursor: append ? nextCursor : null, expectedAccountId: accountId }) : await request('account.local.list', { scope });
  if (version !== epoch) return;
  if (scope === 'remote' && result.library) { library = result.library; renderLibraryStatus(); }
  if (!append) { clearUiText($('items')).replaceChildren(); renderedIds.clear(); }
  nextCursor = scope === 'remote' && typeof result.nextCursor === 'string' ? result.nextCursor : null;
  $('load-more').hidden = !nextCursor;
  writeUiText($('scope-note'), ui(scope === 'legacy'
    ? '这些素材来自升级前的浏览器本机历史，尚未属于任何云端账号。仅在你点击“保存到当前账号”时上传所选内容。'
    : scope === 'current' ? '当前账号的本机素材尚未自动上传。勾选图片时只上传明确标注的本地副本。' : '当前账号的云端素材可在 Canvas 使用；本机历史不会自动导入。', scope === 'legacy'
    ? "These local assets predate this upgrade and do not belong to a cloud account. Only selected content uploads when you choose “Save to this account”."
    : scope === 'current' ? "This account’s local assets are not uploaded automatically. Selecting the image option uploads only the indicated copy." : "This account’s cloud assets are available in Canvas. Local history is never imported automatically."));
  $('prompt-form').hidden = scope !== 'remote';
  if (!result.items?.length && !append) { $('items').append(el('p', ui(scope === 'remote' ? '还没有云素材，可以从本机选择导入，或保存一条提示词。' : '这里暂时没有素材。', scope === 'remote' ? "No cloud assets yet. Import local assets or save a prompt." : "No assets here yet."))); return; }
  for (const item of result.items || []) {
    const itemKey = scope + ':' + (item.id || item.localId);
    if (renderedIds.has(itemKey)) continue; renderedIds.add(itemKey);
    const card = el('article', '', 'item');
    card.append(el('h2', ui(item.title || '未命名素材', item.title || "Untitled asset")), el('small', ui(item.kind === 'prompt' ? '提示词' : '图片素材', item.kind === 'prompt' ? "Prompt" : "Image asset")), el('p', item.prompt || ''));
    const actions = el('div', '', 'actions');
    if (scope === 'remote') {
      const unavailable = imageUnavailable(item);
      if (item.storageClass === 'canvas') card.append(el('small', ui('画布素材 · 按画布 30 天规则保存', 'Canvas asset · follows the Canvas 30-day rule')));
      else if (item.storageClass === 'cloud_library') card.append(el('small', ui('云图词库素材 · 按专业版有效期保存', 'Cloud library asset · follows Pro plan retention')));
      if (item.assetId && typeof item.imageExpiresAt === 'string') card.append(el('small', ui('图片可用至 ' + item.imageExpiresAt.slice(0, 10), 'Image available until ' + item.imageExpiresAt.slice(0, 10))));
      if (item.assetId) {
        const preview = el('button', ui('查看图片', "View image"), 'account-button account-secondary');
        preview.disabled = unavailable;
        preview.onclick = () => void run(async () => {
          let image;
          try { image = await request('account.library.media', { id: item.id, expectedAccountId: accountId }); }
          catch (error) {
            if (error.code === 'NOT_FOUND' || error.code === 'ASSET_EXPIRED') {
              card.append(el('small', ui('图片已到期或暂不可用，文字信息仍保留。', 'The image has expired or is unavailable. Its text is retained.')));
            }
            throw error;
          }
          if (version !== epoch) return;
          const img = document.createElement('img'); img.src = image.dataUrl; setLocalizedAttribute(img, 'alt', item.title || '素材预览', item.title || "Asset preview");
          card.querySelector('img')?.remove(); card.insertBefore(img, actions);
        });
        actions.append(preview);
        if (unavailable) card.append(el('small', ui('图片已到期或不可用，可保存文字信息。', 'The image has expired or is unavailable. You can still save its text.')));
        else card.append(el('small', ui(item.imageQuality === 'preview' ? '已上传预览副本（非原始分辨率）' : '已上传图片副本', item.imageQuality === 'preview' ? "Preview copy uploaded (not original resolution)" : "Image copy uploaded")));
      } else if (item.kind === 'capture') card.append(el('small', ui('已保存文字信息，尚未上传图片', "Text saved; image not uploaded")));
      if (item.projectId) {
        const open = el('button', ui('在 Canvas 使用', "Use in Canvas"), 'account-button account-primary');
        open.onclick = () => void run(async () => {
          const result = await request('account.library.canvas', { id: item.id, expectedAccountId: accountId });
          const target = new URL(result.href || ('/studio?project=' + encodeURIComponent(result.projectId)), 'https://canvas.archbuddy.top');
          if (target.origin !== 'https://canvas.archbuddy.top' || target.pathname !== '/studio') throw new Error(t('画布地址无效', "Invalid Canvas URL"));
          await chrome.tabs.create({ url: target.href });
        }); actions.append(open);
      }
      const restore = el('button', ui(item.assetId && !unavailable ? '下载到本地图词库' : '保存文字到本地图词库', item.assetId && !unavailable ? 'Download to local library' : 'Save text to local library'), 'account-button account-secondary');
      restore.onclick = () => void run(async () => {
        restore.disabled = true;
        try {
          const saved = await request('account.local.restore', { id: item.id, expectedAccountId: accountId, includeImage: Boolean(item.assetId) && !unavailable });
          if (version !== epoch) return;
          writeUiText(restore, saved.duplicate ? ui('本地已有此版本', 'Already saved locally') : ui('已保存到本机', 'Saved locally'));
          card.append(el('small', ui(saved.imageSaved ? '图片和文字已保存到本地图词库，不会覆盖本地修改。' : '文字已保存到本地图词库；图片未下载。', saved.imageSaved ? 'Image and text are saved in your local library without replacing local edits.' : 'Text is saved in your local library; no image was downloaded.')));
        } catch (error) { restore.disabled = false; throw error; }
      });
      actions.append(restore);
      const remove = el('button', ui('移出素材库', "Remove from library"), 'account-button account-secondary');
      remove.onclick = () => void run(async () => {
        if (!confirm(t('将这条素材移出云素材库？本机来源文件会保留。仍在使用的画布项目和图片继续占用空间；未使用的素材待清理完成后释放空间。', "Remove this asset from the cloud library? Local source files remain. Canvas projects and images still in use continue using storage; unused assets release space after cleanup completes."))) return;
        const result = await request('account.library.delete', { id: item.id, revision: item.revision, expectedAccountId: accountId });
        if (version !== epoch) return;
        const message = deletionNotice(result);
        $('notice').dataset.tone = 'info';
        writeUiText($('notice'), message);
        try { await load(); }
        catch {
          writeUiText($('notice'), ui(message.zh + '\n列表暂未刷新，请稍后点击刷新。', message.en + '\nThe list could not refresh. Try Refresh again later.'));
          return;
        }
        writeUiText($('notice'), message);
      });
      if (!item.id.startsWith('canvas-')) actions.append(remove);
    } else {
      const include = document.createElement('input'); include.type = 'checkbox';
      if (item.hasImage) {
        const label = el('label', '', 'include'); label.append(include, el('span', ui(item.imageQuality === 'preview' ? '同时上传本地预览副本（非原图）' : '同时上传本地图片副本', item.imageQuality === 'preview' ? 'Also upload the local preview copy (not the original)' : 'Also upload the local image copy'))); card.append(label);
      }
      const publish = el('button', ui('保存到当前账号', "Save to this account"), 'account-button account-primary');
      publish.disabled = !canWrite();
      publish.onclick = () => void run(async () => {
        publish.disabled = true;
        try {
          const result = await request('account.local.publish', { scope, localId: item.localId, includeImage: include.checked, expectedAccountId: accountId });
          if (version !== epoch) return;
          writeUiText(publish, ui('已保存', "Saved"));
          card.append(el('small', ui(result.imageUploaded ? '图片和文字已保存到当前账号' : '文字已保存；图片未上传', result.imageUploaded ? "Image and text saved to this account" : "Text saved; image not uploaded")));
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
$('load-more').onclick = () => void run(() => load('remote', true));
$('prompt-form').onsubmit = event => {
  event.preventDefault();
  void run(async () => {
    if (!(await ensureAccount())) return;
    if (!canWrite()) return;
    await request('account.library.put', { id: newPromptId, expectedAccountId: accountId,
      item: { kind: 'prompt', title: $('title').value.trim(), prompt: $('prompt').value.trim(), tags: [], sourceUrl: '', expectedRevision: 0 } });
    newPromptId = crypto.randomUUID(); $('prompt-form').reset(); await load('remote');
  });
};
void run(() => load());

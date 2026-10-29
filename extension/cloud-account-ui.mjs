import { ACCOUNT_VIEW_KEY, watchScopeReload } from './account-storage.mjs';
let view = { account: null };
let dialog, trigger, notice, member, loginButton, logoutButton;
let refreshing;
function el(tag, className, text) { const n = document.createElement(tag); n.className = className; n.textContent = text; return n; }
async function request(type) {
  const result = await chrome.runtime.sendMessage({ type });
  if (!result?.ok) throw new Error(result?.message || 'ArchBuddy 账号服务暂时不可用');
  return result;
}
function render(result) {
  view = result;
  if (!dialog) return;
  const a = view.account;
  trigger.textContent = a ? `${a.displayName || '我的账号'} · ${(a.credits?.availableUnits ?? 0).toLocaleString()} BuddyCoin` : '登录 / 注册';
  member.replaceChildren();
  loginButton.hidden = Boolean(a); logoutButton.hidden = !a;
  if (a) {
    member.append(el('p', 'account-welcome', a.displayName || 'ArchBuddy 账号'),
      el('p', 'account-note', '官网、Canvas 与插件共用账号和权益。'),
      el('p', '', `可用 ${a.credits?.availableUnits ?? 0} BuddyCoin · 预占 ${a.credits?.reservedUnits ?? 0}`),
      el('p', '', `下载剩余 ${a.entitlements?.downloads?.remaining ?? 0} 次 · 深度反推剩余 ${a.entitlements?.deepReverse?.remaining ?? 0} 次`));
  }
}
async function refresh() {
  if (!refreshing) refreshing = request('account.get').then(result => { render(result); return result; }).finally(() => { refreshing = null; });
  return refreshing;
}
function show() { if (!dialog.open) dialog.showModal(); void refresh().catch(error => { notice.textContent = error.message; }); }
export async function ensureCloudAccount() {
  try { if ((await refresh()).account) return true; } catch (error) { if (notice) notice.textContent = error.message; }
  if (dialog) { show(); notice.textContent = '请使用官网账号登录，随后继续刚才的操作。'; }
  return false;
}
export function mountCloudAccountUI(container) {
  if (!container || dialog) return;
  trigger = el('button', 'account-entry unified-account-entry', '登录 / 注册');
  trigger.type = 'button';
  const library = el('a', 'account-entry unified-account-entry', '云素材');
  library.href = chrome.runtime.getURL('cloud-library.html'); library.target = '_blank'; library.rel = 'noopener';
  container.append(library, trigger);
  dialog = el('dialog', 'account-dialog', '');
  const heading = el('div', 'account-heading', '');
  const close = el('button', 'account-close', '关闭'); close.type = 'button';
  heading.append(el('h2', '', 'ArchBuddy 账号'), close);
  notice = el('p', 'account-notice', '');
  member = el('div', '', '');
  loginButton = el('button', 'account-button account-primary', '邮箱 / Google 登录或注册');
  logoutButton = el('button', 'account-button account-secondary', '退出插件账号');
  dialog.append(heading, el('p', 'account-note', '通过 ArchBuddy 官网安全登录。新账号的赠送权益以服务器记录为准。'), notice, member, loginButton, logoutButton);
  document.body.append(dialog);
  close.onclick = () => dialog.close(); trigger.onclick = show;
  for (const [button, type] of [[loginButton, 'account.login'], [logoutButton, 'account.logout']]) {
    button.onclick = async () => {
      button.disabled = true; notice.textContent = type === 'account.login' ? '请在打开的登录窗口完成授权…' : '正在退出…';
      try { render(await request(type)); notice.textContent = ''; }
      catch (error) { notice.textContent = error.message; }
      finally { button.disabled = false; }
    };
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && changes[ACCOUNT_VIEW_KEY]) render(changes[ACCOUNT_VIEW_KEY].newValue || { account: null });
  });
  watchScopeReload();
  window.addEventListener('focus', () => { void refresh().catch(() => {}); });
  void refresh().catch(error => { trigger.title = error.message; });
}

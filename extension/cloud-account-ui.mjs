import { ACCOUNT_VIEW_KEY, watchScopeReload } from './account-storage.mjs';
import { initI18n, t, setText, setLocalizedAttribute, formatNumber, mountLanguageToggle, onLanguageChange } from './i18n.mjs';
let view = { account: null };
let dialog, trigger, notice, member, loginButton, logoutButton, summary, balances;
let refreshing;
const ERROR_EN = {
  ACCOUNT_BUSY: 'Please wait for the current action to finish, then try again.',
  LOGIN_REQUIRED: 'Sign in to your ArchBuddy account to continue.',
  LOGIN_CANCELLED: 'Connection cancelled. You can sign in again.',
  LOGIN_TIMEOUT: 'Sign-in timed out. Close the previous window and try again.',
  AUTH_CLIENT_UNSUPPORTED: 'Use the official extension or the approved test package.',
  AUTH_UNAVAILABLE: 'Reload the latest extension to enable browser sign-in.',
  AUTH_INVALID: 'The sign-in response could not be verified. Please try again.',
  ACCOUNT_CHANGED: 'The account has changed. Reopen this action.',
  ACCOUNT_STORAGE: 'Your sign-in could not be saved. Please try again.',
  NETWORK_UNAVAILABLE: 'Could not reach the account service. Check your connection and try again.',
  PROCESS_TIMEOUT: 'The account service took too long. Please try again.',
  FORBIDDEN: 'This account cannot complete the action. Please sign in again.',
};
function el(tag, className, zh = '', en = zh) { const node = document.createElement(tag); node.className = className; if (zh) setText(node, zh, en); return node; }
async function request(type) {
  const result = await chrome.runtime.sendMessage({ type });
  if (!result?.ok) throw Object.assign(new Error(result?.message || 'ArchBuddy 账号服务暂时不可用'), { code: result?.code });
  return result;
}
function showError(error) {
  const code = typeof error?.code === 'string' ? error.code : '';
  notice.dataset.tone = 'error';
  setText(notice, error?.message || '账号服务暂时不可用，请重试', ERROR_EN[code] || 'The account service is unavailable. Please try again.');
}
function showNotice(result) {
  notice.dataset.tone = '';
  setText(notice, result.notice || '', result.notice ? 'Signed out on this device. Server revocation is not confirmed yet; sign out on Canvas to revoke the linked session.' : '');
}
function fillBalances(target, account) {
  target.replaceChildren();
  const items = [
    ['BuddyCoin', 'BuddyCoin', account?.credits?.availableUnits],
    ['简析剩余', 'Brief analyses', account?.entitlements?.downloads?.remaining],
    ['深度反推剩余', 'Deep analyses', account?.entitlements?.deepReverse?.remaining],
  ];
  for (const [zh, en, value] of items) {
    const metric = el('div', 'account-metric');
    const number = document.createElement('dd'); number.textContent = formatNumber(value);
    metric.append(el('dt', '', zh, en), number); target.append(metric);
  }
}
function render(result) {
  view = result;
  if (!dialog) return;
  if (result.notice) showNotice(result);
  const account = view.account;
  summary.dataset.authenticated = account ? 'true' : 'false';
  if (account?.displayName) {
    trigger.removeAttribute('data-i18n-zh'); trigger.removeAttribute('data-i18n-en');
    trigger.textContent = account.displayName; trigger.title = account.displayName;
  } else {
    setText(trigger, account ? '我的账号' : '登录 / 注册', account ? 'My account' : 'Sign in / Register');
    trigger.removeAttribute('title');
  }
  setLocalizedAttribute(trigger, 'aria-label', account ? '管理 ArchBuddy 账户' : '登录或注册 ArchBuddy', account ? 'Manage your ArchBuddy account' : 'Sign in or register with ArchBuddy');
  balances.hidden = !account;
  fillBalances(balances, account);
  member.replaceChildren();
  loginButton.hidden = Boolean(account); logoutButton.hidden = !account;
  if (account) {
    const identity = el('p', 'account-welcome'); identity.textContent = account.displayName || t('我的账号', 'My account');
    identity.setAttribute('data-i18n-user', '');
    const detailBalances = el('dl', 'account-balances account-dialog-balances');
    fillBalances(detailBalances, account);
    member.append(identity, detailBalances,
      el('p', 'account-note', 'BuddyCoin 用于画布生成，简析与深度反推分别使用自己的次数额度。', 'BuddyCoin funds Canvas generation. Brief and deep analyses each use their own allowance.'),
      el('p', 'account-note', '普通下载免费。简析成功后才扣次；余额和次数与官网、Canvas 共用。', 'Ordinary downloads are free. Brief analyses count only on success. Your balance and allowances are shared with the website and Canvas.'));
    const reserved = account.credits?.reservedUnits;
    if (typeof reserved === 'number' && reserved > 0) member.append(el('p', 'account-note', '当前任务预占 {count} BuddyCoin', 'Active tasks have reserved {count} BuddyCoin'));
    if (reserved > 0) setText(member.lastChild, '当前任务预占 {count} BuddyCoin', 'Active tasks have reserved {count} BuddyCoin', { count: formatNumber(reserved) });
  }
}
async function refresh() {
  if (!refreshing) refreshing = request('account.get').then(result => { render(result); return result; }).finally(() => { refreshing = null; });
  return refreshing;
}
function show() { if (!dialog.open) dialog.showModal(); void refresh().catch(showError); }
export async function ensureCloudAccount() {
  try { if ((await refresh()).account) return true; } catch (error) { if (notice) showError(error); }
  if (dialog) { show(); setText(notice, '请使用官网账号登录，随后继续刚才的操作。', 'Sign in with your website account, then continue your action.'); }
  return false;
}
export function mountCloudAccountUI(container) {
  if (!container || dialog) return;
  void initI18n(); mountLanguageToggle(container);
  summary = el('section', 'account-summary');
  setLocalizedAttribute(summary, 'aria-label', '账户与剩余额度', 'Account and remaining allowances');
  const row = el('div', 'account-summary-row');
  trigger = el('button', 'account-entry unified-account-entry account-name', '登录 / 注册', 'Sign in / Register');
  trigger.type = 'button';
  const library = el('a', 'account-entry unified-account-entry cloud-library-link', '云素材', 'Cloud library');
  library.href = chrome.runtime.getURL('cloud-library.html'); library.target = '_blank'; library.rel = 'noopener';
  row.append(trigger, library);
  balances = el('dl', 'account-balances'); balances.hidden = true;
  summary.append(row, balances);
  const host = container.closest('.app-header, .topbar') || container;
  host.classList.add('has-unified-account'); host.append(summary);
  dialog = el('dialog', 'account-dialog');
  const heading = el('div', 'account-heading');
  const close = el('button', 'account-close', '关闭', 'Close'); close.type = 'button';
  heading.append(el('h2', '', 'ArchBuddy 账户', 'ArchBuddy account'), close);
  notice = el('p', 'account-notice'); notice.setAttribute('role', 'status'); notice.setAttribute('aria-live', 'polite');
  member = el('div', 'account-member');
  loginButton = el('button', 'account-button account-primary', '邮箱 / Google 登录或注册', 'Sign in or register with email / Google');
  logoutButton = el('button', 'account-button account-secondary', '退出插件账号', 'Sign out of the extension'); logoutButton.hidden = true;
  dialog.append(heading, el('p', 'account-note', '使用官网、Canvas 和插件共用的账户。', 'Use the same account across the website, Canvas and extension.'), notice, member, loginButton, logoutButton);
  const diagnostics = el('details', 'account-diagnostics');
  diagnostics.append(el('summary', '', '版本与登录信息', 'Version and sign-in details'),
    el('p', '', `版本 ${chrome.runtime.getManifest().version} · ${chrome.runtime.id}`, `Version ${chrome.runtime.getManifest().version} · ${chrome.runtime.id}`),
    el('p', '', '在官网授权窗口点击“连接此账户”，即可返回插件。', 'Choose “Connect this account” in the website window to return to the extension.'));
  dialog.append(diagnostics); document.body.append(dialog);
  close.onclick = () => dialog.close(); trigger.onclick = show;
  for (const [button, type] of [[loginButton, 'account.login'], [logoutButton, 'account.logout']]) {
    button.onclick = async () => {
      button.disabled = true; notice.dataset.tone = '';
      setText(button, type === 'account.login' ? '等待官网授权…' : '正在退出…', type === 'account.login' ? 'Waiting for authorization…' : 'Signing out…');
      setText(notice, type === 'account.login' ? '请在官网窗口登录，然后点击“连接此账户”。' : '正在退出…', type === 'account.login' ? 'Sign in in the website window, then choose “Connect this account”.' : 'Signing out…');
      const hint = type === 'account.login' ? setTimeout(() => {
        setText(notice, '仍在等待官网授权，请查看浏览器或任务栏中的登录窗口。', 'Still waiting for authorization. Check your browser or taskbar for the sign-in window.');
      }, 12000) : null;
      try { const result = await request(type); render(result); showNotice(result); }
      catch (error) { showError(error); }
      finally {
        clearTimeout(hint); button.disabled = false;
        setText(button, type === 'account.login' ? '邮箱 / Google 登录或注册' : '退出插件账号', type === 'account.login' ? 'Sign in or register with email / Google' : 'Sign out of the extension');
      }
    };
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && changes[ACCOUNT_VIEW_KEY]) render(changes[ACCOUNT_VIEW_KEY].newValue || { account: null });
  });
  onLanguageChange(() => render(view));
  watchScopeReload();
  window.addEventListener('focus', () => { void refresh().catch(() => {}); });
  void refresh().catch(error => { trigger.title = ERROR_EN[error.code] ? t(error.message, ERROR_EN[error.code]) : error.message; });
}

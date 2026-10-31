import { BACKEND_MODE } from './runtime-config.mjs';

// 此模块只显示账号公开信息；登录令牌由后台保管，不传给页面。
const VIEW_KEY = 'archbuddyAccountViewV1';
let view = { account: null, mode: BACKEND_MODE === 'local' ? 'local-demo' : 'cloud-legacy', packages: [] };
let dialog;
let trigger;
let notice;
let loginPanel;
let memberPanel;
let busy = false;
let challenge = null;
let retryAt = 0;
let cooldownTimer;
let refreshPromise;
let lastAccountId;
let previousFocus;
const orderRequests = new Map();

export function pointsEnabled() { return BACKEND_MODE === 'local'; }
export function formatPoints(tenths) {
  const value = Number.isSafeInteger(tenths) ? tenths : 0;
  return (value / 10).toLocaleString('zh-CN', { maximumFractionDigits: 1 });
}
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
async function request(type, payload = {}) {
  const response = await chrome.runtime.sendMessage({ type, payload });
  if (!response?.ok) {
    const error = new Error(response?.message || response?.error || '账号服务暂时不可用，请确认本地服务已启动');
    error.code = response?.code;
    throw error;
  }
  return response;
}
function message(text = '', error = false) {
  notice.textContent = text;
  notice.dataset.tone = error ? 'error' : '';
}
function dateLabel(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function setBusy(value) {
  busy = value;
  dialog.querySelectorAll('[data-account-action]').forEach(control => { control.disabled = value; });
  updateCooldown();
  renderMember();
}
async function perform(operation) {
  if (busy) return;
  setBusy(true); message();
  try { await operation(); }
  catch (error) { message(error.message, true); }
  finally { setBusy(false); }
}
function updateCooldown() {
  if (!dialog) return;
  const control = dialog.querySelector('#account-send-code');
  const remaining = Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
  control.disabled = busy || remaining > 0;
  control.textContent = remaining ? `${remaining} 秒后重试` : challenge ? '重新获取' : '获取验证码';
  if (!remaining && cooldownTimer) { clearInterval(cooldownTimer); cooldownTimer = null; }
}
function applyView(result) {
  view = { ...view, ...result };
  if (Object.hasOwn(result, 'account')) view.account = result.account;
  if (!dialog) return;
  const accountId = view.account?.id || null;
  if (lastAccountId !== accountId) {
    lastAccountId = accountId;
    challenge = null;
    dialog.querySelector('#account-code').value = '';
    dialog.querySelector('#account-demo-code').textContent = '';
    dialog.querySelector('#account-feedback-reason').value = '';
    dialog.querySelector('#account-order-status').textContent = '';
    orderRequests.clear();
  }
  trigger.hidden = view.mode === 'cloud-legacy';
  trigger.textContent = view.account ? `${formatPoints(view.account.balanceTenths)} 积分` : '登录 / 注册';
  trigger.title = view.account ? '查看账号、积分和使用记录' : '手机号验证码登录，新用户赠送 200 积分';
  loginPanel.hidden = Boolean(view.account);
  memberPanel.hidden = !view.account;
  renderMember();
}
async function refresh() {
  if (!pointsEnabled()) return view;
  if (!refreshPromise) refreshPromise = request('account.get').then(result => {
    applyView(result); return view;
  }).finally(() => { refreshPromise = null; });
  return refreshPromise;
}
function renderMember() {
  if (!dialog || !view.account) return;
  const account = view.account;
  dialog.querySelector('#account-phone-masked').textContent = account.phoneMasked || '已登录';
  dialog.querySelector('#account-balance').textContent = formatPoints(account.balanceTenths);
  dialog.querySelector('#account-daily').textContent = `今日模型调用 ${account.dailyUsed || 0} / ${account.dailyLimit || 50} 次`;
  const bonus = account.bonus?.status || 'none';
  const statusLabels = {
    none: '分享使用体验或改进建议，人工审核通过后赠送 200 积分；每个账号仅一次。',
    pending: '反馈已提交，等待人工审核。通过后赠送 200 积分。',
    approved: '反馈已通过，200 积分已到账。此账号的一次申请已使用。',
    rejected: '本次反馈申请未通过审核，此账号的一次申请已使用。',
  };
  dialog.querySelector('#account-bonus-status').textContent = statusLabels[bonus] || statusLabels.none;
  dialog.querySelector('#account-feedback-form').hidden = bonus !== 'none';
  dialog.querySelector('#account-bonus-submit').disabled = busy || bonus !== 'none';
  const packages = dialog.querySelector('#account-packages');
  packages.replaceChildren();
  for (const pack of view.packages || []) {
    const row = el('div', 'account-package');
    const label = el('div', 'account-package-label');
    label.append(el('strong', '', `${pack.points} 积分`), el('small', '', `¥${(pack.priceCents / 100).toLocaleString('zh-CN')} · 暂定价`));
    const buy = el('button', 'account-button account-secondary', '创建待支付订单');
    buy.type = 'button'; buy.disabled = busy; buy.dataset.accountAction = 'order';
    buy.addEventListener('click', () => { void perform(async () => {
      if (!orderRequests.has(pack.id)) orderRequests.set(pack.id, crypto.randomUUID());
      const response = await request('account.order', { packageId: pack.id, requestId: orderRequests.get(pack.id) });
      if (response.account) applyView({ account: response.account });
      const orderId = response.order?.id || response.order?.orderId || '';
      dialog.querySelector('#account-order-status').textContent = `待支付订单${orderId ? ' ' + orderId : ''}已创建。本地演示尚未接入支付，未收款、未增加积分。`;
      message('订单已保存，未收款、未增加积分。');
    }); });
    row.append(label, buy); packages.append(row);
  }
  const orders = dialog.querySelector('#account-order-history');
  orders.replaceChildren();
  const recentOrders = Array.isArray(account.orders) ? account.orders.slice(0, 10) : [];
  orders.hidden = recentOrders.length === 0;
  for (const order of recentOrders) {
    const row = el('li', 'account-ledger-row');
    const info = el('div');
    const status = { payment_unavailable: '待支付 · 支付未开放', unpaid: '待支付', pending: '待支付', cancelled: '已取消' }[order.status] || '待核对';
    info.append(el('span', '', `${order.points} 积分 · ¥${(order.priceCents / 100).toLocaleString('zh-CN')}`),
      el('small', '', `${dateLabel(order.createdAt)} · ${status}`), el('small', '', `订单 ${order.id}`));
    row.append(info); orders.append(row);
  }
  const ledger = dialog.querySelector('#account-ledger');
  ledger.replaceChildren();
  const rows = Array.isArray(account.ledger) ? account.ledger.slice(0, 50) : [];
  if (!rows.length) ledger.append(el('p', 'account-note', '暂无积分记录'));
  for (const entry of rows) {
    const row = el('li', 'account-ledger-row');
    const info = el('div');
    const status = { pending: '待结算', uncertain: '待核对', refunded_manual: '已人工退回', reserved: '预占', failed: '失败已释放', released: '已释放', refunded: '已退还', committed: '已扣除', settled: '已结算', succeeded: '已完成', completed: '已完成' }[entry.status];
    info.append(el('span', '', entry.label || '积分变动'), el('small', '', `${dateLabel(entry.createdAt)}${status ? ' · ' + status : ''}`));
    const amount = el('strong', entry.deltaTenths > 0 ? 'is-credit' : '', `${entry.deltaTenths > 0 ? '+' : ''}${formatPoints(entry.deltaTenths)}`);
    row.append(info, amount); ledger.append(row);
  }
}
function open() {
  if (!dialog || !pointsEnabled()) return;
  previousFocus = document.activeElement;
  message();
  if (!dialog.open) dialog.showModal();
  void refresh().catch(error => message(error.message, true));
}
export async function ensureAccount() {
  if (!pointsEnabled()) return true;
  try { await refresh(); }
  catch (error) { open(); message(error.message, true); return false; }
  if (view.account) return true;
  open(); message('请先登录，完成后再次点击刚才的操作。');
  return false;
}
export function mountAccountUI(container) {
  if (!pointsEnabled() || dialog) return;
  trigger = el('button', 'account-entry', '登录 / 注册');
  trigger.type = 'button'; trigger.id = 'account-entry';
  container.append(trigger);
  dialog = el('dialog', 'account-dialog');
  dialog.setAttribute('aria-labelledby', 'account-title');
  dialog.innerHTML = `
    <div class="account-heading"><h2 id="account-title">账号与积分</h2><button type="button" id="account-close" class="account-close" aria-label="关闭账号窗口">关闭</button></div>
    <p class="account-mode">本地演示 · 手机短信与支付尚未接入</p>
    <p id="account-notice" class="account-notice" role="status"></p>
    <section id="account-login-panel">
      <p class="account-welcome">登录，开始积累设计灵感</p>
      <p class="account-note">首次注册赠送 200 积分，不按日清零。每日最多 50 次模型调用。</p>
      <form id="account-login-form" class="account-form">
        <label for="account-phone">中国大陆手机号<input id="account-phone" type="tel" inputmode="tel" autocomplete="tel" maxlength="11" placeholder="请输入 11 位手机号" required pattern="1[3-9][0-9]{9}" /></label>
        <label for="account-code">验证码<span class="account-code-row"><input id="account-code" type="text" inputmode="numeric" autocomplete="one-time-code" minlength="6" maxlength="6" placeholder="6 位验证码" required pattern="[0-9]{6}" /><button type="button" id="account-send-code" class="account-button account-secondary" data-account-action="code">获取验证码</button></span></label>
        <p id="account-demo-code" class="account-demo-code"></p>
        <label class="account-consent"><input id="account-terms" type="checkbox" required /><span>我已阅读<a href="privacy.html" target="_blank" rel="noopener noreferrer">隐私说明</a>，同意保存手机号用于本地账号与积分管理。</span></label>
        <button type="submit" id="account-login-submit" class="account-button account-primary" data-account-action="login">登录 / 注册</button>
      </form>
    </section>
    <section id="account-member-panel" hidden>
      <div class="account-identity"><span id="account-phone-masked"></span><button type="button" id="account-logout" class="account-link-button" data-account-action="logout">退出登录</button></div>
      <div class="account-balance-block"><strong id="account-balance">0</strong><span>可用积分</span><small id="account-daily"></small></div>
      <p class="account-note">反推与效果分析：1 积分 / 张；核心视觉描述：0.1 积分 / 张。失败释放积分；调用次数仍计入当日保护。</p>
      <section class="account-section"><h3>反馈体验，申请 200 积分</h3><p id="account-bonus-status" class="account-note"></p><form id="account-feedback-form" class="account-form"><label for="account-feedback-reason">你的使用体验或改进建议<textarea id="account-feedback-reason" rows="3" minlength="5" maxlength="1000" placeholder="请描述使用场景、遇到的问题或建议（至少 5 字）" required></textarea></label><button type="submit" id="account-bonus-submit" class="account-button account-secondary" data-account-action="bonus">提交反馈申请</button></form></section>
      <section class="account-section"><h3>购买积分包</h3><p class="account-note">价格仅占位，待核算后调整；此处只创建未支付订单。</p><div id="account-packages" class="account-packages"></div><p id="account-order-status" class="account-note" role="status"></p><ol id="account-order-history" class="account-ledger" aria-label="最近订单" hidden></ol></section>
      <details class="account-section"><summary>积分明细</summary><ol id="account-ledger" class="account-ledger"></ol></details>
      <p class="account-note account-library-note">图词库保存在当前浏览器中。退出或切换账号不会删除素材，也不会切换为另一套图库。自动描述需重新开启。</p>
    </section>`;
  document.body.append(dialog);
  notice = dialog.querySelector('#account-notice');
  loginPanel = dialog.querySelector('#account-login-panel');
  memberPanel = dialog.querySelector('#account-member-panel');
  trigger.addEventListener('click', open);
  dialog.querySelector('#account-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { previousFocus?.focus?.(); });
  const phone = dialog.querySelector('#account-phone');
  const code = dialog.querySelector('#account-code');
  phone.addEventListener('input', () => {
    phone.value = phone.value.replace(/\D/g, '').slice(0, 11);
    if (challenge && challenge.phone !== phone.value) { challenge = null; code.value = ''; dialog.querySelector('#account-demo-code').textContent = ''; }
  });
  code.addEventListener('input', () => { code.value = code.value.replace(/\D/g, '').slice(0, 6); });
  dialog.querySelector('#account-send-code').addEventListener('click', () => { void perform(async () => {
    if (!phone.reportValidity()) return;
    const consent = dialog.querySelector('#account-terms');
    if (!consent.reportValidity()) return;
    const requestedPhone = phone.value;
    const response = await request('account.code', { phone: requestedPhone });
    if (phone.value !== requestedPhone) return;
    challenge = { id: response.challengeId, phone: requestedPhone };
    retryAt = Date.now() + (Number(response.retryAfterSeconds) || 60) * 1000;
    if (cooldownTimer) clearInterval(cooldownTimer);
    cooldownTimer = setInterval(updateCooldown, 1000);
    dialog.querySelector('#account-demo-code').textContent = response.developmentCode
      ? `本地演示验证码，未发送短信：${response.developmentCode}` : '本地验证码未返回，请重新获取（未发送短信）。';
    message(response.developmentCode ? '仅用于本机演示，请及时填写验证码。' : '未获得本地演示验证码，请重试。');
    code.focus();
  }); });
  dialog.querySelector('#account-login-form').addEventListener('submit', event => {
    event.preventDefault();
    void perform(async () => {
      if (!challenge || challenge.phone !== phone.value) throw new Error('请先为当前手机号获取验证码');
      const response = await request('account.login', { phone: phone.value, challengeId: challenge.id, code: code.value });
      applyView({ account: response.account });
      await refresh();
      phone.value = ''; dialog.querySelector('#account-terms').checked = false;
      message('登录成功。关闭此窗口即可继续使用，自动描述请在功能页重新开启。');
    });
  });
  dialog.querySelector('#account-logout').addEventListener('click', () => { void perform(async () => {
    await request('account.logout'); applyView({ account: null });
    message('已退出。积分保留，自动 AI 队列已暂停。');
  }); });
  dialog.querySelector('#account-feedback-form').addEventListener('submit', event => {
    event.preventDefault();
    void perform(async () => {
      const reason = dialog.querySelector('#account-feedback-reason').value.trim();
      if (reason.length < 5) throw new Error('请填写至少 5 字的真实体验或改进建议');
      const response = await request('account.bonus', { reason });
      if (response.account) applyView({ account: response.account });
      await refresh(); message('反馈已提交，人工审核通过后增加 200 积分。');
    });
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && changes[VIEW_KEY]) applyView(changes[VIEW_KEY].newValue || { account: null });
  });
  window.addEventListener('focus', () => { void refresh().catch(error => { if (dialog.open) message(error.message, true); }); });
  void refresh().catch(error => { trigger.title = error.message; });
}

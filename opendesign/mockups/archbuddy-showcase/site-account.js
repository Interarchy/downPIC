(() => {
  'use strict';
  const menu = document.querySelector('.nav-account');
  if (!menu) return;
  const en = document.documentElement.lang.startsWith('en');
  const get = name => menu.querySelector('[data-account-' + name + ']');
  const ui = Object.fromEntries(['label','credit','name','status','values','points','analysis','reverse','note','login','workspace','refresh'].map(name => [name,get(name)]));
  const origin = document.body.dataset.accountOrigin;
  const allowed = new Set(['https://canvas.archbuddy.top']);
  if (!allowed.has(origin)) return;
  const channel = 'archbuddy-account-v1';
  const bridge = new URL('/site-account', origin);
  bridge.searchParams.set('parent', location.origin);
  bridge.searchParams.set('lang', en ? 'en' : 'zh');
  const login = new URL('/sign-in', origin);
  login.searchParams.set('redirect_url', bridge.href);
  ui.login.href = login.href;
  ui.workspace.href = origin + '/workspace';
  let frame = null, popup = null, pending = null, timer = 0, lastRead = 0;
  let hoverTimer = 0, leaveTimer = 0;
  const summary = menu.querySelector('summary');
  const format = value => value.toLocaleString(en ? 'en-US' : 'zh-CN');
  const words = {
    loading: en ? 'Reading your account…' : '正在读取账户信息…',
    unavailable: en ? 'Unable to read your account. Retry or open Canvas to check.' : '暂时无法读取账户，请重试或进入 Canvas 查看。',
    signed_out: en ? 'Sign in to view credits and feature allowances.' : '登录后查看积分与功能额度。',
    pending: en ? 'Your account is awaiting activation.' : '账户正在等待开通。',
    suspended: en ? 'This account is suspended. Open your account for details.' : '账户已暂停使用，请进入账户查看详情。',
    closed: en ? 'This account has been closed.' : '账户已注销。'
  };
  function clear() {
    ui.values.hidden = true; ui.note.hidden = true; ui.credit.hidden = true;
    ui.points.textContent = ui.analysis.textContent = ui.reverse.textContent = '—';
    ui.label.textContent = en ? 'Sign In' : '账户登录';
    ui.name.textContent = en ? 'One Account, Every Step' : '一个账号，连接创作';
    ui.label.removeAttribute('title');
    summary.setAttribute('aria-label', en ? 'Sign in and account allowances' : '账户登录与额度');
  }
  function finish(data) {
    clearTimeout(timer); pending = null; ui.refresh.disabled = false;
    clear();
    const status = typeof data.status === 'string' ? data.status : 'unavailable';
    menu.dataset.accountState = status;
    summary.removeAttribute('aria-busy');
    ui.status.textContent = words[status] || words.unavailable;
    if (status === 'unavailable') ui.label.textContent = en ? 'Account' : '我的账户';
    ui.login.hidden = !['signed_out','unavailable'].includes(status);
    ui.workspace.hidden = status === 'signed_out';
    if (['active','pending','suspended','closed'].includes(status)) {
      ui.name.textContent = typeof data.displayName === 'string' && data.displayName.trim() ? data.displayName.trim().slice(0,64) : 'ArchBuddy';
      ui.label.textContent = ui.name.textContent;
      ui.label.title = ui.name.textContent;
      summary.setAttribute('aria-label', ui.name.textContent + (en ? ', account allowances' : '，查看账户额度'));
    }
    if (status !== 'active') return;
    if (!Number.isSafeInteger(data.credits) || data.credits < 0) {
      finish({status:'unavailable'}); return;
    }
    ui.values.hidden = false; ui.credit.hidden = false;
    ui.points.textContent = format(data.credits);
    ui.credit.textContent = ui.points.textContent + ' BuddyCoin';
    const library = data.library;
    const connected = library && library.status === 'connected' &&
      Number.isSafeInteger(library.analysisRemaining) && library.analysisRemaining >= 0 &&
      Number.isSafeInteger(library.reverseRemaining) && library.reverseRemaining >= 0;
    for (const [element,key] of [[ui.analysis,'analysisRemaining'],[ui.reverse,'reverseRemaining']]) {
      element.textContent = connected ? format(library[key]) : (en ? 'Unavailable' : '暂不可用');
      element.dataset.pending = String(!connected);
    }
    ui.note.hidden = false;
    ui.note.textContent = connected
      ? (en ? 'Ordinary image saves are free. Brief analysis and deep reverse use separate allowances.' : '普通保存图片不计次，图片简析与深度反推分别计次。')
      : (en ? 'Library allowances are temporarily unavailable. Retry to refresh.' : '暂时无法读取图词库额度，请稍后刷新。');
    ui.status.textContent = (en ? 'Updated at ' : '更新于 ') + new Date().toLocaleTimeString(en ? 'en-US' : 'zh-CN',{hour:'2-digit',minute:'2-digit'});
  }
  function arm(source) {
    clearTimeout(timer);
    // Keep the account name steady during refresh; never show stale balances as current.
    ui.values.hidden = true; ui.note.hidden = true; ui.credit.hidden = true;
    summary.setAttribute('aria-busy','true');
    if (!menu.dataset.accountState) {
      ui.label.textContent = en ? 'Account' : '我的账户';
      ui.login.hidden = true; ui.workspace.hidden = true;
    }
    ui.status.textContent = words.loading; ui.refresh.disabled = true;
    pending = {source,requestId:crypto.randomUUID()};
    timer = setTimeout(() => finish({status:'unavailable'}),15000);
  }
  function send(source) {
    if (!source) return;
    arm(source); lastRead = Date.now();
    source.postMessage({channel,action:'read',requestId:pending.requestId},origin);
  }
  function read() {
    if (pending) return;
    if (popup && !popup.closed) { send(popup); return; }
    if (!frame) {
      frame = document.createElement('iframe');
      frame.className = 'account-session-frame'; frame.title = en ? 'Account connection' : '账户连接';
      frame.tabIndex = -1; frame.setAttribute('aria-hidden','true'); frame.src = bridge.href;
      document.body.appendChild(frame); arm(frame.contentWindow);
    } else send(frame.contentWindow);
  }
  window.addEventListener('message', event => {
    if (event.origin !== origin) return;
    const fromPopup = popup && event.source === popup;
    const fromFrame = frame && event.source === frame.contentWindow;
    if (!fromPopup && !fromFrame) return;
    if (fromFrame && popup && !popup.closed) return;
    const data = event.data;
    if (!data || data.channel !== channel) return;
    if (data.action === 'ready') { send(event.source); return; }
    if (!pending || pending.source !== event.source || data.requestId !== pending.requestId) return;
    finish(data);
  });
  menu.addEventListener('toggle', () => {
    if (menu.open && Date.now() - lastRead > 30000) read();
  });
  // Hover reveals the same native details panel; touch and keyboard retain click support.
  menu.addEventListener('pointerenter', event => {
    if (event.pointerType !== 'mouse') return;
    clearTimeout(leaveTimer);
    hoverTimer = setTimeout(() => { menu.open = true; },180);
  });
  menu.addEventListener('pointerleave', event => {
    if (event.pointerType !== 'mouse') return;
    clearTimeout(hoverTimer);
    leaveTimer = setTimeout(() => {
      if (!menu.contains(document.activeElement)) menu.open = false;
    },240);
  });
  summary.addEventListener('click', () => { clearTimeout(hoverTimer); clearTimeout(leaveTimer); });
  ui.refresh.addEventListener('click', read);
  ui.login.addEventListener('click', event => {
    const opened = window.open(login.href,'archbuddy-account','popup,width=540,height=760');
    if (!opened) return; // The normal link remains available when popups are blocked.
    event.preventDefault(); popup = opened; clearTimeout(timer); pending = null;
    clear(); ui.refresh.disabled = false;
    ui.status.textContent = en ? 'Complete sign-in in the new window, then return here.' : '请在新窗口完成登录，然后返回这里。';
  });
  window.addEventListener('focus', () => {
    if ((!popup || popup.closed) && Date.now() - lastRead > 5000) read();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && (!popup || popup.closed) && Date.now() - lastRead > 5000) read();
  });
  window.addEventListener('pagehide', () => {
    clearTimeout(timer); clearTimeout(hoverTimer); clearTimeout(leaveTimer); pending = null;
  });
  read();
})();

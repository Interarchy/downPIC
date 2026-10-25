(() => {
  'use strict';
  const menu = document.querySelector('.nav-account');
  if (!menu) return;
  const en = document.documentElement.lang.startsWith('en');
  const get = name => menu.querySelector('[data-account-' + name + ']');
  const ui = Object.fromEntries(['label','credit','name','status','values','points','analysis','reverse','note','login','workspace','refresh'].map(name => [name,get(name)]));
  const origin = document.body.dataset.accountOrigin;
  const allowed = new Set(['https://canvas.archbuddy.top','https://archbuddy-canvas-preview-ed82c1yc8-mel-96aa.vercel.app']);
  if (!allowed.has(origin)) return;
  if (document.body.dataset.accountBridge === 'pending') {
    ui.status.textContent = en
      ? 'Account balance on this website is being connected. Sign in to Canvas to manage your account.'
      : '官网账户额度查询接入中。你可以先登录 Canvas 管理账户。';
    ui.login.href = origin + '/sign-in';
    ui.workspace.href = origin + '/workspace';
    ui.refresh.hidden = true;
    return;
  }
  const channel = 'archbuddy-account-v1';
  const bridge = new URL('/site-account', origin);
  bridge.searchParams.set('parent', location.origin);
  bridge.searchParams.set('lang', en ? 'en' : 'zh');
  const login = new URL('/sign-in', origin);
  login.searchParams.set('redirect_url', bridge.href);
  ui.login.href = login.href;
  ui.workspace.href = origin + '/workspace';
  let frame = null, popup = null, pending = null, timer = 0, lastRead = 0;
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
  }
  function finish(data) {
    clearTimeout(timer); pending = null; ui.refresh.disabled = false;
    clear();
    const status = typeof data.status === 'string' ? data.status : 'unavailable';
    ui.status.textContent = words[status] || words.unavailable;
    ui.login.hidden = !['signed_out','unavailable'].includes(status);
    ui.workspace.hidden = status === 'signed_out';
    if (['active','pending','suspended','closed'].includes(status)) {
      ui.label.textContent = en ? 'Account' : '我的账户';
      ui.name.textContent = typeof data.displayName === 'string' ? data.displayName.slice(0,64) : 'ArchBuddy';
    }
    if (status !== 'active') return;
    if (!Number.isSafeInteger(data.credits) || data.credits < 0) {
      finish({status:'unavailable'}); return;
    }
    ui.values.hidden = false; ui.credit.hidden = false;
    ui.points.textContent = data.credits.toLocaleString(en ? 'en-US' : 'zh-CN');
    ui.credit.textContent = ui.points.textContent + (en ? ' pts' : ' 积分');
    const library = data.library;
    const connected = library && library.status === 'connected' &&
      Number.isSafeInteger(library.analysisRemaining) && library.analysisRemaining >= 0 &&
      Number.isSafeInteger(library.reverseRemaining) && library.reverseRemaining >= 0;
    for (const [element,key] of [[ui.analysis,'analysisRemaining'],[ui.reverse,'reverseRemaining']]) {
      element.textContent = connected ? library[key].toLocaleString() : (en ? 'Not Connected' : '尚未接入');
      element.dataset.pending = String(!connected);
    }
    ui.note.hidden = connected;
    ui.status.textContent = (en ? 'Updated at ' : '更新于 ') + new Date().toLocaleTimeString(en ? 'en-US' : 'zh-CN',{hour:'2-digit',minute:'2-digit'});
  }
  function arm(source) {
    clearTimeout(timer); clear();
    ui.login.hidden = false; ui.workspace.hidden = false;
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
    if (menu.open && Date.now() - lastRead > 3000) read();
  });
  ui.refresh.addEventListener('click', read);
  ui.login.addEventListener('click', event => {
    const opened = window.open(login.href,'archbuddy-account','popup,width=540,height=760');
    if (!opened) return; // The normal link remains available when popups are blocked.
    event.preventDefault(); popup = opened; clearTimeout(timer); pending = null;
    clear(); ui.refresh.disabled = false;
    ui.status.textContent = en ? 'Complete sign-in in the new window, then return here.' : '请在新窗口完成登录，然后返回这里。';
  });
  window.addEventListener('focus', () => {
    if (menu.open && (!popup || popup.closed) && Date.now() - lastRead > 5000) read();
  });
  window.addEventListener('pagehide', () => { clearTimeout(timer); pending = null; });
})();
import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { shanghaiDay } from './quota.mjs';

// 仅本地演示；积分以 0.1 分为整数单位持久化，不保存图片、Prompt 或验证码明文。
export const LOCAL_ACCOUNT_DIRECTORY = fileURLToPath(new URL('./dist/local-accounts/', import.meta.url));
export const POINT_PACKAGES = Object.freeze([
  { id: 'points-100', points: 100, priceCents: 100 },
  { id: 'points-500', points: 500, priceCents: 200 },
  { id: 'points-1000', points: 1000, priceCents: 300 },
]);
const SCOPE = Object.freeze({ projectId: 'archbuddy', stage: 'local' });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PHONE = /^1[3-9]\d{9}$/;
const COSTS = Object.freeze({ analyze: 10, evaluate: 10, describe: 1, embed: 0, search: 0 });
const LABELS = Object.freeze({ analyze: '反推提示词', evaluate: '优化迭代提示词', describe: '核心视觉特点', embed: '本地索引计算', search: '语义检索' });
const USER_LIMIT = 50;
const PROJECT_LIMIT = 500;
const digest = value => createHash('sha256').update(value).digest('hex');
const iso = value => new Date(value).toISOString();

export class AccountError extends Error {
  constructor(status, code, message) { super(message); this.name = 'AccountError'; Object.assign(this, { status, code }); }
}
const fail = (status, code, message) => { throw new AccountError(status, code, message); };
function phoneIdentity(phone) {
  if (typeof phone !== 'string' || !PHONE.test(phone)) fail(400, 'INVALID_PHONE', '请输入有效的 11 位中国大陆手机号');
  return digest(`archbuddy:local:phone:${phone}`);
}
function requestKey(requestId) {
  if (typeof requestId !== 'string' || !UUID.test(requestId)) fail(400, 'INVALID_REQUEST_ID', '请求标识无效，请重新提交');
  return requestId.toLowerCase();
}
function reasonText(reason) {
  if (typeof reason !== 'string' || reason.trim().length < 5 || reason.trim().length > 1000) {
    fail(400, 'INVALID_REASON', '请填写 5 至 1000 字的申请说明或使用反馈');
  }
  return reason.trim();
}
function owned(record) {
  if (!record || record.projectId !== SCOPE.projectId || record.stage !== SCOPE.stage) {
    fail(503, 'ACCOUNT_SCOPE_MISMATCH', '本地账号数据归属异常，请联系维护者');
  }
  return record;
}
function accountFor(state, id) {
  const account = state.accounts[id];
  if (!account) fail(401, 'UNAUTHORIZED', '请先登录账号');
  owned(account);
  if (account.disabled) fail(403, 'AUTH_INVALID', '此账号已停用，请联系维护者');
  return account;
}
function ledger(account, now, label, deltaTenths, status = 'completed', id = randomUUID()) {
  const record = { ...SCOPE, id, createdAt: iso(now), label, deltaTenths, status };
  account.ledger.push(record);
  return record;
}
function publicAccount(state, account, at) {
  return {
    id: account.id, phoneMasked: account.phoneMasked, balanceTenths: account.balanceTenths,
    dailyUsed: state.days[shanghaiDay(at)]?.users[account.id] || 0, dailyLimit: USER_LIMIT,
    bonus: { status: account.bonus.status, ...(account.bonus.decidedAt ? { decidedAt: account.bonus.decidedAt } : {}) },
    orders: [...new Map(Object.values(state.orders).filter(order => order.accountId === account.id)
      .map(({ id, packageId, points, priceCents, status, createdAt }) => [id, { id, packageId, points, priceCents, status, createdAt }])).values()]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt)).slice(0, 10),
    ledger: account.ledger.slice(-100).reverse().map(({ id, createdAt, label, deltaTenths, status }) => ({ id, createdAt, label, deltaTenths, status })),
  };
}

export async function unlockStaleAccountStore(directory = LOCAL_ACCOUNT_DIRECTORY) {
  const filename = path.join(directory, 'writer.lock');
  const raw = await readFile(filename, 'utf8');
  const lock = JSON.parse(raw);
  owned(lock);
  if (!Number.isInteger(lock.pid) || lock.pid < 1) throw new Error('本地账本锁格式异常；请人工检查，不能自动清除。');
  try { process.kill(lock.pid, 0); }
  catch (error) {
    if (error.code !== 'ESRCH') throw new Error('无法确认锁对应进程已经停止，保留锁。');
    if (await readFile(filename, 'utf8') !== raw) throw new Error('锁已改变，请停止其他操作后重试。');
    await unlink(filename);
    return { unlocked: true };
  }
  throw new Error('本地账号服务仍在运行，请先停止服务。');
}

export async function createLocalAccountService({ directory = LOCAL_ACCOUNT_DIRECTORY, now = Date.now } = {}) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const filename = path.join(directory, 'accounts.json');
  const lockPath = path.join(directory, 'writer.lock');
  let lock;
  try {
    lock = await open(lockPath, 'wx', 0o600);
    await lock.writeFile(JSON.stringify({ ...SCOPE, pid: process.pid, startedAt: iso(now()) }));
    await lock.sync();
  } catch (error) {
    await lock?.close();
    if (error.code === 'EEXIST') throw new Error('本地账号账本已锁定。请先停止服务；异常退出后运行 node cloudbase/scripts/account-admin.mjs unlock-stale。');
    throw error;
  }
  let state;
  try {
    try { state = JSON.parse(await readFile(filename, 'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      state = { ...SCOPE, schemaVersion: 1, accounts: {}, phones: {}, challenges: {}, sessions: {}, requests: {}, days: {}, orders: {}, adjustments: {} };
    }
    owned(state);
    if (state.schemaVersion !== 1) throw new Error('不支持的本地账号数据版本');
  } catch (error) { await lock.close(); await unlink(lockPath); throw error; }
  let queue = Promise.resolve();
  let closed = false;
  async function persist(draft) {
    const temporary = path.join(directory, `accounts.${randomUUID()}.tmp`);
    let file;
    try {
      file = await open(temporary, 'wx', 0o600);
      await file.writeFile(JSON.stringify(draft));
      await file.sync();
      await file.close();
      file = null;
      await rename(temporary, filename);
    } finally {
      await file?.close();
      await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
    }
  }
  function transact(update) {
    if (closed) return Promise.reject(new Error('本地账号账本已关闭'));
    const operation = queue.then(async () => {
      const draft = structuredClone(state);
      const result = update(draft);
      await persist(draft);
      state = draft;
      return result;
    });
    queue = operation.catch(() => {});
    return operation;
  }
  async function inspect(read) { await queue; if (closed) throw new Error('本地账号账本已关闭'); return read(state); }
  // 崩溃期间是否已成功无法确认：保留预占和保护计数，阻止自动重试，由本机维护者核对。
  await transact(draft => {
    for (const receipt of Object.values(draft.requests)) if (receipt.status === 'reserved') {
      owned(receipt); receipt.status = 'uncertain';
      const entry = draft.accounts[receipt.accountId]?.ledger.find(item => item.id === receipt.ledgerId);
      if (entry) { entry.status = 'uncertain'; entry.label += '（待核对）'; }
    }
  });
  return {
    packages: POINT_PACKAGES,
    async close() { closed = true; await queue; await lock.close(); await unlink(lockPath); },
    async sendCode(phone) {
      const phoneHash = phoneIdentity(phone);
      const at = now();
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      const challengeId = randomUUID();
      return transact(draft => {
        const recent = Object.values(draft.challenges).filter(item => item.phoneHash === phoneHash);
        if (recent.some(item => at - item.createdAt < 60_000)) fail(429, 'CODE_RATE_LIMITED', '验证码已发送，请 60 秒后重试');
        if (recent.filter(item => at - item.createdAt < 3_600_000).length >= 10) fail(429, 'CODE_RATE_LIMITED', '验证码请求过于频繁，请一小时后重试');
        if (Object.values(draft.challenges).filter(item => at - item.createdAt < 60_000).length >= 30) fail(429, 'CODE_RATE_LIMITED', '本地验证码服务繁忙，请稍后重试');
        for (const [id, item] of Object.entries(draft.challenges)) {
          if (at - item.createdAt >= 3_600_000) delete draft.challenges[id];
          else if (item.phoneHash === phoneHash) item.consumed = true;
        }
        draft.challenges[challengeId] = { ...SCOPE, phoneHash, codeHash: digest(`${challengeId}:${code}`), createdAt: at, expiresAt: at + 300_000, attempts: 0, consumed: false };
        return { challengeId, expiresAt: at + 300_000, retryAfterSeconds: 60, developmentCode: code, mode: 'local-demo' };
      });
    },
    async login({ phone, challengeId, code } = {}) {
      const phoneHash = phoneIdentity(phone);
      if (typeof challengeId !== 'string' || !UUID.test(challengeId) || typeof code !== 'string' || !/^\d{6}$/.test(code)) fail(400, 'INVALID_CODE', '请输入 6 位验证码');
      const at = now();
      const token = randomBytes(32).toString('base64url');
      const expiresAt = at + 7 * 24 * 60 * 60 * 1000;
      const result = await transact(draft => {
        const challenge = draft.challenges[challengeId];
        if (!challenge || challenge.phoneHash !== phoneHash || challenge.consumed || at >= challenge.expiresAt || challenge.attempts >= 5) {
          return { error: '验证码无效、已过期或尝试次数过多，请重新获取' };
        }
        owned(challenge);
        challenge.attempts++;
        if (!timingSafeEqual(Buffer.from(challenge.codeHash, 'hex'), Buffer.from(digest(`${challengeId}:${code}`), 'hex'))) return { error: '验证码错误，请重新输入' };
        challenge.consumed = true;
        let account = draft.accounts[draft.phones[phoneHash]];
        if (!account) {
          account = { ...SCOPE, id: randomUUID(), phoneMasked: `${phone.slice(0, 3)}****${phone.slice(-4)}`, createdAt: iso(at), balanceTenths: 2000, disabled: false, bonus: { status: 'none' }, ledger: [] };
          ledger(account, at, '注册赠送', 2000);
          draft.accounts[account.id] = account;
          draft.phones[phoneHash] = account.id;
        }
        accountFor(draft, account.id);
        for (const [key, item] of Object.entries(draft.sessions)) if (at >= item.expiresAt) delete draft.sessions[key];
        draft.sessions[digest(token)] = { ...SCOPE, accountId: account.id, createdAt: at, expiresAt };
        return { token, expiresAt, account: publicAccount(draft, account, at) };
      });
      if (result.error) fail(400, 'INVALID_CODE', result.error);
      return result;
    },
    async authenticate(token) {
      if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
      return inspect(draft => {
        const session = draft.sessions[digest(token)];
        if (!session || session.expiresAt <= now()) return null;
        owned(session);
        const account = accountFor(draft, session.accountId);
        return { actorId: account.id, type: 'account' };
      });
    },
    async logout(token) { return transact(draft => { delete draft.sessions[digest(token || '')]; return { loggedOut: true }; }); },
    async getAccount(id) { return inspect(draft => publicAccount(draft, accountFor(draft, id), now())); },
    async requestBonus(id, reason) {
      const text = reasonText(reason);
      return transact(draft => {
        const account = accountFor(draft, id);
        if (account.bonus.status !== 'none') fail(409, 'BONUS_ALREADY_REQUESTED', '每个账号仅可申请一次反馈赠送，请查看当前申请状态');
        account.bonus = { status: 'pending', reason: text, createdAt: iso(now()) };
        return { account: publicAccount(draft, account, now()) };
      });
    },
    async createOrder(id, packageId, requestId) {
      const key = requestKey(requestId);
      const selected = POINT_PACKAGES.find(item => item.id === packageId);
      if (!selected) fail(400, 'INVALID_PACKAGE', '积分包不存在');
      return transact(draft => {
        const account = accountFor(draft, id);
        const previous = draft.orders[key];
        if (previous && (previous.accountId !== id || previous.packageId !== packageId)) fail(409, 'DUPLICATE_REQUEST', '订单请求标识已使用');
        const order = previous || Object.values(draft.orders).find(item => item.accountId === id && item.packageId === packageId && item.status === 'payment_unavailable')
          || { ...SCOPE, id: randomUUID(), accountId: id, packageId, points: selected.points, priceCents: selected.priceCents, status: 'payment_unavailable', createdAt: iso(now()) };
        draft.orders[key] = order;
        const { accountId, projectId, stage, ...publicOrder } = order;
        return { order: publicOrder, account: publicAccount(draft, account, now()) };
      });
    },
    async reserve(id, requestId, operation) {
      const key = requestKey(requestId);
      if (!Object.hasOwn(COSTS, operation)) throw new Error('未知积分操作');
      return transact(draft => {
        const account = accountFor(draft, id);
        if (draft.requests[key]) fail(409, 'DUPLICATE_REQUEST', '此请求已受理，不会重复调用或扣积分；请查看结果或联系维护者');
        const day = shanghaiDay(now());
        const counters = draft.days[day] ||= { ...SCOPE, project: 0, users: {} };
        owned(counters);
        if (counters.project >= PROJECT_LIMIT) fail(429, 'PROJECT_DAILY_LIMIT', '今日 ArchBuddy 服务调用达到保护上限，北京时间零点恢复；积分余额保留');
        if ((counters.users[id] || 0) >= USER_LIMIT) fail(429, 'USER_DAILY_LIMIT', '今日已使用 50 次 AI 调用，北京时间零点恢复；积分余额保留');
        const cost = COSTS[operation];
        if (account.balanceTenths < cost) fail(402, 'INSUFFICIENT_POINTS', '积分不足，请查看账号中的积分包或反馈赠送申请');
        account.balanceTenths -= cost;
        counters.project++;
        counters.users[id] = (counters.users[id] || 0) + 1;
        const entry = ledger(account, now(), LABELS[operation], -cost, 'reserved');
        const receipt = { ...SCOPE, id: key, accountId: id, day, costTenths: cost, operation, ledgerId: entry.id, status: 'reserved', createdAt: iso(now()) };
        draft.requests[key] = receipt;
        return { id: key, accountId: id, day, costTenths: cost };
      });
    },
    async finish(reservation, success) {
      return transact(draft => {
        const receipt = owned(draft.requests[reservation.id]);
        if (receipt.accountId !== reservation.accountId) throw new Error('积分记录身份不匹配');
        if (receipt.status !== 'reserved') return;
        const account = owned(draft.accounts[receipt.accountId]);
        receipt.status = success ? 'succeeded' : 'failed';
        receipt.completedAt = iso(now());
        const entry = account.ledger.find(item => item.id === receipt.ledgerId);
        entry.status = success ? 'completed' : 'refunded';
        if (!success) {
          account.balanceTenths += receipt.costTenths;
          ledger(account, now(), `${LABELS[receipt.operation]}失败退回`, receipt.costTenths, 'refunded');
        }
      });
    },
    async cancel(reservation) {
      return transact(draft => {
        const receipt = owned(draft.requests[reservation.id]);
        if (receipt.accountId !== reservation.accountId || receipt.status !== 'reserved') return;
        const account = owned(draft.accounts[receipt.accountId]);
        account.balanceTenths += receipt.costTenths;
        const counters = draft.days[receipt.day];
        counters.project--; counters.users[receipt.accountId]--;
        receipt.status = 'cancelled'; receipt.completedAt = iso(now());
        account.ledger.find(item => item.id === receipt.ledgerId).status = 'refunded';
        ledger(account, now(), `${LABELS[receipt.operation]}取消退回`, receipt.costTenths, 'refunded');
      });
    },
    async admin(command, { accountId, reason, requestId, points, receiptId } = {}) {
      if (command === 'list') return inspect(draft => Object.values(draft.accounts).map(account => ({ ...publicAccount(draft, owned(account), now()), disabled: account.disabled, feedback: account.bonus.reason || '', decisionReason: account.bonus.decisionReason || '' })));
      if (command === 'orders') return inspect(draft => [...new Map(Object.values(draft.orders).map(item => [item.id, { ...owned(item) }])).values()]);
      if (command === 'uncertain') return inspect(draft => Object.values(draft.requests).filter(item => item.status === 'uncertain').map(item => ({ ...owned(item) })));
      return transact(draft => {
        const account = owned(draft.accounts[accountId]);
        if (command === 'approve' || command === 'reject') {
          if (account.bonus.status === (command === 'approve' ? 'approved' : 'rejected')) return publicAccount(draft, account, now());
          if (account.bonus.status !== 'pending') fail(409, 'BONUS_NOT_PENDING', '该账号没有待审核申请');
          const decisionReason = reasonText(reason);
          account.bonus.status = command === 'approve' ? 'approved' : 'rejected';
          account.bonus.decidedAt = iso(now()); account.bonus.decisionReason = decisionReason;
          if (command === 'approve') { account.balanceTenths += 2000; ledger(account, now(), '反馈赠送审核通过', 2000); }
        } else if (command === 'topup') {
          const key = requestKey(requestId); const note = reasonText(reason); const tenths = Number(points) * 10;
          if (!Number.isSafeInteger(tenths) || tenths < 1 || tenths > 10_000) fail(400, 'INVALID_POINTS', '人工赠送须为 0.1 至 1000 积分，最多一位小数');
          const previous = draft.adjustments[key];
          if (previous && (previous.accountId !== accountId || previous.tenths !== tenths || previous.reason !== note)) fail(409, 'DUPLICATE_REQUEST', '人工调整请求标识已使用');
          if (!previous) { draft.adjustments[key] = { ...SCOPE, accountId, tenths, reason: note, createdAt: iso(now()) }; account.balanceTenths += tenths; ledger(account, now(), '管理员人工赠送', tenths); }
        } else if (command === 'disable' || command === 'enable') {
          account.disabled = command === 'disable';
          if (account.disabled) for (const [key, item] of Object.entries(draft.sessions)) if (item.accountId === accountId) delete draft.sessions[key];
        } else if (command === 'refund-uncertain') {
          const receipt = owned(draft.requests[requestKey(receiptId)]);
          if (receipt.accountId !== accountId) fail(409, 'ACCOUNT_MISMATCH', '请求不属于此账号');
          if (receipt.status === 'refunded_manual') return publicAccount(draft, account, now());
          if (receipt.status !== 'uncertain') fail(409, 'RECEIPT_NOT_UNCERTAIN', '该请求不需要人工核对');
          receipt.decisionReason = reasonText(reason); receipt.status = 'refunded_manual'; receipt.completedAt = iso(now());
          account.balanceTenths += receipt.costTenths;
          account.ledger.find(item => item.id === receipt.ledgerId).status = 'refunded';
          ledger(account, now(), '异常中断人工退回', receipt.costTenths, 'refunded');
        } else fail(400, 'INVALID_ADMIN_COMMAND', '不支持的本地管理操作');
        return publicAccount(draft, account, now());
      });
    },
  };
}

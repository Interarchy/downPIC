import { createHash } from 'node:crypto';

export const USER_DAILY_LIMIT = 20;
export const PROJECT_DAILY_LIMIT = 200;
export const PROJECT_ID = 'archbuddy';
export const STAGE = 'development'; // Only the registered stage may deploy this adapter.
export const COLLECTIONS = Object.freeze({
  counters: 'archbuddy_dev_quotas',
  requests: 'archbuddy_dev_requests',
});

export class QuotaError extends Error {
  constructor(code, message, status = 429) { super(message); Object.assign(this, { code, status }); }
}

export function shanghaiDay(ms) {
  return new Date(ms + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
const digest = value => createHash('sha256').update(value).digest('hex');

// Preserve provider-reported values; never infer image, cached or thinking usage.
export function normalizeUsage(raw) {
  const usage = {};
  for (const key of ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens', 'total_tokens']) {
    if (Number.isSafeInteger(raw?.[key]) && raw[key] >= 0) usage[key] = raw[key];
  }
  return Object.keys(usage).length ? usage : null;
}

function owned(doc) {
  if (doc && (doc.projectId !== PROJECT_ID || doc.stage !== STAGE)) {
    throw new QuotaError('QUOTA_SCOPE_MISMATCH', '额度数据归属异常，请联系维护者', 503);
  }
  return doc;
}
function count(doc) {
  owned(doc);
  if (!doc) return 0;
  if (!Number.isSafeInteger(doc.count) || doc.count < 0) throw new Error('Invalid quota counter');
  return doc.count;
}

// store.transaction(callback) commits all writes together; no model calls inside it.
export function createQuotaService(store, { now = Date.now } = {}) {
  const base = { projectId: PROJECT_ID, stage: STAGE };
  return {
    async reserve(actor, requestId) {
      if (typeof actor !== 'string' || actor.length < 1 || actor.length > 256 ||
          typeof requestId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(requestId)) {
        throw new QuotaError('INVALID_REQUEST_ID', '请求标识无效，请重新提交', 400);
      }
      const at = now();
      const day = shanghaiDay(at);
      const expiresAt = new Date(at + 30 * 24 * 60 * 60 * 1000);
      const actorHash = digest(`${PROJECT_ID}:${STAGE}:${actor}`);
      const receiptId = digest(`${actorHash}:${requestId.toLowerCase()}`);
      const projectKey = `project_${day}`;
      const userKey = `user_${day}_${actorHash}`;
      try {
        return await store.transaction(async tx => {
          const previous = owned(await tx.get('requests', receiptId));
          if (previous) throw new QuotaError('DUPLICATE_REQUEST', '此请求已受理，不会重复调用或扣次；需要再次分析请新建请求', 409);
          const project = count(await tx.get('counters', projectKey));
          const user = count(await tx.get('counters', userKey));
          if (project >= PROJECT_DAILY_LIMIT) throw new QuotaError('PROJECT_DAILY_LIMIT', '今日 ArchBuddy 反推总额度已用完，北京时间零点恢复');
          if (user >= USER_DAILY_LIMIT) throw new QuotaError('USER_DAILY_LIMIT', '今日 20 次反推额度已用完，北京时间零点恢复');
          await tx.set('counters', projectKey, { ...base, day, count: project + 1, expiresAt });
          await tx.set('counters', userKey, { ...base, day, actorHash, count: user + 1, expiresAt });
          await tx.set('requests', receiptId, {
            ...base, day, actorHash, projectKey, userKey, status: 'reserved',
            createdAt: at, expiresAt, usage: null, usageRecorded: false,
          });
          return { receiptId, day, userRemaining: USER_DAILY_LIMIT - user - 1, projectRemaining: PROJECT_DAILY_LIMIT - project - 1 };
        });
      } catch (error) {
        if (error instanceof QuotaError) throw error;
        throw new QuotaError('QUOTA_UNAVAILABLE', '额度服务暂不可用，本次未调用模型，请稍后重试', 503);
      }
    },
    async cancel(reservation) {
      // Only used when we KNOW the model was not invoked. Never refund uncertain calls.
      await store.transaction(async tx => {
        const doc = owned(await tx.get('requests', reservation.receiptId));
        if (!doc || doc.status !== 'reserved') return;
        const project = count(await tx.get('counters', doc.projectKey));
        const user = count(await tx.get('counters', doc.userKey));
        if (project < 1 || user < 1) throw new Error('Invalid quota refund');
        await tx.set('counters', doc.projectKey, { ...base, day: doc.day, count: project - 1, expiresAt: doc.expiresAt });
        await tx.set('counters', doc.userKey, { ...base, day: doc.day, actorHash: doc.actorHash, count: user - 1, expiresAt: doc.expiresAt });
        await tx.set('requests', reservation.receiptId, { ...doc, status: 'cancelled', completedAt: now() });
      });
    },
    async finish(reservation, { success, usage, durationMs }) {
      const normalized = normalizeUsage(usage);
      await store.transaction(async tx => {
        const doc = owned(await tx.get('requests', reservation.receiptId));
        if (!doc || doc.status !== 'reserved') throw new Error('Invalid quota receipt');
        await tx.set('requests', reservation.receiptId, {
          ...doc, status: success ? 'succeeded' : 'failed', completedAt: now(),
          usage: normalized, usageRecorded: normalized !== null,
          durationMs: Number.isSafeInteger(durationMs) && durationMs >= 0 ? durationMs : null,
        });
      });
      return normalized;
    },
  };
}

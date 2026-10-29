import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { PROJECT_ID, STAGE } from './quota.mjs';

export const UNIFIED_MAX_BYTES = 1024 * 1024;
export const UNIFIED_PATHS = Object.freeze({
  analyze: '/api/analyze', 'analyze-v2': '/api/v2/analyze', evaluate: '/api/v3/evaluate',
  describe: '/api/library/describe', embed: '/api/library/embed', search: '/api/library/search',
});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACCOUNT = /^[a-zA-Z0-9_-]{8,128}$/;
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const hash = value => createHash('sha256').update(value).digest('hex');
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
export const validExecutorSecret = value => typeof value === 'string' && /^[\x21-\x7e]{32,256}$/.test(value);

export class UnifiedAuthError extends Error {
  constructor(status, code, message = '统一账户服务请求无效') {
    super(message); this.name = 'UnifiedAuthError'; Object.assign(this, { status, code });
  }
}

export function verifyUnifiedRequest({ method, path, headers, raw, body, secret, now = Date.now }) {
  if (!validExecutorSecret(secret)) throw new UnifiedAuthError(503, 'UNIFIED_NOT_CONFIGURED');
  const timestamp = headers['x-archbuddy-timestamp'];
  const requestId = headers['x-archbuddy-request-id'];
  const signature = headers['x-archbuddy-signature'];
  if (method !== 'POST' || !['/api/unified/execute', '/api/unified/result'].includes(path)
      || typeof timestamp !== 'string' || !/^\d{13}$/.test(timestamp)
      || Math.abs(now() - Number(timestamp)) > 5 * 60 * 1000
      || typeof requestId !== 'string' || !UUID.test(requestId)
      || typeof signature !== 'string' || !/^[a-f0-9]{64}$/.test(signature)) {
    throw new UnifiedAuthError(401, 'UNIFIED_UNAUTHORIZED');
  }
  const bodyHash = hash(raw);
  const canonical = ['v1', method, path, timestamp, requestId, bodyHash].join('\n');
  const expected = createHmac('sha256', secret).update(canonical).digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) throw new UnifiedAuthError(401, 'UNIFIED_UNAUTHORIZED');
  if (!plain(body) || typeof body.accountId !== 'string' || !ACCOUNT.test(body.accountId)) throw new UnifiedAuthError(400, 'UNIFIED_INVALID_INPUT');
  if (path === '/api/unified/result') {
    if (Object.keys(body).some(key => !['accountId', 'requestId'].includes(key)) || body.requestId !== requestId) {
      throw new UnifiedAuthError(400, 'UNIFIED_INVALID_INPUT');
    }
  } else if (Object.keys(body).some(key => !['accountId', 'operation', 'payload'].includes(key))
      || !Object.hasOwn(UNIFIED_PATHS, body.operation) || !plain(body.payload)) {
    throw new UnifiedAuthError(400, 'UNIFIED_INVALID_INPUT');
  }
  return { accountId: body.accountId, requestId, bodyHash, operation: body.operation };
}

// Reuse only the existing ArchBuddy requests collection, never environment-wide data.
// A durable reservation is written before dispatch; crashes/timeouts stay pending.
export function createUnifiedExecutions(store, { now = Date.now } = {}) {
  if (!store || typeof store.transaction !== 'function') throw new Error('Unified execution requires a durable transactional store');
  const identity = ({ accountId, requestId }) => ({
    id: `unified_${hash(`${accountId}\n${requestId}`)}`,
    accountHash: hash(`${PROJECT_ID}:${STAGE}:${accountId}`),
    requestHash: hash(requestId),
  });
  const check = (record, key) => {
    if (record && (record.projectId !== PROJECT_ID || record.stage !== STAGE
        || record.kind !== 'unified-execution' || record.accountHash !== key.accountHash || record.requestHash !== key.requestHash)) {
      throw new UnifiedAuthError(503, 'UNIFIED_STORE_CONFLICT');
    }
    return record;
  };
  const transaction = async callback => {
    try { return await store.transaction(callback); }
    catch (error) {
      if (error instanceof UnifiedAuthError) throw error;
      throw new UnifiedAuthError(503, 'UNIFIED_STORE_UNAVAILABLE', '任务记录暂时无法核实，请稍后查询原任务');
    }
  };
  return {
    async reserve(request) {
      const key = identity(request);
      return transaction(async tx => {
        const existing = check(await tx.get('requests', key.id), key);
        if (existing) {
          if (existing.bodyHash !== request.bodyHash || existing.operation !== request.operation) throw new UnifiedAuthError(409, 'UNIFIED_REQUEST_CONFLICT');
          return { created: false, key, record: existing };
        }
        const record = { projectId: PROJECT_ID, stage: STAGE, kind: 'unified-execution',
          accountHash: key.accountHash, requestHash: key.requestHash, bodyHash: request.bodyHash,
          operation: request.operation, state: 'pending', dispatch: 'reserved',
          createdAt: new Date(now()), updatedAt: new Date(now()), expiresAt: new Date(now() + RETENTION_MS) };
        await tx.set('requests', key.id, record);
        return { created: true, key, record };
      });
    },
    async markSubmitted(lease) {
      await transaction(async tx => {
        const record = check(await tx.get('requests', lease.key.id), lease.key);
        if (!record || record.state !== 'pending' || record.dispatch !== 'reserved') throw new UnifiedAuthError(409, 'UNIFIED_PENDING');
        await tx.set('requests', lease.key.id, { ...record, dispatch: 'submitted', updatedAt: new Date(now()) });
      });
    },
    async complete(lease, result) {
      const encoded = JSON.stringify(result);
      if (Buffer.byteLength(encoded) > 900 * 1024) throw new UnifiedAuthError(503, 'UNIFIED_RESULT_TOO_LARGE');
      await transaction(async tx => {
        const record = check(await tx.get('requests', lease.key.id), lease.key);
        if (!record || record.state !== 'pending') throw new UnifiedAuthError(409, 'UNIFIED_STATE_CONFLICT');
        await tx.set('requests', lease.key.id, { ...record, state: 'completed', result: JSON.parse(encoded), updatedAt: new Date(now()) });
      });
    },
    async failBeforeOrRejected(lease, errorCode) {
      await transaction(async tx => {
        const record = check(await tx.get('requests', lease.key.id), lease.key);
        if (!record || record.state !== 'pending') return;
        await tx.set('requests', lease.key.id, { ...record, state: 'failed', errorCode: /^[A-Z0-9_]{1,80}$/.test(errorCode) ? errorCode : 'UNIFIED_REJECTED', updatedAt: new Date(now()) });
      });
    },
    async result(request) {
      const key = identity(request);
      return transaction(async tx => {
        const record = check(await tx.get('requests', key.id), key);
        if (!record || new Date(record.expiresAt).getTime() <= now()) return { state: 'not_found' };
        return record.state === 'completed' ? { state: 'completed', result: record.result }
          : record.state === 'failed' ? { state: 'failed', errorCode: record.errorCode }
          : { state: 'pending' };
      });
    },
  };
}

// Only explicit upstream rejections prove that a paid model was not accepted.
// Timeouts, disconnects, 5xx and malformed successful responses remain pending.
export function definitelyRejected(error, modelStarted) {
  if (!modelStarted) return true;
  if (['NOT_CONFIGURED', 'INVALID_CONFIGURATION', 'IMAGE_REJECTED', 'EMBEDDING_NOT_CONFIGURED'].includes(error?.code)) return true;
  const upstreamStatus = error?.name === 'VisionAnalysisError' ? error.status : error?.upstreamStatus;
  return [400, 401, 403, 404, 413, 415, 422, 429].includes(upstreamStatus);
}

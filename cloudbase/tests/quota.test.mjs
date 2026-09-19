import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createQuotaService, normalizeUsage, shanghaiDay } from '../quota.mjs';
import { createCloudBaseStore, initializeCloudBaseStore } from '../cloudbase-store.mjs';
import { fakeDatabase } from './fake-database.mjs';

test('北京零点切换；20 次个人限额跨服务对象保留', async () => {
  const backend = fakeDatabase();
  let clock = Date.parse('2026-09-15T15:59:59Z');
  let quota = createQuotaService(backend.store, { now: () => clock });
  const id = randomUUID();
  await quota.reserve('alice', id);
  for (let i = 1; i < 20; i++) await quota.reserve('alice', randomUUID());
  quota = createQuotaService(backend.store, { now: () => clock });
  await assert.rejects(quota.reserve('alice', randomUUID()), { code: 'USER_DAILY_LIMIT' });
  clock += 1000;
  assert.equal(shanghaiDay(clock), '2026-09-16');
  assert.equal((await quota.reserve('alice', randomUUID())).userRemaining, 19);
  await assert.rejects(quota.reserve('alice', id), { code: 'DUPLICATE_REQUEST' });
});

test('两个服务并发合计最多 200 次；无超扣、个人最多 20 次', async () => {
  const backend = fakeDatabase();
  const services = [createQuotaService(backend.store), createQuotaService(backend.store)];
  const attempts = await Promise.allSettled(Array.from({ length: 260 }, (_, i) =>
    services[i % 2].reserve(`user-${i % 13}`, randomUUID())));
  assert.equal(attempts.filter(x => x.status === 'fulfilled').length, 200);
  assert.equal(attempts.filter(x => x.status === 'rejected').length, 60);
  for (const [key, value] of backend.docs) {
    if (key.includes('/user_')) assert.ok(value.count <= 20);
    if (key.includes('/project_')) assert.equal(value.count, 200);
  }
});

test('同一请求并发只预占一次；模型前取消退次、重复取消不重复退', async () => {
  const backend = fakeDatabase();
  const quota = createQuotaService(backend.store);
  const id = randomUUID();
  const results = await Promise.allSettled([quota.reserve('alice', id), quota.reserve('alice', id)]);
  assert.equal(results[0].status, 'fulfilled');
  assert.equal(results[1].reason.code, 'DUPLICATE_REQUEST');
  await quota.cancel(results[0].value);
  await quota.cancel(results[0].value);
  assert.equal((await quota.reserve('alice', randomUUID())).userRemaining, 19);
});

test('上游失败计次，未知用量保留 null；只保存允许的数值字段', async () => {
  const backend = fakeDatabase();
  const quota = createQuotaService(backend.store);
  const first = await quota.reserve('alice', randomUUID());
  await quota.finish(first, { success: false });
  await quota.cancel(first); // Completed calls cannot be refunded.
  const next = await quota.reserve('alice', randomUUID());
  assert.equal(next.userRemaining, 18);
  await quota.finish(next, { success: true, usage: { input_tokens: 1234, output_tokens: 890, apiKey: 'secret', image: 'private' }, durationMs: 17664 });
  const receipts = [...backend.docs.values()].filter(doc => doc.status);
  assert.equal(receipts[0].usage, null);
  assert.equal(receipts[0].status, 'failed');
  assert.deepEqual(receipts[1].usage, { input_tokens: 1234, output_tokens: 890 });
  assert.equal(JSON.stringify(receipts).includes('secret'), false);
  assert.equal(JSON.stringify(receipts).includes('private'), false);
  assert.equal(JSON.stringify(receipts).includes('alice'), false);
  assert.equal(normalizeUsage({ input_tokens: -1, output_tokens: '890', total_tokens: Infinity }), null);
  assert.deepEqual(normalizeUsage({ input_tokens: 0 }), { input_tokens: 0 });
});

test('错误项目或阶段数据阻断；事务回滚；SDK 错误响应不当作空计数', async () => {
  const backend = fakeDatabase();
  const quota = createQuotaService(backend.store);
  await quota.reserve('alice', randomUUID());
  const [key, value] = [...backend.docs].find(([key]) => key.includes('/project_'));
  backend.docs.set(key, { ...value, projectId: 'another-project' });
  const before = structuredClone(backend.docs);
  await assert.rejects(quota.reserve('alice', randomUUID()), { code: 'QUOTA_SCOPE_MISMATCH' });
  assert.deepEqual(backend.docs, before);
  const broken = createCloudBaseStore({ runTransaction: async cb => cb({ collection: () => ({ doc: () => ({ get: async () => ({ code: 'PERMISSION_DENIED' }) }) }) }) });
  await assert.rejects(createQuotaService(broken).reserve('alice', randomUUID()), { code: 'QUOTA_UNAVAILABLE' });
  await assert.rejects(backend.store.transaction(tx => tx.get('other-project-users', 'x')));
  assert.throws(() => initializeCloudBaseStore({ ARCHBUDDY_CLOUDBASE_ENV_ID: '', ARCHBUDDY_STAGE: 'development' }));
});

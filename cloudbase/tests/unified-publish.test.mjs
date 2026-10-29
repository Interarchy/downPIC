import test from 'node:test';
import assert from 'node:assert/strict';
import { TARGET, SOURCE_FILES, signedRequest, createApi, inspectService, mergedEnvironment, sourceZip, publish, TTL_INDEX, indexListRequest, ttlCreateRequest, parseIndexMetadata, installUnifiedTtl } from '../scripts/publish-unified-executor.mjs';
const secret = 'unit-test-only-fixed-executor-secret-1234567890';
const env = { ARCHBUDDY_CLOUDBASE_ENV_ID: TARGET.envId, ARCHBUDDY_STAGE: 'development', ARCHBUDDY_QUOTA_MODE: 'cloudbase', ARCHBUDDY_CLOUDBASE_API_KEY: 'mock-db', DEEPSEEK_API_KEY: 'mock-model', PORT: '8080' };
const detail = { BaseInfo: { ServerName: TARGET.service, ServerType: 'container', Status: 'normal' },
  ServerConfig: { EnvId: TARGET.envId, ServerName: TARGET.service, Port: 8080, EnvParams: JSON.stringify(env) },
  OnlineVersionInfos: [{ VersionName: 'archbuddy-api-014', FlowRatio: '100' }] };
const source = { commit: 'mock-commit', zip: Buffer.from('public-source-only') };

test('plan blocks every write before network and signs credentials only in headers', async () => {
  let calls = 0;
  const credential = { secretId: 'mock-secret-id', secretKey: 'mock-secret-key', token: 'mock-session' };
  const api = createApi(credential, { fetchImpl: () => { calls++; } });
  await assert.rejects(api('tcbr', 'UpdateCloudRunServer', {}), { code: 'READ_ONLY_PLAN' });
  assert.equal(calls, 0);
  const request = signedRequest('tcbr', 'DescribeCloudRunServerDetail', { EnvId: TARGET.envId, ServerName: TARGET.service }, credential, 1793318400000);
  assert.equal(request.url, 'https://tcbr.tencentcloudapi.com/');
  assert.equal(request.options.headers['X-TC-Version'], '2022-02-17');
  assert.equal(request.options.body.includes(credential.secretKey), false);
  assert.match(request.options.headers.Authorization, /^TC3-HMAC-SHA256 Credential=mock-secret-id\/2026-10-30\/tcbr\/tc3_request,/);
});
test('target/version drift and development mode fail closed; zero-traffic canary may coexist', () => {
  assert.equal(inspectService(detail, 'archbuddy-api-014').version, 'archbuddy-api-014');
  assert.throws(() => inspectService(detail, 'archbuddy-api-013'), { code: 'ONLINE_VERSION_CHANGED' });
  assert.throws(() => inspectService({ ...detail, ServerConfig: { ...detail.ServerConfig, EnvId: 'another-project' } }), { code: 'TARGET_MISMATCH' });
  assert.throws(() => inspectService({ ...detail, ServerConfig: { ...detail.ServerConfig, EnvParams: JSON.stringify({ ...env, NODE_ENV: 'development' }) } }), { code: 'NON_PRODUCTION_CONFIGURATION' });
  assert.equal(inspectService({ ...detail, OnlineVersionInfos: [...detail.OnlineVersionInfos, { VersionName: 'archbuddy-api-015', FlowRatio: '0' }] }).version, 'archbuddy-api-014');
});
test('environment merge preserves every existing value and never rotates an existing signing secret', () => {
  assert.deepEqual(JSON.parse(mergedEnvironment(env, secret)), { ...env, PRODUCT_EXECUTOR_SECRET: secret });
  assert.throws(() => mergedEnvironment({ ...env, PRODUCT_EXECUTOR_SECRET: 'other-fixed-test-secret-1234567890' }, secret), { code: 'SECRET_ROTATION_FORBIDDEN' });
});
test('source zip uses an explicit deterministic public-only whitelist', () => {
  assert.equal(SOURCE_FILES.length, 17);
  assert.ok(SOURCE_FILES.every(file => !/(^|\/)(\.env|environment\.json|dist|runtime|tests)/.test(file)));
  const bytes = sourceZip([{ name: 'Dockerfile', data: Buffer.from('FROM node:22') }]);
  assert.equal(bytes.readUInt32LE(0), 0x04034b50);
  assert.equal(bytes.readUInt32LE(bytes.length - 22), 0x06054b50);
  assert.deepEqual(bytes, sourceZip([{ name: 'Dockerfile', data: Buffer.from('FROM node:22') }]));
  assert.throws(() => sourceZip([{ name: '../credentials', data: 'no' }]), { code: 'SOURCE_PATH_INVALID' });
});
test('gray deployment preserves original env, emits no secrets and syncs Worker only after CloudBase accepts', async () => {
  const order = [], events = []; let saved, synced;
  const api = async (_service, action, data) => {
    order.push(action);
    if (action === 'DescribeCloudBaseBuildService') return { UploadUrl: 'https://bucket.cos.ap-shanghai.myqcloud.com/source.zip?signature=test', PackageName: 'source', PackageVersion: 'v1' };
    assert.equal(data.DeployInfo.ReleaseType, 'GRAY'); assert.equal(data.Items.length, 1); assert.equal(data.Items[0].Key, 'EnvParam');
    saved = JSON.parse(data.Items[0].Value); return { RequestId: 'mock-release-id' };
  };
  await publish({ api, source, inspected: { env, version: 'archbuddy-api-014' }, emit: e => events.push(e),
    fetchImpl: async () => { order.push('upload'); return { ok: true }; },
    syncSecret: async s => { synced = s; order.push('stdin-secret'); } });
  assert.deepEqual(order, ['DescribeCloudBaseBuildService', 'upload', 'UpdateCloudRunServer', 'stdin-secret']);
  assert.match(synced, /^[a-f0-9]{64}$/); assert.equal(saved.PRODUCT_EXECUTOR_SECRET, synced);
  for (const [key, value] of Object.entries(env)) assert.equal(saved[key], value);
  for (const value of [synced, 'mock-db', 'mock-model', 'signature=test']) assert.equal(JSON.stringify(events).includes(value), false);
});
test('an unknown gray outcome cannot configure Worker or automatically retry the release', async () => {
  let updateCalls = 0, synced = false;
  await assert.rejects(publish({ source, inspected: { env, version: 'archbuddy-api-014' }, fetchImpl: async () => ({ ok: true }),
    api: async (_s, action) => { if (action === 'DescribeCloudBaseBuildService') return { UploadUrl: 'https://bucket.cos.ap-shanghai.myqcloud.com/source.zip', PackageName: 'source', PackageVersion: 'v1' }; updateCalls++; throw Object.assign(new Error(), { code: 'TCB_REQUEST_UNCONFIRMED' }); },
    syncSecret: async () => { synced = true; } }), { code: 'TCB_REQUEST_UNCONFIRMED' });
  assert.equal(updateCalls, 1); assert.equal(synced, false);
});
test('secret recovery reads the persisted value without uploading, redeploying or rotating', async () => {
  let synced;
  await publish({ source, inspected: { env: { ...env, PRODUCT_EXECUTOR_SECRET: secret }, version: 'archbuddy-api-014' }, syncOnly: true,
    api: () => { throw new Error('must not mutate CloudBase'); }, fetchImpl: () => { throw new Error('must not upload'); }, syncSecret: async s => { synced = s; } });
  assert.equal(synced, secret);
});

test('native Mongo index metadata normalizes Extended JSON without reading documents', () => {
  const native = { Data: [JSON.stringify([{ name: '_id_', key: { _id: { $numberInt: '1' } } }, { name: TTL_INDEX, key: { unifiedExpiresAt: { $numberInt: '1' } }, expireAfterSeconds: { $numberLong: '0' } }])] };
  assert.deepEqual(parseIndexMetadata(native), [{ name: '_id_', key: { _id: 1 } }, { name: TTL_INDEX, key: { unifiedExpiresAt: 1 }, expireAfterSeconds: 0 }]);
});
test('TTL plan cannot mutate and executable mode still rejects arbitrary database commands', async () => {
  const credentials = { secretId: 'test', secretKey: 'test', token: 'test' };
  const never = () => { throw new Error('must not reach network'); };
  await assert.rejects(createApi(credentials, { fetchImpl: never })('tcb', 'RunCommands', ttlCreateRequest()), { code: 'DATABASE_COMMAND_NOT_APPROVED' });
  await assert.rejects(createApi(credentials, { execute: true, fetchImpl: never })('tcb', 'RunCommands', { EnvId: TARGET.envId, MgoCommands: [] }), { code: 'DATABASE_COMMAND_NOT_APPROVED' });
});
test('TTL creates only the new dedicated field index, retains legacy indexes, and does not recreate it', async () => {
  const indexes = [{ name: '_id_', key: { _id: 1 } }, { name: '_openid_1', key: { _openid: 1 } }]; let writes = 0;
  const api = async (_s, action, data) => {
    if (action === 'DescribeResourcePermission') return { Data: { PermissionList: [{ Resource: TARGET.collection, Permission: 'ADMINONLY' }] } };
    if (JSON.stringify(data) === JSON.stringify(indexListRequest())) return { Data: [JSON.stringify(indexes)] };
    assert.deepEqual(data, ttlCreateRequest()); writes++;
    indexes.push({ name: TTL_INDEX, key: { unifiedExpiresAt: 1 }, expireAfterSeconds: 0 }); return {};
  };
  assert.equal((await installUnifiedTtl(api)).retainedIndexCount, 2);
  assert.equal((await installUnifiedTtl(api)).alreadyPresent, true); assert.equal(writes, 1);
});

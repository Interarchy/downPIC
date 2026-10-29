import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, createHash } from 'node:crypto';
import { probeTarget, signedProbe, verifyNoModel } from '../scripts/verify-unified-executor.mjs';
const origin = 'https://archbuddy-api-313819-12-1419174875.sh.run.tcloudbase.com';
const secret = 'unit-test-only-verification-secret-1234567890';
const service = { BaseInfo: { ServerName: 'archbuddy-api', DefaultDomainName: origin }, OnlineVersionInfos: [{ VersionName: 'archbuddy-api-014', FlowRatio: '100' }] };
const version = { Name: 'archbuddy-api-015', Status: 'normal' };
const order = { ReleaseOrderInfo: { ReleaseVersion: { VersionName: 'archbuddy-api-015', Status: 'normal', UrlParam: { Key: 'archbuddy_canary', Value: 'test-only-route-value-12345678' } }, TrafficType: 'URL_PARAMS', GrayStatus: 'success' } };
test('probe requires either exact official canary route or the expected version serving all traffic', () => {
  assert.equal(probeTarget(service, order, version, 'archbuddy-api-015').base.searchParams.get('archbuddy_canary'), 'test-only-route-value-12345678');
  assert.throws(() => probeTarget(service, { ReleaseOrderInfo: { ...order.ReleaseOrderInfo, TrafficType: 'FLOW' } }, version, 'archbuddy-api-015'), { code: 'NO_VERIFIED_CANARY_ROUTE' });
  assert.throws(() => probeTarget(service, order, { ...version, Status: 'creating' }, 'archbuddy-api-015'), { code: 'VERSION_NOT_READY' });
  assert.equal(probeTarget({ ...service, OnlineVersionInfos: [{ VersionName: 'archbuddy-api-015', FlowRatio: '100' }] }, order, version, 'archbuddy-api-015').routedBy, 'full-flow');
});
test('read-only receipt signs the precise result path and body without any execute operation', () => {
  const signed = signedProbe(secret, { now: 1793318400000, id: '11111111-1111-4111-8111-111111111111' });
  assert.equal(signed.pathname, '/api/unified/result');
  assert.equal(JSON.parse(signed.body).operation, undefined);
  const canonical = ['v1', 'POST', signed.pathname, '1793318400000', '11111111-1111-4111-8111-111111111111', createHash('sha256').update(signed.body).digest('hex')].join('\n');
  assert.equal(signed.headers['x-archbuddy-signature'], createHmac('sha256', secret).update(canonical).digest('hex'));
});
test('verification uses only status, closed legacy session and result lookup; preserves canary routing on every request', async () => {
  const paths = [];
  const base = new URL(origin + '?archbuddy_canary=test-only-route-value-12345678');
  const result = await verifyNoModel(base, secret, { fetchImpl: async (url, options) => {
    assert.equal(url.searchParams.get('archbuddy_canary'), 'test-only-route-value-12345678'); paths.push(url.pathname);
    const [status, body] = url.pathname === '/api/status' ? [200, { accountMode: 'unified', anonymousSessionsEnabled: false }]
      : url.pathname === '/api/session' ? [410, { code: 'UNIFIED_LOGIN_REQUIRED' }]
      : options.headers['x-archbuddy-signature'] === '00'.repeat(32) ? [401, { code: 'UNIFIED_UNAUTHORIZED' }]
      : [200, { state: 'not_found' }];
    return { status, json: async () => body };
  } });
  assert.deepEqual(paths, ['/api/status', '/api/session', '/api/unified/result', '/api/unified/result']);
  assert.equal(result.modelCalls, 0); assert.equal(result.signedResult, 'not_found');
});

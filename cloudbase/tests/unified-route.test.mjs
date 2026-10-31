import test from 'node:test';
import assert from 'node:assert/strict';
import { assertReleaseReady, promoteRequest } from '../scripts/route-unified-canary.mjs';
const ready = releaseStatus => [
  { ReleaseOrderInfo: { CurrentVersion: { VersionName: 'archbuddy-api-014' }, ReleaseVersion: { VersionName: 'archbuddy-api-015', Status: 'normal' }, GrayStatus: 'success', ReleaseStatus: releaseStatus } },
  { Name: 'archbuddy-api-015', Status: 'normal' },
  { BaseInfo: { ServerName: 'archbuddy-api' }, OnlineVersionInfos: [{ VersionName: 'archbuddy-api-014', FlowRatio: '100' }] },
];
test('accepts successful open and zero-percent gray release', () => {
  for (const state of ['open', 'gray']) assert.doesNotThrow(() => assertReleaseReady(...ready(state)));
});
test('rejects in-flight, unexpected version, and changed traffic', () => {
  for (const mutate of [a => a[0].ReleaseOrderInfo.GrayStatus = 'doing', a => a[0].ReleaseOrderInfo.ReleaseStatus = 'closed', a => a[1].Name = 'archbuddy-api-016', a => a[2].OnlineVersionInfos[0].FlowRatio = '50']) {
    const args = ready('gray'); mutate(args);
    assert.throws(() => assertReleaseReady(...args), { code: 'EXACT_RELEASE_NOT_READY' });
  }
});
test('promotion is pinned to only candidate 015 at full flow', () => {
  const request = promoteRequest();
  assert.equal(request.ServerName, 'archbuddy-api');
  assert.equal(request.TrafficType, 'FLOW');
  assert.equal(request.CloseGrayRelease, true);
  assert.deepEqual(request.VersionFlowItems, [{ VersionName: 'archbuddy-api-015', FlowRatio: 100, Priority: 0, IsDefaultPriority: true }]);
});

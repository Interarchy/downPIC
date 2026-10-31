// 固定本次014→015发布；默认只读计划，--execute才改流量。
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApi, readCredential, TARGET } from './publish-unified-executor.mjs';
import { probeTarget, verifyNoModel } from './verify-unified-executor.mjs';
export function assertReleaseReady(order, version, service) {
  const info = order.ReleaseOrderInfo;
  const online = service.OnlineVersionInfos || [];
  if (info?.CurrentVersion?.VersionName !== 'archbuddy-api-014' || info?.ReleaseVersion?.VersionName !== 'archbuddy-api-015'
      || version.Name !== 'archbuddy-api-015' || version.Status !== 'normal' || info.ReleaseVersion.Status !== 'normal'
      || ['doing', 'running'].includes(String(info.GrayStatus).toLowerCase()) || !['open', 'gray'].includes(info.ReleaseStatus)
      || service.BaseInfo?.ServerName !== TARGET.service || online.length !== 1
      || online[0].VersionName !== 'archbuddy-api-014' || Number(online[0].FlowRatio) !== 100) {
    throw Object.assign(new Error(), { code: 'EXACT_RELEASE_NOT_READY' });
  }
}
export function promoteRequest() {
  return { EnvId: TARGET.envId, ServerName: TARGET.service, GrayType: 'gray', TrafficType: 'FLOW', GrayFlowRatio: 100,
    VersionFlowItems: [{ VersionName: 'archbuddy-api-015', FlowRatio: 100, Priority: 0, IsDefaultPriority: true }], CloseGrayRelease: true };
}
async function main() {
  const args = process.argv.slice(2);
  if (args.some(value => !['--execute', '--promote', '--promote-direct'].includes(value))) throw Object.assign(new Error(), { code: 'UNAPPROVED_ARGUMENT' });
  const execute = args.includes('--execute'), direct = args.includes('--promote-direct'), promote = direct || args.includes('--promote');
  if (direct && args.includes('--promote')) throw Object.assign(new Error(), { code: 'CONFLICTING_PROMOTE_MODES' });
  const api = createApi(await readCredential(), { execute });
  const target = { EnvId: TARGET.envId, ServerName: TARGET.service };
  const [order, version, service] = await Promise.all([
    api('tcbr', 'DescribeReleaseOrder', target),
    api('tcbr', 'DescribeVersionDetail', { ...target, VersionName: 'archbuddy-api-015' }),
    api('tcbr', 'DescribeCloudRunServerDetail', target),
  ]);
  assertReleaseReady(order, version, service);
  console.log(JSON.stringify({ phase: 'route-plan', mode: execute ? 'execute' : 'read-only', operation: direct ? 'promote-015-direct-unverified' : promote ? 'promote-015' : 'canary-015-default-014', current: 'archbuddy-api-014', candidate: 'archbuddy-api-015' }));
  if (!execute) return;
  if (promote && !direct) {
    // 切流前再做四项无模型验收；失败则不发布。
    const { base } = probeTarget(service, order, version, 'archbuddy-api-015');
    const env = JSON.parse(version.EnvParams);
    const checks = await verifyNoModel(base, env.PRODUCT_EXECUTOR_SECRET);
    console.log(JSON.stringify({ phase: 'pre-promote-verification', ...checks }));
  }
  // direct 仅供执行开关已关闭的主任务使用；切流后必须执行 verify 脚本，不能将 API 成功视为验收。
  if (!promote) throw Object.assign(new Error(), { code: 'CANARY_ROUTING_NOT_CONFIRMED' });
  const request = promote ? promoteRequest()
    : { ...target, GrayType: 'gray', TrafficType: 'URL_PARAMS', GrayFlowRatio: 0,
      VersionFlowItems: [ { VersionName: 'archbuddy-api-014', FlowRatio: 100, IsDefaultPriority: true, Priority: 1 },
        { VersionName: 'archbuddy-api-015', FlowRatio: 0, IsDefaultPriority: false, Priority: 2,
          UrlParam: { Key: 'archbuddy_canary', Value: randomBytes(24).toString('hex') } } ] };
  const result = await api('tcbr', 'ReleaseGray', request);
  console.log(JSON.stringify({ phase: 'route-submitted', operation: direct ? 'promote-015-direct-unverified' : promote ? 'promote-015' : 'canary-015-default-014', requestId: result.RequestId }));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => {
  console.error(JSON.stringify({ ok: false, code: typeof error?.code === 'string' && /^[A-Za-z0-9_.-]{1,120}$/.test(error.code) ? error.code : 'ROUTING_STOPPED' }));
  process.exitCode = 1;
});

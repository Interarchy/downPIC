// 仅状态读取/无模型验收，不提交execute、不改流量、不记录Secret或定向URL参数。
import { createHash, createHmac, randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApi, readCredential, TARGET } from './publish-unified-executor.mjs';
const ORIGIN = 'https://archbuddy-api-313819-12-1419174875.sh.run.tcloudbase.com';
const fail = code => { throw Object.assign(new Error(code), { code }); };
const digest = body => createHash('sha256').update(body).digest('hex');
export function probeTarget(service, order, version, expectedVersion) {
  if (service.BaseInfo?.ServerName !== TARGET.service || service.BaseInfo?.DefaultDomainName !== ORIGIN
      || version.Name !== expectedVersion || version.Status !== 'normal') fail('VERSION_NOT_READY');
  const base = new URL(ORIGIN);
  const online = service.OnlineVersionInfos || [];
  const full = online.length === 1 && online[0].VersionName === expectedVersion && Number(online[0].FlowRatio) === 100;
  if (full) return { base, routedBy: 'full-flow' };
  const info = order.ReleaseOrderInfo, candidate = info?.ReleaseVersion;
  if (candidate?.VersionName !== expectedVersion || candidate.Status !== 'normal'
      || info.TrafficType !== 'URL_PARAMS' || ['doing', 'running'].includes(String(info.GrayStatus).toLowerCase())) fail('NO_VERIFIED_CANARY_ROUTE');
  const param = candidate.UrlParam;
  if (!param || typeof param.Key !== 'string' || !/^[a-zA-Z0-9_]{1,64}$/.test(param.Key)
      || typeof param.Value !== 'string' || !/^[a-zA-Z0-9_-]{16,128}$/.test(param.Value)) fail('CANARY_PARAMETER_INVALID');
  base.searchParams.set(param.Key, param.Value);
  return { base, routedBy: 'exact-canary-parameter' };
}
export function signedProbe(secret, { now = Date.now(), id = randomUUID() } = {}) {
  const pathname = '/api/unified/result';
  const body = JSON.stringify({ accountId: 'account_probe_readonly_000000000000', requestId: id });
  const timestamp = String(now);
  const canonical = ['v1', 'POST', pathname, timestamp, id, digest(body)].join('\n');
  return { pathname, body, headers: { 'content-type': 'application/json', 'x-archbuddy-timestamp': timestamp,
    'x-archbuddy-request-id': id, 'x-archbuddy-signature': createHmac('sha256', secret).update(canonical).digest('hex') } };
}
export async function verifyNoModel(base, secret, { fetchImpl = fetch } = {}) {
  if (!/^[\x21-\x7e]{32,256}$/.test(secret)) fail('VERSION_SECRET_MISSING');
  const call = async (pathname, options = {}) => {
    const url = new URL(base); url.pathname = pathname;
    let response, body;
    try { response = await fetchImpl(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(45000) }); body = await response.json(); }
    catch { fail('PROBE_REQUEST_UNCONFIRMED'); }
    return { status: response.status, body };
  };
  const status = await call('/api/status');
  if (status.status !== 200 || status.body.accountMode !== 'unified' || status.body.anonymousSessionsEnabled !== false) fail('UNIFIED_STATUS_FAILED');
  const legacy = await call('/api/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ installationId: randomUUID() }) });
  if (legacy.status !== 410 || legacy.body.code !== 'UNIFIED_LOGIN_REQUIRED') fail('LEGACY_PATH_STILL_OPEN');
  const signed = signedProbe(secret);
  const result = await call(signed.pathname, { method: 'POST', headers: signed.headers, body: signed.body });
  if (result.status !== 200 || result.body.state !== 'not_found' || Object.keys(result.body).length !== 1) fail('SIGNED_RECEIPT_PROBE_FAILED');
  const rejected = await call(signed.pathname, { method: 'POST', headers: { ...signed.headers, 'x-archbuddy-signature': '00'.repeat(32) }, body: signed.body });
  if (rejected.status !== 401 || rejected.body.code !== 'UNIFIED_UNAUTHORIZED') fail('INVALID_SIGNATURE_NOT_REJECTED');
  return { unifiedStatus: true, anonymousSessionClosed: true, signedResult: 'not_found', invalidSignature: 401, modelCalls: 0 };
}
async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg, index) => !['--version', '--verify'].includes(arg) && args[index - 1] !== '--version')) fail('UNAPPROVED_ARGUMENT');
  const expected = args[args.indexOf('--version') + 1];
  if (!/^archbuddy-api-\d+$/.test(expected || '')) fail('VERSION_REQUIRED');
  const api = createApi(await readCredential());
  const target = { EnvId: TARGET.envId, ServerName: TARGET.service };
  const [service, order, version] = await Promise.all([
    api('tcbr', 'DescribeCloudRunServerDetail', target), api('tcbr', 'DescribeReleaseOrder', target),
    api('tcbr', 'DescribeVersionDetail', { ...target, VersionName: expected }),
  ]);
  const info = order.ReleaseOrderInfo;
  console.log(JSON.stringify({ phase: 'version-status', expected, versionStatus: version.Status,
    online: service.OnlineVersionInfos.map(item => ({ name: item.VersionName, percent: Number(item.FlowRatio) })),
    current: info?.CurrentVersion?.VersionName, candidate: info?.ReleaseVersion?.VersionName,
    grayStatus: info?.GrayStatus, releaseStatus: info?.ReleaseStatus, routingType: info?.TrafficType,
    canaryParameterPresent: Boolean(info?.ReleaseVersion?.UrlParam?.Value) }));
  if (!args.includes('--verify')) return;
  const { base, routedBy } = probeTarget(service, order, version, expected);
  let env; try { env = JSON.parse(version.EnvParams); } catch { fail('VERSION_ENVIRONMENT_INVALID'); }
  const checks = await verifyNoModel(base, env.PRODUCT_EXECUTOR_SECRET);
  console.log(JSON.stringify({ phase: 'no-model-verification', version: expected, routedBy, ...checks }));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => {
  console.error(JSON.stringify({ ok: false, code: /^[A-Za-z0-9_.-]{1,120}$/.test(error?.code || '') ? error.code : 'VERIFICATION_STOPPED' })); process.exitCode = 1;
});

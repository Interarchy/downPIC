// 审查后由主任务执行。默认只读；不把环境变量、签名或上传地址输出/落盘。
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

export const TARGET = Object.freeze({
  envId: 'dev-mel-d9guu8bpu44029179', region: 'ap-shanghai', service: 'archbuddy-api',
  worker: 'archbuddy-beta-preview', workerEnv: 'preview', collection: 'archbuddy_dev_requests',
});
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const SOURCE_FILES = Object.freeze([
  'cloudbase/server.mjs', 'cloudbase/embedding.mjs', 'cloudbase/start.mjs', 'cloudbase/unified-auth.mjs',
  'cloudbase/quota.mjs', 'cloudbase/cloudbase-store.mjs', 'cloudbase/session.mjs',
  'cloudbase/package.json', 'cloudbase/package-lock.json',
  'plugin-prototype/vision-analyzer.mjs', 'plugin-prototype/developer-settings.mjs',
  'plugin-prototype/analysis-contract.mjs', 'plugin-prototype/prompt-model.mjs',
  'plugin-prototype/analysis-instructions.md', 'plugin-prototype/analysis-instructions-v2.md',
  'plugin-prototype/evaluation-instructions-v3.md', 'cloudbase/Dockerfile',
]);
const hash = value => createHash('sha256').update(value).digest('hex');
const hmac = (key, value) => createHmac('sha256', key).update(value).digest();
const safeError = code => Object.assign(new Error(code), { code });
const SERVICE_VERSIONS = { tcb: '2018-06-08', tcbr: '2022-02-17' };
const READ_ACTIONS = new Set(['DescribeCloudRunServerDetail', 'DescribeTable', 'DescribeResourcePermission', 'RunCommands']);
export const TTL_INDEX = 'archbuddy_unified_expiry_v1';
export const indexListRequest = () => ({ EnvId: TARGET.envId, MgoCommands: [{ TableName: TARGET.collection, CommandType: 'COMMAND', Command: JSON.stringify({ listIndexes: TARGET.collection }) }] });
export const ttlCreateRequest = () => ({ EnvId: TARGET.envId, MgoCommands: [{ TableName: TARGET.collection, CommandType: 'COMMAND', Command: JSON.stringify({ createIndexes: TARGET.collection, indexes: [{ key: { unifiedExpiresAt: 1 }, name: TTL_INDEX, expireAfterSeconds: 0 }] }) }] });
const WRITE_ACTIONS = new Set(['DescribeCloudBaseBuildService', 'UpdateCloudRunServer']);

export function signedRequest(service, action, data, credential, now = Date.now()) {
  if (!SERVICE_VERSIONS[service] || !READ_ACTIONS.has(action) && !WRITE_ACTIONS.has(action)) throw safeError('UNAPPROVED_API');
  const timestamp = Math.floor(now / 1000), date = new Date(now).toISOString().slice(0, 10);
  const hostname = `${service}.tencentcloudapi.com`, body = JSON.stringify(data);
  const canonical = `POST\n/\n\ncontent-type:application/json\nhost:${hostname}\n\ncontent-type;host\n${hash(body)}`;
  const scope = `${date}/${service}/tc3_request`;
  const stringToSign = `TC3-HMAC-SHA256\n${timestamp}\n${scope}\n${hash(canonical)}`;
  const key = hmac(hmac(hmac('TC3' + credential.secretKey, date), service), 'tc3_request');
  const signature = createHmac('sha256', key).update(stringToSign).digest('hex');
  return { url: `https://${hostname}/`, options: { method: 'POST', redirect: 'error', body,
    headers: { 'Content-Type': 'application/json', 'X-TC-Action': action, 'X-TC-Version': SERVICE_VERSIONS[service],
      'X-TC-Region': TARGET.region, 'X-TC-Timestamp': String(timestamp), 'X-TC-Token': credential.token,
      Authorization: `TC3-HMAC-SHA256 Credential=${credential.secretId}/${scope}, SignedHeaders=content-type;host, Signature=${signature}` },
  } };
}

export async function readCredential() {
  // 使用 tcb 既有临时登录；不读取供应商或浏览器凭据，不自行创建/刷新登录。
  const file = path.join(os.homedir(), '.config', '.cloudbase', 'auth.json');
  const { credential: c } = JSON.parse(await readFile(file, 'utf8'));
  const expires = Number(c?.tmpExpired || c?.accessTokenExpired);
  const expiresMs = expires < 1e12 ? expires * 1000 : expires;
  if (!c?.tmpSecretId || !c.tmpSecretKey || !c.tmpToken || !Number.isFinite(expiresMs) || expiresMs < Date.now() + 300000) throw safeError('TCB_CREDENTIAL_EXPIRED');
  return { secretId: c.tmpSecretId, secretKey: c.tmpSecretKey, token: c.tmpToken };
}

export function createApi(credential, { execute = false, fetchImpl = fetch } = {}) {
  return async (service, action, data) => {
    if (action === 'RunCommands') {
      const encoded = JSON.stringify(data);
      if (encoded !== JSON.stringify(indexListRequest()) && (encoded !== JSON.stringify(ttlCreateRequest()) || !execute)) throw safeError('DATABASE_COMMAND_NOT_APPROVED');
    }
    if (!execute && !READ_ACTIONS.has(action)) throw safeError('READ_ONLY_PLAN');
    const { url, options } = signedRequest(service, action, data, credential);
    let response, result;
    try { response = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(45000) }); result = await response.json(); }
    catch { throw safeError('TCB_REQUEST_UNCONFIRMED'); }
    const error = result?.Response?.Error;
    if (error) throw safeError(/^[a-zA-Z0-9_.]{1,100}$/.test(error.Code) ? `TCB_${error.Code}` : 'TCB_API_REJECTED');
    if (!response.ok || !result?.Response) throw safeError('TCB_RESPONSE_INVALID');
    return result.Response;
  };
}

export function inspectService(detail, expectedVersion) {
  const base = detail?.BaseInfo, config = detail?.ServerConfig;
  if (base?.ServerName !== TARGET.service || config?.EnvId !== TARGET.envId || config.ServerName !== TARGET.service
      || base.ServerType !== 'container' || config.Port !== 8080) throw safeError('TARGET_MISMATCH');
  if (base.Status !== 'normal') throw safeError('SERVICE_NOT_STABLE');
  const online = detail.OnlineVersionInfos;
  const stable = Array.isArray(online) ? online.filter(item => Number(item.FlowRatio) === 100) : [];
  if (stable.length !== 1 || online.some(item => ![0, 100].includes(Number(item.FlowRatio))
      || !/^archbuddy-api-\d+$/.test(item.VersionName))) throw safeError('UNEXPECTED_TRAFFIC');
  if (expectedVersion && stable[0].VersionName !== expectedVersion) throw safeError('ONLINE_VERSION_CHANGED');
  let env;
  try { env = JSON.parse(config.EnvParams); } catch { throw safeError('ENVIRONMENT_INVALID'); }
  if (!env || Array.isArray(env) || Object.values(env).some(value => typeof value !== 'string')) throw safeError('ENVIRONMENT_INVALID');
  if (env.ARCHBUDDY_CLOUDBASE_ENV_ID !== TARGET.envId || env.ARCHBUDDY_STAGE !== 'development'
      || env.ARCHBUDDY_QUOTA_MODE !== 'cloudbase' || !env.ARCHBUDDY_CLOUDBASE_API_KEY || !env.DEEPSEEK_API_KEY) throw safeError('SERVICE_CONFIGURATION_MISMATCH');
  if (env.NODE_ENV && env.NODE_ENV !== 'production') throw safeError('NON_PRODUCTION_CONFIGURATION');
  return { env, version: stable[0].VersionName, port: config.Port, min: config.MinNum, max: config.MaxNum };
}

export function mergedEnvironment(env, secret) {
  if (!/^[\x21-\x7e]{32,256}$/.test(secret)) throw safeError('EXECUTOR_SECRET_INVALID');
  if (env.PRODUCT_EXECUTOR_SECRET && env.PRODUCT_EXECUTOR_SECRET !== secret) throw safeError('SECRET_ROTATION_FORBIDDEN');
  const merged = { ...env, PRODUCT_EXECUTOR_SECRET: secret };
  for (const [key, value] of Object.entries(env)) if (merged[key] !== value) throw safeError('ORIGINAL_ENVIRONMENT_CHANGED');
  return JSON.stringify(merged);
}

// 无压缩 ZIP 在内存构建：固定白名单、固定时间戳、没有磁盘目录/环境文件可被意外打包。
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
export function sourceZip(files) {
  const locals = [], central = []; let offset = 0;
  for (const { name, data } of files) {
    if (!/^(cloudbase|plugin-prototype)\/[a-zA-Z0-9_.-]+$/.test(name) && name !== 'Dockerfile') throw safeError('SOURCE_PATH_INVALID');
    const filename = Buffer.from(name), bytes = Buffer.from(data), crc = crc32(bytes);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0x21, 12); local.writeUInt32LE(crc, 14); local.writeUInt32LE(bytes.length, 18); local.writeUInt32LE(bytes.length, 22); local.writeUInt16LE(filename.length, 26);
    locals.push(local, filename, bytes);
    const record = Buffer.alloc(46); record.writeUInt32LE(0x02014b50); record.writeUInt16LE(20, 4); record.writeUInt16LE(20, 6); record.writeUInt16LE(0x0800, 8);
    record.writeUInt16LE(0x21, 14); record.writeUInt32LE(crc, 16); record.writeUInt32LE(bytes.length, 20); record.writeUInt32LE(bytes.length, 24); record.writeUInt16LE(filename.length, 28); record.writeUInt32LE(offset, 42);
    central.push(record, filename); offset += local.length + filename.length + bytes.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}
export function collectSource() {
  const git = args => execFileSync('git', args, { cwd: REPO, windowsHide: true, maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  if (git(['status', '--porcelain', '--', ...SOURCE_FILES]).toString().trim()) throw safeError('SOURCE_NOT_COMMITTED');
  const commit = git(['rev-parse', 'HEAD']).toString().trim();
  const files = SOURCE_FILES.map(file => ({ name: file === 'cloudbase/Dockerfile' ? 'Dockerfile' : file, data: git(['show', `${commit}:${file}`]) }));
  return { commit, files, zip: sourceZip(files) };
}

export async function validateWorker(configPath, cliPath) {
  const source = await readFile(configPath, 'utf8');
  // 仓库当前 jsonc 是有效 JSON；不能通过宽松正则误读其它环境。
  let config; try { config = JSON.parse(source); } catch { throw safeError('WORKER_CONFIG_PARSE_FAILED'); }
  const preview = config.env?.preview;
  if (preview?.name !== TARGET.worker || preview.vars?.STAGE !== 'preview'
      || preview.vars?.PRODUCT_EXECUTION_ENABLED && preview.vars.PRODUCT_EXECUTION_ENABLED !== 'false') throw safeError('WORKER_NOT_PAUSED');
  if (!path.isAbsolute(configPath) || !path.isAbsolute(cliPath) || !cliPath.replaceAll('\\', '/').endsWith('/wrangler/bin/wrangler.js')) throw safeError('WORKER_CLI_INVALID');
  await readFile(cliPath); // 路径确实存在；不 import CLI，也不打印文件。
}
export async function syncWorkerSecret(secret, configPath, cliPath) {
  // Secret 只在 stdin，stdout/stderr 完整丢弃，避免 CLI 失败转储配置内容。
  const env = { ...process.env, CI: 'true', WRANGLER_LOG: 'error', WRANGLER_SEND_METRICS: 'false' };
  delete env.NODE_OPTIONS; delete env.DEBUG;
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, 'secret', 'put', 'PRODUCT_EXECUTOR_SECRET', '--config', configPath, '--env', TARGET.workerEnv, '--name', TARGET.worker],
      { cwd: path.dirname(configPath), env, windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'] });
    let timer = setTimeout(() => { child.kill(); reject(safeError('WORKER_SECRET_UNCONFIRMED')); }, 55000);
    child.on('error', () => { clearTimeout(timer); reject(safeError('WORKER_SECRET_FAILED')); });
    child.on('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(safeError('WORKER_SECRET_UNCONFIRMED')); });
    child.stdin.on('error', () => {}); child.stdin.end(secret + '\n');
  });
}

export async function publish({ api, source, inspected, workerConfig, wranglerCli, syncOnly = false, syncSecret = syncWorkerSecret, fetchImpl = fetch, emit = () => {} }) {
  let secret = inspected.env.PRODUCT_EXECUTOR_SECRET;
  if (syncOnly) {
    if (!secret) throw safeError('NO_EXISTING_EXECUTOR_SECRET');
    mergedEnvironment(inspected.env, secret);
    await syncSecret(secret, workerConfig, wranglerCli);
    emit({ phase: 'worker-secret-synced', retainedSecret: true, worker: TARGET.worker, executionEnabled: false }); return;
  }
  // 已有密钥只复用，不允许因重试悄悄轮换；灰度API未知时不得自动重新提交。
  secret ||= randomBytes(32).toString('hex');
  const envParams = mergedEnvironment(inspected.env, secret);
  const upload = await api('tcb', 'DescribeCloudBaseBuildService', { EnvId: TARGET.envId, ServiceName: TARGET.service });
  const url = new URL(upload.UploadUrl);
  if (url.protocol !== 'https:' || !/(^|\.)[a-z0-9-]+\.cos(?:\.[a-z0-9-]+)?\.(myqcloud\.com|tencentcos\.cn)$/.test(url.hostname)
      || !upload.PackageName || !upload.PackageVersion) throw safeError('SOURCE_UPLOAD_TARGET_INVALID');
  const headers = Object.fromEntries((upload.UploadHeaders || []).map(item => [item.Key, item.Value]));
  let response;
  try { response = await fetchImpl(url, { method: 'PUT', headers, body: source.zip, redirect: 'error', signal: AbortSignal.timeout(45000) }); }
  catch { throw safeError('SOURCE_UPLOAD_UNCONFIRMED'); }
  if (!response.ok) throw safeError('SOURCE_UPLOAD_FAILED');
  const released = await api('tcbr', 'UpdateCloudRunServer', { EnvId: TARGET.envId, ServerName: TARGET.service,
    DeployInfo: { DeployType: 'package', PackageName: upload.PackageName, PackageVersion: upload.PackageVersion, ReleaseType: 'GRAY' },
    Items: [{ Key: 'EnvParam', Value: envParams }],
  });
  emit({ phase: 'gray-submitted', previousVersion: inspected.version, commit: source.commit,
    requestId: released.RequestId, keys: Object.keys(released).filter(key => key !== 'RequestId'), trafficChanged: false });
  // 先由CloudBase持久保留新密钥，再通过stdin同步；失败后用 --sync-worker-only 读取原值恢复，不生成另一把。
  await syncSecret(secret, workerConfig, wranglerCli);
  emit({ phase: 'worker-secret-synced', worker: TARGET.worker, executionEnabled: false });
}

export function parseIndexMetadata(result) {
  const objects = [];
  const normalize = value => {
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === 'object') {
      if (Object.keys(value).length === 1 && ['$numberInt', '$numberLong', '$numberDouble'].some(key => Object.hasOwn(value, key))) return Number(Object.values(value)[0]);
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalize(item)]));
    }
    return value;
  };
  function walk(value) {
    if (typeof value === 'string') { try { walk(JSON.parse(value)); } catch {} }
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') { if (typeof value.name === 'string' && value.key) objects.push(value); else Object.values(value).forEach(walk); }
  }
  walk(result.Data);
  return objects.map(item => ({ name: item.name, key: normalize(item.key), ...(item.expireAfterSeconds === undefined ? {} : { expireAfterSeconds: Number(normalize(item.expireAfterSeconds)) }) }));
}
export async function installUnifiedTtl(api) {
  const permission = await api('tcb', 'DescribeResourcePermission', { EnvId: TARGET.envId, ResourceType: 'collection', Resources: [TARGET.collection] });
  if (permission.Data?.PermissionList?.find(item => item.Resource === TARGET.collection)?.Permission !== 'ADMINONLY') throw safeError('COLLECTION_NOT_PRIVATE');
  const before = parseIndexMetadata(await api('tcb', 'RunCommands', indexListRequest()));
  if (!before.some(item => item.name === '_id_')) throw safeError('INDEX_LIST_INVALID');
  const existing = before.find(item => item.name === TTL_INDEX);
  if (existing) {
    if (JSON.stringify(existing.key) !== JSON.stringify({ unifiedExpiresAt: 1 }) || existing.expireAfterSeconds !== 0) throw safeError('TTL_INDEX_CONFLICT');
    return { alreadyPresent: true, index: existing };
  }
  await api('tcb', 'RunCommands', ttlCreateRequest());
  const after = parseIndexMetadata(await api('tcb', 'RunCommands', indexListRequest()));
  const applied = after.find(item => item.name === TTL_INDEX);
  if (!applied || JSON.stringify(applied.key) !== JSON.stringify({ unifiedExpiresAt: 1 }) || applied.expireAfterSeconds !== 0) throw safeError('TTL_INDEX_UNCONFIRMED');
  for (const index of before) if (!after.some(item => JSON.stringify(item) === JSON.stringify(index))) throw safeError('LEGACY_INDEX_CHANGED');
  return { alreadyPresent: false, index: applied, retainedIndexCount: before.length };
}

async function main() {
  const args = process.argv.slice(2), get = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
  const allowed = new Set(['--execute', '--sync-worker-only', '--expect-version', '--worker-config', '--wrangler-cli', '--inspect-database', '--apply-ttl']);
  for (let i = 0; i < args.length; i++) { if (!allowed.has(args[i])) throw safeError('UNAPPROVED_ARGUMENT'); if (['--expect-version', '--worker-config', '--wrangler-cli'].includes(args[i])) i++; }
  const execute = args.includes('--execute'), syncOnly = args.includes('--sync-worker-only'), applyTtl = args.includes('--apply-ttl');
  if (applyTtl && (!execute || syncOnly)) throw safeError('TTL_REQUIRES_EXCLUSIVE_EXECUTE');
  if (syncOnly && !execute) throw safeError('SYNC_REQUIRES_EXECUTE');
  const expectedVersion = get('--expect-version');
  if (execute && !/^archbuddy-api-\d+$/.test(expectedVersion || '')) throw safeError('EXPECTED_VERSION_REQUIRED');
  const credential = await readCredential();
  const api = createApi(credential, { execute });
  const detail = await api('tcbr', 'DescribeCloudRunServerDetail', { EnvId: TARGET.envId, ServerName: TARGET.service });
  const inspected = inspectService(detail, expectedVersion), source = collectSource();
  const emit = value => process.stdout.write(JSON.stringify(value) + '\n');
  emit({ phase: 'plan', target: TARGET, onlineVersion: inspected.version, port: inspected.port, min: inspected.min, max: inspected.max,
    environmentNames: Object.keys(inspected.env).sort(), hasExecutorSecret: Boolean(inspected.env.PRODUCT_EXECUTOR_SECRET),
    commit: source.commit, sourceFiles: source.files.map(file => ({ name: file.name, sha256: hash(file.data) })), zipBytes: source.zip.length, zipSha256: hash(source.zip), mode: execute ? syncOnly ? 'sync-existing-secret' : 'gray-create' : 'read-only' });
  if (args.includes('--inspect-database')) {
    // 返回只含结构元数据的原 API 对象；不执行查询用户文档或修改权限/索引。
    for (const [action, data] of [ ['DescribeTable', { EnvId: TARGET.envId, TableName: TARGET.collection }],
      ['DescribeResourcePermission', { EnvId: TARGET.envId, ResourceType: 'collection', Resources: [TARGET.collection] }] ]) {
      const result = await api('tcb', action, data);
      emit({ phase: 'database-metadata', action, result });
    }
  }
  if (args.includes('--inspect-database')) {
    const result = await api('tcb', 'RunCommands', indexListRequest());
    emit({ phase: 'native-index-metadata', indexes: parseIndexMetadata(result) });
  }
  if (!execute) return;
  if (applyTtl) { emit({ phase: 'ttl-installed', ...(await installUnifiedTtl(api)) }); return; }
  const workerConfig = get('--worker-config'), wranglerCli = get('--wrangler-cli');
  if (!workerConfig || !wranglerCli) throw safeError('WORKER_PATHS_REQUIRED');
  await validateWorker(workerConfig, wranglerCli);
  await publish({ api, source, inspected, workerConfig, wranglerCli, syncOnly, emit });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    const code = typeof error?.code === 'string' && /^[A-Za-z0-9_.-]{1,120}$/.test(error.code) ? error.code : 'PUBLISH_STOPPED';
    process.stderr.write(JSON.stringify({ ok: false, code, instruction: '保持统一执行关闭。勿自动重试未知发布；先核对CloudBase版本。无凭据写入本地或日志。' }) + '\n');
    process.exitCode = 1;
  });
}

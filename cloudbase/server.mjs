import { createServer } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { AnalysisFormatError, assembleSections, loadSystemPrompt } from '../plugin-prototype/analysis-contract.mjs';
import { DeepSeekVisionAnalyzer, VisionAnalysisError } from '../plugin-prototype/vision-analyzer.mjs';
import { QuotaError, normalizeUsage } from './quota.mjs';
import { createAnonymousSession, validSessionSecret, verifyAnonymousSession } from './session.mjs';

// Protected developer smoke-test service. The extension is not yet switched here.
// This administrative test token is NEVER included in any extension build.
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_BODY_BYTES = Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 4096;
const MAX_SESSION_BODY_BYTES = 4096;

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    Object.assign(this, { status, code });
  }
}

function positiveInt(value, fallback) {
  if (value === undefined || value === '') return fallback;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw new Error('Invalid service limit configuration');
  return number;
}

function validSecret(value) {
  return typeof value === 'string' && /^[\x21-\x7e]{32,256}$/.test(value);
}

function tokenMatches(header, token) {
  if (!validSecret(token) || typeof header !== 'string' || header.length > 300) return false;
  const digest = text => createHash('sha256').update(text).digest();
  return timingSafeEqual(digest(header), digest(`Bearer ${token}`));
}

function bearerToken(header) {
  if (typeof header !== 'string' || header.length > 1100) return '';
  const match = header.match(/^Bearer ([\x21-\x7e]+)$/);
  return match?.[1] || '';
}

function authenticate(header, { testToken, sessionSecret, now }) {
  if (tokenMatches(header, testToken)) return { actorId: 'administrator-test', type: 'administrator' };
  const session = verifyAnonymousSession(bearerToken(header), sessionSecret, { now });
  return session ? { ...session, type: 'anonymous' } : null;
}

async function readJson(req, maximumBytes) {
  if (String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new HttpError(415, 'INVALID_CONTENT_TYPE', '请使用 JSON 发送请求');
  }
  const declaredSize = Number(req.headers['content-length'] || 0);
  if (declaredSize > maximumBytes) throw new HttpError(413, 'BODY_TOO_LARGE', '请求内容过大');
  const raw = await new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    req.on('data', chunk => {
      if (settled) return;
      size += chunk.length;
      if (size > maximumBytes) {
        settled = true;
        chunks.length = 0;
        req.pause();
        reject(new HttpError(413, 'BODY_TOO_LARGE', '请求内容过大'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => { if (!settled) resolve(Buffer.concat(chunks)); });
    req.on('error', reject);
    req.on('aborted', () => reject(new HttpError(400, 'REQUEST_ABORTED', '请求已中断')));
  });
  try { return JSON.parse(raw.toString('utf8')); }
  catch { throw new HttpError(400, 'MALFORMED_JSON', '请求内容不是有效 JSON'); }
}

async function readImage(req) {
  if (String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new HttpError(415, 'INVALID_CONTENT_TYPE', '请使用 JSON 发送图片');
  }
  const declaredSize = Number(req.headers['content-length'] || 0);
  if (declaredSize > MAX_BODY_BYTES) throw new HttpError(413, 'BODY_TOO_LARGE', '图片超过 10 MB');
  const body = await readJson(req, MAX_BODY_BYTES);
  const image = body?.image;
  if (!image || typeof image.base64 !== 'string' || !image.base64.length || image.base64.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4) {
    throw new HttpError(400, 'IMAGE_REJECTED', '图片内容为空或过大');
  }
  const buffer = Buffer.from(image.base64, 'base64');
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES || buffer.toString('base64') !== image.base64) {
    throw new HttpError(400, 'IMAGE_REJECTED', '图片编码无效');
  }
  // File-signature screening, not a full image decoder. The model validates contents.
  let mimeType;
  if (buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) && buffer.toString('ascii', 12, 16) === 'IHDR') mimeType = 'image/png';
  if (buffer.length >= 12 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) mimeType = 'image/jpeg';
  if (buffer.length >= 20 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') mimeType = 'image/webp';
  if (!mimeType || image.mimeType !== mimeType) throw new HttpError(400, 'IMAGE_REJECTED', '图片格式与内容不匹配，请使用 PNG、JPEG 或 WebP');
  return { buffer, mimeType };
}

function json(res, status, payload) {
  if (res.destroyed || res.writableEnded) return;
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(JSON.stringify(payload));
}

export function createAnalysisServer({
  environment = process.env,
  analyzerFactory = options => new DeepSeekVisionAnalyzer(options),
  now = Date.now,
  quota = null,
} = {}) {
  const testToken = environment.ARCHBUDDY_TEST_TOKEN;
  const sessionSecret = environment.ARCHBUDDY_SESSION_SECRET;
  const persistent = environment.ARCHBUDDY_QUOTA_MODE === 'cloudbase';
  const anonymousSessionsEnabled = persistent && validSessionSecret(sessionSecret);
  const configured = Boolean(environment.DEEPSEEK_API_KEY)
    && (validSecret(testToken) || anonymousSessionsEnabled)
    && (!persistent || Boolean(quota));
  const maxCalls = positiveInt(environment.ARCHBUDDY_MAX_CALLS_PER_PROCESS, 20);
  const maxConcurrent = positiveInt(environment.ARCHBUDDY_MAX_CONCURRENT, 1);
  const perMinute = positiveInt(environment.ARCHBUDDY_CALLS_PER_MINUTE, 3);
  const timeoutMs = positiveInt(environment.ARCHBUDDY_TIMEOUT_MS, 60_000);
  let startedCalls = 0;
  let active = 0;
  let minuteStart = now();
  let minuteCalls = 0;

  const server = createServer(async (req, res) => {
    let acquired = false;
    let reservation = null;
    let modelStarted = false;
    let modelResult = null;
    let modelStartedAt = null;
    let outcomeRecorded = false;
    try {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      if (req.method === 'GET' && pathname === '/healthz') {
        json(res, 200, { status: 'ok', service: 'archbuddy-api' });
        return;
      }
      if (req.method === 'GET' && pathname === '/api/status') {
        json(res, 200, { configured, provider: 'deepseek', model: 'deepseek-flash', mode: anonymousSessionsEnabled ? 'anonymous-beta' : 'developer-test', authenticationRequired: true,
          anonymousSessionsEnabled,
          quotaMode: persistent ? 'daily' : 'process-test',
          ...(persistent ? { quotaTimeZone: 'Asia/Shanghai' } : {}),
        });
        return;
      }
      if (pathname === '/api/session') {
        if (req.method !== 'POST') throw new HttpError(405, 'METHOD_NOT_ALLOWED', '仅支持 POST 请求');
        if (!anonymousSessionsEnabled) throw new HttpError(503, 'ANONYMOUS_SESSION_DISABLED', '匿名使用服务尚未启用');
        const body = await readJson(req, MAX_SESSION_BODY_BYTES);
        let session;
        try { session = createAnonymousSession(body?.installationId, sessionSecret, { now }); }
        catch { throw new HttpError(400, 'INVALID_INSTALLATION_ID', '安装身份无效，请重新加载扩展'); }
        json(res, 201, session);
        return;
      }
      if (pathname !== '/api/analyze') throw new HttpError(404, 'NOT_FOUND', '接口不存在');
      if (req.method !== 'POST') throw new HttpError(405, 'METHOD_NOT_ALLOWED', '仅支持 POST 请求');
      if (!configured) throw new HttpError(503, 'NOT_CONFIGURED', '测试服务尚未配置完成');
      const identity = authenticate(req.headers.authorization, { testToken, sessionSecret, now });
      if (!identity) throw new HttpError(401, 'UNAUTHORIZED', '匿名访问凭据无效或已过期');
      if (environment.ARCHBUDDY_ANALYSIS_ENABLED === 'false') throw new HttpError(503, 'ANALYSIS_PAUSED', '反推服务暂时暂停，下载与分类仍可使用');
      if (!persistent && startedCalls >= maxCalls) throw new HttpError(429, 'TEST_LIMIT_REACHED', '本次测试调用额度已用完');
      if (now() - minuteStart >= 60_000) { minuteStart = now(); minuteCalls = 0; }
      if (minuteCalls >= perMinute) throw new HttpError(429, 'RATE_LIMITED', '请求过于频繁，请稍后再试');
      if (active >= maxConcurrent) throw new HttpError(429, 'BUSY', '已有图片正在分析，请稍后再试');
      // Reserve capacity before reading uploads; release on every success/error path.
      active++;
      acquired = true;
      minuteCalls++;
      const image = await readImage(req);
      const controller = new AbortController();
      res.on('close', () => { if (!res.writableEnded) controller.abort(); });
      const analyzer = analyzerFactory({
        apiKey: environment.DEEPSEEK_API_KEY,
        baseUrl: environment.DEEPSEEK_BASE_URL,
        model: environment.DEEPSEEK_MODEL || 'deepseek-flash',
        systemPrompt: await loadSystemPrompt(),
        timeoutMs,
      });
      if (req.aborted || res.destroyed) return;
      if (persistent) {
        reservation = await quota.reserve(identity.actorId, req.headers['x-archbuddy-request-id']);
        if (req.aborted || res.destroyed) return;
      }
      // Count attempts, even failures: upstream may charge for unsuccessful requests.
      if (!persistent && startedCalls >= maxCalls) throw new HttpError(429, 'TEST_LIMIT_REACHED', '本次测试调用额度已用完');
      startedCalls++;
      modelStarted = true;
      modelStartedAt = now();
      const result = modelResult = await analyzer.analyze({ ...image, signal: controller.signal });
      const sections = assembleSections(result.sections);
      let usageRecorded = false;
      if (reservation) {
        try {
          await quota.finish(reservation, { success: true, usage: result.usage, durationMs: result.durationMs });
          usageRecorded = normalizeUsage(result.usage) !== null;
          outcomeRecorded = true;
        } catch {
          // Quota remains reserved. A bookkeeping outage must not invite a paid retry.
          console.warn(JSON.stringify({ event: 'usage_record_failed', projectId: 'archbuddy', stage: 'development' }));
        }
      }
      json(res, 200, { sections, model: result.model, durationMs: result.durationMs, truncated: Boolean(result.truncated), cached: false,
        usage: normalizeUsage(result.usage), usageRecorded,
        ...(reservation && identity.type === 'administrator'
          ? { quota: { day: reservation.day, userRemaining: reservation.userRemaining, projectRemaining: reservation.projectRemaining } }
          : {}),
      });
    } catch (error) {
      if (reservation && modelStarted && !outcomeRecorded) {
        try {
          await quota.finish(reservation, { success: false, usage: modelResult?.usage ?? error?.usage, durationMs: now() - modelStartedAt });
          outcomeRecorded = true;
        } catch {
          console.warn(JSON.stringify({ event: 'usage_record_failed', projectId: 'archbuddy', stage: 'development' }));
        }
      }
      if (error instanceof HttpError || error instanceof QuotaError) json(res, error.status, { code: error.code, message: error.message });
      else if (error instanceof AnalysisFormatError) json(res, 502, { code: error.code, message: '模型返回的提示词分项不完整，请重试' });
      else if (error instanceof VisionAnalysisError) {
        const timeout = error.code === 'UPSTREAM_TIMEOUT';
        json(res, timeout ? 504 : 502, { code: error.code, message: timeout ? '模型分析超时，请稍后重试' : '模型服务暂时不可用，请稍后重试' });
      } else json(res, 500, { code: 'INTERNAL_ERROR', message: '服务暂时不可用' });
      // Do not log request bodies, credentials, images, prompts, or upstream errors.
      req.resume();
    } finally {
      if (reservation && !modelStarted) {
        try { await quota.cancel(reservation); }
        catch { console.warn(JSON.stringify({ event: 'quota_release_failed', projectId: 'archbuddy', stage: 'development' })); }
      }
      if (acquired) active--;
    }
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 10_000;
  server.setTimeout(timeoutMs + 30_000, socket => socket.destroy());
  return server;
}

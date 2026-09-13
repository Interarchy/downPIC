import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AnalysisFormatError, assembleSections, loadSystemPrompt } from './analysis-contract.mjs';
import { ArchiveError, archiveCapture, sha256Hex } from './archive.mjs';
import { credentialSummary } from './developer-settings.mjs';
import { DeepSeekVisionAnalyzer, VisionAnalysisError } from './vision-analyzer.mjs';

// 原型服务：浏览器侧不持密钥，所有花钱和写盘的动作都收在这里。
//
// 三条边界规则（也写进了 README）：
//   1. 密钥绝不出现在任何 HTTP 响应体、日志或错误文案里
//   2. /api/analyze 绝不写磁盘；/api/capture 绝不调模型
//   3. 落盘只经 archive.mjs，外网只经 vision-analyzer.mjs

const STATIC_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.md': 'text/plain; charset=utf-8',
};
const STATIC_FOLDERS = ['plugin-prototype', 'prototype'];

// 浏览器侧限 10MB 原图，base64 后约 13.3MB，留出余量。
export const MAX_BODY_BYTES = 20 * 1024 * 1024;

const ERROR_STATUS = {
  NOT_CONFIGURED: 503,
  IMAGE_REJECTED: 400,
  ANALYSIS_FORMAT_INVALID: 502,
  UPSTREAM_FAILED: 502,
  UPSTREAM_TIMEOUT: 504,
  ANALYSIS_ABORTED: 499,
};

export class RequestError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = 'RequestError';
    this.code = code;
    this.status = status;
  }
}

// 把任何异常收敛成「能安全回给浏览器的」错误码 + 文案。
// VisionAnalysisError 已经自行抹过密钥；这里只负责分类，不改文案。
export function describeError(error) {
  if (error instanceof RequestError || error instanceof VisionAnalysisError) {
    return {
      code: error.code,
      status: error.status || ERROR_STATUS[error.code] || 500,
      message: error.message,
    };
  }
  if (error instanceof ArchiveError) return { code: error.code, status: 400, message: error.message };
  if (error instanceof AnalysisFormatError) {
    return { code: error.code, status: 502, message: error.message };
  }
  return { code: 'INTERNAL_ERROR', status: 500, message: '服务端内部错误' };
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(body);
}

function readBody(req, limit = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    req.on('data', chunk => {
      if (settled) return;
      size += chunk.length;
      if (size > limit) {
        settled = true;
        // 先停下来、把 413 回出去，再断开。
        // 直接 destroy 的话客户端只会看到 ECONNRESET，读不到我们想告诉它的原因。
        req.pause();
        reject(new RequestError('BODY_TOO_LARGE', `请求体超过 ${Math.round(limit / 1024 / 1024)}MB 上限`, 413));
        return;
      }
      chunks.push(chunk);
    });
    req.on('error', reject);
    req.on('end', () => { if (!settled) resolve(Buffer.concat(chunks)); });
  });
}

async function readJsonBody(req) {
  const raw = await readBody(req);
  if (!raw.length) throw new RequestError('EMPTY_BODY', '请求体是空的', 400);
  try {
    return JSON.parse(raw.toString('utf8'));
  } catch {
    throw new RequestError('MALFORMED_JSON', '请求体不是合法 JSON', 400);
  }
}

// 把 {mimeType, base64} 还原成字节，并校验 base64 本身是可信的。
function decodeImage(image) {
  if (!image || typeof image.base64 !== 'string' || !image.base64) {
    throw new RequestError('IMAGE_REJECTED', '请求里没有图片数据', 400);
  }
  const buffer = Buffer.from(image.base64, 'base64');
  if (!buffer.length) throw new RequestError('IMAGE_REJECTED', '图片数据无法解码', 400);
  return { buffer, mimeType: String(image.mimeType || '') };
}

// 本地服务仍然要防 CSRF：任何网页都能向 127.0.0.1 发请求。
// 要求自定义头是为了逼出预检——预检我们一律不批准，浏览器就不会真的发出请求。
// Origin 校验是第二道：万一将来放宽了头的要求，跨站来源仍然会被挡住。
export function isTrustedRequest(req) {
  if (req.headers['x-downpic'] !== '1') return false;
  const origin = req.headers.origin;
  if (!origin) return true; // curl 之类没有 Origin，此时自定义头已经足够
  try {
    const { hostname, port } = new URL(origin);
    const host = String(req.headers.host || '');
    return `${hostname}:${port || '80'}` === (host.includes(':') ? host : `${host}:80`);
  } catch {
    return false;
  }
}

export function createPrototypeServer({
  libraryRoot,
  environment = {},
  systemPrompt = null,
  analyzerFactory = null,
  staticRoot = fileURLToPath(new URL('../', import.meta.url)),
  reveal = defaultReveal,
  cache = new Map(),
} = {}) {
  const resolvedLibraryRoot = libraryRoot ? path.resolve(libraryRoot) : '';
  // 显式传 null 表示「用默认工厂」，好让测试能覆盖到未配置凭据这类真实分支。
  const makeAnalyzer = analyzerFactory ?? defaultAnalyzerFactory;

  // system prompt 只在第一次用到时读，服务能起来不依赖文档存在。
  let systemPromptPromise = systemPrompt ? Promise.resolve(systemPrompt) : null;
  async function analyzerFor() {
    systemPromptPromise ??= loadSystemPrompt();
    return makeAnalyzer(environment, await systemPromptPromise);
  }

  const routes = {
    'GET /api/status': async () => ({
      status: 200,
      body: { ...credentialSummary(environment), libraryRoot: resolvedLibraryRoot },
    }),

    'POST /api/analyze': async (req, res, body) => {
      const { buffer, mimeType } = decodeImage(body?.image);
      const hash = sha256Hex(buffer);

      const cached = cache.get(hash);
      if (cached) return { status: 200, body: { ...cached, cached: true } };

      const controller = new AbortController();
      // 客户端断开就断掉上游请求：一次分析要花钱，用户点了取消不该继续烧。
      //
      // 必须挂在 res 上而不是 req 上：Node 16 起 req 的 'close' 表示「请求体收完了」，
      // 挂它会让我们自己的请求刚发出去就被 abort。res 的 'close' 才代表连接提前终止，
      // 而 writableEnded 用来排除正常收尾的那次触发。
      res.on('close', () => {
        if (!res.writableEnded) controller.abort();
      });

      const analyzer = await analyzerFor();
      const result = await analyzer.analyze({ buffer, mimeType, signal: controller.signal });

      // 装配失败会抛 AnalysisFormatError，由 describeError 映射成 502。
      const sections = assembleSections(result.sections);
      const payload = {
        sections,
        model: result.model,
        durationMs: result.durationMs,
        truncated: result.truncated,
        cached: false,
      };
      // 示例图会被反复反推，缓存能省下重复的视觉调用。
      cache.set(hash, payload);
      return { status: 200, body: payload };
    },

    'POST /api/capture': async (req, res, body) => {
      const { buffer, mimeType } = decodeImage(body?.image);
      const result = await archiveCapture({
        libraryRoot: resolvedLibraryRoot,
        imageBuffer: buffer,
        metadata: { ...(body?.meta ?? {}), mimeType },
      });
      return { status: 200, body: result };
    },

    'POST /api/library/reveal': async () => {
      if (!resolvedLibraryRoot) throw new RequestError('LIBRARY_ROOT_MISSING', '未指定素材根目录', 400);
      await mkdir(resolvedLibraryRoot, { recursive: true });
      await reveal(resolvedLibraryRoot);
      return { status: 200, body: { libraryRoot: resolvedLibraryRoot } };
    },
  };

  return createServer(async (req, res) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
      sendJson(res, 400, { code: 'BAD_URL', message: '无法解析请求路径' });
      return;
    }

    const route = routes[`${req.method} ${pathname}`];
    if (route) {
      // 预检一律不批准：批准了就等于把跨站 POST 放行。
      if (req.method !== 'GET' && !isTrustedRequest(req)) {
        sendJson(res, 403, { code: 'FORBIDDEN', message: '缺少同源校验头，已拒绝本次请求' });
        return;
      }
      try {
        const body = req.method === 'GET' ? null : await readJsonBody(req);
        const { status, body: payload } = await route(req, res, body);
        sendJson(res, status, payload);
      } catch (error) {
        const { code, status, message } = describeError(error);
        if (status === 499) {
          res.destroy(); // 客户端已经走了，没有可以回的地方
          return;
        }
        if (code === 'INTERNAL_ERROR') console.error('未预期的服务端错误：', error);
        sendJson(res, status, { code, message });
        // 超限时客户端还在往上发。把剩下的排空丢掉即可：
        // 直接 destroy 会把已经写出的 413 响应一起 RST 掉，客户端只能看到 ECONNRESET，
        // 反而不知道自己做错了什么。排空不缓冲，内存开销可以忽略。
        if (code === 'BODY_TOO_LARGE') res.on('finish', () => req.resume());
      }
      return;
    }

    if (req.method !== 'GET') {
      sendJson(res, 405, { code: 'METHOD_NOT_ALLOWED', message: '不支持的方法' });
      return;
    }
    await serveStatic(res, pathname, staticRoot);
  });
}

function defaultAnalyzerFactory(environment, systemPrompt) {
  return new DeepSeekVisionAnalyzer({
    apiKey: environment.DEEPSEEK_API_KEY,
    model: environment.DEEPSEEK_MODEL,
    baseUrl: environment.DEEPSEEK_BASE_URL,
    systemPrompt,
  });
}

async function defaultReveal(target) {
  // explorer.exe 打开成功时也常返回非 0，所以只看能不能 spawn 起来。
  spawn('explorer.exe', [target], { detached: true, stdio: 'ignore' }).unref();
}

async function serveStatic(res, pathname, staticRoot) {
  try {
    let target = pathname === '/' ? '/plugin-prototype/' : pathname;
    if (target.endsWith('/')) target += 'index.html';
    const resolved = path.resolve(staticRoot, `.${target}`);
    const allowed = STATIC_FOLDERS.some(folder => {
      const relative = path.relative(path.join(staticRoot, folder), resolved);
      return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
    });
    if (!allowed || !STATIC_TYPES[path.extname(resolved)]) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const data = await readFile(resolved);
    res.writeHead(200, {
      'content-type': STATIC_TYPES[path.extname(resolved)],
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}

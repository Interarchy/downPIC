import { parseSections } from './analysis-contract.mjs';
import { normalizeApiKey } from './developer-settings.mjs';

// 全进程唯一的外网调用点。
//
// 产品内沿用 deepseek-flash 这个短名称；DeepSeek 官方端点会映射到
// 实际支持图片输入的 deepseek-v4-flash-vision-exp。自定义兼容端点仍原样透传，
// 避免破坏供应商自己的模型别名。
// 适配器走 Anthropic Messages 格式（不是 OpenAI 的 choices[]）。
// 实测响应里会先出现一个 thinking 块，正文在后面的 text 块——提取时必须跳过 thinking，
// 否则会把模型的内部推理当成分析结果返回给用户。

export const DEFAULT_MAX_TOKENS = 8192; // Step 0 实测：中文 8 个分项约 1000 token，8192 留足了余量
export const DEFAULT_TIMEOUT_MS = 120_000; // 带 thinking 的单次调用实测 23s 左右，但网络抖动要留余量
export const PRODUCT_MODEL = 'deepseek-flash';
export const OFFICIAL_VISION_MODEL = 'deepseek-v4-flash-vision-exp';

const SUPPORTED_MEDIA_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

export class VisionAnalysisError extends Error {
  constructor(code, message, { status = 0, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'VisionAnalysisError';
    this.code = code;
    this.status = status;
  }
}

// 错误文案会一路走到 HTTP 响应体里。密钥绝不能跟着出去，
// 所以任何来自底层（fetch、上游错误体）的文字都要先过一遍这里。
export function redactSecrets(text, secrets = []) {
  let result = String(text ?? '');
  for (const secret of secrets) {
    if (secret && secret.length >= 8) result = result.split(secret).join('[redacted]');
  }
  return result.replace(/\bsk-[A-Za-z0-9_-]{8,}/g, '[redacted]');
}

function normalizeBaseUrl(value) {
  return String(value || 'https://api.deepseek.com/anthropic').replace(/\/+$/, '');
}

export function resolveUpstreamModel(model, baseUrl) {
  const requested = String(model || PRODUCT_MODEL);
  try {
    if (requested === PRODUCT_MODEL && new URL(baseUrl).hostname.toLowerCase() === 'api.deepseek.com') {
      return OFFICIAL_VISION_MODEL;
    }
  } catch {
    // 非标准兼容地址交给 fetch 报出更具体的连接错误。
  }
  return requested;
}

// 只取 text 块拼成正文。thinking 块和任何未知类型一律丢弃。
export function extractContentText(payload) {
  const blocks = Array.isArray(payload?.content) ? payload.content : [];
  return {
    text: blocks.filter(block => block?.type === 'text').map(block => block.text ?? '').join('\n').trim(),
    contentTypes: blocks.map(block => block?.type ?? 'unknown'),
  };
}

export class DeepSeekVisionAnalyzer {
  constructor({
    apiKey,
    model = PRODUCT_MODEL,
    baseUrl,
    systemPrompt,
    fetchImpl = globalThis.fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxTokens = DEFAULT_MAX_TOKENS,
  } = {}) {
    const normalizedApiKey = normalizeApiKey(apiKey) || '';
    if (!normalizedApiKey) throw new VisionAnalysisError('NOT_CONFIGURED', 'DeepSeek 凭据尚未配置');
    if (!/^[\x21-\x7e]+$/.test(normalizedApiKey)) {
      throw new VisionAnalysisError('INVALID_CONFIGURATION', 'DeepSeek API Key 含有换行或其他非法字符，请重新配置');
    }
    if (!systemPrompt) throw new Error('缺少 system prompt：应由 analysis-contract.loadSystemPrompt() 提供');

    this.apiKey = normalizedApiKey;
    this.model = model;
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.upstreamModel = resolveUpstreamModel(model, this.baseUrl);
    this.systemPrompt = systemPrompt;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.maxTokens = maxTokens;
    this.secrets = [normalizedApiKey];
  }

  redact(text) {
    return redactSecrets(text, this.secrets);
  }

  // 返回 { text, sections, model, stopReason, truncated, usage, durationMs }。
  // 只负责「拿到并解析文本」，不负责装配分项——装配是 analysis-contract 的事。
  async analyze({ buffer, mimeType, signal } = {}) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw new VisionAnalysisError('IMAGE_REJECTED', '图片内容为空');
    }
    if (!SUPPORTED_MEDIA_TYPES.has(mimeType)) {
      throw new VisionAnalysisError('IMAGE_REJECTED', `不支持的图片格式：${mimeType ?? '(未提供)'}`);
    }

    const timeout = AbortSignal.timeout(this.timeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    const started = Date.now();

    let response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/v1/messages`, {
        method: 'POST',
        signal: combined,
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.apiKey,
          authorization: `Bearer ${this.apiKey}`,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.upstreamModel,
          max_tokens: this.maxTokens,
          system: this.systemPrompt,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mimeType, data: buffer.toString('base64') } },
              { type: 'text', text: '分析这张参考图，按要求输出中文结构化生图提示词。' },
            ],
          }],
        }),
      });
    } catch (error) {
      throw this.#transportError(error, timeout, signal);
    }

    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      throw new VisionAnalysisError('UPSTREAM_FAILED', this.redact(`上游返回的不是 JSON：${error.message}`), {
        status: response.status,
        cause: error,
      });
    }

    // 计时必须在读完 body 之后：fetch 只等到响应头，生成耗时全在 body 流里。
    const durationMs = Date.now() - started;

    if (!response.ok) {
      const detail = payload?.error?.message || payload?.message || `HTTP ${response.status}`;
      throw new VisionAnalysisError('UPSTREAM_FAILED', this.redact(`DeepSeek 请求失败：${detail}`), {
        status: response.status,
      });
    }

    const { text, contentTypes } = extractContentText(payload);
    if (!text) {
      throw new VisionAnalysisError(
        'UPSTREAM_FAILED',
        `模型只返回了 ${contentTypes.join('、') || '空'} 内容块，没有可用的正文`,
        { status: response.status },
      );
    }

    return {
      text,
      sections: parseSections(text),
      model: payload?.model || this.model,
      stopReason: payload?.stop_reason ?? null,
      truncated: payload?.stop_reason === 'max_tokens',
      contentTypes,
      usage: payload?.usage ?? null,
      durationMs,
    };
  }

  // 区分三种中断：调用方主动取消（换图/点取消）、超时、真正的网络故障。
  // 前两种映射成不同的错误码，UI 才能给出不同的提示。
  #transportError(error, timeout, signal) {
    if (timeout.aborted) {
      return new VisionAnalysisError('UPSTREAM_TIMEOUT', `模型 ${Math.round(this.timeoutMs / 1000)} 秒内没有返回结果`);
    }
    if (signal?.aborted) {
      return new VisionAnalysisError('ANALYSIS_ABORTED', '分析已取消');
    }
    if (error?.name === 'AbortError') {
      return new VisionAnalysisError('UPSTREAM_TIMEOUT', '模型请求被中断');
    }
    const causeCode = error?.cause?.code ? ` [${error.cause.code}]` : '';
    const causeMessage = error?.cause?.message && error.cause.message !== error?.message
      ? `；${error.cause.message}`
      : '';
    const detail = `${error?.message ?? error}${causeCode}${causeMessage}`;
    return new VisionAnalysisError('UPSTREAM_FAILED', this.redact(`无法连接 DeepSeek：${detail}`), {
      cause: error,
    });
  }
}

// TokenHub only computes vectors. Asset text and vectors are never persisted by this service.
export const EMBEDDING_MODEL = 'kinfra-text-embedding-0.6b';
export const EMBEDDING_DIMENSIONS = 1024;
const EMBEDDING_URL = 'https://tokenhub.tencentmaas.com/v1/embeddings';

export function validEmbeddingKey(apiKey) {
  return typeof apiKey === 'string' && /^[\x21-\x7e]{16,256}$/.test(apiKey);
}

export class EmbeddingError extends Error {
  constructor(code, message, status = 502) { super(message); Object.assign(this, { code, status }); }
}

export async function embedTexts(texts, { apiKey, signal, fetchImpl = fetch } = {}) {
  if (!validEmbeddingKey(apiKey)) {
    throw new EmbeddingError('EMBEDDING_NOT_CONFIGURED', '语义向量服务尚未配置；关键词搜索仍可使用', 503);
  }
  let response;
  try {
    response = await fetchImpl(EMBEDDING_URL, {
      method: 'POST', signal,
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts, encoding_format: 'float' }),
    });
  } catch (cause) {
    const error = new EmbeddingError('EMBEDDING_UNAVAILABLE', '语义向量服务暂时无法连接');
    const code = cause?.cause?.code || cause?.code;
    const knownCodes = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT',
      'UND_ERR_CONNECT_TIMEOUT', 'CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'SELF_SIGNED_CERT_IN_CHAIN']);
    error.networkCode = cause?.name === 'TimeoutError' || cause?.name === 'AbortError'
      ? 'TIMEOUT' : knownCodes.has(code) ? code : 'NETWORK_ERROR';
    throw error;
  }
  if (!response.ok) {
    const message = response.status === 401 ? 'TokenHub 凭据无效，请检查服务端专用 Key'
      : response.status === 403 ? 'TokenHub 拒绝访问，请检查 Key 的模型权限和服务启用状态'
      : response.status === 429 ? 'TokenHub 调用受限，请检查额度或稍后重试'
      : '语义向量服务暂时不可用';
    const error = new EmbeddingError('EMBEDDING_UNAVAILABLE', message);
    error.upstreamStatus = response.status;
    throw error;
  }
  let payload;
  try { payload = await response.json(); }
  catch { throw new EmbeddingError('EMBEDDING_RESPONSE_INVALID', '语义向量结果无法解析'); }
  if (payload?.model !== EMBEDDING_MODEL || !Array.isArray(payload.data) || payload.data.length !== texts.length) {
    throw new EmbeddingError('EMBEDDING_RESPONSE_INVALID', '语义向量结果数量或模型不匹配');
  }
  const vectors = Array(texts.length);
  for (const row of payload.data) {
    if (!Number.isInteger(row?.index) || row.index < 0 || row.index >= texts.length || vectors[row.index]
        || !Array.isArray(row.embedding) || row.embedding.length !== EMBEDDING_DIMENSIONS
        || !row.embedding.every(value => typeof value === 'number' && Number.isFinite(value))) {
      throw new EmbeddingError('EMBEDDING_RESPONSE_INVALID', '语义向量格式无效');
    }
    vectors[row.index] = row.embedding;
  }
  return { model: EMBEDDING_MODEL, vectors, usage: {
    input_tokens: payload.usage?.prompt_tokens,
    total_tokens: payload.usage?.total_tokens,
  } };
}

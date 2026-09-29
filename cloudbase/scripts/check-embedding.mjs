import { embedTexts, EmbeddingError, validEmbeddingKey } from '../embedding.mjs';

const apiKey = process.env.ARCHBUDDY_EMBEDDING_API_KEY;
const started = Date.now();
if (!validEmbeddingKey(apiKey)) {
  console.log(JSON.stringify({ ok: false, code: apiKey ? 'KEY_FORMAT_INVALID' : 'KEY_MISSING' }));
  process.exitCode = 1;
} else {
  try {
    const result = await embedTexts(['school architecture aerial view'], {
      apiKey, signal: AbortSignal.timeout(30_000),
    });
    console.log(JSON.stringify({ ok: true, model: result.model, count: result.vectors.length,
      dimensions: result.vectors[0].length, durationMs: Date.now() - started }));
  } catch (error) {
    console.log(JSON.stringify({ ok: false,
      code: error instanceof EmbeddingError ? error.code : 'DIAGNOSTIC_FAILED',
      upstreamStatus: error instanceof EmbeddingError ? error.upstreamStatus ?? null : null,
      networkCode: error instanceof EmbeddingError ? error.networkCode ?? null : null,
      durationMs: Date.now() - started }));
    process.exitCode = 1;
  }
}

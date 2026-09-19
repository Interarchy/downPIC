import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const PROJECT_ID = 'archbuddy';
const STAGE = 'development';
const TOKEN_VERSION = 1;
const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60;

export function validSessionSecret(value) {
  return typeof value === 'string' && /^[\x21-\x7e]{32,256}$/.test(value);
}

function encode(value) {
  return Buffer.from(value).toString('base64url');
}

function signature(payload, secret) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function anonymousSubject(installationId, secret) {
  return createHmac('sha256', secret)
    .update(`archbuddy:development:installation:${installationId}`)
    .digest('base64url');
}

export function createAnonymousSession(installationId, secret, { now = Date.now, ttlSeconds = DEFAULT_TTL_SECONDS } = {}) {
  if (!validSessionSecret(secret)) throw new Error('Invalid anonymous session secret');
  if (typeof installationId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(installationId)) {
    throw new Error('Invalid installation identity');
  }
  const issuedAt = Math.floor(now() / 1000);
  const payload = encode(JSON.stringify({
    v: TOKEN_VERSION,
    p: PROJECT_ID,
    s: STAGE,
    sub: anonymousSubject(installationId.toLowerCase(), secret),
    iat: issuedAt,
    exp: issuedAt + ttlSeconds,
  }));
  return { token: `${payload}.${signature(payload, secret)}`, expiresAt: (issuedAt + ttlSeconds) * 1000 };
}

export function verifyAnonymousSession(token, secret, { now = Date.now } = {}) {
  if (!validSessionSecret(secret) || typeof token !== 'string' || token.length > 1024) return null;
  const [payload, suppliedSignature, extra] = token.split('.');
  if (!payload || !suppliedSignature || extra) return null;
  const expected = signature(payload, secret);
  const suppliedDigest = createHash('sha256').update(suppliedSignature).digest();
  const expectedDigest = createHash('sha256').update(expected).digest();
  if (!timingSafeEqual(suppliedDigest, expectedDigest)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const current = Math.floor(now() / 1000);
    if (claims?.v !== TOKEN_VERSION || claims?.p !== PROJECT_ID || claims?.s !== STAGE) return null;
    if (typeof claims.sub !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(claims.sub)) return null;
    if (!Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.exp)) return null;
    if (claims.iat > current + 60 || claims.exp <= current || claims.exp - claims.iat > DEFAULT_TTL_SECONDS) return null;
    return { actorId: `anonymous:${claims.sub}`, expiresAt: claims.exp * 1000 };
  } catch {
    return null;
  }
}

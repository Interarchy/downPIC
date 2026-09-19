import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createAnonymousSession, verifyAnonymousSession } from '../session.mjs';

const secret = 'test-session-secret-with-at-least-32-characters';

test('匿名会话只暴露不可逆主体并可验证', () => {
  const installationId = randomUUID();
  const issued = createAnonymousSession(installationId, secret, { now: () => 1_000_000 });
  assert.ok(!issued.token.includes(installationId));
  const identity = verifyAnonymousSession(issued.token, secret, { now: () => 1_001_000 });
  assert.match(identity.actorId, /^anonymous:[A-Za-z0-9_-]{43}$/);
  assert.equal(identity.expiresAt, issued.expiresAt);
});

test('匿名会话拒绝篡改、错误密钥、过期令牌和非法安装 ID', () => {
  const issued = createAnonymousSession(randomUUID(), secret, { now: () => 1_000_000 });
  assert.equal(verifyAnonymousSession(issued.token + 'x', secret, { now: () => 1_001_000 }), null);
  assert.equal(verifyAnonymousSession(issued.token, 'another-test-session-secret-that-is-long-enough', { now: () => 1_001_000 }), null);
  assert.equal(verifyAnonymousSession(issued.token, secret, { now: () => issued.expiresAt + 1 }), null);
  assert.throws(() => createAnonymousSession('not-a-uuid', secret));
});

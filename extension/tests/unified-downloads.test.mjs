import test from 'node:test';
import assert from 'node:assert/strict';
import { createUnifiedDownloads } from '../unified-downloads.mjs';
import { METER_FILE_DOWNLOADS } from '../runtime-config.mjs';
function setup() {
  let accountId = 'a', state = 'in_progress', rejectDownload = false;
  let data = {};
  const calls = [];
  globalThis.chrome = { storage: { local: {
    get: async () => structuredClone(data),
    set: async value => { data = structuredClone(value); },
  } }, downloads: {
    download: async () => { if (rejectDownload) throw new Error('Chrome rejected'); return 7; },
    search: async () => [{ state }],
  } };
  const client = {
    identity: async () => accountId, refresh: async () => {},
    api: async (path, options) => { calls.push({ path, ...options.body }); return { reservationId: 'reservation-one' }; },
  };
  return { broker: createUnifiedDownloads(client), calls, setAccount: value => { accountId = value; },
    setState: value => { state = value; }, reject: () => { rejectDownload = true; } };
}
test('undecided ordinary download charging stays disabled', () => assert.equal(METER_FILE_DOWNLOADS, false));
test('unknown Chrome download state is never guessed as failed', async () => {
  const h = setup(); await h.broker.download({ url: 'https://example.test/image.png' }); await h.broker.reconcile();
  assert.equal(h.calls.length, 1); assert.ok(h.calls[0].path.endsWith('/reserve'));
});
test('Chrome completed download settles the same reservation only once', async () => {
  const h = setup(); await h.broker.download({});
  await h.broker.changed({ id: 7, state: { current: 'complete' } });
  await h.broker.changed({ id: 7, state: { current: 'complete' } });
  assert.equal(h.calls.filter(c => c.path.endsWith('/settle')).length, 1);
  assert.equal(h.calls.at(-1).reservationId, 'reservation-one'); assert.equal(h.calls.at(-1).outcome, 'completed');
});
test('old account download never settles against a new account session', async () => {
  const h = setup(); await h.broker.download({}); h.setAccount('b');
  await h.broker.changed({ id: 7, state: { current: 'complete' } }); assert.equal(h.calls.length, 1);
  h.setAccount('a'); await h.broker.reconcile();
  assert.equal(h.calls.length, 2); assert.equal(h.calls.at(-1).outcome, 'completed');
});
test('explicit Chrome failure releases once', async () => {
  const h = setup(); h.reject(); await assert.rejects(h.broker.download({}));
  assert.equal(h.calls.at(-1).outcome, 'failed'); await h.broker.reconcile();
  assert.equal(h.calls.filter(c => c.path.endsWith('/settle')).length, 1);
});

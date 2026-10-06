import { STORAGE } from './shared.mjs';
import { ANALYTICS_POLICY_VERSION, ANALYTICS_SCHEMA_VERSION, ANALYTICS_BATCH_SIZE,
  ANALYTICS_QUEUE_AGE_MS, analyticsConsentValid, validateAnalyticsEvent } from './analytics-schema.mjs';

const MAX_QUEUE = 200;
const MAX_ATTEMPTS = 5;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function createAnalyticsController(send) {
  let changes = Promise.resolve(), flushing = false;
  const serial = operation => {
    const result = changes.catch(() => {}).then(operation);
    changes = result;
    return result;
  };
  const safe = operation => Promise.resolve().then(operation).catch(() => ({ ok: true, accepted: false }));
  async function consent() { return (await chrome.storage.local.get(STORAGE.analyticsConsent))[STORAGE.analyticsConsent]; }
  async function enqueue(payload, current) {
    if (!analyticsConsentValid(current) || (payload.consentId && payload.consentId !== current.consentId)) return { ok: true, accepted: false };
    const event = validateAnalyticsEvent({ ...payload, schemaVersion: ANALYTICS_SCHEMA_VERSION,
      eventId: crypto.randomUUID(), clientOccurredAt: new Date().toISOString(),
      extensionVersion: chrome.runtime.getManifest().version,
      policyVersion: ANALYTICS_POLICY_VERSION, consentId: current.consentId });
    const stored = await chrome.storage.local.get(STORAGE.analyticsQueue);
    const queue = (stored[STORAGE.analyticsQueue] || []).filter(row => row.event?.consentId === current.consentId
      && Date.parse(row.event.clientOccurredAt) >= Date.now() - ANALYTICS_QUEUE_AGE_MS);
    queue.push({ event, attempts: 0 });
    await chrome.storage.local.set({ [STORAGE.analyticsQueue]: queue.slice(-MAX_QUEUE) });
    return { ok: true, accepted: true, consentId: current.consentId };
  }
  async function record(payload) { return safe(() => serial(async () => enqueue(payload, await consent()))); }
  async function setConsent(enabled) {
    let previous;
    const result = await serial(async () => {
      previous = await consent();
      const current = { enabled: enabled === true, updatedAt: new Date().toISOString(), policyVersion: ANALYTICS_POLICY_VERSION,
        ...(enabled === true ? { consentId: analyticsConsentValid(previous) ? previous.consentId : crypto.randomUUID() } : {}) };
      await chrome.storage.local.set({ [STORAGE.analyticsConsent]: current });
      if (!analyticsConsentValid(current) || current.consentId !== previous?.consentId) {
        await chrome.storage.local.remove(STORAGE.analyticsQueue);
        await chrome.storage.session.remove([STORAGE.analyticsTasks, STORAGE.analyticsDownloads]);
      }
      return { ok: true, consent: current };
    });
    if (!enabled && analyticsConsentValid(previous)) {
      // 控制请求与行为事件分开；离线撤回仍先在本机立即停止采集。
      void send('/api/events/withdraw', { method: 'POST', body: { consentId: previous.consentId,
        policyVersion: ANALYTICS_POLICY_VERSION }, timeoutMs: 15_000 }).catch(() => {});
    }
    return result;
  }
  async function task(payload, start) {
    return safe(() => serial(async () => {
      const current = await consent();
      if (!analyticsConsentValid(current) || !UUID.test(payload?.key || '')) return { ok: true, taskId: null };
      const stored = await chrome.storage.session.get(STORAGE.analyticsTasks);
      const contexts = stored[STORAGE.analyticsTasks] || {};
      let context = contexts[payload.key];
      if (context?.consentId !== current.consentId) context = null;
      if (!context && start) {
        if (!['prompt_build', 'evaluation'].includes(payload.taskType) || !['sidepanel', 'library'].includes(payload.entry)) return { ok: true, taskId: null };
        context = { consentId: current.consentId, taskId: crypto.randomUUID() };
        await enqueue({ eventName: 'task_started', entry: payload.entry, scope: 'task', taskType: payload.taskType, taskId: context.taskId }, current);
        contexts[payload.key] = context;
        await chrome.storage.session.set({ [STORAGE.analyticsTasks]: Object.fromEntries(Object.entries(contexts).slice(-100)) });
      }
      return { ok: true, taskId: context?.taskId || null };
    }));
  }
  async function downloadComplete(downloadId) {
    return safe(() => serial(async () => {
      const current = await consent();
      if (!analyticsConsentValid(current)) return;
      const catalog = (await chrome.storage.local.get(STORAGE.captureCatalogV4))[STORAGE.captureCatalogV4] || {};
      const item = catalog[downloadId];
      if (!item || !Number.isFinite(Date.parse(item.createdAt)) || Date.parse(item.createdAt) < Date.parse(current.updatedAt)) return;
      const done = (await chrome.storage.session.get(STORAGE.analyticsDownloads))[STORAGE.analyticsDownloads] || [];
      const key = `${current.consentId}:${downloadId}`;
      if (done.includes(key)) return;
      await enqueue({ eventName: 'image_saved', entry: 'capture', source: 'download', count: 1 }, current);
      await chrome.storage.session.set({ [STORAGE.analyticsDownloads]: [...done, key].slice(-500) });
    }));
  }
  async function flush() {
    if (flushing) return;
    flushing = true;
    let snapshot;
    try {
      snapshot = await serial(async () => {
        const current = await consent();
        if (!analyticsConsentValid(current)) { await chrome.storage.local.remove(STORAGE.analyticsQueue); return null; }
        const stored = await chrome.storage.local.get(STORAGE.analyticsQueue);
        const queue = (stored[STORAGE.analyticsQueue] || []).filter(row => row.event?.consentId === current.consentId
          && Date.parse(row.event.clientOccurredAt) >= Date.now() - ANALYTICS_QUEUE_AGE_MS && row.attempts < MAX_ATTEMPTS);
        await chrome.storage.local.set({ [STORAGE.analyticsQueue]: queue });
        return { current, batch: queue.slice(0, ANALYTICS_BATCH_SIZE) };
      });
      if (!snapshot?.batch.length) return;
      const status = await send('/api/status', { timeoutMs: 25_000 });
      if (!analyticsConsentValid(await consent()) || (await consent()).consentId !== snapshot.current.consentId) return;
      let accepted = false;
      if (status?.analyticsEnabled === true && status.analyticsSchemaVersion === 2 && status.analyticsPolicyVersion === ANALYTICS_POLICY_VERSION) {
        const result = await send('/api/events', { method: 'POST', timeoutMs: 15_000,
          body: { schemaVersion: 2, events: snapshot.batch.map(row => row.event) } });
        accepted = result?.accepted === true;
      } else {
        // 旧后端或未启用后端不积压、更不将关闭状态误称为已持久化。
        accepted = true;
      }
      await finishBatch(snapshot, accepted);
    } catch { if (snapshot) await finishBatch(snapshot, false).catch(() => {}); }
    finally { flushing = false; }
  }
  async function finishBatch(snapshot, accepted) {
    await serial(async () => {
      const current = await consent();
      if (!analyticsConsentValid(current) || current.consentId !== snapshot.current.consentId) return;
      const ids = new Set(snapshot.batch.map(row => row.event.eventId));
      const queue = (await chrome.storage.local.get(STORAGE.analyticsQueue))[STORAGE.analyticsQueue] || [];
      await chrome.storage.local.set({ [STORAGE.analyticsQueue]: queue.flatMap(row => ids.has(row.event.eventId)
        ? accepted || row.attempts + 1 >= MAX_ATTEMPTS ? [] : [{ ...row, attempts: row.attempts + 1 }] : [row]) });
    });
  }
  return { record, setConsent, task, downloadComplete, flush };
}

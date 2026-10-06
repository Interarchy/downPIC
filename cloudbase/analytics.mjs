import { actorHashFor, PROJECT_ID, STAGE, shanghaiDay } from './quota.mjs';
import { isActiveAnalyticsEvent, validateAnalyticsEvent } from '../extension/analytics-schema.mjs';

const DAY = 86_400_000;
function owned(record) {
  if (record && (record.projectId !== PROJECT_ID || record.stage !== STAGE)) throw new Error('Analytics scope mismatch');
}
export function createEventWriter(store, { now = Date.now } = {}) {
  const writer = async (actor, input) => {
    if (typeof actor !== 'string' || !actor.length || actor.length > 256) throw new Error('Invalid event actor');
    const receivedAt = now();
    const event = validateAnalyticsEvent(input, { now: receivedAt, allowLegacy: true });
    const actorHash = actorHashFor(event.schemaVersion === 2 ? `${actor}:${event.consentId}` : actor);
    const id = `${actorHash}_${event.eventId.toLowerCase()}`;
    const { consentId, ...safeEvent } = event;
    const document = { ...safeEvent, projectId: PROJECT_ID, stage: STAGE, actorHash,
      eventId: event.eventId.toLowerCase(), receivedAt: new Date(receivedAt),
      expiresAt: new Date(receivedAt + 30 * DAY), schemaVersion: event.schemaVersion || 1 };
    if (event.schemaVersion !== 2) { await store.set('events', id, document); return; }
    await store.transaction(async transaction => {
      const existing = await transaction.get('events', id);
      owned(existing);
      if (existing) return; // 重发不延长原始事件保留期，也不重复更新摘要。
      let summary = await transaction.get('activities', actorHash);
      owned(summary);
      if (summary?.withdrawnAt) return; // 关闭后的在途上报不能恢复该同意周期。
      if (summary && Date.parse(summary.expiresAt) <= receivedAt) summary = null;
      if (isActiveAnalyticsEvent(event)) {
        const day = shanghaiDay(Date.parse(event.clientOccurredAt));
        const firstDay = summary?.firstActiveDay && summary.firstActiveDay < day ? summary.firstActiveDay : day;
        const days = { ...(summary?.days || {}) };
        for (const oldDay of Object.keys(days)) if (oldDay < shanghaiDay(receivedAt - 60 * DAY)) delete days[oldDay];
        days[day] = { active: true, library: days[day]?.library === true || event.entry === 'library' };
        await transaction.set('activities', actorHash, {
          projectId: PROJECT_ID, stage: STAGE, actorHash, schemaVersion: 2,
          firstActiveDay: firstDay, days, firstReceivedAt: summary?.firstReceivedAt || new Date(receivedAt),
          expiresAt: summary?.expiresAt || new Date(receivedAt + 60 * DAY),
        });
      }
      await transaction.set('events', id, document);
    });
  };
  writer.withdraw = async (actor, consentId) => {
    const actorHash = actorHashFor(`${actor}:${consentId}`);
    await store.transaction(async transaction => {
      let summary = await transaction.get('activities', actorHash);
      owned(summary);
      const timestamp = now();
      if (summary && Date.parse(summary.expiresAt) <= timestamp) summary = null;
      await transaction.set('activities', actorHash, {
        ...(summary || { projectId: PROJECT_ID, stage: STAGE, actorHash, schemaVersion: 2,
          days: {}, firstReceivedAt: new Date(timestamp), expiresAt: new Date(timestamp + 60 * DAY) }),
        withdrawnAt: new Date(timestamp),
      });
    });
  };
  return writer;
}

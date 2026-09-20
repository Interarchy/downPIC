import cloudbase from '@cloudbase/node-sdk';
import { actorHashFor, COLLECTIONS, PROJECT_ID, STAGE } from './quota.mjs';

const EVENT_NAMES = new Set([
  'analysis_started', 'analysis_succeeded', 'analysis_failed', 'module_edited',
  'module_disabled', 'prompt_confirmed', 'prompt_copied',
]);
const EVENT_OUTCOMES = new Set([
  'success', 'invalid_input', 'network_unavailable', 'timeout', 'service_unavailable',
  'quota_exceeded', 'format_invalid', 'version_mismatch', 'unknown_error',
]);

// The SDK may return an error result rather than throw. Never interpret that as
// an absent counter (which would reset quota), or a successful write.
function check(result) {
  if (!result || result.code) {
    const error = new Error('Database operation failed');
    error.code = result?.code;
    throw error;
  }
  return result;
}

export function createCloudBaseStore(db) {
  function directRef(collection, id) {
    if (!Object.hasOwn(COLLECTIONS, collection) || !/^[a-zA-Z0-9_-]{1,128}$/.test(id)) {
      throw new Error('Invalid project resource');
    }
    return db.collection(COLLECTIONS[collection]).doc(id);
  }
  return {
    async transaction(callback) {
      return db.runTransaction(async transaction => {
        function ref(collection, id) {
          if (!Object.hasOwn(COLLECTIONS, collection) || !/^[a-zA-Z0-9_-]{1,128}$/.test(id)) {
            throw new Error('Invalid project resource');
          }
          return transaction.collection(COLLECTIONS[collection]).doc(id);
        }
        return callback({
          async get(collection, id) {
            const result = check(await ref(collection, id).get());
            // SDK 3.18.3 transaction reads return one object or null (not an array).
            if (!Object.hasOwn(result, 'data') || Array.isArray(result.data)) throw new Error('Invalid database response');
            return result.data;
          },
          async set(collection, id, data) {
            const { _id, ...fields } = data;
            check(await ref(collection, id).set(fields));
          },
        });
      }, 3);
    },
    async set(collection, id, data) {
      const { _id, ...fields } = data;
      check(await directRef(collection, id).set(fields));
    },
  };
}

export function createEventWriter(store, { now = Date.now } = {}) {
  return async (actor, event) => {
    if (typeof actor !== 'string' || actor.length < 1 || actor.length > 256) throw new Error('Invalid event actor');
    const keys = Object.keys(event ?? {}).sort();
    const allowed = ['clientOccurredAt', 'eventId', 'eventName', 'outcome'];
    if (keys.some(key => !allowed.includes(key)) ||
        typeof event?.eventId !== 'string' || !/^[0-9a-f-]{36}$/i.test(event.eventId) ||
        !EVENT_NAMES.has(event?.eventName) ||
        (event.outcome !== undefined && !EVENT_OUTCOMES.has(event.outcome)) ||
        typeof event?.clientOccurredAt !== 'string' || !Number.isFinite(Date.parse(event.clientOccurredAt))) {
      throw new Error('Invalid analytics event');
    }
    const receivedAt = now();
    await store.set('events', event.eventId.toLowerCase(), {
      projectId: PROJECT_ID,
      stage: STAGE,
      actorHash: actorHashFor(actor),
      eventId: event.eventId.toLowerCase(),
      eventName: event.eventName,
      ...(event.outcome ? { outcome: event.outcome } : {}),
      clientOccurredAt: event.clientOccurredAt,
      receivedAt: new Date(receivedAt),
      expiresAt: new Date(receivedAt + 30 * 24 * 60 * 60 * 1000),
      schemaVersion: 1,
    });
  };
}

export function initializeCloudBaseStore(environment = process.env) {
  const environmentId = String(environment.ARCHBUDDY_CLOUDBASE_ENV_ID || '').trim();
  if (!/^[a-zA-Z0-9-]{6,128}$/.test(environmentId) || environment.ARCHBUDDY_STAGE !== STAGE) {
    throw new Error('CloudBase project environment or stage does not match registered resources');
  }
  // Explicit service-scoped credentials; do not silently reuse machine/account credentials.
  const accessKey = environment.ARCHBUDDY_CLOUDBASE_API_KEY;
  if (!accessKey) throw new Error('ArchBuddy database service API key is required');
  const app = cloudbase.init({ env: environmentId, region: 'ap-shanghai', accessKey });
  return createCloudBaseStore(app.database());
}

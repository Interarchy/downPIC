import cloudbase from '@cloudbase/node-sdk';
import { COLLECTIONS, STAGE } from './quota.mjs';

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

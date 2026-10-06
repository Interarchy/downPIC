import { createAnalysisServer } from './server.mjs';
import { createQuotaService } from './quota.mjs';
import { loadDeepSeekEnvironment } from '../plugin-prototype/developer-settings.mjs';

const environment = await loadDeepSeekEnvironment();
const port = Number(environment.PORT || 8080);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be 1..65535');
const mode = environment.ARCHBUDDY_QUOTA_MODE || 'process-test';
if (!['cloudbase', 'process-test'].includes(mode)) throw new Error('Invalid quota mode');
let quota = null;
let eventWriter = null;
if (mode === 'cloudbase') {
  const { createEventWriter, initializeCloudBaseStore } = await import('./cloudbase-store.mjs');
  const store = initializeCloudBaseStore();
  quota = createQuotaService(store, { environment });
  eventWriter = createEventWriter(store);
}
const server = createAnalysisServer({ environment, quota, eventWriter });
server.on('error', error => {
  console.error(JSON.stringify({ event: 'startup_failed', code: error.code || 'UNKNOWN' }));
  process.exitCode = 1;
});
server.listen(port, '0.0.0.0', () => {
  console.log(JSON.stringify({ event: 'ready', service: 'archbuddy-api', port }));
});
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 65_000).unref();
  });
}

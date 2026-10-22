import { createAnalysisServer } from './server.mjs';
import { createQuotaService } from './quota.mjs';
import { loadDeepSeekEnvironment } from '../plugin-prototype/developer-settings.mjs';

const localAccounts = process.env.ARCHBUDDY_ACCOUNT_MODE === 'local-demo';
if (process.env.ARCHBUDDY_ACCOUNT_MODE && !localAccounts) throw new Error('Invalid account mode');
if (localAccounts && process.env.ARCHBUDDY_QUOTA_MODE === 'cloudbase') throw new Error('Local account demo cannot use CloudBase resources');
if (process.env.ARCHBUDDY_LOCAL_MOCK_AI === 'true' && !localAccounts) throw new Error('Mock AI requires local account mode');
const localMockAI = localAccounts && process.env.ARCHBUDDY_LOCAL_MOCK_AI === 'true';
if (localAccounts && !localMockAI) throw new Error('This local account milestone supports mock AI only; a shared model budget must be approved before real calls');
const environment = localMockAI ? { ...process.env } : await loadDeepSeekEnvironment();
const port = Number(environment.PORT || 8080);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be 1..65535');
const mode = environment.ARCHBUDDY_QUOTA_MODE || 'process-test';
if (!['cloudbase', 'process-test'].includes(mode)) throw new Error('Invalid quota mode');
let quota = null;
let eventWriter = null;
let accountService = null;
let localModelOptions = {};
if (localAccounts) {
  const { createLocalAccountService } = await import('./accounts.mjs');
  accountService = await createLocalAccountService();
  if (localMockAI) {
    const { createLocalMockAnalyzer } = await import('./local-model-demo.mjs');
    localModelOptions = { analyzerFactory: createLocalMockAnalyzer };
  }
} else if (mode === 'cloudbase') {
  const { createEventWriter, initializeCloudBaseStore } = await import('./cloudbase-store.mjs');
  const store = initializeCloudBaseStore();
  quota = createQuotaService(store, { environment });
  eventWriter = createEventWriter(store);
}
const server = createAnalysisServer({ environment, quota, eventWriter, accountService, localMockAI, ...localModelOptions });
let stopping = false;
async function releaseStore() { if (accountService) { const service = accountService; accountService = null; await service.close(); } }
server.on('error', async error => {
  console.error(JSON.stringify({ event: 'startup_failed', code: error.code || 'UNKNOWN' }));
  await releaseStore();
  process.exitCode = 1;
});
server.listen(port, localAccounts ? '127.0.0.1' : '0.0.0.0', () => {
  console.log(JSON.stringify({ event: 'ready', service: 'archbuddy-api', port, ...(localAccounts ? { accountMode: 'local-demo', mockAI: localMockAI } : {}) }));
});
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.once(signal, () => {
    if (stopping) return;
    stopping = true;
    server.close(async () => { await releaseStore(); process.exit(0); });
    setTimeout(() => process.exit(1), 65_000).unref();
  });
}

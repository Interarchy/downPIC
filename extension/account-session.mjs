import { BACKEND_MODE } from './runtime-config.mjs';
import { createAccountClient as localClient } from './account-session-local.mjs';
import { createCloudAccountClient } from './cloud-account.mjs';
export const LOCAL_ACCOUNTS = BACKEND_MODE === 'local';
export const ACCOUNT_REQUIRED = true;
export function createAccountClient(options) { return LOCAL_ACCOUNTS ? localClient(options) : createCloudAccountClient(options); }

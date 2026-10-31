import { BACKEND_MODE } from './runtime-config.mjs';
import * as local from './account-ui-local.mjs';
import { ensureCloudAccount, mountCloudAccountUI } from './cloud-account-ui.mjs';
export const pointsEnabled = () => BACKEND_MODE === 'local';
export const formatPoints = local.formatPoints;
export const ensureAccount = BACKEND_MODE === 'local' ? local.ensureAccount : ensureCloudAccount;
export const mountAccountUI = BACKEND_MODE === 'local' ? local.mountAccountUI : mountCloudAccountUI;

import { initI18n, mountLanguageToggle } from './i18n.mjs';

await initI18n();
mountLanguageToggle(document.getElementById('privacy-language'));

import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
const require = createRequire('C:/Users/lee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/runtime.cjs');
const { chromium } = require('playwright');
const out = path.resolve('opendesign/review/archbuddy-concept-interactions-20261023');
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const reports = [];
for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  const page = await browser.newPage({ viewport, hasTouch: viewport.width < 500, isMobile: viewport.width < 500 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => errors.push(`${request.url()} ${request.failure()?.errorText}`));
  await page.goto('https://archbuddy-dev-showcase-dev-mel-d9guu8bpu44029179.webapps.tcloudbase.com/?v=concept-interactions-20261023#concept', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3900);
  const consent = page.getByRole('button', { name: '确定访问' });
  if (await consent.count()) await consent.click();
  await page.waitForLoadState('load');
  await page.locator('#concept').scrollIntoViewIfNeeded();
  await page.locator('[data-concept-card="reference"] .concept-front-button').click();
  await page.locator('[data-concept-card="prompt"] .concept-front-button').click();
  await page.waitForTimeout(2500);
  const promptVisible = await page.locator('.concept-card-prompt .concept-back').isVisible();
  await page.locator('[data-concept-card="compare"] .concept-front-button').click();
  await page.locator('.compare-range').fill('68');
  await page.locator('.creation-storage').click();
  await page.waitForTimeout(750);
  await page.locator('#concept').screenshot({ path: path.join(out, `public-${viewport.width}.png`) });
  const state = await page.evaluate(() => ({
    version: document.querySelector('link[href*="concept-interactive.css"]')?.getAttribute('href'),
    cards: document.querySelectorAll('[data-concept-card]').length,
    split: document.querySelector('.comparison').style.getPropertyValue('--split'),
    expanded: document.querySelector('.creation-storage').getAttribute('aria-expanded'),
    libraryLoaded: document.querySelector('.creation-reveal img').naturalWidth > 0,
    horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  reports.push({ viewport, promptVisible, errors, ...state });
  await page.close();
}
await browser.close();
await writeFile(path.join(out, 'public-browser.json'), JSON.stringify(reports, null, 2));
console.log(JSON.stringify(reports));
if (reports.some(report => report.errors.length || !report.promptVisible || report.cards !== 3 || report.split !== '68%' || report.expanded !== 'true' || !report.libraryLoaded || report.horizontalOverflow > 0)) process.exitCode = 1;

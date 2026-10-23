import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const require = createRequire('C:/Users/lee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/runtime.cjs');
const { chromium } = require('playwright');
const out = path.resolve('opendesign/review/archbuddy-concept-interactions-20261023');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const results = [];
for (const viewport of [{ width: 1440, height: 1000 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 360, height: 780 }]) {
  const mobile = viewport.width < 500;
  const label = String(viewport.width);
  const page = await browser.newPage({ viewport, hasTouch: mobile, isMobile: mobile });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('requestfailed', r => errors.push(`${r.url()} ${r.failure()?.errorText}`));
  await page.goto('http://127.0.0.1:8766/mockups/archbuddy-showcase/?v=concept-interactions-20261023#concept', { waitUntil: 'networkidle' });
  await page.locator('#concept').scrollIntoViewIfNeeded();
  await page.locator('#concept').screenshot({ path: path.join(out, `${label}-front.png`) });
  const first = page.locator('[data-concept-card="reference"]');
  if (mobile) await first.locator('.concept-front-button').click(); else await first.hover();
  await page.waitForTimeout(850);
  const hoverState = await first.evaluate(el => ({ hovered: el.matches(':hover'), open: el.classList.contains('is-open'), transform: getComputedStyle(el.querySelector('.concept-flip')).transform }));
  await page.locator('#concept').screenshot({ path: path.join(out, `${label}-reference.png`) });
  const second = page.locator('[data-concept-card="prompt"]');
  if (mobile) await second.locator('.concept-front-button').click(); else await second.hover();
  await page.waitForTimeout(2700);
  await page.locator('#concept').screenshot({ path: path.join(out, `${label}-prompt.png`) });
  const third = page.locator('[data-concept-card="compare"]');
  await third.locator('.concept-front-button').click();
  await page.waitForTimeout(850);
  const range = third.locator('.compare-range');
  if (mobile) await range.fill('72');
  else {
    const bounds = await range.boundingBox();
    await page.mouse.move(bounds.x + bounds.width * .3, bounds.y + bounds.height * .5);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width * .72, bounds.y + bounds.height * .5, { steps: 8 });
    await page.mouse.up();
  }
  const split = await third.locator('.comparison').evaluate(el => getComputedStyle(el).getPropertyValue('--split').trim());
  await page.locator('#concept').screenshot({ path: path.join(out, `${label}-compare.png`) });
  const storage = page.locator('.creation-storage');
  if (mobile) await storage.click();
  else {
    const bounds = await storage.boundingBox();
    await page.mouse.move(bounds.x + bounds.width * .5, bounds.y + 20);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width * .5, bounds.y + 85, { steps: 6 });
    await page.mouse.up();
  }
  await page.waitForTimeout(850);
  await page.locator('#concept').screenshot({ path: path.join(out, `${label}-expanded.png`) });
  const state = await page.evaluate(() => ({
    storageExpanded: document.querySelector('.creation-storage').getAttribute('aria-expanded'),
    screenshotLoaded: document.querySelector('.creation-reveal img').complete && document.querySelector('.creation-reveal img').naturalWidth > 0,
    horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    cardHeight: Math.round(document.querySelector('.concept-card').getBoundingClientRect().height),
  }));
  results.push({ viewport, hoverState, split, ...state, errors });
  await page.close();
}
await browser.close();
await writeFile(path.join(out, 'local-results.json'), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results));

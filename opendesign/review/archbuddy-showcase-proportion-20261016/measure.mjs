import { createRequire } from 'node:module';
const require = createRequire('C:/Users/lee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/runtime.cjs');
const { chromium } = require('playwright');
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const publicBase = process.env.PUBLIC_SHOWCASE_URL;
const scope = publicBase ? 'public' : 'local';
const sizes = [[2436, 1240], [1920, 900], [1440, 1000], [390, 844]];
for (const [width, height] of sizes) {
  const page = await browser.newPage({ viewport: { width, height } });
  const browserErrors=[];page.on('pageerror',error=>browserErrors.push(error.message));page.on('requestfailed',request=>browserErrors.push(request.url()+' '+request.failure()?.errorText));
  const base=publicBase||'http://127.0.0.1:8766/mockups/archbuddy-showcase/?v=proportion-white-install-20261016';
  await page.goto(base, { waitUntil: 'load' });
  if(publicBase){await page.waitForTimeout(3500);if(await page.getByText('确定访问',{exact:true}).count()){await page.getByText('确定访问',{exact:true}).click();await page.waitForLoadState('load');browserErrors.length=0;}}
  await page.waitForFunction(()=>document.querySelectorAll('#problem .sector').length===5&&document.querySelectorAll('#workflow .ab-workflow-node').length===8);
  for (const step of [0, 1]) {
    await page.evaluate(step => {
      const chapter = document.getElementById('story');
      if (document.body.dataset.storyLayout === 'pinned') {
        const top = parseFloat(getComputedStyle(document.body).getPropertyValue('--story-top'));
        const start = chapter.getBoundingClientRect().top + scrollY + parseFloat(getComputedStyle(chapter).paddingTop) - top;
        scrollTo(0, start + Math.max(1550, innerHeight * 1.8) * (step ? .91 : .46));
      } else {
        const target = document.getElementById(step ? 'workflow' : 'problem');
        scrollTo(0, target.getBoundingClientRect().top + scrollY - 100);
      }
    }, step);
    await page.waitForTimeout(500);
    const metrics = await page.evaluate(step => {
      const box = el => { const r = document.querySelector(el)?.getBoundingClientRect(); return r && { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
      return { width: innerWidth, height: innerHeight, step, layout: document.body.dataset.storyLayout, stage: getComputedStyle(document.body).getPropertyValue('--story-stage'), top: getComputedStyle(document.body).getPropertyValue('--story-top'), overflow: document.documentElement.scrollWidth - innerWidth,
        panel: box('.story-window'), heading: box(step ? '#workflow .section-heading' : '#problem .section-heading'), graphic: box(step ? '#workflow .ab-workflow-diagrams' : '#problem .radial-disc'), right: box(step ? '#scenario-ai' : '#problem .diagnoses'), workflowNode: box('#workflow .ab-workflow-node') };
    }, step);
    console.log(JSON.stringify({scope,...metrics}));
    await page.screenshot({ path: 'opendesign/review/archbuddy-showcase-proportion-20261016/' + scope + '-' + width + '-' + step + '.png' });
  }
  if (width === 1440 || width === 390) {
    await page.locator('#install').evaluate(el => scrollTo(0, el.getBoundingClientRect().top + scrollY - 90));
    await page.waitForTimeout(400);
    const colors = await page.evaluate(() => Object.fromEntries(['#install .section-label','#install .section-label span','#install .button-green','#install .install-steps>li>span','#install .testset-guide strong'].map(selector => { const style=getComputedStyle(document.querySelector(selector)); return [selector,{color:style.color,background:style.backgroundColor}]; })));
    console.log(JSON.stringify({scope,width,installColors:colors}));
    await page.locator('#install').screenshot({path:'opendesign/review/archbuddy-showcase-proportion-20261016/' + scope + '-' + width + '-install.png'});
  }
  console.log(JSON.stringify({scope,width,browserErrors}));
  if(browserErrors.length)process.exitCode=1;
  await page.close();
}
await browser.close();
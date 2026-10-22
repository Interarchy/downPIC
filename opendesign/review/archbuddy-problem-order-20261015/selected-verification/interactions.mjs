import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire('C:/Users/lee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/runtime.cjs');
const {chromium}=require('playwright');
const dir='opendesign/review/archbuddy-problem-order-20261015/selected-verification';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
const page=await context.newPage();const errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
await page.goto('http://127.0.0.1:8766/mockups/archbuddy-showcase/#problem',{waitUntil:'networkidle'});
const result={sections:await page.locator('main > section[id]').evaluateAll(nodes=>nodes.map(n=>({id:n.id,display:getComputedStyle(n).display,height:n.getBoundingClientRect().height}))),interactions:[],errors};
for(const gallery of ['prompt','assets']){
const figure=page.locator('[data-gallery='+gallery+']');const img=figure.locator('img');const before=await img.getAttribute('src');
await figure.locator('[data-variant="1"]').click();const after=await img.getAttribute('src');await img.evaluate(e=>e.decode());
result.interactions.push({gallery,before,after,pressed:await figure.locator('[data-variant="1"]').getAttribute('aria-pressed'),imageLoaded:await img.evaluate(e=>e.complete&&e.naturalWidth>0)});
await figure.locator('[data-enlarge]').first().click();result.interactions.push({dialogGallery:gallery,open:await page.locator('#image-dialog').evaluate(e=>e.open),sameSrc:await page.locator('#dialog-image').evaluate((e,g)=>e.src===document.querySelector('[data-gallery='+g+'] img').src,gallery)});
await page.locator('[data-close-dialog]').click();
}
await page.locator('a[href="#workflow"]').first().click();result.interactions.push({nav:'workflow',hash:await page.evaluate(()=>location.hash)});
await fs.writeFile(dir+'/interactions.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
await context.close();await browser.close();

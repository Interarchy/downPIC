import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
const require = createRequire('C:/Users/lee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/runtime.cjs');
const { chromium } = require('playwright');
const out=path.dirname(new URL(import.meta.url).pathname.slice(1));
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:8766/mockups/archbuddy-workflow-options/?v=verify-20261016#one',{waitUntil:'networkidle'});
const checks=[];
for(const width of [1440,360]){
 await page.setViewportSize({width,height:1000});
 for(const key of ['two','three','one']){
  await page.locator('[data-option="'+key+'"]').click();
  checks.push(await page.evaluate(({key,width})=>({type:'button',width,key,pass:location.hash==='#'+key&&document.querySelector('.workflow-section').dataset.variant===key&&document.querySelector('[data-option="'+key+'"]').getAttribute('aria-pressed')==='true',nodes:document.querySelectorAll('.node').length}),{key,width}));
 }
}
for(const key of ['three','two','one']){
 await page.evaluate(k=>{location.hash=k},key);
 await page.waitForFunction(k=>document.querySelector('.workflow-section').dataset.variant===k,key);
 checks.push(await page.evaluate(key=>({type:'hash',width:innerWidth,key,pass:document.querySelector('.workflow-section').dataset.variant===key&&document.querySelector('[data-option="'+key+'"]').getAttribute('aria-pressed')==='true',nodes:document.querySelectorAll('.node').length}),key));
}
await browser.close();
const all=[...JSON.parse(await fs.readFile(path.join(out,'first.json'),'utf8')),...JSON.parse(await fs.readFile(path.join(out,'remaining.json'),'utf8'))];
const rectOverlap=(a,b)=>a.x<b.right&&a.right>b.x&&a.y<b.bottom&&a.bottom>b.y;
const summary=all.map(r=>({variant:r.variant,width:r.width,overflow:r.metrics.overflow,overflowElementCount:r.metrics.overflowElements.length,nodeSizes:[...new Set(r.metrics.flows.flatMap(f=>f.nodes.map(n=>n.rect.width+' x '+n.rect.height)))],wireColors:[...new Set(r.metrics.flows.flatMap(f=>f.edges.map(e=>e.stroke)))],arrowColors:[...new Set(r.metrics.flows.flatMap(f=>f.arrows.map(e=>e.color)))],productColors:[...new Set(r.variant==='three'?r.metrics.flows.flatMap(f=>f.nodes.filter(n=>!['create','generate'].includes(n.id)).map(n=>n.background)):r.metrics.markColors)],labelNodeCollisions:r.metrics.flows.flatMap(f=>f.labels.flatMap(l=>f.nodes.filter(n=>rectOverlap(l.rect,n.rect)).map(n=>({flow:f.flow,label:l.text,node:n.id})))),errors:r.errors,failures:r.failures}));
const result={checks,errors,summary};
await fs.writeFile(path.join(out,'interaction-summary.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));

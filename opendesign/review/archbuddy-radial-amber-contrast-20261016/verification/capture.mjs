import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require=createRequire('C:/Users/lee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/runtime.cjs');
const {chromium}=require('playwright');
const out=path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/,'$1'));
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const results=[];
for(const width of [360,1440]){
 const context=await browser.newContext({viewport:{width,height:width===1440?1050:844},deviceScaleFactor:1});
 const page=await context.newPage();const errors=[],failures=[],badResponses=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('requestfailed',r=>failures.push({url:r.url(),error:r.failure()}));page.on('response',r=>{if(r.status()>=400)badResponses.push({url:r.url(),status:r.status()});});
 await page.goto('http://127.0.0.1:8766/mockups/archbuddy-radial-break-options/?round=14#two',{waitUntil:'networkidle'});await page.evaluate(()=>document.fonts.ready);
 await page.locator('.radial-disc').screenshot({path:path.join(out,`${width}-two-ring.png`)});await page.screenshot({path:path.join(out,`${width}-two-full.png`),fullPage:true});
 const metrics=await page.evaluate(()=>{const svg=document.querySelector('#ring-svg');return {hash:location.hash,theme:document.querySelector('.problem-section').dataset.theme,viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,diameter:document.querySelector('.radial-disc').clientWidth,flows:[...svg.querySelectorAll('.flow')].map(el=>({stroke:getComputedStyle(el).stroke,width:getComputedStyle(el).strokeWidth})),breaks:[...svg.querySelectorAll('.break-group')].map(el=>({shape:el.querySelector('.break-shape').getAttribute('d'),fill:getComputedStyle(el.querySelector('.break-shape')).fill,text:[...el.querySelectorAll('text')].map(t=>({text:t.textContent,font:getComputedStyle(t).fontSize,x:t.getAttribute('x'),y:t.getAttribute('y'),transform:t.getAttribute('transform')}))})),headings:[...document.querySelectorAll('.diagnosis h2')].map(el=>({text:el.textContent,color:getComputedStyle(el).color,weight:getComputedStyle(el).fontWeight})),labels:[...svg.querySelectorAll('.step-label')].map(el=>el.textContent)};});
 results.push({width,metrics,errors,failures,badResponses});console.log(JSON.stringify({width,errors:errors.length,failures:failures.length,badResponses:badResponses.length,overflow:metrics.scrollWidth>width}));await context.close();
}
fs.writeFileSync(path.join(out,'check-summary.json'),JSON.stringify(results,null,2));await browser.close();

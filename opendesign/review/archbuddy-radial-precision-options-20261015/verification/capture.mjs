import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire('C:/Users/lee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/runtime.cjs');
const { chromium } = require('playwright');
const out = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'));
const browser = await chromium.launch({headless:true, executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const results = {base:'http://127.0.0.1:8766/mockups/archbuddy-radial-break-options/?round=12', scenarios:[], interactions:[]};
for (const width of [360,1440,390]) {
  for (const option of ['one','two','three']) {
    const context = await browser.newContext({viewport:{width,height:width===1440?1050:844},deviceScaleFactor:1});
    const page = await context.newPage();
    const errors=[], failures=[], statuses=[];
    page.on('pageerror', e=>errors.push(String(e)));
    page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
    page.on('requestfailed',r=>failures.push({url:r.url(),error:r.failure()}));
    page.on('response',r=>{statuses.push({url:r.url(),status:r.status()});});
    await page.goto(results.base+'#'+option, {waitUntil:'networkidle'});
    await page.evaluate(()=>document.fonts.ready);
    await page.locator('.radial-disc').screenshot({path:path.join(out, `${width}-${option}-ring.png`)});
    await page.screenshot({path:path.join(out, `${width}-${option}-full.png`),fullPage:true});
    const metrics=await page.evaluate(()=>{
      const rect=el=>{const b=el.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height,right:b.right,bottom:b.bottom};};
      const svg=document.querySelector('#ring-svg');
      const labels=[...svg.querySelectorAll('.step-label')].map(el=>({text:el.textContent,rect:rect(el),font:getComputedStyle(el).fontSize,numberFont:getComputedStyle(el.querySelector('.step-number')).fontSize,path:svg.querySelector(el.querySelector('textPath').getAttribute('href')).getAttribute('d')}));
      const breaks=[...svg.querySelectorAll('.break-group')].map(el=>({label:el.querySelector('text').textContent,rect:rect(el),textRect:rect(el.querySelector('text')),shape:el.querySelector('path').getAttribute('d'),transform:el.querySelector('text').getAttribute('transform'),font:getComputedStyle(el.querySelector('text')).fontSize}));
      return {hash:location.hash,theme:document.querySelector('.problem-section').dataset.theme,bg:getComputedStyle(document.querySelector('.problem-section')).backgroundColor,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,disc:rect(document.querySelector('.radial-disc')),labels,breaks,seamWidths:[...svg.querySelectorAll('.stage-seam')].map(el=>el.getAttribute('stroke-width')),flows:[...svg.querySelectorAll('.flow')].map(el=>({d:el.getAttribute('d'),stroke:el.getAttribute('stroke-width')})),fill:svg.style.getPropertyValue('--break-color'),pressed:[...document.querySelectorAll('[aria-pressed="true"]')].map(el=>el.dataset.option)};
    });
    results.scenarios.push({width,option,metrics,errors,failures,statuses});
    console.log(JSON.stringify({width,option,overflow:metrics.scrollWidth>width,errors:errors.length,failures:failures.length}));
    await context.close();
  }
}
const page=await browser.newPage({viewport:{width:390,height:844}});
await page.goto(results.base+'#one',{waitUntil:'networkidle'});
const snap=async(name,expected)=>{const state=await page.evaluate(()=>({hash:location.hash,theme:document.querySelector('.problem-section').dataset.theme,pressed:[...document.querySelectorAll('[aria-pressed="true"]')].map(el=>el.dataset.option),focused:document.activeElement.dataset.option,desc:document.querySelector('#option-description').textContent}));results.interactions.push({name,expected,state,pass:state.theme===expected&&state.pressed.length===1&&state.pressed[0]===expected&&(name==='invalid hash fallback'||state.hash==='#'+expected)});};
for(const option of ['two','three','one']) {await page.locator(`[data-option="${option}"]`).click();await snap('button '+option,option);}
for(const [key,expected] of [['ArrowRight','two'],['ArrowRight','three'],['ArrowRight','one'],['ArrowLeft','three'],['Home','one'],['End','three']]) {await page.keyboard.press(key);await snap('keyboard '+key,expected);}
await page.locator('[data-option="two"]').focus();await page.keyboard.press('Enter');await snap('keyboard Enter','two');
await page.locator('[data-option="one"]').focus();await page.keyboard.press('Space');await snap('keyboard Space','one');
await page.evaluate(()=>{location.hash='three';});await page.waitForFunction(()=>document.querySelector('.problem-section').dataset.theme==='three');await snap('hash change','three');
await page.evaluate(()=>{location.hash='unknown';});await page.waitForFunction(()=>document.querySelector('.problem-section').dataset.theme==='one');await snap('invalid hash fallback','one');
fs.writeFileSync(path.join(out,'check-summary.json'),JSON.stringify(results,null,2));
await browser.close();
console.log(JSON.stringify({scenarios:results.scenarios.length,interactionPass:results.interactions.filter(x=>x.pass).length,interactions:results.interactions.length}));

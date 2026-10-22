const fs = require('node:fs');
const path = require('node:path');
const {createRequire} = require('node:module');
const req=createRequire('C:/Users/lee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/runtime.cjs');
const {chromium}=req('playwright');
(async()=>{
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const out=__dirname, results=[];
for(const width of [1440,390,360]) {
 const page=await browser.newPage({viewport:{width,height:1100},deviceScaleFactor:1});
 const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 for(const variant of ['one','two','three']) {
  await page.goto(`http://127.0.0.1:8766/mockups/archbuddy-radial-break-options/?round=10bverify#${variant}`,{waitUntil:'networkidle'});
  await page.screenshot({path:path.join(out,`${width}-${variant}-10b.png`),fullPage:true});
  const metrics=await page.evaluate(()=>{
   const svg=document.querySelector('#ring-svg'), box=svg.getBoundingClientRect();
   const center=box.width/2;
   const texts=[...svg.querySelectorAll('text')].map(t=>{const b=t.getBBox();return {class:t.getAttribute('class'),text:t.textContent,attr:t.getAttribute('font-size'),computed:getComputedStyle(t).fontSize,bbox:{x:b.x,y:b.y,width:b.width,height:b.height}};});
   return {viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,svgWidth:box.width,flowCount:svg.querySelectorAll('.flow').length,sectorCount:svg.querySelectorAll('.sector').length,breaks:svg.querySelectorAll('.break-group').length,circles:svg.querySelectorAll('circle').length,texts,selected:[...document.querySelectorAll('[aria-pressed="true"]')].map(t=>t.dataset.option),bodyVariant:document.querySelector('#radial-stage').dataset.variant};
  });
  results.push({width,variant,errors:[...errors],...metrics});
 }
 await page.close();
}
const page=await browser.newPage({viewport:{width:1440,height:1100}});
await page.goto('http://127.0.0.1:8766/mockups/archbuddy-radial-break-options/?round=10bverify#one',{waitUntil:'networkidle'});
const interactions=[];
await page.locator('[data-option="two"]').click();interactions.push({action:'click two',hash:await page.evaluate(()=>location.hash),selected:await page.locator('[aria-pressed="true"]').getAttribute('data-option')});
await page.locator('[data-option="two"]').press('ArrowRight');interactions.push({action:'ArrowRight',hash:await page.evaluate(()=>location.hash)});
await page.locator('[data-option="three"]').press('Home');interactions.push({action:'Home',hash:await page.evaluate(()=>location.hash)});
await page.locator('[data-option="one"]').press('End');interactions.push({action:'End',hash:await page.evaluate(()=>location.hash)});
await page.locator('[data-option="three"]').press('ArrowRight');interactions.push({action:'ArrowRight wrap',hash:await page.evaluate(()=>location.hash)});
await page.evaluate(()=>location.hash='two');await page.waitForTimeout(100);interactions.push({action:'hash two',selected:await page.locator('[aria-pressed="true"]').getAttribute('data-option')});
fs.writeFileSync(path.join(out,'metrics-10b.json'),JSON.stringify({results,interactions},null,2));
console.log(JSON.stringify({screenshots:results.length,errors:results.filter(x=>x.errors.length),overflow:results.filter(x=>x.scrollWidth>x.viewport),fontMismatch:results.flatMap(x=>x.texts.filter(t=>Math.abs(parseFloat(t.attr)-parseFloat(t.computed))>.01).map(t=>({width:x.width,variant:x.variant,...t}))),interactions}));
await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});

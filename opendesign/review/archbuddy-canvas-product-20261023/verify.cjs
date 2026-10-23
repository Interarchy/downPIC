const {createRequire}=require('module');
const req=createRequire('C:/Users/lee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/runtime.cjs');
const {chromium}=req('playwright');
const fs=require('fs'),path=require('path');
const out=__dirname;
(async()=>{
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const results=JSON.parse(fs.readFileSync(path.join(out,'check-summary.json'),'utf8')).filter(r=>r.width>1000);
for(const [width,height] of [[390,844],[768,1024]]){
 const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1});const page=await context.newPage();const errors=[],badResponses=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});page.on('response',r=>{if(r.status()>=400)badResponses.push({url:r.url(),status:r.status()})});
 await page.goto('http://127.0.0.1:8766/mockups/archbuddy-showcase/?v=canvas-product-20261023',{waitUntil:'networkidle'});
 await page.waitForTimeout(600);const checks={width,height};
 for(const id of ['concept','features','install']){
  await page.locator('#'+id).evaluate(el=>window.scrollTo({top:el.getBoundingClientRect().top+scrollY-85,behavior:'instant'}));await page.waitForTimeout(1200);
  await page.locator('#'+id).screenshot({path:path.join(out,`${width}-${id}.png`)});
 }
 checks.layout=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,innerWidth,storyLayout:document.body.dataset.storyLayout,installBackground:getComputedStyle(document.querySelector('#install')).backgroundColor,stages:[...document.querySelectorAll('.creation-stages h3')].map(el=>({text:el.textContent,width:el.getBoundingClientRect().width,scrollWidth:el.scrollWidth,parentWidth:el.parentElement.getBoundingClientRect().width})),overflow:[...document.querySelectorAll('#concept *,#features *')].filter(el=>{const r=el.getBoundingClientRect();return r.width>0&&(r.left< -1||r.right>innerWidth+1)}).map(el=>({tag:el.tagName,class:el.className})),brokenImages:[...document.images].filter(i=>!i.complete||!i.naturalWidth).map(i=>i.src)}));
 checks.gallery=[];
 for(const name of ['prompt','assets'])for(const v of [1,0]){
  await page.locator(`[data-gallery="${name}"] [data-variant="${v}"]`).click();await page.waitForTimeout(200);
  const state=await page.locator(`[data-gallery="${name}"]`).evaluate(el=>({src:el.querySelector('img').getAttribute('src'),pressed:[...el.querySelectorAll('[data-variant]')].map(b=>b.getAttribute('aria-pressed'))}));checks.gallery.push({name,v,...state});
 }
 checks.dialog=[];
 for(const id of ['capture-image','prompt-image','assets-image']){
  await page.locator(`button.image-button[data-enlarge="${id}"]`).click();await page.waitForTimeout(200);
  checks.dialog.push(await page.evaluate(id=>({id,open:document.querySelector('#image-dialog').open,matching:document.querySelector('#dialog-image').src===document.getElementById(id).src}),id));
  if(id==='prompt-image')await page.screenshot({path:path.join(out,`${width}-dialog.png`)});
  await page.locator('[data-close-dialog]').click();
 }
 checks.story=[];
 for(const step of [0,1]){
  if(width>=1100)await page.locator(`[data-story-step="${step}"]`).click();
  else await page.locator(step===0?'#problem':'#workflow').evaluate(el=>window.scrollTo({top:el.getBoundingClientRect().top+scrollY-90,behavior:'instant'}));
  await page.waitForTimeout(1200);
  checks.story.push(await page.evaluate(()=>({step:document.querySelector('#story').dataset.step,transition:document.querySelector('#story').dataset.transition,scrollY})));
  await page.screenshot({path:path.join(out,`${width}-story-${step+1}.png`)});
 }
 checks.errors=errors;checks.badResponses=badResponses;results.push(checks);fs.writeFileSync(path.join(out,'check-summary.json'),JSON.stringify(results,null,2));await context.close();console.log('complete '+width);
}
await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});

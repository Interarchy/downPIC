import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire('C:/Users/lee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/runtime.cjs');
const {chromium}=require('playwright');
const dir='opendesign/review/archbuddy-problem-order-20261015/verification';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const report={time:new Date().toISOString(),cases:[],interaction:[],errors:[]};
try {
for (const width of [1440,1024,390,360]) {
 const context=await browser.newContext({viewport:{width,height:width>1000?1000:844}}); const page=await context.newPage();
 const errors=[];page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url())});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text()+' '+m.location().url)});
 for(const variant of ['one','two','three']) {
  const res=await page.goto('http://127.0.0.1:8766/mockups/archbuddy-problem-options/?round=4&verify='+variant+'#'+variant,{waitUntil:'networkidle'});
  const initialScrollY=await page.evaluate(()=>scrollY); await page.waitForTimeout(260);
  const metrics=await page.evaluate(id=>{
   const section=document.getElementById('panel-'+id),r=section.getBoundingClientRect();
   const clip=[...section.querySelectorAll('h1,h2,h3,p')].filter(e=>e.scrollWidth>e.clientWidth+1||e.scrollHeight>e.clientHeight+1).map(e=>({text:e.textContent,scroll:e.scrollWidth,client:e.clientWidth,height:e.clientHeight,scrollHeight:e.scrollHeight}));
   return {url:location.href,visible:[...document.querySelectorAll('.variant')].filter(e=>!e.hidden).map(e=>e.id),documentWidth:document.documentElement.scrollWidth,viewport:innerWidth,section:{top:r.top,bottom:r.bottom,height:r.height},headings:[...section.querySelectorAll('h2')].map(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return{text:e.textContent,top:r.top,left:r.left,width:r.width,height:r.height,lineHeight:s.lineHeight,font:s.fontSize}}),clip,icons:[...section.querySelectorAll('svg')].map(e=>{const b=e.getBBox();return{width:b.width,height:b.height,reference:e.querySelector('use')?.getAttribute('href')}})};
  },variant);
  report.cases.push({width,variant,initialScrollY,status:res?.status()||200,...metrics,errors:[...errors]});
  if([1440,390].includes(width))await page.screenshot({path:dir+'/'+variant+'-'+width+'.png',fullPage:true});
 }
 if(width===1440){
  await page.locator('[data-option="one"]').click();
  report.interaction.push({test:'click one',hash:await page.evaluate(()=>location.hash),pressed:await page.locator('[aria-pressed="true"]').getAttribute('data-option')});
  for(const key of ['ArrowRight','ArrowRight','ArrowRight','End','Home','ArrowLeft']){
   await page.keyboard.press(key);report.interaction.push({test:key,hash:await page.evaluate(()=>location.hash),focus:await page.evaluate(()=>document.activeElement?.dataset.option),visible:await page.locator('.variant:visible').getAttribute('id')});
  }
  await page.evaluate(()=>location.hash='two');await page.waitForTimeout(100);report.interaction.push({test:'hashchange',hash:await page.evaluate(()=>location.hash),visible:await page.locator('.variant:visible').getAttribute('id')});
 }
 await context.close();
}
} catch(e){report.errors.push(String(e));}finally{await browser.close();await fs.writeFile(dir+'/browser-report.json',JSON.stringify(report,null,2));}
console.log(JSON.stringify(report,null,2));

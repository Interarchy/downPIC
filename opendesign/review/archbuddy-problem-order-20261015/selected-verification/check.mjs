import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire('C:/Users/lee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/runtime.cjs');
const {chromium}=require('playwright');
const dir='opendesign/review/archbuddy-problem-order-20261015/selected-verification';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const report={checkedAt:new Date().toISOString(),cases:[]};
for(const target of [
{name:'preview',url:'http://127.0.0.1:8766/mockups/archbuddy-problem-options/?round=5#one',sel:'#panel-one'},
{name:'canonical',url:'http://127.0.0.1:8766/mockups/archbuddy-showcase/#problem',sel:'#problem'}]){
for(const width of [1440,1024,390,360]){
const context=await browser.newContext({viewport:{width,height:width>1000?1000:844},reducedMotion:'reduce'});
const page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push('pageerror '+e.message));
page.on('console',m=>{if(m.type()==='error')errors.push('console '+m.text())});
page.on('response',r=>{if(r.status()>=400)errors.push('HTTP '+r.status()+' '+r.url())});
const response=await page.goto(target.url,{waitUntil:'networkidle'});await page.waitForTimeout(450);
const metrics=await page.evaluate(sel=>{
const section=document.querySelector(sel),rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom}};
const steps=[...section.querySelectorAll('.axis-step')].map(e=>({n:e.querySelector('.step-no').textContent,t:e.querySelector('h2,h3').textContent,nr:rect(e.querySelector('.step-no')),tr:rect(e.querySelector('h2,h3')),r:rect(e)}));
const breaks=[...section.querySelectorAll('.axis-break')].map(e=>({label:e.getAttribute('aria-label'),icon:e.querySelector('use').getAttribute('href'),r:rect(e),ir:rect(e.querySelector('svg')),lines:[...e.querySelectorAll('.axis-break-line')].map(rect)}));
const pains=[...section.querySelectorAll('.axis-pain')].map(e=>({range:e.querySelector('.axis-range').textContent,title:e.querySelector('h3,h4').textContent,lines:[...e.querySelectorAll('.axis-detail span')].map(x=>x.textContent),rr:rect(e.querySelector('.axis-range')),tr:rect(e.querySelector('h3,h4')),dr:rect(e.querySelector('.axis-detail')),r:rect(e)}));
const overflow=[...section.querySelectorAll('*')].filter(e=>e.scrollWidth>e.clientWidth+1||e.scrollHeight>e.clientHeight+1).map(e=>({tag:e.tagName,cls:e.getAttribute('class'),text:e.textContent.trim().slice(0,50),sw:e.scrollWidth,cw:e.clientWidth,sh:e.scrollHeight,ch:e.clientHeight}));
const others=[...document.querySelectorAll('main > section[id]')].filter(e=>['workflow','concept','features','install'].includes(e.id)).map(e=>({id:e.id,r:rect(e),display:getComputedStyle(e).display}));
return{documentWidth:document.documentElement.scrollWidth,viewport:innerWidth,section:rect(section),board:rect(section.querySelector('.axis-board')),steps,breaks,pains,overflow,others};
},target.sel);
if([1440,390].includes(width)){await page.locator(target.sel).screenshot({path:dir+'/'+target.name+'-'+width+'-section.png'});if(target.name==='canonical')await page.screenshot({path:dir+'/'+target.name+'-'+width+'-full.png',fullPage:true})}
report.cases.push({name:target.name,width,status:response?.status(),url:page.url(),...metrics,errors});await context.close();
}}
await browser.close();await fs.writeFile(dir+'/report.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report.cases.map(x=>({name:x.name,width:x.width,status:x.status,documentWidth:x.documentWidth,viewport:x.viewport,steps:x.steps.length,breaks:x.breaks.length,pains:x.pains.length,errors:x.errors,overflow:x.overflow.length,others:x.others.map(o=>o.id)})),null,2));

import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
const require = createRequire('C:/Users/lee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/runtime.cjs');
const { chromium } = require('playwright');
const out = path.dirname(new URL(import.meta.url).pathname.slice(1));
const browser = await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const scenarios = process.argv[2] === 'first' ? [['one',1440],['two',1440],['three',1440],['one',360]] : [['two',360],['three',360],['two',780]];
const results=[];
for (const [variant,width] of scenarios) {
 const page=await browser.newPage({viewport:{width,height:1000},deviceScaleFactor:1});
 const errors=[],failures=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 page.on('requestfailed',r=>failures.push({url:r.url(),error:r.failure()?.errorText}));
 page.on('response',r=>{if(r.status()>=400)failures.push({url:r.url(),status:r.status()})});
 const response = await page.goto('http://127.0.0.1:8766/mockups/archbuddy-workflow-options/?v=verify-20261016#'+variant,{waitUntil:'networkidle'});
 await page.evaluate(()=>document.fonts.ready);
 const metrics = await page.evaluate(()=>{
  const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};
  return {
   viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,overflow:Math.max(0,document.documentElement.scrollWidth-innerWidth),variant:document.querySelector('.workflow-section').dataset.variant,
   flows:[...document.querySelectorAll('.chart')].map(c=>({flow:c.dataset.flow,rect:rect(c),nodes:[...c.querySelectorAll('.node')].map(n=>({id:n.dataset.node,text:n.innerText,rect:rect(n),background:getComputedStyle(n).backgroundColor})),opportunities:c.querySelectorAll('.product-mark').length,edges:[...c.querySelectorAll('[data-edge]')].map(e=>({id:e.dataset.edge,stroke:getComputedStyle(e).stroke})),arrows:[...c.querySelectorAll('.arrow')].map(e=>({color:getComputedStyle(e).color,stroke:getComputedStyle(e).stroke})),labels:[...c.querySelectorAll('.edge-label,.center-note')].map(e=>({text:e.innerText,rect:rect(e)}))})),
   markColors:[...document.querySelectorAll('.product-mark')].map(e=>getComputedStyle(e).backgroundColor),
   imageSources:[...document.images].map(e=>({src:e.getAttribute('src'),complete:e.complete,width:e.naturalWidth})),
   overflowElements:[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.left<-.5||r.right>innerWidth+.5)}).map(e=>({tag:e.tagName,class:e.getAttribute('class'),rect:rect(e)}))
  };
 });
 if(width!==780) await page.screenshot({path:path.join(out,variant+'-'+width+'.png'),fullPage:true});
 results.push({variant,width,status:response.status(),errors,failures,metrics});
 await page.close();
}
await fs.writeFile(path.join(out,process.argv[2]+'.json'),JSON.stringify(results,null,2));
console.log(JSON.stringify(results.map(r=>({variant:r.variant,width:r.width,status:r.status,overflow:r.metrics.overflow,errors:r.errors,failures:r.failures,nodeCounts:r.metrics.flows.map(f=>f.nodes.length),opportunities:r.metrics.flows.map(f=>f.opportunities)})),null,2));
await browser.close();

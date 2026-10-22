import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire('C:/Users/lee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/runtime.cjs');
const {chromium}=require('playwright');
const dir='opendesign/review/archbuddy-problem-order-20261015/selected-verification';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const report={checkedAt:new Date().toISOString(),cases:[]};
for(const variant of ['two','three'])for(const width of [1440,1024,390,360]){
const context=await browser.newContext({viewport:{width,height:width>1000?1000:844}});
const page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push('pageerror '+e.message));
page.on('console',m=>{if(m.type()==='error')errors.push('console '+m.text())});
page.on('response',r=>{if(r.status()>=400)errors.push('HTTP '+r.status()+' '+r.url())});
const response=await page.goto('http://127.0.0.1:8766/mockups/archbuddy-problem-options/?round=ring-qa#'+variant,{waitUntil:'networkidle'});await page.waitForTimeout(300);
const metrics=await page.evaluate(variant=>{
const s=document.querySelector('#panel-'+variant),rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom}};
const disc=s.querySelector('.ring-disc');
const steps=[...s.querySelectorAll('.ring-step')].map(e=>({text:e.textContent.trim(),r:rect(e)}));
const fractures=[...s.querySelectorAll('.ring-fracture')].map(e=>({text:e.textContent.trim(),r:rect(e)}));
const findings=[...s.querySelectorAll('.ring-finding')].map(e=>({id:e.querySelector('.finding-id').textContent.trim(),title:e.querySelector('h2').textContent.trim(),r:rect(e)}));
const track=s.querySelector('.ring-track-actual'),ideal=s.querySelector('.ring-track-ideal');
const overlaps=[];for(const a of [...s.querySelectorAll('.ring-step,.ring-fracture')])for(const b of [...s.querySelectorAll('.ring-step,.ring-fracture')]){if(a===b||a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_PRECEDING)continue;const x=a.getBoundingClientRect(),y=b.getBoundingClientRect();if(x.left<y.right&&x.right>y.left&&x.top<y.bottom&&x.bottom>y.top)overlaps.push(a.textContent.trim()+' × '+b.textContent.trim())}
return{documentWidth:document.documentElement.scrollWidth,viewport:innerWidth,section:rect(s),board:rect(s.querySelector('.ring-board')),disc:rect(disc),steps,fractures,findings,overlaps,center:s.querySelector('.ring-heart').textContent.trim(),trackBackground:getComputedStyle(track).backgroundImage,idealDisplay:getComputedStyle(ideal).display,visible:[...document.querySelectorAll('.variant')].filter(x=>!x.hidden).map(x=>x.id)};
},variant);
if([1440,390].includes(width))await page.locator('#panel-'+variant).screenshot({path:dir+'/ring-'+variant+'-'+width+'.png'});
report.cases.push({variant,width,status:response?.status(),...metrics,errors});await context.close();
}
await browser.close();await fs.writeFile(dir+'/ring-report.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report.cases.map(x=>({variant:x.variant,width:x.width,status:x.status,documentWidth:x.documentWidth,viewport:x.viewport,steps:x.steps.map(s=>s.text),fractures:x.fractures.map(f=>f.text),findings:x.findings.map(f=>f.id+':'+f.title),center:x.center,overlaps:x.overlaps,errors:x.errors,visible:x.visible})),null,2));

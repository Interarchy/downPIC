import {createRequire} from 'node:module';
import fs from 'node:fs';
const require=createRequire('C:/Users/lee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/runtime.cjs');
const {chromium}=require('playwright');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const results=[];
for(const [width,height] of [[1440,1000],[2436,1240],[768,1024],[390,844]]){
 const page=await browser.newPage({viewport:{width,height}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8766/mockups/archbuddy-showcase/#workflow',{waitUntil:'load'});
 await page.waitForTimeout(4300);
 await page.locator('#workflow').screenshot({path:'opendesign/review/archbuddy-centered-flow-20261023/local-'+width+'.png'});
 const data=await page.evaluate(()=>{
  const flow=document.querySelector('#workflow');
  const cards=[...flow.querySelectorAll('.ab-flow-node')].map(el=>{
   const b=el.getBoundingClientRect(),k=el.querySelector('.ab-flow-kicker').getBoundingClientRect(),h=el.querySelector('h3').getBoundingClientRect(),badge=el.querySelector('.ab-flow-badge')?.getBoundingClientRect();
   return{name:el.dataset.flowNode,width:b.width,height:b.height,kickerDelta:+((k.left+k.width/2)-(b.left+b.width/2)).toFixed(2),headingDelta:+((h.left+h.width/2)-(b.left+b.width/2)).toFixed(2),badgeDelta:badge?+((badge.left+badge.width/2)-(b.left+b.width/2)).toFixed(2):null};
  });
  return{story:document.querySelector('#story').dataset.step,overflow:document.documentElement.scrollWidth-innerWidth,cards,wireCount:flow.querySelectorAll('.ab-flow-wire').length,visibleWires:[...flow.querySelectorAll('.ab-flow-wire')].filter(e=>getComputedStyle(e).opacity>.85).length,upperLane:!!flow.querySelector('.ab-flow-lane-design'),captureLogo:!!flow.querySelector('.ab-flow-capture .ab-flow-badge img')};
 });
 results.push({width,height,errors,...data});await page.close();
}
await browser.close();
fs.writeFileSync('opendesign/review/archbuddy-centered-flow-20261023/local-check.json',JSON.stringify(results,null,2));
console.log(JSON.stringify(results.map(r=>({width:r.width,story:r.story,errors:r.errors,overflow:r.overflow,wires:r.visibleWires+'/'+r.wireCount,upperLane:r.upperLane,captureLogo:r.captureLogo,maxXDelta:Math.max(...r.cards.flatMap(c=>[Math.abs(c.kickerDelta),Math.abs(c.headingDelta),Math.abs(c.badgeDelta??0)]))}))));

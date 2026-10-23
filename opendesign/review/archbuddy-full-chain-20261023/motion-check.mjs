import { createRequire } from 'node:module';
const require=createRequire('C:/Users/lee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/runtime.cjs');
const {chromium}=require('playwright');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
await page.goto('http://127.0.0.1:8766/mockups/archbuddy-showcase/#workflow',{waitUntil:'load'});
await page.waitForTimeout(3500);
await page.evaluate(()=>{document.querySelector('#story').dataset.step='0'});
await page.waitForTimeout(100);
await page.evaluate(()=>{document.querySelector('#story').dataset.step='1'});
const snapshots=[];
for(const [label,wait] of [['upper',750],['handoff',700],['lower',1300]]){
 await page.waitForTimeout(wait);
 snapshots.push({label,...await page.evaluate(()=>({scheme:getComputedStyle(document.querySelector('[data-flow-node=scheme]')).opacity,library:getComputedStyle(document.querySelector('[data-flow-node=library]')).opacity,reverse:getComputedStyle(document.querySelector('[data-flow-node=reverse]')).opacity,generate:getComputedStyle(document.querySelector('[data-flow-node=generate]')).opacity,iterate:getComputedStyle(document.querySelector('[data-flow-node=iterate]')).opacity,upper:[...document.querySelectorAll('[data-lane=upper]')].map(x=>getComputedStyle(x).strokeDashoffset),lower:[...document.querySelectorAll('[data-lane=lower]')].map(x=>getComputedStyle(x).strokeDashoffset)}))});
}
console.log(JSON.stringify(snapshots));
await browser.close();

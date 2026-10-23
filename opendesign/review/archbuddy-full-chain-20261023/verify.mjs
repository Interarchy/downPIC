import { createRequire } from 'node:module';
import fs from 'node:fs';
const require=createRequire('C:/Users/lee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/runtime.cjs');
const {chromium}=require('playwright');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const results=[];
for (const [width,height] of [[1440,1000],[1920,1080],[390,844]]) {
 const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8766/mockups/archbuddy-showcase/#workflow',{waitUntil:'load'});
 await page.waitForTimeout(5000);
 const data=await page.evaluate(()=>{const map=document.querySelector('.ab-flow-map');const nodes=[...map.querySelectorAll('[data-flow-node]')].map(n=>({name:n.dataset.flowNode,box:n.getBoundingClientRect().toJSON(),opacity:getComputedStyle(n).opacity}));return{story:document.querySelector('#story').dataset.step,layout:document.body.dataset.storyLayout,map:map.getBoundingClientRect().toJSON(),nodes,wires:[...map.querySelectorAll('.ab-flow-wire')].map(n=>({lane:n.dataset.lane,d:n.getAttribute('d'),opacity:getComputedStyle(n).opacity})),scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth};});
 await page.screenshot({path:'opendesign/review/archbuddy-full-chain-20261023/local-'+width+'.png',fullPage:false});
 results.push({width,height,errors,...data});await page.close();
}
fs.writeFileSync('opendesign/review/archbuddy-full-chain-20261023/local-check.json',JSON.stringify(results,null,2));
await browser.close();
console.log(JSON.stringify(results.map(r=>({width:r.width,story:r.story,layout:r.layout,errors:r.errors,overflow:r.scrollWidth-r.clientWidth,nodeOpacity:r.nodes.map(n=>n.opacity)}))));

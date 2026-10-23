import { createRequire } from 'node:module';
const require=createRequire('C:/Users/lee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/runtime.cjs');
const {chromium}=require('playwright');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
for(const [w,h] of [[390,844],[768,1024],[2436,1240]]){
 const page=await browser.newPage({viewport:{width:w,height:h}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8766/mockups/archbuddy-showcase/#workflow',{waitUntil:'load'});
 await page.waitForTimeout(4200);
 await page.locator('#workflow').screenshot({path:'opendesign/review/archbuddy-full-chain-20261023/section-'+w+'.png'});
 const v=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth-innerWidth,flowHeight:document.querySelector('#workflow').scrollHeight,wireCount:document.querySelectorAll('.ab-flow-wire').length,layout:document.body.dataset.storyLayout}));
 console.log(JSON.stringify({width:w,errors,...v}));await page.close();
}
await browser.close();

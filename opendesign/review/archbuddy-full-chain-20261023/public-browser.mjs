import { createRequire } from 'node:module';
import fs from 'node:fs';
const require=createRequire('C:/Users/lee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/runtime.cjs');
const {chromium}=require('playwright');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const reports=[];
for(const [width,height] of [[1440,1000],[390,844]]){
 const page=await browser.newPage({viewport:{width,height}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('https://archbuddy-dev-showcase-dev-mel-d9guu8bpu44029179.webapps.tcloudbase.com/?v=full-chain-20261023#workflow',{waitUntil:'domcontentloaded'});
 await page.waitForTimeout(3800);
 const consent=page.getByRole('button',{name:'确定访问'});
 if(await consent.count())await consent.click();
 await page.waitForLoadState('load');
 await page.evaluate(()=>document.querySelector('a[href="#workflow"]')?.click());
 await page.waitForTimeout(4400);
 const result=await page.evaluate(()=>({title:document.querySelector('#workflow-title')?.textContent,step:document.querySelector('#story')?.dataset.step,nodes:[...document.querySelectorAll('#workflow [data-flow-node]')].map(e=>e.dataset.flowNode),wires:document.querySelectorAll('#workflow .ab-flow-wire').length,visibleWires:[...document.querySelectorAll('#workflow .ab-flow-wire')].filter(e=>getComputedStyle(e).opacity>0.85).length,overflow:document.documentElement.scrollWidth-innerWidth,chrome:document.querySelector('a[href*="chromewebstore.google.com"]')?.href,edge:document.querySelector('a[href*="microsoftedge.microsoft.com"]')?.href}));
 await page.screenshot({path:'opendesign/review/archbuddy-full-chain-20261023/public-'+width+'.png'});
 reports.push({width,height,errors,...result});await page.close();
}
await browser.close();
fs.writeFileSync('opendesign/review/archbuddy-full-chain-20261023/public-browser.json',JSON.stringify(reports,null,2));
console.log(JSON.stringify(reports));

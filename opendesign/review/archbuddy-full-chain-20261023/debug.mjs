import { createRequire } from 'node:module';
const require=createRequire('C:/Users/lee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/runtime.cjs');
const {chromium}=require('playwright');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const page=await browser.newPage({viewport:{width:768,height:1024}});
await page.goto('http://127.0.0.1:8766/mockups/archbuddy-showcase/#workflow',{waitUntil:'load'});
await page.waitForTimeout(4200);
async function status(label){console.log(label,await page.evaluate(()=>({step:document.querySelector('#story').dataset.step,playing:document.querySelector('.ab-flow-map').className,scrollY,section:document.querySelector('#workflow').getBoundingClientRect().top,wires:[...document.querySelectorAll('.ab-flow-wire')].map(x=>({opacity:getComputedStyle(x).opacity,offset:getComputedStyle(x).strokeDashoffset}))})));}
await status('before');
await page.locator('#workflow').screenshot({path:'opendesign/review/archbuddy-full-chain-20261023/debug-768.png'});
await status('after');
await page.waitForTimeout(3500);
await status('wait');
await page.screenshot({path:'opendesign/review/archbuddy-full-chain-20261023/debug-view-768.png'});
await browser.close();

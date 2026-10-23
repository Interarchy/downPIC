const {createRequire}=require('module');
const req=createRequire('C:/Users/lee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/runtime.cjs');
const {chromium}=req('playwright');
const fs=require('fs'),path=require('path');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const out=[];
 for(const [width,height] of [[1440,1000],[390,844],[1920,1080]]){
  const context=await browser.newContext({viewport:{width,height}}),page=await context.newPage();
  await page.goto('http://127.0.0.1:8766/mockups/archbuddy-showcase/?v=no-hero-edge-20261023',{waitUntil:'networkidle'});
  const snapshots=[];
  for(const n of [0,1,2,3,4,5,6,7]){
   if(n)await page.mouse.wheel(0,height*.54);
   await page.waitForTimeout(180);
   snapshots.push(await page.evaluate(()=>({scrollY,step:document.querySelector('#story').dataset.step,transition:document.querySelector('#story').dataset.transition,storyBottom:Math.round(document.querySelector('#story').getBoundingClientRect().bottom),conceptTop:Math.round(document.querySelector('#concept').getBoundingClientRect().top)})));
  }
  out.push({viewport:[width,height],snapshots});await context.close();
 }
 await browser.close();
 fs.writeFileSync(path.join(__dirname,'scroll-summary.json'),JSON.stringify(out,null,2));
 console.log(JSON.stringify(out));
})().catch(e=>{console.error(e);process.exit(1)});

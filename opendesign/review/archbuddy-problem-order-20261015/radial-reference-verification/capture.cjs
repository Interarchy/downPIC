const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('C:/Users/lee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
  const browser = await chromium.launch({channel:'chrome',headless:true});
  const output = [];
  for(const width of [1440,1024,390,360]){
    const context = await browser.newContext({viewport:{width,height:900},deviceScaleFactor:1});
    const page = await context.newPage();
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    const response=await page.goto('http://127.0.0.1:8766/mockups/archbuddy-problem-options/?round=6#three',{waitUntil:'networkidle'});
    await page.locator('#panel-three').waitFor({state:'visible'});
    await page.screenshot({path:path.join(__dirname,'page-'+width+'.png'),fullPage:true});
    await page.locator('.radial-layout').screenshot({path:path.join(__dirname,'radial-'+width+'.png')});
    const metrics=await page.evaluate(()=>{
      const rect=s=>{const e=document.querySelector(s);const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,left:r.left,right:r.right,top:r.top,bottom:r.bottom}};
      return {viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,board:rect('.radial-layout'),disc:rect('.radial-disc'),steps:[1,2,3,4,5].map(i=>({text:document.querySelector('.radial-step-'+i).innerText.replace(/\s+/g,' ').trim(),rect:rect('.radial-step-'+i)})),breaks:['a','b','c'].map(id=>({id,rect:rect('.radial-break-'+id)})),findings:Array.from(document.querySelectorAll('.radial-finding')).map(e=>e.innerText.replace(/\s+/g,' ').trim()),background:getComputedStyle(document.querySelector('.radial-layout')).backgroundColor,border:getComputedStyle(document.querySelector('.radial-layout')).border};
    });
    output.push({width,status:response.status(),errors,...metrics});
    await context.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(__dirname,'browser-metrics.json'),JSON.stringify(output,null,2));
  process.stdout.write(JSON.stringify(output.map(x=>({width:x.width,status:x.status,scrollWidth:x.scrollWidth,errors:x.errors,steps:x.steps.map(s=>s.text),breaks:x.breaks.map(b=>b.id),findings:x.findings})),null,2));
})().catch(e=>{console.error(e);process.exit(1)});

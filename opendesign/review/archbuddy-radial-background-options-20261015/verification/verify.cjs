const fs=require('node:fs'),path=require('node:path');
const {createRequire}=require('node:module');
const req=createRequire('C:/Users/lee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/runtime.cjs');
const {chromium}=req('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 const results=[],out=__dirname;
 for(const width of [1440,390,360]){
  const page=await browser.newPage({viewport:{width,height:1100},deviceScaleFactor:1});
  const errors=[],failed=[]; page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});page.on('requestfailed',r=>failed.push({url:r.url(),error:r.failure()}));
  for(const variant of ['one','two','three','four']){
   let response=await page.goto(`http://127.0.0.1:8766/mockups/archbuddy-radial-break-options/?round=11bverify#${variant}`,{waitUntil:'networkidle'});
   if(!response) response=await page.reload({waitUntil:'networkidle'});
   await page.screenshot({path:path.join(out,`${width}-${variant}.png`),fullPage:true});
   await page.locator('.radial-disc').screenshot({path:path.join(out,`${width}-${variant}-diagram.png`)});
   const metrics=await page.evaluate(()=>{
    const svg=document.querySelector('#ring-svg'), section=document.querySelector('.problem-section'), box=svg.getBoundingClientRect(), sb=section.getBoundingClientRect();
    const rect=r=>({x:r.x,y:r.y,width:r.width,height:r.height});
    const texts=[...svg.querySelectorAll('text')].map(t=>({class:t.getAttribute('class'),text:t.textContent,attr:t.getAttribute('font-size'),computed:getComputedStyle(t).fontSize,color:getComputedStyle(t).fill,bbox:rect(t.getBBox()),transform:t.getAttribute('transform'),characters:[...Array(t.getNumberOfChars())].map((_,i)=>rect(t.getExtentOfChar(i)))}));
    const stages=[...svg.querySelectorAll('.step-label')].map(t=>({text:t.textContent,paths:t.querySelectorAll('textPath').length,numberColor:getComputedStyle(t.querySelector('.step-number')).fill,numberBaseline:t.querySelector('.step-number').getAttribute('dy'),nameBaseline:t.querySelector('tspan:last-child').getAttribute('dy')}));
    const elements=[...document.querySelectorAll('.section-label,h1,.diagnosis h2,.diagnosis p,.diagnosis-id')].map(e=>({text:e.textContent,color:getComputedStyle(e).color,background:getComputedStyle(e).backgroundColor,font:getComputedStyle(e).fontSize}));
    return {viewport:innerWidth,scrollWidth:document.documentElement.scrollWidth,svgWidth:box.width,section:rect(sb),sectionBackground:getComputedStyle(section).backgroundColor,theme:section.dataset.theme,selected:[...document.querySelectorAll('[aria-pressed="true"]')].map(t=>t.dataset.option),sectorColors:[...svg.querySelectorAll('.sector')].map(e=>e.getAttribute('fill')),flowCount:svg.querySelectorAll('.flow').length,sectorCount:svg.querySelectorAll('.sector').length,breaks:svg.querySelectorAll('.break-group').length,halos:[...svg.querySelectorAll('.break-halo')].map(e=>({stroke:getComputedStyle(e).stroke,width:e.getAttribute('stroke-width')})),circles:svg.querySelectorAll('circle').length,stages,texts,elements};
   });
   results.push({width,variant,http:response.status(),errors:[...errors],failed:[...failed],...metrics});
  }
  await page.close();
 }
 const page=await browser.newPage({viewport:{width:1440,height:1100}}),interactions=[];
 await page.goto('http://127.0.0.1:8766/mockups/archbuddy-radial-break-options/?round=11bverify#one',{waitUntil:'networkidle'});
 async function record(action,expected){const actual=await page.evaluate(()=>({hash:location.hash,selected:document.querySelector('[aria-pressed="true"]').dataset.option,theme:document.querySelector('.problem-section').dataset.theme}));interactions.push({action,expected,...actual,pass:actual.hash==='#'+expected&&actual.selected===expected&&actual.theme===expected})}
 for(const v of ['two','three','four','one']){await page.locator(`[data-option="${v}"]`).click();await record('button '+v,v)}
 await page.locator('[data-option="one"]').press('ArrowLeft');await record('ArrowLeft wrap','four');
 await page.locator('[data-option="four"]').press('ArrowRight');await record('ArrowRight wrap','one');
 await page.locator('[data-option="one"]').press('End');await record('End','four');
 await page.locator('[data-option="four"]').press('Home');await record('Home','one');
 await page.locator('[data-option="one"]').press('ArrowRight');await record('ArrowRight','two');
 await page.locator('[data-option="two"]').press('ArrowLeft');await record('ArrowLeft','one');
 for(const v of ['two','three','four']){await page.evaluate(v=>location.hash=v,v);await page.waitForTimeout(50);await record('hash '+v,v)}
 fs.writeFileSync(path.join(out,'metrics.json'),JSON.stringify({created:new Date().toISOString(),results,interactions},null,2));
 console.log(JSON.stringify({scenes:results.length,screenshots:results.length*2,errors:results.filter(x=>x.errors.length||x.failed.length),overflow:results.filter(x=>x.scrollWidth>x.viewport),sectionNotFullWidth:results.filter(x=>x.section.x!==0||x.section.width!==x.width),interactions},null,2));
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
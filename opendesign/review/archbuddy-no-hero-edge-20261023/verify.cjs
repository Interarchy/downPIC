const {createRequire}=require('module');
const req=createRequire('C:/Users/lee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/runtime.cjs');
const {chromium}=req('playwright');
const fs=require('fs'),path=require('path');
const out=__dirname;
const url='http://127.0.0.1:8766/mockups/archbuddy-showcase/?v=no-hero-edge-20261023';
(async()=>{
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const results=[];
  for(const [width,height] of [[1440,1000],[390,844],[1920,1080]]){
    const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1});
    const page=await context.newPage();
    const errors=[],badResponses=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
    page.on('response',r=>{if(r.status()>=400)badResponses.push({url:r.url(),status:r.status()})});
    const response=await page.goto(url,{waitUntil:'networkidle'});
    await page.waitForTimeout(600);
    await page.screenshot({path:path.join(out,`${width}-opening.png`)});
    const result={viewport:[width,height],status:response.status(),opening:await page.evaluate(()=>({scrollY,firstSection:document.querySelector('main section, #story section')?.id,storyTop:document.querySelector('#story').getBoundingClientRect().top,step:document.querySelector('#story').dataset.step,storyLayout:document.body.dataset.storyLayout,heroCount:document.querySelectorAll('.hero-section,#hero').length}))};
    if(width>=1100){
      for(const step of [0,1]){
        await page.locator(`[data-story-step="${step}"]`).click();
        await page.waitForTimeout(1000);
        result[`story${step}`]=await page.evaluate(()=>({step:document.querySelector('#story').dataset.step,transition:document.querySelector('#story').dataset.transition,scrollY}));
        await page.screenshot({path:path.join(out,`${width}-story-${step+1}.png`)});
      }
    } else {
      await page.locator('#workflow').evaluate(el=>window.scrollTo({top:el.getBoundingClientRect().top+scrollY-90,behavior:'instant'}));
      await page.waitForTimeout(900);
      result.story1=await page.evaluate(()=>({step:document.querySelector('#story').dataset.step,transition:document.querySelector('#story').dataset.transition,scrollY}));
      await page.screenshot({path:path.join(out,`${width}-story-2.png`)});
    }
    for(const id of ['concept','features','install']){
      await page.locator('#'+id).evaluate(el=>window.scrollTo({top:el.getBoundingClientRect().top+scrollY-85,behavior:'instant'}));
      await page.waitForTimeout(1100);
      await page.locator('#'+id).screenshot({path:path.join(out,`${width}-${id}.png`)});
    }
    result.check=await page.evaluate(()=>{
      const cs=s=>getComputedStyle(document.querySelector(s));
      const section=id=>{const r=document.querySelector('#'+id).getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height}};
      return {scrollWidth:document.documentElement.scrollWidth,innerWidth,sections:Object.fromEntries(['story','concept','features','install'].map(id=>[id,section(id)])),conceptColors:{foundation:cs('.creation-storage').backgroundColor,foundationIcon:cs('.creation-storage .icon').color,foundationText:cs('.creation-storage').color},featuresColors:{asset:cs('.asset-support').backgroundColor,assetIcon:cs('.asset-support .feature-title .icon').color},installLinks:[...document.querySelectorAll('#install .download-options a')].map(a=>({text:a.textContent.trim(),href:a.href})),installText:document.querySelector('#install').innerText,conceptText:document.querySelector('#concept').innerText,brokenImages:[...document.images].filter(i=>i.id!=='dialog-image'&&(!i.complete||!i.naturalWidth)).map(i=>i.src),overflow:[...document.querySelectorAll('body *')].filter(el=>{const r=el.getBoundingClientRect();return r.width>0&&(r.left<-2||r.right>innerWidth+2)&&getComputedStyle(el).position!=='fixed'}).slice(0,30).map(el=>({tag:el.tagName,id:el.id,className:typeof el.className==='string'?el.className:''}))};
    });
    result.errors=errors;result.badResponses=badResponses;
    results.push(result);
    fs.writeFileSync(path.join(out,'check-summary.json'),JSON.stringify(results,null,2));
    await context.close();
    console.log(`${width} complete`);
  }
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});

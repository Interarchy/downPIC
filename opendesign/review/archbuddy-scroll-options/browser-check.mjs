import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire('C:/Users/lee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/runtime.cjs');
const {chromium}=require('playwright');
const root='opendesign/review/archbuddy-scroll-options';
const base='http://127.0.0.1:8766/mockups/archbuddy-scroll-options/';
const browser=await chromium.launch({headless:true,channel:'chrome'});
const report={generated:new Date().toISOString(),scope:'仅本地三动效预览；独立无头Chrome临时上下文，未部署、安装插件或调用模型',cases:[],errors:[]};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const absoluteTopCode=el=>{let y=0;while(el){y+=el.offsetTop;el=el.offsetParent;}return y;};
try{
for(const width of [1440,390])for(const mode of ['reveal','focus','chapter']){
 const page=await browser.newPage({viewport:{width,height:width===1440?1000:844},deviceScaleFactor:1});const pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));
 const response=await page.goto(base+'?motion='+mode,{waitUntil:'load'});await pause(250);
 const entry=await page.evaluate(()=>({mode:document.body.dataset.motion,headings:document.querySelectorAll('.motion-heading').length,stages:document.querySelectorAll('.motion-stage').length,width:document.documentElement.scrollWidth,viewport:innerWidth}));
 const item={width,mode,httpStatus:response.status(),entry,chapters:[],checks:[],pageErrors};report.cases.push(item);
 if(entry.headings!==5||entry.stages!==5||entry.mode!==mode)throw new Error('动效初始化不完整: '+JSON.stringify(item));
 const chapters=await page.evaluate(()=>[...document.querySelectorAll('.motion-heading')].map(e=>({text:e.textContent.trim(),id:e.querySelector('h2')?.id,section:e.closest('section').className})));
 for(let i=0;i<5;i++){
  const heading=page.locator('.motion-heading').nth(i);const y=await heading.evaluate(absoluteTopCode);await page.evaluate(y=>scrollTo({top:y-120,behavior:'instant'}),y);await pause(mode==='reveal'?1000:100);
  await page.mouse.move(width-50,350);const before=await page.evaluate(()=>scrollY);await page.mouse.wheel(0,160);await pause(150);const after=await page.evaluate(()=>scrollY);
  const data=await page.evaluate(i=>{const h=document.querySelectorAll('.motion-heading')[i],s=document.querySelectorAll('.motion-stage')[i];const hr=h.getBoundingClientRect(),sr=s.getBoundingClientRect(),header=document.querySelector('.site-header').getBoundingClientRect(),cs=getComputedStyle(h),ss=getComputedStyle(s);return {text:h.textContent.trim(),headingTop:hr.top,headingBottom:hr.bottom,stageTop:sr.top,headerBottom:header.bottom,headingOpacity:cs.opacity,stageOpacity:ss.opacity,headingPosition:cs.position,stageTransform:ss.transform,width:document.documentElement.scrollWidth,viewport:innerWidth,headingHeight:hr.height,stageHeight:sr.height};},i);
  item.chapters.push({index:i+1,...chapters[i],...data,nativeWheelDelta:after-before});
  await page.screenshot({path:root+'/'+mode+'-'+width+'-chapter-'+(i+1)+'.png'});
  if(data.width>width||data.headingOpacity==='0'||data.stageOpacity==='0')item.checks.push({name:'章节可读/无横溢出 '+(i+1),pass:false});
  else item.checks.push({name:'章节可读/无横溢出 '+(i+1),pass:true});
 }
 // Mode switch and replay are actual button clicks.
 await page.locator('[data-motion-option="focus"]').click();await pause(750);item.switchToFocus=await page.evaluate(()=>({mode:document.body.dataset.motion,query:new URL(location.href).searchParams.get('motion'),pressed:document.querySelector('[data-motion-option="focus"]').getAttribute('aria-pressed'),y:scrollY}));
 await page.evaluate(()=>scrollTo({top:document.body.scrollHeight,behavior:'instant'}));await pause(100);const bottomY=await page.evaluate(()=>scrollY);await page.locator('#motion-replay').click();await pause(800);const replayY=await page.evaluate(()=>scrollY);item.replay={before:bottomY,after:replayY,pass:replayY<bottomY};
 // Focus forward and backward progress for the same chapter body.
 const stage=page.locator('.motion-stage').nth(1),stageY=await stage.evaluate(absoluteTopCode),vh=await page.evaluate(()=>innerHeight);
 const metrics=[];for(const offset of [.87,.5,.87]){await page.evaluate(y=>scrollTo({top:y,behavior:'instant'}),stageY-vh*offset);await pause(100);metrics.push(await stage.evaluate(e=>({opacity:getComputedStyle(e).opacity,transform:getComputedStyle(e).transform,y:scrollY})));}item.focusReverse=metrics;
 // Original navigation still uses standard anchors. Download is not triggered.
 await page.locator('.site-header a[href="#install"]').click();await pause(800);item.installAnchor=await page.evaluate(()=>({hash:location.hash,heading:document.getElementById('install-title').getBoundingClientRect().top,header:document.querySelector('.site-header').getBoundingClientRect().bottom}));
 // Existing hero dialog opens/closes without touching download links.
 await page.locator('.brand').click();await pause(800);await page.locator('[data-enlarge="hero-image"]').click();item.dialogOpen=await page.locator('#image-dialog').evaluate(e=>e.open);await page.locator('[data-close-dialog]').click();item.dialogClosed=await page.locator('#image-dialog').evaluate(e=>!e.open);
 item.finalWidth=await page.evaluate(()=>document.documentElement.scrollWidth);await page.close();
}
}catch(e){report.errors.push(String(e));}
finally{await browser.close();await fs.writeFile(root+'/check-summary.json',JSON.stringify(report,null,2));}
console.log(JSON.stringify({cases:report.cases.length,errors:report.errors,pageErrors:report.cases.flatMap(c=>c.pageErrors),failed:report.cases.flatMap(c=>c.checks).filter(c=>!c.pass)},null,2));

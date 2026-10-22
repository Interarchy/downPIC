import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire('C:/Users/lee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/runtime.cjs');
const {chromium}=require('playwright');
const out='opendesign/review/archbuddy-selected-publish-20261016/verification';
const base=process.env.SELECTED_PUBLIC_URL||'http://127.0.0.1:8766/mockups/archbuddy-showcase/?v=selected-workflows-20261016';
const kind=process.env.SELECTED_PUBLIC_URL?'public':'local';
const widths=kind==='public'?[1440,390]:[1440,390,360];
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const report={generated:new Date().toISOString(),scope:kind,base,cases:[],failures:[]};
const check=(yes,text)=>{if(!yes)report.failures.push(text);};
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
try {
for(const width of widths){
 const context=await browser.newContext({viewport:{width,height:width===1440?1000:844}});
 const page=await context.newPage();
 const c={width,errors:[],consoleErrors:[],failedRequests:[],httpErrors:[],documents:[],chapters:[]};report.cases.push(c);
 page.on('pageerror',e=>c.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')c.consoleErrors.push(m.text());});
 page.on('requestfailed',r=>c.failedRequests.push({url:r.url(),error:r.failure()?.errorText}));
 page.on('response',r=>{if(r.request().resourceType()==='document')c.documents.push({url:r.url(),status:r.status(),type:r.headers()['content-type'],disposition:r.headers()['content-disposition']||null});if(r.status()>=400)c.httpErrors.push({url:r.url(),status:r.status()});});
 const initial=await page.goto(base,{waitUntil:'load'});c.initialHttp=initial.status();await pause(200);
 if(kind==='public'&&await page.getByRole('button',{name:/确定访问/}).count()){
   c.platformWarning=true;await pause(3300);await page.getByText('确定访问',{exact:true}).click();await page.waitForLoadState('load');await pause(500);
   c.platformConsoleErrors=[...c.consoleErrors];c.consoleErrors=[];c.platformHttpErrors=[...c.httpErrors];c.httpErrors=[];
 }
 await page.waitForSelector('#workflow .ab-workflow-chart');await page.waitForFunction(()=>document.querySelectorAll('#problem .sector').length===5&&document.querySelectorAll('#workflow .ab-workflow-node').length===8);await page.evaluate(()=>document.fonts.ready);
 c.init=await page.evaluate(()=>({motion:document.body.dataset.motion,parts:document.querySelectorAll('.motion-part').length,headings:document.querySelectorAll('.motion-heading').length,stages:document.querySelectorAll('.motion-stage').length,overflow:document.documentElement.scrollWidth-innerWidth,brand:document.querySelector('.brand img').getAttribute('src'),heroRight:document.querySelector('.hero-visual').getBoundingClientRect().right,downloadRight:document.querySelector('.header-download').getBoundingClientRect().right,comparisonControls:document.querySelectorAll('[data-motion-option],[data-option],.option-tabs').length,initialParts:[...document.querySelectorAll('.motion-part')].map(e=>({reveal:e.classList.contains('is-revealed'),opacity:getComputedStyle(e).opacity}))}));
 check(c.init.motion==='reveal'&&c.init.parts===10&&c.init.headings===5&&c.init.stages===5,width+' chapter setup');check(c.init.overflow===0,width+' init overflow');check(c.init.comparisonControls===0,width+' comparison controls');
 if(width===1440)await page.screenshot({path:out+'/'+kind+'-'+width+'-hero.png'});
 for(const id of ['problem','workflow','concept','features','install']){
   await page.locator('#'+id+' .motion-heading').evaluate(e=>window.scrollTo(0,e.getBoundingClientRect().top+window.scrollY-150));await pause(950);
   await page.locator('#'+id+' .motion-stage').evaluate(e=>window.scrollTo(0,e.getBoundingClientRect().top+window.scrollY-250));await pause(950);
   const state=await page.locator('#'+id).evaluate(e=>({id:e.id,heading:getComputedStyle(e.querySelector('.motion-heading')).opacity,stage:getComputedStyle(e.querySelector('.motion-stage')).opacity,revealed:[...e.querySelectorAll('.motion-part')].every(x=>x.classList.contains('is-revealed')),overflow:document.documentElement.scrollWidth-innerWidth}));c.chapters.push(state);check(state.heading==='1'&&state.stage==='1'&&state.revealed,width+' '+id+' reveal');check(state.overflow===0,width+' '+id+' overflow');
   if(['problem','workflow'].includes(id)&&width!==360)await page.locator('#'+id).screenshot({path:out+'/'+kind+'-'+width+'-'+id+'.png',timeout:15000});
 }
 c.diagram=await page.evaluate(()=>{
   const rgba='rgb(255, 175, 69)';const styles=(selector,prop)=>[...document.querySelectorAll(selector)].map(e=>getComputedStyle(e)[prop]);
   const nodeIssues=[];for(const node of document.querySelectorAll('.ab-workflow-node')){const b=node.getBoundingClientRect();for(const e of node.querySelectorAll('h4,.ab-workflow-mark,.ab-workflow-note')){const x=e.getBoundingClientRect();if(x.left<b.left-.5||x.right>b.right+.5||x.top<b.top-.5||x.bottom>b.bottom+.5)nodeIssues.push({node:node.dataset.node,text:e.textContent.trim(),b:{l:b.left,r:b.right,t:b.top,bt:b.bottom},x:{l:x.left,r:x.right,t:x.top,bt:x.bottom}});}}
   const charts=[...document.querySelectorAll('.ab-workflow-chart')].map(e=>({flow:e.dataset.flow,nodes:e.querySelectorAll('.ab-workflow-node').length,marks:e.querySelectorAll('.ab-workflow-mark').length,edges:[...e.querySelectorAll('[data-edge]')].map(x=>x.dataset.edge),titles:[...e.querySelectorAll('h4')].map(x=>x.textContent),labels:[...e.querySelectorAll('.ab-workflow-edge-label')].map(x=>x.textContent),width:e.clientWidth,height:e.clientHeight}));
   return{sectors:document.querySelectorAll('#problem .sector').length,breaks:document.querySelectorAll('#problem .break-group').length,stages:[...document.querySelectorAll('#problem .step-label')].map(e=>e.textContent),center:[...document.querySelectorAll('#problem .center-title')].map(e=>e.textContent),breakFills:styles('#problem .break-shape','fill'),flowStrokes:styles('#problem .flow','stroke'),diagnosisColors:styles('#problem .diagnosis h3','color'),markFills:styles('#workflow .ab-workflow-mark','backgroundColor'),wireStrokes:styles('#workflow .ab-workflow-wire','stroke'),arrowStrokes:styles('#workflow .ab-workflow-arrow','stroke'),charts,nodeIssues,manual:document.querySelector('.ab-workflow-manual').textContent,external:document.querySelector('.ab-workflow-external').textContent};
 });
 const d=c.diagram;check(d.sectors===5&&d.breaks===3,width+' five stages three breaks');for(const k of ['breakFills','flowStrokes','diagnosisColors','markFills','wireStrokes','arrowStrokes'])check(d[k].length>0&&d[k].every(x=>x==='rgb(255, 175, 69)'),width+' amber '+k);check(d.nodeIssues.length===0,width+' node content bounds');check(d.charts[0].nodes===3&&d.charts[0].marks===2&&d.charts[1].nodes===5&&d.charts[1].marks===4,width+' product roles');check(d.manual.includes('由设计师完成')&&d.external.includes('外部工具完成')&&d.external.includes('ArchBuddy 未介入'),width+' manual external boundaries');check(d.charts.every(x=>x.edges.includes('library-capture'))&&d.charts[1].edges.includes('iterate-generate')&&d.charts[1].edges.includes('generate-iterate'),width+' loops');
 await page.evaluate(()=>scrollTo(0,0));await pause(900);c.backscroll=await page.evaluate(()=>[...document.querySelectorAll('.motion-part')].map(e=>({reveal:e.classList.contains('is-revealed'),opacity:getComputedStyle(e).opacity})));check(c.backscroll.every(x=>x.reveal&&x.opacity==='1'),width+' no replay');
 if(width!==360){
   await page.locator('.site-header a[href="#features"]').click();await pause(900);c.nav=await page.evaluate(()=>({hash:location.hash,top:document.getElementById('features-title').getBoundingClientRect().top,headerBottom:document.querySelector('.site-header').getBoundingClientRect().bottom}));check(c.nav.hash==='#features',width+' navigation');
   c.gallery=[];for(const gallery of ['prompt','assets']){const img=page.locator('#'+gallery+'-image');for(const n of [1,0]){await page.locator('[data-gallery="'+gallery+'"] [data-variant="'+n+'"]').click();await img.evaluate(e=>e.decode());c.gallery.push({gallery,n,src:await img.getAttribute('src')});}}
   await page.locator('.brand').click();await pause(900);await page.locator('[data-enlarge="hero-image"]').click();c.dialogOpen=await page.locator('#image-dialog').evaluate(e=>e.open);await page.locator('[data-close-dialog]').click();c.dialogClosed=await page.locator('#image-dialog').evaluate(e=>!e.open);check(c.dialogOpen&&c.dialogClosed,width+' image dialog');
 }
 c.links=await page.evaluate(()=>({chrome:[...document.querySelectorAll('a')].filter(e=>e.textContent.includes('下载 Chrome 插件')).map(e=>({text:e.textContent.trim(),href:e.href,download:e.hasAttribute('download')})),testset:[...document.querySelectorAll('a')].filter(e=>e.textContent.includes('下载图片测试集')).map(e=>({href:e.getAttribute('href'),download:e.getAttribute('download')})),steps:[...document.querySelectorAll('.install-steps h3')].map(e=>e.textContent.trim()),overflow:document.documentElement.scrollWidth-innerWidth}));
 check(c.links.chrome.length===2&&c.links.chrome.every(x=>x.href==='https://chromewebstore.google.com/detail/archbuddy/hkbnjlapflleibeodhghbephgpacbhle?authuser=0&hl=zh-CN'&&!x.download),width+' store links');check(c.links.testset.length===2&&c.links.testset.every(x=>x.href==='downloads/ArchBuddy-test-images.7z'&&x.download==='ArchBuddy测试集.7z'),width+' testset links');
 check(c.errors.length===0&&c.consoleErrors.length===0&&c.httpErrors.length===0&&c.failedRequests.length===0,width+' browser resources');
 await context.close();
}
}catch(e){report.failures.push(String(e));}
finally{await browser.close();await fs.writeFile(out+'/'+kind+'-summary.json',JSON.stringify(report,null,2));}
console.log(JSON.stringify({scope:kind,cases:report.cases.map(c=>({width:c.width,errors:c.errors,consoleErrors:c.consoleErrors,failedRequests:c.failedRequests,httpErrors:c.httpErrors,nodeIssues:c.diagram?.nodeIssues})),failures:report.failures},null,2));

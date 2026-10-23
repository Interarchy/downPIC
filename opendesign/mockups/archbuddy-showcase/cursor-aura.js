(() => {
'use strict';
const selector='.abhero,.site-header,.site-film-pin,.story-chapter,#problem,#workflow,#concept,#features,#install,.site-footer,.sticky-stage,.film-shell,.chapter-intro,.viewer,.film';
const surfaces=new Map();
for(const host of document.querySelectorAll(selector)){
 host.dataset.ambientSurface='';
 if(getComputedStyle(host).position==='static')host.dataset.ambientPosition='relative';
 if(host.matches('.story-chapter,#concept,#features'))host.dataset.ambientTone='light';
 let backdrop=host.querySelector(':scope > .hero-light');
 if(!backdrop){
  backdrop=document.createElement('div');backdrop.setAttribute('aria-hidden','true');
  backdrop.innerHTML='<span class="ambient-field ambient-field--west"></span><span class="ambient-field ambient-field--east"></span>';
  host.prepend(backdrop);
 }
 backdrop.classList.add('ambient-backdrop');
 surfaces.set(host,Array.from(backdrop.querySelectorAll('.ambient-field')));
}
const supported=matchMedia('(hover:hover) and (pointer:fine) and (prefers-reduced-motion:no-preference)');
const clamp=n=>Math.max(0,Math.min(1,n));
const origin=location.origin;
let frame=0,pending=null,active=new Set();
function relay(data,x,y,root=document){
 for(const child of root.querySelectorAll('iframe')){
  if(!child.getAttribute('src')||!child.contentWindow)continue;
  if(data.reset){child.contentWindow.postMessage(data,origin);continue;}
  const style=getComputedStyle(child);
  if(style.visibility==='hidden'||style.display==='none'||Number(style.opacity)===0)continue;
  const rect=child.getBoundingClientRect();
  if(!rect.width||!rect.height||x<rect.left||x>rect.right||y<rect.top||y>rect.bottom)continue;
  child.contentWindow.postMessage({type:'archbuddy-background-light',u:clamp((x-rect.left)/rect.width),v:clamp((y-rect.top)/rect.height)},origin);
 }
}
function paint(){
 frame=0;
 if(!pending||!supported.matches||document.hidden)return;
 const {x,y,target,remote}=pending;pending=null;
 const next=new Set();
 for(const [host,layers] of surfaces){
  if(!remote&&!host.contains(target))continue;
  const rect=host.getBoundingClientRect();
  if(!rect.width||!rect.height||x<rect.left||x>rect.right||y<rect.top||y>rect.bottom)continue;
  const u=clamp((x-rect.left)/rect.width),v=clamp((y-rect.top)/rect.height);
  layers[0].style.opacity=(.38+(1-u)*.28+(1-v)*.04).toFixed(3);
  layers[1].style.opacity=(.38+u*.28+v*.04).toFixed(3);
  next.add(host);
 }
 for(const host of active)if(!next.has(host))for(const layer of surfaces.get(host))layer.style.opacity='';
 active=next;
 relay({type:'archbuddy-background-light'},x,y);
}
function queue(value){pending=value;if(!frame)frame=requestAnimationFrame(paint);}
function reset(){
 cancelAnimationFrame(frame);frame=0;pending=null;
 for(const host of active)for(const layer of surfaces.get(host))layer.style.opacity='';
 active.clear();
 relay({type:'archbuddy-background-light',reset:true});
}
document.addEventListener('pointermove',event=>{
 if(event.pointerType!=='mouse'||!supported.matches||document.hidden)return;
 queue({x:event.clientX,y:event.clientY,target:event.target,remote:false});
},{passive:true});
window.addEventListener('message',event=>{
 const data=event.data;
 if(window.parent===window||event.source!==window.parent||event.origin!==origin||data?.type!=='archbuddy-background-light')return;
 if(data.reset){reset();return;}
 if(!supported.matches||document.hidden||!Number.isFinite(data.u)||!Number.isFinite(data.v))return;
 queue({x:clamp(data.u)*innerWidth,y:clamp(data.v)*innerHeight,remote:true});
});
document.addEventListener('pointerleave',reset);
window.addEventListener('scroll',reset,{passive:true});
window.addEventListener('resize',reset,{passive:true});
window.addEventListener('blur',reset);
document.addEventListener('visibilitychange',()=>{if(document.hidden)reset();});
supported.addEventListener('change',reset);
})();

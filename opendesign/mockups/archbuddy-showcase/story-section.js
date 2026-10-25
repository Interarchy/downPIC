(() => {
'use strict';
const body=document.body,chapter=document.getElementById('story'),pin=chapter.querySelector('.story-pin'),shell=chapter.querySelector('.story-shell');
const panels=[document.getElementById('problem'),document.getElementById('workflow')];
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const clamp=x=>Math.max(0,Math.min(1,x));
const ease=x=>x*x*(3-2*x);
const rootTop=element=>{let top=0;while(element){top+=element.offsetTop;element=element.offsetParent;}return top;};
let pinned=false,span=0,start=0,top=0,stage=0,scale=1,heights=[],scheduled=false,resizeTimer;
function clearPanels(){panels.forEach(p=>{p.style.transform='';p.style.opacity='';p.style.clipPath='';p.style.zIndex='';p.inert=false;p.removeAttribute('aria-hidden');});shell.style.transform='';}
function layout(){
  body.style.removeProperty('--story-panel-height');
  const headerHeight=document.querySelector('.site-header').offsetHeight;
  const available=innerHeight-headerHeight-58;
  stage=innerWidth>=1800&&innerHeight>=1050?Math.min(860,available):Math.min(800,available);
  top=headerHeight+16+Math.max(0,(available-stage)/2);
  body.style.setProperty('--story-top',top+'px');body.style.setProperty('--story-stage',Math.max(400,stage)+'px');
  pinned=!reduced.matches&&innerWidth>=1100&&innerHeight>=760;
  body.dataset.storyLayout=pinned?'pinned':'natural';chapter.style.height='';clearPanels();
  window.dispatchEvent(new Event('story-layout'));
  heights=panels.map(p=>p.offsetHeight);
  if(pinned){const commonHeight=Math.max(stage,...heights);body.style.setProperty('--story-panel-height',commonHeight+'px');heights=[commonHeight,commonHeight];scale=Math.min(1,stage/commonHeight);}
  else scale=1;
  if(pinned&&scale<.9){pinned=false;body.dataset.storyLayout='natural';body.style.removeProperty('--story-panel-height');window.dispatchEvent(new Event('story-layout'));heights=panels.map(p=>p.offsetHeight);scale=1;}
  if(pinned){span=Math.max(1550,innerHeight*1.8);const style=getComputedStyle(chapter);chapter.style.height=(pin.offsetHeight+span*.91+parseFloat(style.paddingTop)+parseFloat(style.paddingBottom))+'px';start=rootTop(chapter)+parseFloat(style.paddingTop)-top;}
  paint();
}
function animateProblem(progress){
  const staged=!reduced.matches;
  ['A','B','C'].forEach((id,index)=>{
    const begin=index===0?-.18:.015+index*.14;
    const pop=staged?ease(clamp((progress-begin)/.075)):1;
    const reveal=staged?ease(clamp((progress-begin-.065)/.085)):1;
    const group=panels[0].querySelector('.break-group[data-break="'+id+'"]');
    const item=panels[0].querySelector('.diagnosis[data-story-break="'+id+'"]');
    if(group){
      const x=Number(group.dataset.originX),y=Number(group.dataset.originY);
      const angle=Number(group.dataset.angle)*Math.PI/180;
      const reach=9*Number(group.dataset.scale)*pop,size=.88+.18*pop;
      const dx=Math.sin(angle)*reach,dy=-Math.cos(angle)*reach;
      group.setAttribute('transform','translate('+dx.toFixed(2)+' '+dy.toFixed(2)+') translate('+x+' '+y+') scale('+size.toFixed(3)+') translate('+(-x)+' '+(-y)+')');
    }
    if(item){item.style.opacity=String(reveal);item.style.clipPath='inset(0 '+(100*(1-reveal)).toFixed(1)+'% 0 0)';item.style.transform='translateY('+(12*(1-reveal)).toFixed(1)+'px)';}
  });
}
function paint(){
  scheduled=false;
  if(pinned){
    const p=clamp((scrollY-start)/span),t=ease(clamp((p-.46)/.36));
    animateProblem(p);
    const entry=ease(clamp((innerHeight-chapter.getBoundingClientRect().top)/(innerHeight-top)));
    const y=heights.map(h=>Math.max(0,(stage-h*scale)/2));
    panels[0].style.zIndex='1';panels[1].style.zIndex='2';
    panels[0].style.transform='translate3d('+(-100*t)+'%,'+y[0]+'px,0) scale('+scale+')';
    panels[1].style.transform='translate3d('+(100*(1-t))+'%,'+y[1]+'px,0) scale('+scale+')';
    panels.forEach(panel=>panel.style.opacity='1');
    shell.style.transform='translateY('+(18*(1-entry))+'px) scale('+(.985+.015*entry)+')';
    const current=t>=.5?1:0;chapter.dataset.step=String(current);chapter.dataset.transition=t.toFixed(4);
    panels.forEach((panel,i)=>{panel.inert=i!==current;panel.setAttribute('aria-hidden',String(i!==current));});
  }else{
    let current=0;
    panels.forEach((panel,i)=>{const rect=panel.getBoundingClientRect();const t=ease(clamp((innerHeight*.95-rect.top)/(innerHeight*.4)));if(rect.top<innerHeight*.55)current=i;panel.style.opacity=reduced.matches?'1':String(.45+.55*t);panel.style.transform=reduced.matches?'none':'translateX('+((i===0?-1:1)*24*(1-t))+'px)';});
    const rect=panels[0].getBoundingClientRect();animateProblem(clamp((innerHeight*.84-rect.top)/Math.max(520,Math.min(rect.height,innerHeight)*.9)));
    chapter.dataset.step=String(current);chapter.dataset.transition=String(current);
  }
}
function requestPaint(){if(!scheduled){scheduled=true;requestAnimationFrame(paint);}}
function goStep(step,behavior='smooth'){
  const target=pinned?start+span*(step===0?.44:.9):rootTop(panels[step])-top;
  scrollTo({top:Math.max(0,target),behavior:reduced.matches?'instant':behavior});
}
document.querySelectorAll('a[href="#workflow"],a[href="#problem"]').forEach(a=>a.addEventListener('click',event=>{event.preventDefault();history.replaceState(null,'',a.hash);goStep(a.hash==='#workflow'?1:0);}));
window.addEventListener('hashchange',()=>{if(location.hash==='#workflow')goStep(1);else if(location.hash==='#problem')goStep(0);});
window.addEventListener('scroll',requestPaint,{passive:true});
window.addEventListener('problem-ring-rendered',requestPaint);
window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(layout,80);},{passive:true});
window.addEventListener('load',()=>{layout();if(location.hash==='#workflow')goStep(1,'instant');else if(location.hash==='#problem')goStep(0,'instant');},{once:true});
reduced.addEventListener('change',layout);
layout();
})();

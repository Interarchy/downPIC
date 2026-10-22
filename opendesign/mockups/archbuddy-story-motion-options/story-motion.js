(() => {
'use strict';
const modes=['relay','focus','rail'];
const body=document.body,chapter=document.getElementById('story'),pin=chapter.querySelector('.story-pin'),shell=chapter.querySelector('.story-shell');
const panels=[document.getElementById('problem'),document.getElementById('workflow')];
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const clamp=x=>Math.max(0,Math.min(1,x));
const ease=x=>x*x*(3-2*x);
const rootTop=element=>{let top=0;while(element){top+=element.offsetTop;element=element.offsetParent;}return top;};
let mode='relay',pinned=false,span=0,start=0,top=0,stage=0,scale=1,heights=[],scheduled=false,resizeTimer;
function clearPanels(){panels.forEach(p=>{p.style.transform='';p.style.opacity='';p.style.clipPath='';p.style.zIndex='';p.inert=false;p.removeAttribute('aria-hidden');});shell.style.transform='';}
function layout(){
  top=document.querySelector('.preview-controls').offsetHeight+document.querySelector('.site-header').offsetHeight+16;
  stage=innerHeight-top-42;
  body.style.setProperty('--story-top',top+'px');body.style.setProperty('--story-stage',Math.max(400,stage)+'px');
  pinned=!reduced.matches&&innerWidth>=1100&&innerHeight>=760;
  body.dataset.storyLayout=pinned?'pinned':'natural';chapter.style.height='';clearPanels();
  window.dispatchEvent(new Event('story-layout'));
  heights=panels.map(p=>p.offsetHeight);scale=Math.min(1,(stage-2)/Math.max(...heights));
  if(pinned&&scale<.9){pinned=false;body.dataset.storyLayout='natural';window.dispatchEvent(new Event('story-layout'));heights=panels.map(p=>p.offsetHeight);scale=1;}
  if(pinned){span=mode==='relay'?Math.max(1550,innerHeight*1.8):Math.max(1100,innerHeight*1.55);const style=getComputedStyle(chapter);chapter.style.height=(pin.offsetHeight+span+parseFloat(style.paddingTop)+parseFloat(style.paddingBottom))+'px';start=rootTop(chapter)+parseFloat(style.paddingTop)-top;}
  paint();
}
function activeStep(step,progress){
  chapter.dataset.step=String(step);chapter.style.setProperty('--story-progress',progress.toFixed(4));
  document.querySelectorAll('[data-story-step]').forEach(button=>{if(Number(button.dataset.storyStep)===step)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');});
  chapter.querySelector('.story-progress-track i').style.transform='scaleX('+progress+')';
  chapter.querySelector('.rail-connector span').style.transform='scaleY('+progress+')';
}
function animateProblem(progress){
  const staged=mode==='relay'&&!reduced.matches;
  ['A','B','C'].forEach((id,index)=>{
    const start=.015+index*.14;
    const pop=staged?ease(clamp((progress-start)/.075)):1;
    const reveal=staged?ease(clamp((progress-start-.065)/.085)):1;
    const group=panels[0].querySelector('.break-group[data-break="'+id+'"]');
    const item=panels[0].querySelector('.diagnosis[data-story-break="'+id+'"]');
    if(group){
      const x=Number(group.dataset.originX),y=Number(group.dataset.originY);
      const angle=Number(group.dataset.angle)*Math.PI/180;
      const reach=9*Number(group.dataset.scale)*pop;
      const size=.88+.18*pop;
      const dx=Math.sin(angle)*reach,dy=-Math.cos(angle)*reach;
      group.setAttribute('transform','translate('+dx.toFixed(2)+' '+dy.toFixed(2)+') translate('+x+' '+y+') scale('+size.toFixed(3)+') translate('+(-x)+' '+(-y)+')');
    }
    if(item){
      item.style.opacity=String(reveal);
      item.style.clipPath='inset(0 '+(100*(1-reveal)).toFixed(1)+'% 0 0)';
      item.style.transform='translateY('+(12*(1-reveal)).toFixed(1)+'px)';
    }
  });
}
function paint(){
  scheduled=false;
  if(pinned){
    const p=clamp((scrollY-start)/span),t=ease(clamp((p-(mode==='relay'?.46:.24))/(mode==='relay'?.36:.5)));
    animateProblem(p);
    const entry=ease(clamp((innerHeight-chapter.getBoundingClientRect().top)/(innerHeight-top)));
    const y=heights.map(h=>Math.max(0,(stage-h*scale)/2));
    panels[0].style.zIndex='1';panels[1].style.zIndex='2';
    if(mode==='relay'){
      panels[0].style.transform='translate3d('+(-100*t)+'%,'+y[0]+'px,0) scale('+scale+')';
      panels[1].style.transform='translate3d('+(100*(1-t))+'%,'+y[1]+'px,0) scale('+scale+')';
      panels.forEach(panel=>panel.style.opacity='1');
      shell.style.transform='translateY('+(18*(1-entry))+'px) scale('+(.985+.015*entry)+')';
    }else if(mode==='focus'){
      panels[0].style.transform='translate3d('+(-16*t)+'%,'+y[0]+'px,0) scale('+(scale*(1-.04*t))+')';
      panels[0].style.opacity=String(1-.6*t);
      panels[1].style.transform='translate3d('+(102*(1-t))+'%,'+y[1]+'px,0) scale('+scale+')';panels[1].style.opacity='1';
      shell.style.transform='translateY('+(30*(1-entry))+'px) scale('+(.96+.04*entry)+')';
    }else{
      panels[0].style.transform='translate3d('+(-24*t)+'%,'+y[0]+'px,0) scale('+scale+')';panels[0].style.opacity=String(1-t);
      panels[1].style.transform='translate3d('+(26*(1-t))+'%,'+y[1]+'px,0) scale('+scale+')';panels[1].style.clipPath='inset(0 '+(100*(1-t))+'% 0 0)';panels[1].style.opacity='1';
      shell.style.transform='';
    }
    const current=t>=.5?1:0;activeStep(current,p);chapter.dataset.transition=t.toFixed(4);
    panels.forEach((panel,i)=>{panel.inert=i!==current;panel.setAttribute('aria-hidden',String(i!==current));});
  }else{
    let current=0;
    panels.forEach((panel,i)=>{
      const rect=panel.getBoundingClientRect();const t=ease(clamp((innerHeight*.95-rect.top)/(innerHeight*.4)));
      if(rect.top<innerHeight*.55)current=i;
      panel.style.opacity=reduced.matches?'1':String(.45+.55*t);
      const direction=i===0?-1:1;panel.style.transform=reduced.matches?'none':'translateX('+(direction*24*(1-t))+'px)';
    });
    const problemRect=panels[0].getBoundingClientRect();
    animateProblem(clamp((innerHeight*.84-problemRect.top)/Math.max(520,Math.min(problemRect.height,innerHeight)*.9)));
    activeStep(current,current);chapter.dataset.transition=String(current);
  }
}
function requestPaint(){if(!scheduled){scheduled=true;requestAnimationFrame(paint);}}
function goStep(step,behavior='smooth'){
  let target;
  if(pinned)target=start+span*(step===0?(mode==='relay'?.44:.12):(mode==='relay'?.91:.87));else target=rootTop(panels[step])-top;
  scrollTo({top:Math.max(0,target),behavior:reduced.matches?'instant':behavior});
}
function setMode(next,restart=true){
  mode=modes.includes(next)?next:'relay';body.dataset.storyMode=mode;
  document.querySelectorAll('[data-story-option]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.storyOption===mode)));
  const url=new URL(location.href);url.searchParams.set('motion',mode);if(restart)url.hash='';history.replaceState(null,'',url);
  layout();if(restart)scrollTo({top:0,behavior:'instant'});
}
document.querySelectorAll('[data-story-option]').forEach(button=>button.addEventListener('click',()=>setMode(button.dataset.storyOption)));
document.querySelectorAll('[data-story-step]').forEach(button=>button.addEventListener('click',()=>goStep(Number(button.dataset.storyStep))));
document.getElementById('story-replay').addEventListener('click',()=>scrollTo({top:0,behavior:reduced.matches?'instant':'smooth'}));
document.querySelectorAll('a[href="#workflow"],a[href="#problem"]').forEach(a=>a.addEventListener('click',event=>{event.preventDefault();history.replaceState(null,'',a.hash);goStep(a.hash==='#workflow'?1:0);}));
window.addEventListener('hashchange',()=>{if(location.hash==='#workflow')goStep(1);else if(location.hash==='#problem')goStep(0);});
window.addEventListener('scroll',requestPaint,{passive:true});
window.addEventListener('problem-ring-rendered',requestPaint);
window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(layout,80);},{passive:true});
window.addEventListener('load',()=>{layout();if(location.hash==='#workflow')goStep(1,'instant');else if(location.hash==='#problem')goStep(0,'instant');},{once:true});
reduced.addEventListener('change',layout);
setMode(new URLSearchParams(location.search).get('motion'),false);
})();

(() => {
  'use strict';
  const section=document.getElementById('product-film'),pin=section?.querySelector('.site-film-pin'),frame=document.getElementById('site-film-frame');
  if(!section||!pin||!frame)return;
  const header=document.querySelector('.site-header');
  const loading=document.getElementById('site-film-loading');
  const mobileNumber=document.getElementById('site-film-mobile-number'),mobileTitle=document.getElementById('site-film-mobile-title'),mobileCopy=document.getElementById('site-film-mobile-copy');
  const titles=['图片快速采集','快速构建提示词','画布创作','搜索复用'];
  const summaries=['浏览网页时一键保存参考图，自动归入项目资料。','从多张参考图提炼设计意图，组合成可编辑的提示词。','连接提示词与参考图，生成效果图并逐轮优化。','按画面特征找回图片与提示词版本，继续复用。'];
  if(document.documentElement.lang.startsWith('en')){
    titles.splice(0,titles.length,'Capture images quickly','Build prompts quickly','Create on Canvas','Search and reuse');
    summaries.splice(0,summaries.length,'Save references in one click while browsing.','Extract intent from multiple references and compose editable prompts.','Connect prompts and images, then generate and refine renderings.','Find images and prompt versions by visual features.');
  }
  const clamp=value=>Math.max(0,Math.min(1,value));
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
  let ready=false,scheduled=false,last=-1;
  let filmRequested=false;
  function requestFilm(){
    if(filmRequested)return;
    filmRequested=true;
    frame.src=frame.dataset.src;
    window.removeEventListener('scroll',requestOnScroll);
  }
  function requestOnScroll(){if(scrollY>80)requestFilm();}
  window.addEventListener('scroll',requestOnScroll,{passive:true});
  window.addEventListener('hashchange',()=>{if(location.hash==='#product-film')requestFilm();});
  if(scrollY>80||location.hash==='#product-film')requestFilm();
  else if('IntersectionObserver' in window){
    const observer=new IntersectionObserver(entries=>{
      if(entries.some(entry=>entry.isIntersecting)){observer.disconnect();requestFilm();}
    });
    observer.observe(section);
  }

  function geometry(){
    const viewportTop=section.getBoundingClientRect().top;
    const top=viewportTop+scrollY-(header?.offsetHeight||0);
    return {top,viewportTop,range:Math.max(1,section.offsetHeight-pin.offsetHeight)};
  }
  function paint(){
    scheduled=false;
    const {top,viewportTop,range}=geometry(),q=4*clamp((scrollY-top)/range),step=Math.min(3,Math.floor(q));
    const arrival=reducedMotion.matches?1:clamp((innerHeight-viewportTop)/Math.max(1,innerHeight-(header?.offsetHeight||0)));
    section.style.setProperty('--film-entry-opacity',String(.28+.72*arrival));
    section.style.setProperty('--film-entry-shift',`${Math.round((1-arrival)*24)}px`);
    document.body.dataset.filmEnhanced='true';
    mobileNumber.textContent='0'+(step+1)+' / 04';
    mobileTitle.textContent=titles[step];mobileCopy.textContent=summaries[step];
    if(ready&&Math.abs(q-last)>.0001){
      try{frame.contentWindow.__archbuddyScroll.seekEmbedded(q);last=q;}catch(error){ready=false;loading.textContent=document.documentElement.lang.startsWith('en')?'The demo could not load. Please refresh.':'演示加载遇到问题，请刷新页面';loading.hidden=false;}
    }
  }
  function requestPaint(){if(!scheduled){scheduled=true;requestAnimationFrame(paint);}}
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin||event.source!==frame.contentWindow||event.data?.type!=='archbuddy-film-ready')return;
    ready=true;loading.hidden=true;last=-1;requestPaint();
  });
  frame.addEventListener('load',()=>{if(frame.contentWindow?.__archbuddyScroll){ready=true;loading.hidden=true;last=-1;requestPaint();}});
  window.addEventListener('scroll',requestPaint,{passive:true});
  window.addEventListener('resize',requestPaint,{passive:true});
  requestPaint();
})();
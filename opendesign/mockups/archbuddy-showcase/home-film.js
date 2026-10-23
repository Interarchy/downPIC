(() => {
  'use strict';
  const section=document.getElementById('product-film'),pin=section?.querySelector('.site-film-pin'),frame=document.getElementById('site-film-frame');
  if(!section||!pin||!frame)return;
  const header=document.querySelector('.site-header');
  const loading=document.getElementById('site-film-loading');
  const mobileNumber=document.getElementById('site-film-mobile-number'),mobileTitle=document.getElementById('site-film-mobile-title'),mobileCopy=document.getElementById('site-film-mobile-copy');
  const titles=['图片快速采集','快速构建提示词','画布创作','搜索复用'];
  const summaries=['浏览网页时一键保存参考图，自动归入项目资料。','从多张参考图提炼设计意图，组合成可编辑的提示词。','连接提示词与参考图，生成效果图并逐轮优化。','按画面特征找回图片与提示词版本，继续复用。'];
  const clamp=value=>Math.max(0,Math.min(1,value));
  let ready=false,scheduled=false,last=-1;
  function geometry(){
    const top=section.getBoundingClientRect().top+scrollY-(header?.offsetHeight||0);
    return {top,range:Math.max(1,section.offsetHeight-pin.offsetHeight)};
  }
  function paint(){
    scheduled=false;
    const {top,range}=geometry(),q=4*clamp((scrollY-top)/range),step=Math.min(3,Math.floor(q));
    mobileNumber.textContent='0'+(step+1)+' / 04';
    mobileTitle.textContent=titles[step];mobileCopy.textContent=summaries[step];
    if(ready&&Math.abs(q-last)>.0001){
      try{frame.contentWindow.__archbuddyScroll.seekEmbedded(q);last=q;}catch(error){ready=false;loading.textContent='演示加载遇到问题，请刷新页面';loading.hidden=false;}
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
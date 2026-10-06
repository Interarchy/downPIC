(() => {
  'use strict';
  const descriptions={reveal:'章节标题与内容依次浮现，轻柔进入；适合轻量、自然的阅读。',focus:'画面跟随滚动逐渐清晰，并从略小恢复原尺寸；往回滚动可反向体验。',chapter:'章节标题在顶部导航下停驻，内容在下方展开；长图示可以完整向下浏览。'};
  const chapters=['problem','workflow','concept','features','install'].map(id=>document.getElementById(id));
  const parts=[];
  const opaqueBackground=node=>{while(node){const color=getComputedStyle(node).backgroundColor;if(color!=='rgba(0, 0, 0, 0)'&&color!=='transparent')return color;node=node.parentElement;}return '#f5f7f4';};
  chapters.forEach(section=>{
    let heading=section.querySelector('.section-heading,.install-heading');
    if(!heading){const label=section.querySelector('.section-label'),title=section.querySelector('h2');heading=document.createElement('div');label.parentElement.insertBefore(heading,label);heading.append(label,title);}
    heading.style.setProperty('--chapter-bg',opaqueBackground(heading));
    heading.classList.add('motion-heading','motion-part');
    const host=heading.parentElement,stage=document.createElement('div');stage.className='motion-stage motion-part';
    while(heading.nextSibling)stage.append(heading.nextSibling);host.append(stage);
    parts.push(heading,stage);
  });
  const absoluteTop=node=>{let top=0;while(node){top+=node.offsetTop;node=node.offsetParent;}return top;};
  const clamp=value=>Math.min(1,Math.max(0,value));
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let observer=null,mode='reveal',queued=false,anchors=[];
  const cache=()=>{anchors=parts.map(element=>({element,top:absoluteTop(element)}));const header=document.querySelector('.site-header');document.body.style.setProperty('--chapter-top',header.getBoundingClientRect().height+'px');};
  function paint(){queued=false;if(reduced.matches||mode==='reveal')return;const vh=innerHeight,y=scrollY;anchors.forEach(({element,top})=>{if(mode==='chapter'&&element.classList.contains('motion-heading'))return;const p=clamp((y+vh*.91-top)/(vh*.44));const heading=element.classList.contains('motion-heading');const opacity=mode==='chapter'?.7+.3*p:heading?.55+.45*p:.38+.62*p;const shift=(mode==='chapter'?16:heading?16:30)*(1-p);const scale=mode==='focus'&&!heading?.955+.045*p:1;element.style.setProperty('--scroll-opacity',opacity.toFixed(4));element.style.setProperty('--scroll-y',shift.toFixed(2)+'px');element.style.setProperty('--scroll-scale',scale.toFixed(4));});}
  const requestPaint=()=>{if(!queued){queued=true;requestAnimationFrame(paint);}};
  function applyMode(next,replay=false){
    if(observer)observer.disconnect();parts.forEach(part=>{part.classList.remove('is-revealed');part.style.removeProperty('--scroll-opacity');part.style.removeProperty('--scroll-y');part.style.removeProperty('--scroll-scale');});
    mode=Object.hasOwn(descriptions,next)?next:'reveal';document.body.dataset.motion=reduced.matches?'none':mode;
    document.querySelectorAll('[data-motion-option]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.motionOption===mode)));
    document.getElementById('motion-description').textContent=descriptions[mode];cache();
    if(mode==='reveal'&&!reduced.matches){observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('is-revealed');observer.unobserve(entry.target);}}),{rootMargin:'0px 0px -10% 0px',threshold:0});parts.forEach(part=>observer.observe(part));}else requestPaint();
    if(replay){const top=absoluteTop(document.getElementById('problem'))-innerHeight*.66;scrollTo({top:Math.max(0,top),behavior:reduced.matches?'auto':'smooth'});}
  }
  document.querySelectorAll('[data-motion-option]').forEach(button=>button.addEventListener('click',()=>{const query=new URL(location.href);query.searchParams.set('motion',button.dataset.motionOption);history.replaceState(null,'',query);applyMode(button.dataset.motionOption,true);}));
  document.getElementById('motion-replay').addEventListener('click',()=>applyMode(mode,true));
  addEventListener('scroll',requestPaint,{passive:true});addEventListener('resize',()=>{cache();requestPaint();},{passive:true});
  addEventListener('load',()=>{cache();requestPaint();},{once:true});
  reduced.addEventListener('change',()=>applyMode(mode));
  applyMode(new URLSearchParams(location.search).get('motion')||'reveal');
})();

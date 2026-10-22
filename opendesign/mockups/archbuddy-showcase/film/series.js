(() => {
  'use strict';
  const $=id=>document.getElementById(id),frames=[1,2,3,4].map(n=>$('chapter-'+n));
  const durations=[16,18.5,24,22.5],gap=2.2,starts=[0];
  durations.slice(0,-1).forEach((d,i)=>starts.push(Math.round((starts[i]+d+gap)*100)/100));
  const total=Math.round((starts[3]+durations[3])*100)/100,params=new URLSearchParams(location.search);
  const labels=['图片快速采集','快速构建提示词','画布创作','搜索复用'];
  const bridges=[
    ['01 采集参考 → 02 构建提示词','让参考成为设计语言','收集下来的图片，成为提示词构建的起点。'],
    ['02 构建提示词 → 03 画布创作','把设计意图带入画布','完整提示词与参考图片，共同引导生成。'],
    ['03 画布创作 → 04 搜索复用','回到图词库，让灵感再次被找到','从版本回看到参考复用，开启下一次创作。']
  ];
  const clamp=x=>Math.max(0,Math.min(1,x)),ease=x=>{x=clamp(x);return x*x*(3-2*x);};
  const format=t=>{const n=Math.floor(t);return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');};
  let current=0,playing=false,ready=false,last=0,raf=0;
  window.__filmErrors=[];window.addEventListener('error',e=>window.__filmErrors.push(e.message));
  const clean=params.get('clean')==='1';document.body.classList.toggle('clean',clean);
  function fit(){const s=Math.max(.15,Math.min((innerWidth-(clean?0:40))/1440,(innerHeight-(clean?0:190))/810,1));$('screen').style.width=1440*s+'px';$('screen').style.height=810*s+'px';$('film-shell').style.transform='scale('+s+')';$('scrubber').max=total;}
  function draw(t){
    current=Math.max(0,Math.min(total,t));let index=3;
    for(let i=0;i<3;i++)if(current<starts[i+1]){index=i;break;}
    frames.forEach(f=>{f.style.opacity='0';f.setAttribute('aria-hidden','true');});
    const local=current-starts[index],inBridge=index<3&&local>durations[index];
    frames[index].contentWindow.__archbuddyFilm.seek(Math.min(local,durations[index]));frames[index].setAttribute('aria-hidden','false');
    $('bridge').style.opacity='0';
    if(inBridge){
      const p=(local-durations[index])/gap;
      frames[index].style.opacity=String(1-ease(p/.42));
      frames[index+1].contentWindow.__archbuddyFilm.seek(0);
      frames[index+1].style.opacity=String(ease((p-.67)/.33));
      const alpha=ease(p/.22)*(1-ease((p-.75)/.25));$('bridge').style.opacity=String(alpha);
      [...$('bridge-art').children].forEach((el,i)=>el.style.display=i===index?'block':'none');
      if(index===2)$('bridge-art').children[2].style.display='flex';
      $('bridge-art').style.transform='translateX('+((1-ease(p))*65-ease(Math.max(0,(p-.65)/.35))*32)+'px) scale('+(.94+.06*ease(p/.4))+')';
      $('bridge-route').textContent=bridges[index][0];$('bridge-title').textContent=bridges[index][1];$('bridge-text').textContent=bridges[index][2];
    }else frames[index].style.opacity='1';
    $('time').textContent=format(current)+' / '+format(Math.ceil(total));
    $('scrubber').value=String(current);$('chapter-name').textContent=inBridge?'下一步 · '+labels[index+1]:labels[index];
    document.querySelectorAll('[data-scene]').forEach((b,i)=>{b.classList.toggle('active',i===index);b.classList.toggle('done',i<index);b.setAttribute('aria-current',i===index?'step':'false');});
    $('film-shell').dataset.time=current.toFixed(2);$('film-shell').dataset.chapter=String(index+1);$('film-shell').dataset.transition=String(inBridge);
  }
  function pause(){playing=false;cancelAnimationFrame(raf);$('toggle').textContent='播放';}
  function tick(now){if(!playing)return;draw(current+Math.min((now-last)/1000,.1));last=now;if(current>=total)pause();else raf=requestAnimationFrame(tick);}
  function play(){if(!ready)return;if(current>=total)draw(0);playing=true;last=performance.now();$('toggle').textContent='暂停';cancelAnimationFrame(raf);raf=requestAnimationFrame(tick);}
  function seek(t){if(!ready)return;draw(t);last=performance.now();}
  $('toggle').addEventListener('click',()=>playing?pause():play());
  $('restart').addEventListener('click',()=>{seek(0);play();});
  $('scrubber').addEventListener('input',e=>seek(Number(e.target.value)));
  document.querySelectorAll('[data-scene]').forEach(b=>b.addEventListener('click',()=>{seek(starts[Number(b.dataset.scene)]);play();}));
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
  window.addEventListener('resize',fit,{passive:true});fit();
  const awaitFrame=f=>new Promise((resolve,reject)=>{const check=()=>{try{if(f.contentWindow.__archbuddyFilm){resolve();return true;}}catch{}return false;};if(check())return;f.addEventListener('load',()=>check()||reject(new Error('章节加载失败')),{once:true});setTimeout(()=>{if(!check())reject(new Error('加载超时，请刷新重试'));},20000);});
  Promise.all(frames.map(awaitFrame)).then(()=>{
    ready=true;$('loading').style.display='none';document.querySelectorAll('button,input').forEach(el=>el.disabled=false);
    window.__archbuddySeries={seek(t){pause();seek(t);},play,pause,duration:total,starts};
    if(params.has('t')){draw(Number(params.get('t'))||0);pause();}
    else if(matchMedia('(prefers-reduced-motion:reduce)').matches){draw(0);pause();}
    else{draw(0);play();}
  }).catch(error=>{$('loading-state').textContent=error.message;window.__filmErrors.push(error.message);});
})();
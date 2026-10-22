(() => {
  'use strict';
  const $=id=>document.getElementById(id),frames=[1,2,3,4].map(n=>$('chapter-'+n)),durations=[8,12,16,14],pre=[.8,.6,.8,.4];
  const names=['图片快速采集','快速构建提示词','画布创作','搜索复用'],params=new URLSearchParams(location.search);
  const clamp=x=>Math.max(0,Math.min(1,x)),ease=x=>{x=clamp(x);return x*x*(3-2*x);};
  let ready=false,current=0,scheduled=0,autoFrame=0,auto=false,autoStart=0,autoFrom=0,autoTo=0,autoDuration=0;
  window.__filmErrors=[];window.addEventListener('error',e=>window.__filmErrors.push(e.message));
  const range=()=>Math.max(1,$('journey').offsetHeight-innerHeight);
  function fit(){const s=Math.max(.15,Math.min((innerWidth-48)/1440,(innerHeight-175)/810,1));$('screen').style.width=1440*s+'px';$('screen').style.height=810*s+'px';$('film-shell').style.transform='scale('+s+')';$('controls').style.maxWidth=1440*s+'px';}
  function showIntro(i,opacity,progress){
    const el=$('intro-'+i);if(!el)return;
    el.style.visibility=opacity>0?'visible':'hidden';el.style.opacity=String(opacity);
    el.style.transform='translateY('+((1-progress)*22)+'px) scale('+(.965+.035*progress)+')';
    el.querySelectorAll('.overview-wire').forEach(w=>w.style.strokeDashoffset=String(-current*140));
  }
  function draw(q){
    if(!ready)return;current=Math.max(0,Math.min(4,q));const i=Math.min(3,Math.floor(current)),p=current>=4?1:current-i,start=i===0?0:.16;
    frames.forEach(f=>{f.style.opacity='0';f.setAttribute('aria-hidden','true');});
    [1,2,3].forEach(n=>showIntro(n,0,1));
    const phase=clamp((p-start)/(.9-start)),local=pre[i]+(durations[i]-pre[i])*phase;
    frames[i].contentWindow.__archbuddyFilm.seek(local);frames[i].setAttribute('aria-hidden','false');
    let alpha=1,zoom=.90+.10*ease(clamp(p/.30));
    if(i>0&&p<.16){const out=1-ease((p-.10)/.06);showIntro(i,out,1);alpha=1-out;}
    if(i<3&&p>.9){const cross=ease((p-.9)/.1);alpha*=1-cross;showIntro(i+1,cross,cross);}
    frames[i].style.opacity=String(alpha);frames[i].style.transform='scale('+zoom+')';
    const entering=i>0&&p<.16,leaving=i<3&&p>.9;
    $('section-number').textContent='0'+(i+1)+' / 04';
    $('stage-label').textContent=entering?'进入'+names[i]:leaving?'接下来 · '+names[i+1]:names[i];
    $('journey-progress').value=String(current);
    $('next-step').textContent=i<3?'下一步 ↓':'回到开始 ↑';
    $('journey-hint').textContent=current>=3.9?'图片与提示词，再次成为创作的起点':'滚动推进 · 停下细看 · 向上回看';
    document.querySelectorAll('[data-go]').forEach(b=>{const n=Number(b.dataset.go);b.classList.toggle('active',n===i);b.classList.toggle('done',n<i);b.setAttribute('aria-current',n===i?'step':'false');});
    $('film-shell').dataset.progress=current.toFixed(4);$('film-shell').dataset.chapter=String(i+1);$('film-shell').dataset.time=local.toFixed(2);
  }
  function setProgress(q){q=Math.max(0,Math.min(4,q));window.scrollTo({top:$('journey').offsetTop+range()*q/4,behavior:'instant'});draw(q);}
  function stopAuto(){auto=false;cancelAnimationFrame(autoFrame);$('demo').textContent='播放本段';}
  function autoTick(now){if(!auto)return;const p=clamp((now-autoStart)/autoDuration);setProgress(autoFrom+(autoTo-autoFrom)*p);if(p<1)autoFrame=requestAnimationFrame(autoTick);else stopAuto();}
  function playChapter(){
    if(!ready)return;if(auto){stopAuto();return;}
    const i=Math.min(3,Math.floor(current));if(current-i>=.9)setProgress(i+(i?0:.001));
    autoFrom=current;autoTo=i+.9;autoDuration=Math.max(900,durations[i]*1000*(autoTo-autoFrom)/.9);autoStart=performance.now();auto=true;$('demo').textContent='暂停演示';autoFrame=requestAnimationFrame(autoTick);
  }
  function go(i){stopAuto();setProgress(Math.max(0,Math.min(3,i))+.001);}
  $('demo').addEventListener('click',playChapter);
  $('replay').addEventListener('click',()=>go(Math.min(3,Math.floor(current))));
  $('next-step').addEventListener('click',()=>go(current>=3?0:Math.floor(current)+1));
  $('journey-progress').addEventListener('input',e=>{stopAuto();setProgress(Number(e.target.value));});
  document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>go(Number(b.dataset.go))));
  window.addEventListener('scroll',()=>{if(scheduled)return;scheduled=requestAnimationFrame(()=>{scheduled=0;draw(4*(scrollY-$('journey').offsetTop)/range());});},{passive:true});
  window.addEventListener('wheel',stopAuto,{passive:true});window.addEventListener('touchstart',stopAuto,{passive:true});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopAuto();});
  window.addEventListener('resize',()=>{const q=current;fit();if(ready)setProgress(q);},{passive:true});fit();
  const waitFrame=f=>new Promise((resolve,reject)=>{
    let timer;const check=()=>{try{if(f.contentWindow.__archbuddyFilm){clearTimeout(timer);resolve();return true;}}catch{}return false;};
    if(check())return;f.addEventListener('load',()=>check()||reject(new Error('章节加载失败，请刷新页面')),{once:true});timer=setTimeout(()=>{if(!check())reject(new Error('加载超时，请刷新页面'));},20000);
  });
  Promise.all(frames.map(waitFrame)).then(()=>{
    ready=true;$('loading').style.display='none';document.querySelectorAll('button,input').forEach(e=>e.disabled=false);
    window.__archbuddyScroll={seekProgress(q){stopAuto();setProgress(q);},play:playChapter,pause:stopAuto,durations,get progress(){return current;}};
    const q=params.has('q')?Number(params.get('q')):params.has('scene')?Number(params.get('scene'))-1:4*scrollY/range();
    setProgress(Number.isFinite(q)?q:0);
  }).catch(e=>{$('loading-state').textContent=e.message;window.__filmErrors.push(e.message);});
})();
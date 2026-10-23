(() => {
  'use strict';
  const $=id=>document.getElementById(id),frames=[1,2,3,4].map(n=>$('chapter-'+n)),durations=[8,12,16,14],pre=[.8,.6,.8,.4];
  const hasIntro=i=>Boolean($('intro-'+i));
  const embedded=new URLSearchParams(location.search).get('embedded')==='1';
  if(embedded)document.documentElement.classList.add('embedded');
  const english=document.documentElement.lang.startsWith('en');
  const names=english?['Capture images','Build prompts','Create on Canvas','Search and reuse']:['图片快速采集','快速构建提示词','画布创作','搜索复用'],params=new URLSearchParams(location.search);
  const clamp=x=>Math.max(0,Math.min(1,x)),ease=x=>{x=clamp(x);return x*x*(3-2*x);};
  const frameReady=[false,false,false,false],framePromises=[null,null,null,null],frameFailed=[false,false,false,false];
  let ready=false,current=0,scheduled=0,autoFrame=0,auto=false,autoStart=0,autoFrom=0,autoTo=0,autoDuration=0;
  window.__filmErrors=[];window.addEventListener('error',e=>window.__filmErrors.push(e.message));
  const range=()=>Math.max(1,$('journey').offsetHeight-innerHeight);
  function fit(){const s=Math.max(.15,Math.min((innerWidth-(embedded?24:48))/1440,(innerHeight-(embedded?24:175))/810,1));$('screen').style.width=1440*s+'px';$('screen').style.height=810*s+'px';$('film-shell').style.transform='scale('+s+')';$('controls').style.maxWidth=1440*s+'px';}
  function showIntro(i,opacity,progress){
    const el=$('intro-'+i);if(!el)return;
    el.style.visibility=opacity>0?'visible':'hidden';el.style.opacity=String(opacity);
    el.style.transform='translateY('+((1-progress)*22)+'px) scale('+(.965+.035*progress)+')';
    const paths=[...el.querySelectorAll('.lightpath-core')],travel=clamp((current-i+.1)/.26);
    el.querySelectorAll('.diagram-spark').forEach(dot=>{
      const path=paths[Number(dot.dataset.path)];if(!path)return;
      const point=path.getPointAtLength(path.getTotalLength()*travel);
      dot.setAttribute('cx',point.x);dot.setAttribute('cy',point.y);
    });
  }
  function ensureFrame(i){
    if(i<0||i>=frames.length)return Promise.resolve(false);
    if(framePromises[i])return framePromises[i];
    const frame=frames[i];
    framePromises[i]=waitFrame(frame).then(()=>{
      frameReady[i]=true;
      if(ready)draw(current);
      return true;
    }).catch(error=>{
      frameFailed[i]=true;window.__filmErrors.push(error.message);
      if(ready)draw(current);
      return false;
    });
    if(!frame.getAttribute('src'))frame.src=frame.dataset.src;
    return framePromises[i];
  }
  function preloadNext(i){
    if(i>=frames.length)return;
    const start=()=>ensureFrame(i).then(ok=>{if(ok)setTimeout(()=>preloadNext(i+1),700);});
    if('requestIdleCallback' in window)requestIdleCallback(start,{timeout:1600});
    else setTimeout(start,600);
  }
  function draw(q){
    if(!ready)return;current=Math.max(0,Math.min(4,q));const i=Math.min(3,Math.floor(current)),p=current>=4?1:current-i,start=hasIntro(i) ? .16 : 0;
    ensureFrame(i);if(i<3&&p>.65)ensureFrame(i+1);
    frames.forEach(f=>{f.style.opacity='0';f.setAttribute('aria-hidden','true');});
    [1,2,3].forEach(n=>showIntro(n,0,1));
    const phase=clamp((p-start)/(.9-start)),local=pre[i]+(durations[i]-pre[i])*phase;
    if(frameReady[i]){frames[i].contentWindow.__archbuddyFilm.seek(local);frames[i].setAttribute('aria-hidden','false');}
    else if(hasIntro(i))showIntro(i,1,1);
    $('loading-state').textContent=frameFailed[i]?(english?'Chapter failed to load. Please refresh.':'章节加载失败，请刷新页面'):(english?'Opening ':'正在打开')+names[i]+'…';
    $('loading').style.display=frameReady[i]||(hasIntro(i)&&!frameFailed[i])?'none':'grid';
    let alpha=frameReady[i]?1:0,zoom=.90+.10*ease(clamp(p/.30));
    if(frameReady[i]&&hasIntro(i)&&p<.16){const out=1-ease((p-.10)/.06);showIntro(i,out,1);alpha=1-out;}
    if(i<3&&p>.9&&(hasIntro(i+1)||frameReady[i+1])){
      const cross=ease((p-.9)/.1);alpha*=1-cross;
      if(hasIntro(i+1))showIntro(i+1,cross,cross);
      else {
        // 无扉页的章节直接淡入真实界面，边界两侧保持同一开场时刻与缩放。
        const next=frames[i+1];next.contentWindow.__archbuddyFilm.seek(pre[i+1]);
        next.style.opacity=String(cross);next.style.transform='scale(.9)';
        next.setAttribute('aria-hidden',cross>0?'false':'true');
      }
    }
    frames[i].style.opacity=String(alpha);frames[i].style.transform='scale('+zoom+')';
    const entering=hasIntro(i)&&p<.16,leaving=i<3&&p>.9;
    $('section-number').textContent='0'+(i+1)+' / 04';
    $('stage-label').textContent=entering?(english?'Entering ':'进入')+names[i]:leaving?(english?'Next · ':'接下来 · ')+names[i+1]:names[i];
    $('journey-progress').value=String(current);
    $('next-step').textContent=i<3?(english?'Next ↓':'下一步 ↓'):(english?'Back to start ↑':'回到开始 ↑');
    $('journey-hint').textContent=current>=3.9?(english?'Images and prompts become a new starting point':'图片与提示词，再次成为创作的起点'):(english?'Scroll to advance · Pause to explore · Scroll up to revisit':'滚动推进 · 停下细看 · 向上回看');
    document.querySelectorAll('[data-go]').forEach(b=>{const n=Number(b.dataset.go);b.classList.toggle('active',n===i);b.classList.toggle('done',n<i);b.setAttribute('aria-current',n===i?'step':'false');});
    $('film-shell').dataset.progress=current.toFixed(4);$('film-shell').dataset.chapter=String(i+1);$('film-shell').dataset.time=local.toFixed(2);
  }
  function setProgress(q){q=Math.max(0,Math.min(4,q));window.scrollTo({top:$('journey').offsetTop+range()*q/4,behavior:'instant'});draw(q);}
  function stopAuto(){auto=false;cancelAnimationFrame(autoFrame);$('demo').textContent=(english?'Play this chapter':'播放本段');}
  function autoTick(now){if(!auto)return;const p=clamp((now-autoStart)/autoDuration);setProgress(autoFrom+(autoTo-autoFrom)*p);if(p<1)autoFrame=requestAnimationFrame(autoTick);else stopAuto();}
  function playChapter(){
    if(!ready)return;if(auto){stopAuto();return;}
    const i=Math.min(3,Math.floor(current));if(current-i>=.9)setProgress(i+(i?0:.001));
    autoFrom=current;autoTo=i+.9;autoDuration=Math.max(900,durations[i]*1000*(autoTo-autoFrom)/.9);autoStart=performance.now();auto=true;$('demo').textContent=(english?'Pause demo':'暂停演示');autoFrame=requestAnimationFrame(autoTick);
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
    let timer;const check=()=>{try{if(f.contentWindow.__archbuddyFilm){clearTimeout(timer);f.removeEventListener('load',check);resolve();return true;}}catch{}return false;};
    if(check())return;f.addEventListener('load',check);timer=setTimeout(()=>{if(!check()){f.removeEventListener('load',check);reject(new Error('加载超时，请刷新页面'));}},20000);
  });
  ensureFrame(0).then(ok=>{if(!ok)throw new Error('首段加载失败，请刷新页面');
    ready=true;$('loading').style.display='none';document.querySelectorAll('button,input').forEach(e=>e.disabled=false);
    window.__archbuddyScroll={seekProgress(q){stopAuto();setProgress(q);},seekEmbedded(q){if(embedded)draw(q);},play:playChapter,pause:stopAuto,durations,get progress(){return current;}};
    const q=params.has('q')?Number(params.get('q')):params.has('scene')?Number(params.get('scene'))-1:4*scrollY/range();
    if(embedded){draw(0);parent.postMessage({type:'archbuddy-film-ready'},location.origin);}
    else setProgress(Number.isFinite(q)?q:0);
    preloadNext(1);
  }).catch(e=>{$('loading-state').textContent=e.message;window.__filmErrors.push(e.message);});
})();
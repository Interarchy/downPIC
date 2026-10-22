(() => {
  'use strict';
  const W=1440,H=810,DURATION=10000;
  const film=document.getElementById('film');
  const cards=[...document.querySelectorAll('.photo-card')];
  const slots=[...document.querySelectorAll('.saved-slot')];
  const toolbar=document.getElementById('floating-toolbar');
  const page=document.getElementById('browser-page');
  const library=document.getElementById('library');
  const count=document.getElementById('saved-count');
  const status=document.getElementById('status-text');
  const footer=document.getElementById('footer-caption');
  const progress=document.getElementById('progress-bar');
  const endCard=document.getElementById('end-card');
  let timers=[],animations=[],runId=0;
  function fit(){const scale=Math.min((innerWidth-40)/W,(innerHeight-100)/H,1);film.style.zoom=String(Math.max(.18,scale));}
  function later(fn,ms){const id=setTimeout(fn,ms);timers.push(id)}
  function clear(){timers.forEach(clearTimeout);timers=[];animations.forEach(a=>{try{a.cancel()}catch{}});animations=[];document.querySelectorAll('.flyer').forEach(e=>e.remove())}
  function reset(){
    clear();runId++;film.classList.remove('is-playing');
    cards.forEach(c=>c.classList.remove('active','saved'));slots.forEach(s=>s.classList.remove('filled'));
    toolbar.classList.remove('visible','pressed');library.classList.remove('complete');endCard.classList.remove('visible');
    count.textContent='00';status.textContent='等待采集';footer.textContent='看见灵感，顺手留住。';progress.style.width='0%';
  }
  function save(index,token){
    if(token!==runId)return;
    const card=cards[index],photo=card.querySelector('.photo'),slot=slots[index],source=photo.getBoundingClientRect(),dest=slot.getBoundingClientRect(),pageRect=page.getBoundingClientRect();
    cards.forEach(c=>c.classList.remove('active'));card.classList.add('active');
    const scale=film.getBoundingClientRect().width/W;toolbar.style.left=((source.left-pageRect.left+source.width)/scale-230)+'px';toolbar.style.top=((source.top-pageRect.top)/scale+12)+'px';
    toolbar.classList.add('visible');status.textContent='正在保存第 '+(index+1)+' 张参考';
    later(()=>{
      if(token!==runId)return;
      toolbar.classList.add('pressed');
      const flyer=document.createElement('div');flyer.className='flyer';flyer.style.cssText='left:'+source.left+'px;top:'+source.top+'px;width:'+source.width+'px;height:'+source.height+'px;--x:'+photo.style.getPropertyValue('--x')+';--y:'+photo.style.getPropertyValue('--y')+';';
      document.body.appendChild(flyer);
      const dx=dest.left-source.left,dy=dest.top-source.top,sx=dest.width/source.width,sy=dest.height/source.height;
      const a=flyer.animate([
        {transform:'translate(0,0) scale(1,1)',opacity:1,filter:'brightness(1)'},
        {transform:'translate('+dx*.45+'px,'+(dy*.36-48)+'px) scale(.66,.66)',opacity:.95,filter:'brightness(1.15)',offset:.46},
        {transform:'translate('+dx+'px,'+dy+'px) scale('+sx+','+sy+')',opacity:1,filter:'brightness(1)'}
      ],{duration:850,easing:'cubic-bezier(.18,.82,.25,1)',fill:'forwards'});
      animations.push(a);
      a.onfinish=()=>{if(token!==runId)return;slot.classList.add('filled');card.classList.add('saved');card.classList.remove('active');flyer.remove();count.textContent=String(index+1).padStart(2,'0');status.textContent=index===3?'4 张参考已归档':'已保存 '+(index+1)+' 张参考';toolbar.classList.remove('visible','pressed')};
    },340);
  }
  function play(){
    reset();const token=runId;film.classList.add('is-playing');progress.style.transition='none';progress.style.width='0%';void progress.offsetWidth;progress.style.transition='width '+DURATION+'ms linear';requestAnimationFrame(()=>progress.style.width='100%');
    [1550,2950,4350,5750].forEach((t,i)=>later(()=>save(i,token),t));
    later(()=>{if(token!==runId)return;library.classList.add('complete');footer.textContent='四张参考，一次归档。'},7350);
    later(()=>{if(token!==runId)return;endCard.classList.add('visible')},8000);
  }
  document.getElementById('replay').addEventListener('click',play);
  window.addEventListener('resize',fit,{passive:true});
  fit();
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){reset();film.classList.add('is-playing');cards.forEach(c=>c.classList.add('saved'));slots.forEach(s=>s.classList.add('filled'));count.textContent='04';status.textContent='4 张参考已归档';footer.textContent='四张参考，一次归档。';progress.style.width='100%'}
  else play();
})();
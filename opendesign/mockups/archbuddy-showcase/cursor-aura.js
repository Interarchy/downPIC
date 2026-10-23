(() => {
'use strict';
const supported=matchMedia('(hover:hover) and (pointer:fine) and (prefers-reduced-motion:no-preference)');
if(!supported.matches)return;
const aura=document.createElement('div');
aura.className='cursor-aura';aura.setAttribute('aria-hidden','true');
aura.innerHTML='<span class="cursor-aura-cloud"></span><span class="cursor-aura-cloud"></span><span class="cursor-aura-cloud"></span>';
document.body.append(aura);
const layers=Array.from(aura.children,(el,i)=>({el,x:0,y:0,lag:170+i*135,phase:Math.random()*Math.PI*2}));
let x=0,y=0,raf=0,last=0,movedAt=0,startAt=0,initialized=false,energy=0;
function draw(now){
 const dt=Math.min(48,now-(last||now-16));last=now;
 const age=now-movedAt;
 const target=age<100?1:Math.max(0,1-(age-100)/1050);
 energy+=(target-energy)*(1-Math.exp(-dt/230));
 const time=(now-startAt)/1000;
 for(let i=0;i<layers.length;i++){
  const layer=layers[i],p=layer.phase;
  const ease=1-Math.exp(-dt/layer.lag);
  layer.x+=(x-layer.x)*ease;layer.y+=(y-layer.y)*ease;
  const dx=Math.sin(time*.53+p)*(30+i*16);
  const dy=Math.cos(time*.39+p)*(22+i*13);
  const rotation=Math.sin(time*.27+p)*18+i*47;
  const scale=1+Math.sin(time*.43+p)*.09;
  layer.el.style.transform=`translate3d(${layer.x+dx}px,${layer.y+dy}px,0) rotate(${rotation}deg) scale(${scale})`;
  layer.el.style.opacity=String(energy*(.8+i*.08));
 }
 if(age<2200)raf=requestAnimationFrame(draw);
 else{raf=0;last=0;energy=0;initialized=false;aura.classList.remove('is-visible');for(const layer of layers)layer.el.style.opacity='0';}
}
document.addEventListener('pointermove',event=>{
 if(event.pointerType!=='mouse'||!supported.matches||document.hidden)return;
 x=event.clientX;y=event.clientY;movedAt=performance.now();
 if(!initialized){for(const layer of layers){layer.x=x;layer.y=y;}startAt=movedAt;initialized=true;}
 const target=event.target instanceof Element?event.target:null;
 const dark=target?.closest('.story-window,.asset-support');
 aura.dataset.surface=!dark&&target?.closest('#concept,#features,.story-chapter')?'light':'dark';
 aura.classList.add('is-visible');
 if(!raf)raf=requestAnimationFrame(draw);
},{passive:true});
function hide(){
 aura.classList.remove('is-visible');cancelAnimationFrame(raf);
 raf=0;last=0;initialized=false;energy=0;
 for(const layer of layers)layer.el.style.opacity='0';
}
document.addEventListener('pointerleave',hide);
document.addEventListener('visibilitychange',()=>{if(document.hidden)hide();});
window.addEventListener('blur',hide);supported.addEventListener('change',hide);
})();

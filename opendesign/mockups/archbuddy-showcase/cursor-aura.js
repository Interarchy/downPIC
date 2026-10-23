(() => {
'use strict';
const supported=matchMedia('(hover:hover) and (pointer:fine) and (prefers-reduced-motion:no-preference)');
if(!supported.matches)return;
const aura=document.createElement('div');aura.className='cursor-aura';aura.setAttribute('aria-hidden','true');
aura.innerHTML='<span class="cursor-aura-glow"></span><span class="cursor-aura-ring"></span>';document.body.append(aura);
const glow=aura.firstElementChild,dot=aura.lastElementChild;
let x=0,y=0,gx=0,gy=0,raf=0,last=0,fade=0,initialized=false;
function draw(now){
 const dt=Math.min(50,now-(last||now-16));last=now;const ease=1-Math.exp(-dt/180);
 gx+=(x-gx)*ease;gy+=(y-gy)*ease;
 dot.style.transform=`translate3d(${x}px,${y}px,0)`;
 glow.style.transform=`translate3d(${gx}px,${gy}px,0)`;
 if(Math.abs(x-gx)+Math.abs(y-gy)>.2)raf=requestAnimationFrame(draw);else{raf=0;last=0;}
}
document.addEventListener('pointermove',event=>{
 if(event.pointerType!=='mouse'||!supported.matches)return;
 x=event.clientX;y=event.clientY;if(!initialized){gx=x;gy=y;initialized=true;}
 const target=event.target instanceof Element?event.target:null;
 aura.dataset.surface=target?.closest('#concept,#features,.story-chapter')?'light':'dark';
 aura.classList.add('is-visible','is-moving');document.body.classList.add('has-cursor-aura');
 clearTimeout(fade);fade=setTimeout(()=>aura.classList.remove('is-moving'),180);
 if(!raf)raf=requestAnimationFrame(draw);
},{passive:true});
function hide(){aura.classList.remove('is-visible','is-moving');document.body.classList.remove('has-cursor-aura');cancelAnimationFrame(raf);raf=0;last=0;initialized=false;clearTimeout(fade);}
document.addEventListener('pointerleave',hide);window.addEventListener('blur',hide);supported.addEventListener('change',hide);
})();
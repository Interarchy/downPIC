(() => {
'use strict';
const hero=document.querySelector('.abhero');
const west=hero?.querySelector('.ambient-field--west');
const east=hero?.querySelector('.ambient-field--east');
if(!hero||!west||!east)return;
const supported=matchMedia('(hover:hover) and (pointer:fine) and (prefers-reduced-motion:no-preference)');
let frame=0,rect=null,x=0,y=0;
const clamp=value=>Math.max(0,Math.min(1,value));
function paint(){
 frame=0;
 if(!supported.matches||document.hidden)return;
 rect=rect||hero.getBoundingClientRect();
 if(!rect.width||!rect.height)return;
 const u=clamp((x-rect.left)/rect.width),v=clamp((y-rect.top)/rect.height);
 // 固定背景的两侧轻微改变明暗，坐标不控制光斑位置、大小或旋转。
 west.style.opacity=(.38+(1-u)*.28+(1-v)*.04).toFixed(3);
 east.style.opacity=(.38+u*.28+v*.04).toFixed(3);
}
function reset(){
 cancelAnimationFrame(frame);frame=0;rect=null;
 west.style.opacity='';east.style.opacity='';
}
hero.addEventListener('pointermove',event=>{
 if(event.pointerType!=='mouse'||!supported.matches||document.hidden)return;
 x=event.clientX;y=event.clientY;
 if(!frame)frame=requestAnimationFrame(paint);
},{passive:true});
hero.addEventListener('pointerenter',()=>{rect=null;},{passive:true});
hero.addEventListener('pointerleave',reset);
window.addEventListener('scroll',reset,{passive:true});
window.addEventListener('resize',reset,{passive:true});
window.addEventListener('blur',reset);
document.addEventListener('visibilitychange',()=>{if(document.hidden)reset();});
supported.addEventListener('change',reset);
})();

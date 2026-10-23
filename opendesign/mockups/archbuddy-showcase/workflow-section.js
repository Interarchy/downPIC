(() => {
'use strict';
const NS='http://www.w3.org/2000/svg';
const map=document.querySelector('#workflow .ab-flow-map');
if(!map)return;
const svg=map.querySelector('.ab-flow-wires');
const nodes=Object.fromEntries([...map.querySelectorAll('[data-flow-node]')].map(el=>[el.dataset.flowNode,el]));
const chapter=document.getElementById('story');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const flows=[
  {from:'capture',to:'scheme',lane:'upper',delay:.1},
  {from:'scheme',to:'library',lane:'upper',delay:.55},
  {from:'capture',to:'reverse',lane:'lower',delay:1.35},
  {from:'reverse',to:'generate',lane:'lower',delay:1.85},
  {from:'generate',to:'iterate',lane:'lower',delay:2.35},
  {from:'iterate',to:'library',lane:'lower',delay:2.85}
];
const nodeDelays={scheme:.4,library:.95,reverse:1.65,generate:2.15,iterate:2.65};
for(const [name,delay] of Object.entries(nodeDelays))nodes[name].style.setProperty('--flow-delay',delay+'s');
function box(name){const n=nodes[name].getBoundingClientRect(),p=map.getBoundingClientRect(),sx=map.clientWidth/p.width,sy=map.clientHeight/p.height;return{x:(n.left-p.left)*sx,y:(n.top-p.top)*sy,w:n.width*sx,h:n.height*sy,cx:(n.left-p.left+n.width/2)*sx,cy:(n.top-p.top+n.height/2)*sy};}
function rounded(points){
  let d='M '+points[0][0]+' '+points[0][1];
  for(let i=1;i<points.length-1;i++){
    const a=points[i-1],b=points[i],c=points[i+1],before=Math.hypot(b[0]-a[0],b[1]-a[1]),after=Math.hypot(c[0]-b[0],c[1]-b[1]);
    const r=Math.min(14,before/2,after/2);
    const s=[b[0]+(a[0]-b[0])*r/before,b[1]+(a[1]-b[1])*r/before];
    const e=[b[0]+(c[0]-b[0])*r/after,b[1]+(c[1]-b[1])*r/after];
    d+=' L '+s[0]+' '+s[1]+' Q '+b[0]+' '+b[1]+' '+e[0]+' '+e[1];
  }
  return d+' L '+points.at(-1)[0]+' '+points.at(-1)[1];
}
function points(edge,mobile){
  const a=box(edge.from),b=box(edge.to);
  if(mobile){
    const left=18,right=map.clientWidth-18;
    if(edge.from==='capture'&&edge.to==='scheme')return[[a.cx,a.y+a.h+5],[b.cx,b.y-6]];
    if(edge.from==='scheme')return[[a.x+a.w+5,a.cy],[right,a.cy],[right,b.cy-12],[b.x+b.w+5,b.cy-12]];
    if(edge.from==='capture')return[[a.x-5,a.cy],[left,a.cy],[left,b.cy],[b.x-5,b.cy]];
    return[[a.cx,a.y+a.h+5],[b.cx,b.y-6]];
  }
  if(edge.from==='capture'&&edge.to==='scheme')return[[a.x+a.w+6,a.cy-17],[a.x+a.w+42,a.cy-17],[a.x+a.w+42,b.cy],[b.x-7,b.cy]];
  if(edge.from==='scheme')return[[a.x+a.w+6,a.cy],[b.x-31,a.cy],[b.x-31,b.cy-23],[b.x-7,b.cy-23]];
  if(edge.from==='capture')return[[a.x+a.w+6,a.cy+17],[a.x+a.w+42,a.cy+17],[a.x+a.w+42,b.cy],[b.x-7,b.cy]];
  if(edge.to==='library')return[[a.x+a.w+6,a.cy],[b.x-31,a.cy],[b.x-31,b.cy+26],[b.x-7,b.cy+26]];
  return[[a.x+a.w+6,a.cy],[b.x-7,b.cy]];
}
let lastGeometry='';
function draw(){
  const mobile=matchMedia('(max-width: 980px)').matches;
  const geometry=map.clientWidth+'x'+map.clientHeight+':'+mobile;
  if(geometry===lastGeometry&&svg.childElementCount)return;
  lastGeometry=geometry;
  svg.replaceChildren();svg.setAttribute('viewBox','0 0 '+map.clientWidth+' '+map.clientHeight);
  const defs=document.createElementNS(NS,'defs'),marker=document.createElementNS(NS,'marker');
  marker.setAttribute('id','ab-flow-head');marker.setAttribute('viewBox','0 0 10 10');marker.setAttribute('refX','9');marker.setAttribute('refY','5');marker.setAttribute('markerWidth','5');marker.setAttribute('markerHeight','5');marker.setAttribute('orient','auto');
  const tip=document.createElementNS(NS,'path');tip.setAttribute('d','M 1 1 L 9 5 L 1 9');tip.setAttribute('fill','none');tip.setAttribute('stroke','#ffaf45');tip.setAttribute('stroke-width','2');tip.setAttribute('stroke-linecap','round');tip.setAttribute('stroke-linejoin','round');marker.append(tip);defs.append(marker);svg.append(defs);
  for(const edge of flows){const path=document.createElementNS(NS,'path');path.setAttribute('d',rounded(points(edge,mobile)));path.setAttribute('class','ab-flow-wire');path.setAttribute('data-lane',edge.lane);path.setAttribute('marker-end','url(#ab-flow-head)');path.style.setProperty('--flow-delay',edge.delay+'s');svg.append(path);path.style.setProperty('--wire-length',Math.ceil(path.getTotalLength())+'px');}
  map.classList.add('is-ready');
}
let frame;
function requestDraw(){cancelAnimationFrame(frame);frame=requestAnimationFrame(draw);}
function syncMotion(){map.classList.toggle('is-playing',chapter.dataset.step==='1'||reduced.matches);}
new MutationObserver(syncMotion).observe(chapter,{attributes:true,attributeFilter:['data-step']});
window.addEventListener('resize',requestDraw,{passive:true});
window.addEventListener('story-layout',requestDraw);
reduced.addEventListener('change',syncMotion);
draw();syncMotion();
})();

(() => {
'use strict';
const NS = 'http://www.w3.org/2000/svg';
const root = document.querySelector('#workflow .ab-workflow-diagrams');
if (!root) return;
const flows = [
  { id: 'design', number: '01', title: '方案创作链路', reuse: '复用参考', nodes: [
    { id: 'capture', title: '采集参考图', opportunity: '采集提效' },
    { id: 'create', title: '方案创作', note: '由设计师完成', kind: 'manual' },
    { id: 'library', title: '沉淀参考图库', opportunity: '沉淀复用' }
  ]},
  { id: 'ai', number: '02', title: 'AI 效果图迭代链路', reuse: '复用图词', nodes: [
    { id: 'capture', title: '收集参考图', opportunity: '采集提效' },
    { id: 'prompt', title: '反推提示词', opportunity: 'AI 反推' },
    { id: 'generate', title: '生成 AI 效果图', note: '外部工具完成<br>ArchBuddy 未介入', kind: 'external' },
    { id: 'iterate', title: '迭代提示词', opportunity: 'AI 评估' },
    { id: 'library', title: '沉淀提示词库', opportunity: '沉淀复用' }
  ]}
];
function svgElement(tag, attrs, parent) {
  const item = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) item.setAttribute(key, String(value));
  parent.appendChild(item); return item;
}
function roundedPath(points) {
  let d = 'M ' + points[0].join(' ');
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1], b = points[i], c = points[i + 1];
    const before = Math.hypot(b[0]-a[0], b[1]-a[1]);
    const after = Math.hypot(c[0]-b[0], c[1]-b[1]);
    const radius = Math.min(12, before/2, after/2);
    const start = [b[0]+(a[0]-b[0])*radius/before,b[1]+(a[1]-b[1])*radius/before];
    const end = [b[0]+(c[0]-b[0])*radius/after,b[1]+(c[1]-b[1])*radius/after];
    d += ' L ' + start.join(' ') + ' Q ' + b.join(' ') + ' ' + end.join(' ');
  }
  return d + ' L ' + points.at(-1).join(' ');
}
function arrow(svg,x,y,angle) {
  const group = svgElement('g',{class:'ab-workflow-arrow',transform:'translate('+x+' '+y+') rotate('+angle+')'},svg);
  svgElement('use',{href:'assets/lucide.svg#chevron-right',x:-15,y:-12,width:24,height:24},group);
}
function wire(svg,points,id) {
  svgElement('path',{class:'ab-workflow-wire','data-edge':id,d:roundedPath(points)},svg);
  const last=points.at(-1), previous=points.at(-2);
  arrow(svg,last[0],last[1],Math.atan2(last[1]-previous[1],last[0]-previous[0])*180/Math.PI);
}
function label(chart,text,x,y,vertical=false,className='ab-workflow-edge-label') {
  const el=document.createElement('span');el.className=className+(vertical?' ab-workflow-vertical':'');el.textContent=text;
  el.style.left=x+'px';el.style.top=y+'px';chart.appendChild(el);
}
function port(n,side,offset=0) {
  if(side==='left')return[n.x-n.w/2-6,n.y+offset];
  if(side==='right')return[n.x+n.w/2+6,n.y+offset];
  if(side==='top')return[n.x+offset,n.y-n.h/2-6];
  return[n.x+offset,n.y+n.h/2+6];
}
function addNode(chart,n,position) {
  const el=document.createElement('div');el.className='ab-workflow-node '+(n.opportunity?'ab-workflow-product':'ab-workflow-'+n.kind);
  el.dataset.node=n.id;el.style.cssText='left:'+position.x+'px;top:'+position.y+'px;width:'+position.w+'px;height:'+position.h+'px';
  const heading=document.createElement('h4');heading.textContent=n.title;el.appendChild(heading);
  if(n.opportunity){const mark=document.createElement('div');mark.className='ab-workflow-mark';mark.dataset.opportunity=n.id;
    mark.innerHTML='<span class="ab-workflow-brand"><img src="assets/brand-mark.svg" alt="" width="16" height="16"><strong>ArchBuddy</strong></span><span class="ab-workflow-caption">'+n.opportunity+'</span>';el.appendChild(mark);
  }else{const note=document.createElement('p');note.className='ab-workflow-note';note.innerHTML=n.note;el.appendChild(note);}
  chart.appendChild(el);
}
function compactLayout(chart,svg,flow,w) {
  const mobile=w<490, nw=mobile?Math.min(144,(w-82)/2):146, nh=98;
  let positions;
  if(flow.id==='design'){
    positions=[[w*.25,58],[w*.75,58],[w*.5,262]];chart.style.height='328px';
  }else if(mobile){
    positions=[[w*.25,56],[w*.75,56],[w*.75,198],[w*.75,340],[w*.25,340]];chart.style.height='402px';
  }else{
    positions=[[w*.16,58],[w*.5,58],[w*.84,58],[w*.84,262],[w*.16,262]];chart.style.height='328px';
  }
  const nodes=positions.map(([x,y])=>({x,y,w:nw,h:nh}));
  if(flow.id==='design'){
    const[a,b,c]=nodes;
    wire(svg,[port(a,'right'),port(b,'left')],'capture-create');
    wire(svg,[port(b,'bottom'),[b.x,c.y],port(c,'right')],'create-library');
    wire(svg,[port(c,'left'),[a.x,c.y],port(a,'bottom')],'library-capture');
    label(chart,flow.reuse,a.x,168);
  }else{
    const[a,b,c,d,e]=nodes;
    wire(svg,[port(a,'right'),port(b,'left')],'capture-prompt');
    wire(svg,[port(b,mobile?'bottom':'right'),port(c,mobile?'top':'left')],'prompt-generate');
    wire(svg,[port(c,'bottom',-25),port(d,'top',-25)],'generate-iterate');
    wire(svg,[port(d,'top',25),port(c,'bottom',25)],'iterate-generate');
    label(chart,'评估',c.x-25,(c.y+d.y)/2);
    label(chart,'再生成',c.x+25,(c.y+d.y)/2);
    wire(svg,[port(d,'left'),port(e,'right')],'iterate-library');
    wire(svg,[port(e,'top'),port(a,'bottom')],'library-capture');
    label(chart,flow.reuse,a.x,(a.y+e.y)/2);
  }
  flow.nodes.forEach((n,i)=>addNode(chart,n,nodes[i]));
}

function drawCharts() {
  for (const flow of flows) {
    const chart = root.querySelector('[data-flow="'+flow.id+'"]');
    if (!chart || !chart.clientWidth) continue;
    const width = chart.clientWidth;
    chart.replaceChildren();
    const svg = svgElement('svg', {class:'ab-workflow-wires','aria-hidden':'true'}, chart);
    compactLayout(chart, svg, flow, width);
  }
}
let resizeFrame;
window.addEventListener('resize', () => {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(drawCharts);
});
drawCharts();
})();

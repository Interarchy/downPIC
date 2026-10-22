const NS = 'http://www.w3.org/2000/svg';
const descriptions = {
  one: '双栏紧凑回环：缩小步骤框与品牌标记，让两条链路并排呈现。',
  two: '横向双轨：按步骤从左向右阅读，再沿返回线进入下一轮创作。',
  three: '双环站点：用连续环路连接紧凑节点，琥珀色标出产品介入环节。'
};
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
const root = document.getElementById('workflows');
const section = document.querySelector('.workflow-section');
const buttons = [...document.querySelectorAll('[data-option]')];
let variant = 'one';
let resizeFrame;
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
  const group = svgElement('g',{class:'arrow',transform:'translate('+x+' '+y+') rotate('+angle+')'},svg);
  svgElement('use',{href:'assets/lucide.svg#chevron-right',x:-15,y:-12,width:24,height:24},group);
}
function wire(svg,points,id) {
  svgElement('path',{class:'wire','data-edge':id,d:roundedPath(points)},svg);
  const last=points.at(-1), previous=points.at(-2);
  arrow(svg,last[0],last[1],Math.atan2(last[1]-previous[1],last[0]-previous[0])*180/Math.PI);
}
function label(chart,text,x,y,vertical=false,className='edge-label') {
  const el=document.createElement('span');el.className=className+(vertical?' vertical':'');el.textContent=text;
  el.style.left=x+'px';el.style.top=y+'px';chart.appendChild(el);
}
function port(n,side,offset=0) {
  if(side==='left')return[n.x-n.w/2-6,n.y+offset];
  if(side==='right')return[n.x+n.w/2+6,n.y+offset];
  if(side==='top')return[n.x+offset,n.y-n.h/2-6];
  return[n.x+offset,n.y+n.h/2+6];
}
function addNode(chart,n,position) {
  const el=document.createElement('div');el.className='node '+(n.opportunity?'product':n.kind);
  el.dataset.node=n.id;el.style.cssText='left:'+position.x+'px;top:'+position.y+'px;width:'+position.w+'px;height:'+position.h+'px';
  const heading=document.createElement('h3');heading.textContent=n.title;el.appendChild(heading);
  if(n.opportunity){const mark=document.createElement('div');mark.className='product-mark';mark.dataset.opportunity=n.id;
    mark.innerHTML='<span class="product-brand"><img src="assets/brand-mark.svg" alt="" width="16" height="16"><strong>ArchBuddy</strong></span><span class="product-caption">'+n.opportunity+'</span>';el.appendChild(mark);
  }else{const note=document.createElement('p');note.className='node-note';note.innerHTML=n.note;el.appendChild(note);}
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
function linearLayout(chart,svg,flow,w) {
  const vertical=w<700;
  if(vertical){
    const nw=Math.min(238,w-106),nh=94,x=w/2,step=132;
    const nodes=flow.nodes.map((n,i)=>({x,y:54+i*step,w:nw,h:nh}));
    chart.style.height=(nodes.at(-1).y+62)+'px';
    for(let i=0;i<nodes.length-1;i++)wire(svg,[port(nodes[i],'bottom'),port(nodes[i+1],'top')],flow.nodes[i].id+'-'+flow.nodes[i+1].id);
    const first=nodes[0],last=nodes.at(-1),rail=w-13;
    wire(svg,[port(last,'right'),[rail,last.y],[rail,first.y],port(first,'right')],'library-capture');
    label(chart,flow.reuse,rail,(first.y+last.y)/2,true);
    if(flow.id==='ai'){
      const c=nodes[2],d=nodes[3];wire(svg,[port(d,'left'),[16,d.y],[16,c.y],port(c,'left')],'iterate-generate');
      label(chart,'调整后再生成',16,(c.y+d.y)/2,true);
    }
    flow.nodes.forEach((n,i)=>addNode(chart,n,nodes[i]));return;
  }
  const nw=flow.id==='design'?164:Math.min(152,w/5-26),nh=88;
  const edge=nw/2+8;
  const nodes=flow.nodes.map((n,i)=>({x:edge+(w-2*edge)*i/(flow.nodes.length-1),y:52,w:nw,h:nh}));
  chart.style.height=flow.id==='design'?'183px':'236px';
  for(let i=0;i<nodes.length-1;i++)wire(svg,[port(nodes[i],'right'),port(nodes[i+1],'left')],flow.nodes[i].id+'-'+flow.nodes[i+1].id);
  const first=nodes[0],last=nodes.at(-1),returnY=flow.id==='design'?148:205;
  wire(svg,[port(last,'bottom'),[last.x,returnY],[first.x,returnY],port(first,'bottom')],'library-capture');
  label(chart,flow.reuse,w*.5,returnY);
  if(flow.id==='ai'){
    const c=nodes[2],d=nodes[3];wire(svg,[port(d,'bottom'),[d.x,139],[c.x,139],port(c,'bottom')],'iterate-generate');
    label(chart,'调整后再生成',(c.x+d.x)/2,139);
  }
  flow.nodes.forEach((n,i)=>addNode(chart,n,nodes[i]));
}
function circlePoint(cx,cy,r,angle){const rad=(angle-90)*Math.PI/180;return[cx+r*Math.cos(rad),cy+r*Math.sin(rad)];}
function ringLayout(chart,svg,flow,w){
  if(w<490){compactLayout(chart,svg,flow,w);return;}
  const cx=w/2,cy=187,r=139,nw=142,nh=88,count=flow.nodes.length;
  chart.style.height='380px';
  const nodes=flow.nodes.map((n,i)=>{const[x,y]=circlePoint(cx,cy,r,i*360/count);return{x,y,w:nw,h:nh};});
  svgElement('circle',{class:'wire',cx,cy,r,'data-edge':'main-cycle'},svg);
  for(let i=0;i<count;i++){
    const angle=(i+.5)*360/count;const[x,y]=circlePoint(cx,cy,r,angle);
    arrow(svg,x,y,angle);
  }
  label(chart,flow.reuse,cx,flow.id==='design'?183:172,false,'center-note');
  if(flow.id==='ai'){
    const c=nodes[2],d=nodes[3],y=242;
    wire(svg,[port(d,'top'),[d.x,y],[c.x,y],port(c,'top')],'iterate-generate');
    label(chart,'调整后再生成',cx,y);
  }
  flow.nodes.forEach((n,i)=>addNode(chart,n,nodes[i]));
}
function drawCharts(){
  for(const flow of flows){
    const chart=document.querySelector('[data-flow="'+flow.id+'"]');if(!chart)continue;
    const w=chart.clientWidth;if(!w)continue;chart.replaceChildren();
    const svg=svgElement('svg',{class:'wires','aria-hidden':'true'},chart);
    if(variant==='two')linearLayout(chart,svg,flow,w);
    else if(variant==='three')ringLayout(chart,svg,flow,w);
    else compactLayout(chart,svg,flow,w);
  }
}
function selectOption(){
  const key=location.hash.slice(1);variant=Object.hasOwn(descriptions,key)?key:'one';
  section.dataset.variant=variant;document.getElementById('option-description').textContent=descriptions[variant];
  buttons.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.option===variant)));
  root.innerHTML=flows.map(flow=>'<article class="workflow"><header class="workflow-heading"><span class="workflow-number">'+flow.number+'</span><h2>'+flow.title+'</h2></header><div class="chart" data-flow="'+flow.id+'" aria-label="'+flow.title+'的完整流程与产品介入点"></div></article>').join('');
  drawCharts();
}
buttons.forEach(button=>button.addEventListener('click',()=>{history.replaceState(null,'','#'+button.dataset.option);selectOption();}));
window.addEventListener('hashchange',selectOption);
window.addEventListener('resize',()=>{cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(drawCharts);});
selectOption();

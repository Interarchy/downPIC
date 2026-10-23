(() => {
'use strict';
const NS='http://www.w3.org/2000/svg';
const en=document.documentElement.lang.startsWith('en');
const selected = { colors:['#e1e9cf','#c3d9bd','#a5c9af','#87b59b','#6a9f84'], flow:getComputedStyle(document.documentElement).getPropertyValue('--diagram-accent').trim() || '#ffaf45',stroke:3.8,minStroke:2.6,dash:4.8,gap:2.4,curvedBreak:true,red:getComputedStyle(document.documentElement).getPropertyValue('--diagram-accent').trim() || '#ffaf45',outline:'#ffcb82',ink:'#492a0c' };
const stages = [
  { number: '01', title: '收集参考图', from: 324, to: 396, center: 360 },
  { number: '02', title: '构思新方案', from: 36, to: 108, center: 72 },
  { number: '03', title: '编写提示词', from: 108, to: 180, center: 144 },
  { number: '04', title: 'AI 生图迭代', from: 180, to: 252, center: 216 },
  { number: '05', title: '复用图与词', from: 252, to: 324, center: 288 }
];
if(en) ['Collect','Design','Write Prompts','Iterate Images','Reuse Assets'].forEach((title,i)=>{stages[i].title=title;});
const breaks = [{ id: 'A', center: 36 }, { id: 'B', center: 108 }, { id: 'C', center: 252 }];
const svg = document.getElementById('problem-ring-svg');
const disc = document.querySelector('#problem .radial-disc');


function element(tag, attributes, parent = svg) {
  const item = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attributes)) item.setAttribute(name, String(value));
  parent.appendChild(item);
  return item;
}
function polar(center, radius, degrees) {
  const radians = (degrees - 90) * Math.PI / 180;
  return { x: center + radius * Math.cos(radians), y: center + radius * Math.sin(radians) };
}
function coord(point) { return `${point.x.toFixed(2)} ${point.y.toFixed(2)}`; }
function sectorPath(center, inner, outer, from, to) {
  const a = polar(center, outer, from), b = polar(center, outer, to);
  const c = polar(center, inner, to), d = polar(center, inner, from);
  const large = to - from > 180 ? 1 : 0;
  return `M ${coord(a)} A ${outer} ${outer} 0 ${large} 1 ${coord(b)} L ${coord(c)} A ${inner} ${inner} 0 ${large} 0 ${coord(d)} Z`;
}
function roundedBreakPath(center, inner, outer, middle, scale, curvedOuter = false) {
  const points = [polar(center, inner, middle - 3.3), polar(center, outer, middle - 7.5), polar(center, outer, middle + 7.5), polar(center, inner, middle + 3.3)];
  const toward = (a, b) => {
    const distance = Math.hypot(b.x - a.x, b.y - a.y);
    const factor = Math.min(8 * scale, distance * .38) / distance;
    return { x: a.x + (b.x - a.x) * factor, y: a.y + (b.y - a.y) * factor };
  };
  const corners = points.map((point, index) => ({ point, start: toward(point, points[(index + 3) % 4]), end: toward(point, points[(index + 1) % 4]) }));
  if (curvedOuter) {
    const arcTrim = 8 * scale / outer * 180 / Math.PI;
    const arcStart = polar(center, outer, middle - 7.5 + arcTrim);
    const arcEnd = polar(center, outer, middle + 7.5 - arcTrim);
    return `M ${coord(corners[0].end)} L ${coord(corners[1].start)} Q ${coord(points[1])} ${coord(arcStart)} A ${outer} ${outer} 0 0 1 ${coord(arcEnd)} Q ${coord(points[2])} ${coord(corners[2].end)} L ${coord(corners[3].start)} Q ${coord(points[3])} ${coord(corners[3].end)} L ${coord(corners[0].start)} Q ${coord(points[0])} ${coord(corners[0].end)} Z`;
  }
  return corners.map((corner, index) => `${index ? 'L' : 'M'} ${coord(corner.start)} Q ${coord(corner.point)} ${coord(corner.end)}`).join(' ') + ' Z';
}
function flowPath(center, radius, from, to, scale, option) {
  const startAngle = from + .4, endAngle = to - .5;
  const length = (endAngle - startAngle) * Math.PI / 180 * radius;
  const dash = Math.max(1.65, option.dash * scale);
  const gap = Math.max(1.2, option.gap * scale);
  const tail = Math.max(7, 11 * scale);
  const dashedLength = length - tail - gap;
  let d = '';
  const angleAt = distance => startAngle + distance / radius * 180 / Math.PI;
  for (let distance = 0; distance + dash <= dashedLength; distance += dash + gap) {
    d += `M ${coord(polar(center, radius, angleAt(distance)))} A ${radius} ${radius} 0 0 1 ${coord(polar(center, radius, angleAt(distance + dash)))} `;
  }
  const end = polar(center, radius, endAngle);
  const angle = endAngle * Math.PI / 180;
  const tangent = { x: Math.cos(angle), y: Math.sin(angle) };
  const radial = { x: Math.sin(angle), y: -Math.cos(angle) };
  const back = Math.max(6, 10.5 * scale), wing = Math.max(3.8, 6.4 * scale);
  const a = { x: end.x - tangent.x * back + radial.x * wing, y: end.y - tangent.y * back + radial.y * wing };
  const b = { x: end.x - tangent.x * back - radial.x * wing, y: end.y - tangent.y * back - radial.y * wing };
  return d + `M ${coord(polar(center, radius, angleAt(length - tail)))} A ${radius} ${radius} 0 0 1 ${coord(end)} M ${coord(a)} L ${coord(end)} L ${coord(b)}`;
}
function drawLabels(center, flow, size, defs) {
  const scale = size / 560;
  const titleSize = en ? Math.max(9.5, 12.5 * scale) : Math.max(11.2, 17 * scale) * 1.15;
  const numberSize = Math.max(9.7, 12.8 * scale) * 1.15;
  const titleRadius = flow + Math.max(15, 25 * scale);
  for (const step of stages) {
    const reverse = step.center > 90 && step.center < 270;
    const from = reverse ? step.center + 26 : step.center - 26;
    const to = reverse ? step.center - 26 : step.center + 26;
    const path = element('path', { id: `problem-label-path-${step.number}`, d: `M ${coord(polar(center, titleRadius, from))} A ${titleRadius} ${titleRadius} 0 0 ${reverse ? 0 : 1} ${coord(polar(center, titleRadius, to))}` }, defs);
    const text = element('text', { class: 'step-label', 'font-size': titleSize });
    const pathText = element('textPath', { href: `#${path.id}`, startOffset: '50%' }, text);
    const num = element('tspan', { class: 'step-number', 'font-size': numberSize }, pathText);
    num.textContent = step.number;
    const name = element('tspan', { dx: Math.max(4, 6 * scale) }, pathText);
    name.textContent = step.title;
  }
}
function drawChainLabels(center, inner, size, defs) {
  const scale = size / 560;
  const radius = inner - Math.max(13, 18 * scale);
  const chains = [
    { id: 'design', title: '方案创作链路', from: 342, to: 450, reverse: false },
    { id: 'ai', title: 'AI 效果图迭代链路', from: 288, to: 144, reverse: true }
  ];
  if(en){chains[0].title='Design Path';chains[1].title='AI Rendering Path';}
  for (const chain of chains) {
    const path = element('path', {
      id: `problem-chain-${chain.id}`,
      d: `M ${coord(polar(center, radius, chain.from))} A ${radius} ${radius} 0 0 ${chain.reverse ? 0 : 1} ${coord(polar(center, radius, chain.to))}`
    }, defs);
    const label = element('text', {
      class: 'chain-label',
      'font-size': Math.max(12.8, 17 * scale),
      'aria-hidden': 'true'
    });
    element('textPath', { href: `#${path.id}`, startOffset: '50%' }, label).textContent = chain.title;
  }
}
function drawCenteredBreakLabel(group, id, position, rotation, fontSize, scale) {
  const caption = element('g', {
    class: 'break-caption',
    transform: `translate(${position.x} ${position.y}) rotate(${rotation})`,
    'aria-hidden': 'true'
  }, group);
  const context = document.createElement('canvas').getContext('2d');
  const family = getComputedStyle(svg).fontFamily;
  const parts = en ? [{text:'BREAK',size:fontSize*.63},{text:id,size:fontSize*1.12}] : id === 'C'
    ? [{ text: id, size: fontSize * 1.2 }, { text: '点断', size: fontSize }]
    : [{ text: '断点', size: fontSize }, { text: id, size: fontSize * 1.2 }];
  const spacing = Math.max(2.5, 3.5 * scale);
  const measured = parts.map(part => {
    context.font = `600 ${part.size}px ${family}`;
    const metrics = context.measureText(part.text);
    return { ...part, metrics, width: metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight };
  });
  let left = -(measured.reduce((sum, part) => sum + part.width, 0) + spacing) / 2;
  for (const part of measured) {
    const label = element('text', {
      class: 'break-label break-glyph',
      x: left + part.metrics.actualBoundingBoxLeft,
      y: (part.metrics.actualBoundingBoxAscent - part.metrics.actualBoundingBoxDescent) / 2,
      'font-size': part.size
    }, caption);
    label.textContent = part.text;
    left += part.width + spacing;
  }
}
function renderDiagram() {
  const size = disc.clientWidth;
  if (!size) return;
  const option = { inner: .26, outer: .445, stroke: 2.6, dash: 4.2, gap: 2, ...selected };
  const center = size / 2, scale = size / 560;
  const outer = size * option.outer, inner = size * option.inner;
  const flow = inner + (outer - inner) / 3;
  const breakOuter = outer + (option.curvedBreak ? 22 : 12) * scale;
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.style.setProperty('--flow-color', option.flow);
  svg.style.setProperty('--break-color', option.red);
  svg.style.setProperty('--break-outline', option.outline);
  svg.style.setProperty('--break-ink', option.ink);
  svg.replaceChildren();
  const defs = element('defs', {});
  stages.forEach((stage, index) => element('path', { class: 'sector', d: sectorPath(center, inner, outer, stage.from, stage.to), fill: option.colors[index] }));
  const seamWidth = Math.max(3.8, 6 * scale);
  const clearance = Math.max(5, 8 * scale);
  for (const stage of stages) {
    const a = polar(center, inner - .5, stage.from);
    const b = polar(center, outer + .5, stage.from);
    element('line', { class: 'stage-seam', x1: a.x, y1: a.y, x2: b.x, y2: b.y, 'stroke-width': seamWidth });
  }
  const halfCutAngle = 3.3 + (clearance + 3 * scale) / flow * 180 / Math.PI;
  const flowSegments = [
    { from: breaks[2].center + halfCutAngle, to: breaks[0].center + 360 - halfCutAngle },
    { from: breaks[0].center + halfCutAngle, to: breaks[1].center - halfCutAngle },
    { from: breaks[1].center + halfCutAngle, to: breaks[2].center - halfCutAngle }
  ];
  for (const gap of breaks) {
    element('path', { class: 'break-halo', d: roundedBreakPath(center, flow, breakOuter, gap.center, scale, option.curvedBreak), 'stroke-width': 2 * clearance + Math.max(.75, 1.25 * scale) });
  }
  for (const segment of flowSegments) {
    element('path', { class: 'flow', d: flowPath(center, flow, segment.from, segment.to, scale, option), 'stroke-width': Math.max(option.minStroke || 1.8, option.stroke * scale) });
  }
  for (const gap of breaks) {
    const origin = polar(center, (flow + breakOuter) / 2, gap.center);
    const group = element('g', { class: 'break-group', 'data-break': gap.id, 'data-origin-x': origin.x, 'data-origin-y': origin.y, 'data-angle': gap.center, 'data-scale': scale, 'aria-label': `断点 ${gap.id}` });
    element('path', { class: 'break-shape', d: roundedBreakPath(center, flow, breakOuter, gap.center, scale, option.curvedBreak), 'stroke-width': Math.max(.75, 1.25 * scale) }, group);
    const middle = gap.center;
    const rotation = gap.id === 'C' ? middle + 90 : middle - 90;
    const fontSize = Math.max(10.1, 13.5 * scale) * 1.18;
    if (option.curvedBreak) {
      const labelRadius = (flow * Math.cos(3.3 * Math.PI / 180) + breakOuter) / 2;
      drawCenteredBreakLabel(group, gap.id, polar(center, labelRadius, middle), rotation, fontSize, scale);
    } else {
      const labelPosition = polar(center, (flow + breakOuter) / 2, middle);
      const label = element('text', {
        class: 'break-label', x: 0, y: 0,
        transform: `translate(${labelPosition.x} ${labelPosition.y}) rotate(${rotation})`,
        'font-size': fontSize
      }, group);
      label.textContent = en ? `Break ${gap.id}` : gap.id === 'C' ? 'C 点断' : `断点 ${gap.id}`;
    }
  }
  drawLabels(center, flow, size, defs);
  drawChainLabels(center, inner, size, defs);
  const titleSize = Math.max(18, 28 * scale);
  const lineGap = Math.max(25, 34 * scale);
  for (const [line, y] of (en ? [['Design Flow', center - lineGap / 2], ['Breaks', center + lineGap / 2]] : [['创作流程', center - lineGap / 2], ['断点分析', center + lineGap / 2]])) {
    const title = element('text', { class: 'center-title', x: center, y, 'font-size': titleSize });
    title.textContent = line;
  }
  window.dispatchEvent(new Event('problem-ring-rendered'));
}

new ResizeObserver(renderDiagram).observe(disc);
renderDiagram();
})();

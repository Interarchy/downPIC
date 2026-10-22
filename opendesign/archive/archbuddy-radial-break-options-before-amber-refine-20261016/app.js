const NS = 'http://www.w3.org/2000/svg';
const options = {
  one: {
    description: '珊瑚橙：明亮而柔和，断点清楚，整体色彩更均衡。',
    colors: ['#e1e9cf', '#c3d9bd', '#a5c9af', '#87b59b', '#6a9f84'],
    flow: '#173f2e', red: '#ff8a78', outline: '#ffb4a8', ink: '#492017'
  },
  two: {
    description: '琥珀橙：亮度更高，在森林绿底上形成更醒目的提示。',
    colors: ['#e1e9cf', '#c3d9bd', '#a5c9af', '#87b59b', '#6a9f84'],
    flow: '#173f2e', red: '#ffaf45', outline: '#ffcb82', ink: '#492a0c'
  },
  three: {
    description: '朱红：更鲜明的红橙色，强化流程被打断的视觉感受。',
    colors: ['#e1e9cf', '#c3d9bd', '#a5c9af', '#87b59b', '#6a9f84'],
    flow: '#173f2e', red: '#f56a45', outline: '#ffa28a', ink: '#401b13'
  }
};
const stages = [
  { number: '01', title: '收集参考图', from: 324, to: 396, center: 360 },
  { number: '02', title: '构思新方案', from: 36, to: 108, center: 72 },
  { number: '03', title: '编写提示词', from: 108, to: 180, center: 144 },
  { number: '04', title: 'AI 生图迭代', from: 180, to: 252, center: 216 },
  { number: '05', title: '复用图与词', from: 252, to: 324, center: 288 }
];
const breaks = [{ id: 'A', center: 36 }, { id: 'B', center: 108 }, { id: 'C', center: 252 }];
const svg = document.getElementById('ring-svg');
const disc = document.querySelector('.radial-disc');
const buttons = [...document.querySelectorAll('[data-option]')];
let currentOption = 'one';

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
function roundedBreakPath(center, inner, outer, middle, scale) {
  const points = [polar(center, inner, middle - 3.3), polar(center, outer, middle - 7.5), polar(center, outer, middle + 7.5), polar(center, inner, middle + 3.3)];
  const toward = (a, b) => {
    const distance = Math.hypot(b.x - a.x, b.y - a.y);
    const factor = Math.min(8 * scale, distance * .38) / distance;
    return { x: a.x + (b.x - a.x) * factor, y: a.y + (b.y - a.y) * factor };
  };
  const corners = points.map((point, index) => ({ point, start: toward(point, points[(index + 3) % 4]), end: toward(point, points[(index + 1) % 4]) }));
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
  const titleSize = Math.max(11.2, 17 * scale) * 1.15;
  const numberSize = Math.max(9.7, 12.8 * scale) * 1.15;
  const titleRadius = flow + Math.max(15, 25 * scale);
  for (const step of stages) {
    const reverse = step.center > 90 && step.center < 270;
    const from = reverse ? step.center + 26 : step.center - 26;
    const to = reverse ? step.center - 26 : step.center + 26;
    const path = element('path', { id: `label-path-${step.number}`, d: `M ${coord(polar(center, titleRadius, from))} A ${titleRadius} ${titleRadius} 0 0 ${reverse ? 0 : 1} ${coord(polar(center, titleRadius, to))}` }, defs);
    const text = element('text', { class: 'step-label', 'font-size': titleSize });
    const pathText = element('textPath', { href: `#${path.id}`, startOffset: '50%' }, text);
    const num = element('tspan', { class: 'step-number', 'font-size': numberSize }, pathText);
    num.textContent = step.number;
    const name = element('tspan', { dx: Math.max(4, 6 * scale) }, pathText);
    name.textContent = step.title;
  }
}
function renderDiagram() {
  const size = disc.clientWidth;
  if (!size) return;
  const option = { inner: .26, outer: .445, stroke: 2.6, dash: 4.2, gap: 2, ...options[currentOption] };
  const center = size / 2, scale = size / 560;
  const outer = size * option.outer, inner = size * option.inner;
  const flow = inner + (outer - inner) / 3;
  const breakOuter = outer + 12 * scale;
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
    element('path', { class: 'break-halo', d: roundedBreakPath(center, flow, breakOuter, gap.center, scale), 'stroke-width': 2 * clearance + Math.max(.75, 1.25 * scale) });
  }
  for (const segment of flowSegments) {
    element('path', { class: 'flow', d: flowPath(center, flow, segment.from, segment.to, scale, option), 'stroke-width': Math.max(1.8, option.stroke * scale) });
  }
  for (const gap of breaks) {
    const group = element('g', { class: 'break-group', 'aria-label': `断点 ${gap.id}` });
    element('path', { class: 'break-shape', d: roundedBreakPath(center, flow, breakOuter, gap.center, scale), 'stroke-width': Math.max(.75, 1.25 * scale) }, group);
    const middle = gap.center;
    const labelPosition = polar(center, (flow + breakOuter) / 2, middle);
    const label = element('text', {
      class: 'break-label', x: 0, y: 0,
      transform: `translate(${labelPosition.x} ${labelPosition.y}) rotate(${gap.id === 'C' ? middle + 90 : middle - 90})`,
      'font-size': Math.max(10.1, 13.5 * scale) * 1.18
    }, group);
    label.textContent = gap.id === 'C' ? 'C 点断' : `断点 ${gap.id}`;
  }
  drawLabels(center, flow, size, defs);
  const titleSize = Math.max(18, 28 * scale);
  const lineGap = Math.max(25, 34 * scale);
  for (const [line, y] of [['创作流程', center - lineGap / 2], ['断点分析', center + lineGap / 2]]) {
    const title = element('text', { class: 'center-title', x: center, y, 'font-size': titleSize });
    title.textContent = line;
  }
}
function selectOption() {
  const requested = location.hash.slice(1);
  currentOption = Object.hasOwn(options, requested) ? requested : 'one';
  buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.option === currentOption)));
  document.getElementById('option-description').textContent = options[currentOption].description;
  document.querySelector('.problem-section').dataset.theme = currentOption;
  renderDiagram();
}
buttons.forEach((button, index) => {
  button.addEventListener('click', () => { history.replaceState(null, '', '#' + button.dataset.option); selectOption(); });
  button.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
      : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].focus(); buttons[next].click();
  });
});
window.addEventListener('hashchange', selectOption);
new ResizeObserver(renderDiagram).observe(disc);
selectOption();
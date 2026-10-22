const NS = 'http://www.w3.org/2000/svg';
const options = {
  one: {
    description: '素纸细线：柔和鼠尾草绿，细短虚线，完整环带。',
    colors: ['#edf0df', '#dce6d0', '#c5d8c0', '#a7c5ae', '#87ae97'],
    inner: .235, outer: .445, stroke: 1.65, dash: 5.3, gap: 2.3,
    flow: '#356f54', red: '#b77b6d', outline: '#d8aaa0', corner: 8
  },
  two: {
    description: '林绿方格：清楚的浅深层次，方块虚线，更鲜明的流程节奏。',
    colors: ['#eaf1dd', '#cce4c9', '#a6d1b4', '#7ab698', '#4f9878'],
    inner: .215, outer: .445, stroke: 2.25, dash: 2.4, gap: 1.9,
    flow: '#205e46', red: '#a9675b', outline: '#cb9d92', corner: 5
  },
  three: {
    description: '留白轻环：薄环与更大留白，细密虚线，克制的灰绿层次。',
    colors: ['#ecf0e7', '#dce7dc', '#c4d8c9', '#a5c5b4', '#80ab95'],
    inner: .26, outer: .445, stroke: 1.5, dash: 3.5, gap: 2,
    flow: '#356c54', red: '#ac776b', outline: '#d6afa5', corner: 10
  }
};
const stages = [
  { number: '01', title: '收集参考图', from: 326, to: 392, center: 359 },
  { number: '02', title: '构思新方案', from: 43, to: 104, center: 73.5 },
  { number: '03', title: '编写提示词', from: 115, to: 179, center: 147 },
  { number: '04', title: 'AI 生图迭代', from: 181, to: 248, center: 214.5 },
  { number: '05', title: '复用图与词', from: 259, to: 324, center: 291.5 }
];
const breaks = [{ id: 'A', from: 32, to: 43 }, { id: 'B', from: 104, to: 115 }, { id: 'C', from: 248, to: 259 }];
const flowSegments = [{ from: 259, to: 392 }, { from: 43, to: 104 }, { from: 115, to: 248 }];
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
function roundedBreakPath(center, inner, outer, from, to, scale, corner) {
  const radiusTrim = corner * scale, angleTrim = 1.1;
  const p = (r, a) => coord(polar(center, r, a));
  return `M ${p(inner + radiusTrim, from)} L ${p(outer - radiusTrim, from)}`
    + ` Q ${p(outer, from)} ${p(outer, from + angleTrim)}`
    + ` A ${outer} ${outer} 0 0 1 ${p(outer, to - angleTrim)}`
    + ` Q ${p(outer, to)} ${p(outer - radiusTrim, to)}`
    + ` L ${p(inner + radiusTrim, to)}`
    + ` Q ${p(inner, to)} ${p(inner, to - angleTrim)}`
    + ` A ${inner} ${inner} 0 0 0 ${p(inner, from + angleTrim)}`
    + ` Q ${p(inner, from)} ${p(inner + radiusTrim, from)} Z`;
}
function flowPath(center, radius, from, to, scale, option) {
  const startAngle = from + .4, endAngle = to - .5;
  const length = (endAngle - startAngle) * Math.PI / 180 * radius;
  const dash = Math.max(1.65, option.dash * scale);
  const gap = Math.max(1.2, option.gap * scale);
  const tail = Math.max(5, 8 * scale);
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
  const back = Math.max(4.2, 7 * scale), wing = Math.max(2.5, 4.1 * scale);
  const a = { x: end.x - tangent.x * back + radial.x * wing, y: end.y - tangent.y * back + radial.y * wing };
  const b = { x: end.x - tangent.x * back - radial.x * wing, y: end.y - tangent.y * back - radial.y * wing };
  return d + `M ${coord(polar(center, radius, angleAt(length - tail)))} A ${radius} ${radius} 0 0 1 ${coord(end)} M ${coord(a)} L ${coord(end)} L ${coord(b)}`;
}
function drawLabels(center, flow, size, defs) {
  const scale = size / 560;
  const titleSize = Math.max(11.2, 17 * scale);
  const numberSize = Math.max(10.2, 13.5 * scale);
  const titleRadius = flow + (currentOption === 'three' ? Math.max(11.6, 20 * scale) : Math.max(12.8, 22 * scale));
  const numberRadius = titleRadius + (currentOption === 'three' ? Math.max(15.8, 26 * scale) : Math.max(16.8, 29 * scale));
  for (const step of stages) {
    const reverse = step.center > 90 && step.center < 270;
    const from = reverse ? step.center + 24 : step.center - 24;
    const to = reverse ? step.center - 24 : step.center + 24;
    const path = element('path', { id: `label-path-${step.number}`, d: `M ${coord(polar(center, titleRadius, from))} A ${titleRadius} ${titleRadius} 0 0 ${reverse ? 0 : 1} ${coord(polar(center, titleRadius, to))}` }, defs);
    const text = element('text', { class: 'step-label', 'font-size': titleSize });
    const pathText = element('textPath', { href: `#${path.id}`, startOffset: '50%' }, text);
    pathText.textContent = step.title;
    const p = polar(center, numberRadius, step.center);
    const num = element('text', { class: 'step-number', x: p.x, y: p.y, 'font-size': numberSize });
    num.textContent = step.number;
  }
}
function renderDiagram() {
  const size = disc.clientWidth;
  if (!size) return;
  const option = options[currentOption];
  const center = size / 2, scale = size / 560;
  const outer = size * option.outer, inner = size * option.inner;
  const flow = inner + (outer - inner) / 3;
  const breakOuter = outer + 9 * scale;
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.style.setProperty('--flow-color', option.flow);
  svg.style.setProperty('--break-color', option.red);
  svg.style.setProperty('--break-outline', option.outline);
  svg.replaceChildren();
  const defs = element('defs', {});
  stages.forEach((stage, index) => element('path', { class: 'sector', d: sectorPath(center, inner, outer, stage.from, stage.to), fill: option.colors[index] }));
  for (const segment of flowSegments) {
    element('path', { class: 'flow', d: flowPath(center, flow, segment.from, segment.to, scale, option), 'stroke-width': Math.max(1.25, option.stroke * scale) });
  }
  for (const gap of breaks) {
    const group = element('g', { class: 'break-group', 'aria-label': `断点 ${gap.id}` });
    element('path', { class: 'break-shape', d: roundedBreakPath(center, flow, breakOuter, gap.from, gap.to, scale, option.corner), 'stroke-width': Math.max(.75, 1.25 * scale) }, group);
    const middle = (gap.from + gap.to) / 2;
    const labelPosition = polar(center, (flow + breakOuter) / 2, middle);
    const label = element('text', {
      class: 'break-label', x: 0, y: 0,
      transform: `translate(${labelPosition.x} ${labelPosition.y}) rotate(${middle - 90})`,
      'font-size': Math.max(10.1, 13.5 * scale)
    }, group);
    label.textContent = `断点 ${gap.id}`;
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
  document.getElementById('radial-stage').dataset.variant = currentOption;
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
const NS = 'http://www.w3.org/2000/svg';
const descriptions = {
  one: '切线随行：五组编号与名称统一沿绿色环线的切线排布。',
  two: '双轨弧排：序号靠近绿色流程线，名称沿外侧圆弧展开。',
  three: '等距轴列：五组文字沿同一环线轨道分布，并保持正向阅读。'
};
const stages = [
  { number: '01', title: '收集参考图', lines: ['收集', '参考图'], from: 326, to: 392, center: 359, color: '#eaf1dd' },
  { number: '02', title: '构思新方案', lines: ['构思', '新方案'], from: 43, to: 104, center: 73.5, color: '#cce4c9' },
  { number: '03', title: '编写提示词', lines: ['编写', '提示词'], from: 115, to: 179, center: 147, color: '#a6d1b4' },
  { number: '04', title: 'AI 生图迭代', lines: ['AI 生图', '迭代'], from: 181, to: 248, center: 214.5, color: '#7ab698' },
  { number: '05', title: '复用图与词', lines: ['复用', '图与词'], from: 259, to: 324, center: 291.5, color: '#4f9878' }
];
const breaks = [
  { id: 'A', from: 32, to: 43 },
  { id: 'B', from: 104, to: 115 },
  { id: 'C', from: 248, to: 259 }
];
const flowSegments = [
  { from: 259, to: 392 },
  { from: 43, to: 104 },
  { from: 115, to: 248 }
];
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
function roundedBreakPath(center, inner, outer, from, to, scale) {
  const radiusTrim = 7 * scale;
  const angleTrim = 1.25;
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
function flowPath(center, radius, from, to, scale) {
  const start = polar(center, radius, from);
  const end = polar(center, radius, to);
  const angle = to * Math.PI / 180;
  const tangent = { x: Math.cos(angle), y: Math.sin(angle) };
  const radial = { x: Math.sin(angle), y: -Math.cos(angle) };
  const back = 11 * scale, wing = 5.5 * scale;
  const wingA = { x: end.x - tangent.x * back + radial.x * wing, y: end.y - tangent.y * back + radial.y * wing };
  const wingB = { x: end.x - tangent.x * back - radial.x * wing, y: end.y - tangent.y * back - radial.y * wing };
  const large = to - from > 180 ? 1 : 0;
  return `M ${coord(start)} A ${radius} ${radius} 0 ${large} 1 ${coord(end)} M ${coord(wingA)} L ${coord(end)} L ${coord(wingB)}`;
}
function combinedLabel(parent, number, title, fontSize, numberSize, spacing) {
  const text = element('text', { class: 'step-label', x: 0, y: 0, 'font-size': fontSize }, parent);
  const num = element('tspan', { class: 'step-number', 'font-size': numberSize }, text);
  num.textContent = number;
  const name = element('tspan', { dx: spacing }, text);
  name.textContent = title;
  return text;
}
function drawLabels(center, radius, size, defs) {
  const scale = size / 560;
  const titleSize = Math.max(11.5, Math.min(16, 16 * scale));
  const numberSize = Math.max(10.5, Math.min(14, 14 * scale));
  for (const step of stages) {
    const position = polar(center, radius, step.center);
    if (currentOption === 'one') {
      let angle = step.center;
      if (angle > 90 && angle < 270) angle -= 180;
      if (angle >= 270) angle -= 360;
      const group = element('g', { transform: `translate(${position.x} ${position.y}) rotate(${angle})` });
      combinedLabel(group, step.number, step.title, titleSize, numberSize, 5 * scale);
    } else if (currentOption === 'two') {
      const half = 24;
      const pathRadius = radius + 13 * scale;
      const reverse = step.center > 90 && step.center < 270;
      const from = reverse ? step.center + half : step.center - half;
      const to = reverse ? step.center - half : step.center + half;
      const p = element('path', { id: `label-path-${step.number}`, d: `M ${coord(polar(center, pathRadius, from))} A ${pathRadius} ${pathRadius} 0 0 ${reverse ? 0 : 1} ${coord(polar(center, pathRadius, to))}` }, defs);
      const text = element('text', { class: 'step-label', 'font-size': titleSize, 'text-anchor': 'middle' });
      const pathText = element('textPath', { href: `#${p.id}`, startOffset: '50%' }, text);
      pathText.textContent = step.title;
      const numberPosition = polar(center, radius - 25 * scale, step.center);
      const num = element('text', { class: 'step-label step-number', x: numberPosition.x, y: numberPosition.y, 'font-size': numberSize });
      num.textContent = step.number;
    } else {
      const group = element('g', { transform: `translate(${position.x} ${position.y})` });
      const lineGap = Math.max(17, 18 * scale);
      const num = element('text', { class: 'step-label step-number', x: 0, y: -lineGap, 'font-size': numberSize }, group);
      num.textContent = step.number;
      step.lines.forEach((line, index) => {
        const title = element('text', { class: 'step-label', x: 0, y: index * lineGap, 'font-size': titleSize }, group);
        title.textContent = line;
      });
    }
  }
}
function renderDiagram() {
  const size = disc.clientWidth;
  if (!size) return;
  const center = size / 2, scale = size / 560;
  const outer = size * .425, inner = size * .225;
  const flow = inner + (outer - inner) / 3;
  const breakOuter = outer + 10 * scale;
  const labelRadius = flow + (outer - flow) * .53;
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  svg.replaceChildren();
  const defs = element('defs', {});
  element('circle', { class: 'outer-guide', cx: center, cy: center, r: outer + 33 * scale });
  for (const stage of stages) {
    element('path', { class: 'sector', d: sectorPath(center, inner, outer, stage.from, stage.to), fill: stage.color });
  }
  for (const segment of flowSegments) {
    element('path', { class: 'flow', d: flowPath(center, flow, segment.from, segment.to, scale), 'stroke-width': 4.5 * Math.max(.72, scale) });
  }
  for (const gap of breaks) {
    element('path', { class: 'break-shape', d: roundedBreakPath(center, flow, breakOuter, gap.from, gap.to, scale), 'stroke-width': 1.6 * Math.max(.75, scale) });
    const middle = (gap.from + gap.to) / 2;
    const dotRows = 5;
    for (let row = 0; row < dotRows; row++) {
      const r = flow + (9 + row * 10) * scale;
      for (const offset of [-3.1, -1.55, 0, 1.55, 3.1]) {
        const point = polar(center, r, middle + offset);
        element('circle', { class: 'break-dot', cx: point.x, cy: point.y, r: (1.35 + row * .11) * Math.max(.78, scale) });
      }
    }
    const letterPoint = polar(center, breakOuter - 15 * scale, middle);
    const letter = element('text', { class: 'break-letter', x: letterPoint.x, y: letterPoint.y, 'font-size': Math.max(10.5, 15 * scale) });
    letter.textContent = gap.id;
  }
  drawLabels(center, labelRadius, size, defs);
  const titleSize = Math.max(20, 31 * scale);
  const centerLineGap = Math.max(29, 34 * scale);
  for (const [line, y] of [['创作流程', center + 5 * scale - centerLineGap / 2], ['断点分析', center + 5 * scale + centerLineGap / 2]]) {
    const title = element('text', { class: 'center-title', x: center, y, 'font-size': titleSize }, svg);
    title.textContent = line;
  }
}
function selectOption() {
  const requested = location.hash.slice(1);
  currentOption = Object.hasOwn(descriptions, requested) ? requested : 'one';
  buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.option === currentOption)));
  document.getElementById('option-description').textContent = descriptions[currentOption];
  renderDiagram();
}
buttons.forEach((button, index) => {
  button.addEventListener('click', () => { history.replaceState(null, '', '#' + button.dataset.option); selectOption(); });
  button.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
      : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].focus();
    buttons[next].click();
  });
});
window.addEventListener('hashchange', selectOption);
new ResizeObserver(renderDiagram).observe(disc);
selectOption();
const descriptions = {
  one: '均衡放射：五段绿扇面逐级加深，椭圆断口里铺放射状反白点。',
  two: '轻盈留白：加宽五段之间的白缝，用更疏的放射白点保持断裂感。',
  three: '层次点阵：加大绿色色阶与白点密度，使三处椭圆断口更醒目。'
};
const gaps = [
  { name: 'a', angle: 37.5 },
  { name: 'b', angle: 109.5 },
  { name: 'c', angle: 253.5 }
];
const stage = document.getElementById('radial-stage');
const disc = stage.querySelector('.radial-disc');
const dotsLayer = stage.querySelector('.radial-dots');
const buttons = [...document.querySelectorAll('[data-option]')];
let currentOption = 'one';

function polarPoint(size, radius, angle) {
  const radians = (angle - 90) * Math.PI / 180;
  return {
    x: size / 2 + Math.cos(radians) * radius,
    y: size / 2 + Math.sin(radians) * radius
  };
}

function renderGeometry() {
  const size = disc.clientWidth;
  const computed = getComputedStyle(disc);
  const band = Number.parseFloat(computed.getPropertyValue('--band-thickness'));
  const offset = Number.parseFloat(computed.getPropertyValue('--flow-offset'));
  if (!size || !Number.isFinite(band) || !Number.isFinite(offset)) return;

  const outerRadius = size * (1 - 0.148) / 2;
  const lineRadius = outerRadius - band + offset;
  const capsuleLength = outerRadius - lineRadius;
  const dotAngles = currentOption === 'two' ? [-2.7, 0, 2.7]
    : currentOption === 'three' ? [-3.1, -1.85, -.6, .6, 1.85, 3.1]
    : [-3, -1.5, 0, 1.5, 3];
  const dotRows = currentOption === 'three' ? 6 : 5;
  const dotStart = lineRadius + Math.max(7, capsuleLength * .15);
  const dotEnd = outerRadius - Math.max(17, capsuleLength * .31);
  const scale = Math.max(.76, Math.min(1, size / 560));
  const dots = document.createDocumentFragment();

  for (const gap of gaps) {
    const capsule = disc.querySelector('.capsule-' + gap.name);
    const center = polarPoint(size, (lineRadius + outerRadius) / 2, gap.angle);
    capsule.style.left = center.x + 'px';
    capsule.style.top = center.y + 'px';
    capsule.style.height = capsuleLength + 'px';
    capsule.style.setProperty('--capsule-angle', gap.angle + 'deg');
    capsule.style.setProperty('--inverse-angle', -gap.angle + 'deg');

    for (let row = 0; row < dotRows; row++) {
      const radius = dotStart + (dotEnd - dotStart) * row / (dotRows - 1);
      for (const angleOffset of dotAngles) {
        const point = polarPoint(size, radius, gap.angle + angleOffset);
        const dot = document.createElement('span');
        const diameter = (currentOption === 'two' ? 3.2 + row * .25 : 2.55 + row * .28) * scale;
        dot.style.left = point.x + 'px';
        dot.style.top = point.y + 'px';
        dot.style.width = diameter + 'px';
        dot.style.height = diameter + 'px';
        dots.appendChild(dot);
      }
    }
  }
  dotsLayer.replaceChildren(dots);
}

function selectOption() {
  const requested = location.hash.slice(1);
  currentOption = Object.hasOwn(descriptions, requested) ? requested : 'one';
  stage.classList.remove('treatment-one', 'treatment-two', 'treatment-three');
  stage.classList.add('treatment-' + currentOption);
  buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.option === currentOption)));
  document.getElementById('option-description').textContent = descriptions[currentOption];
  renderGeometry();
}

buttons.forEach((button, index) => {
  button.addEventListener('click', () => {
    history.replaceState(null, '', '#' + button.dataset.option);
    selectOption();
  });
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
new ResizeObserver(renderGeometry).observe(disc);
selectOption();
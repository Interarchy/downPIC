const descriptions = {
  one: '五步横向同轴，四处衔接清楚断开；下方三类痛点共用标题与说明基线。',
  two: '五步围成一圈，三处可见缺口与右侧 A / B / C 三类问题逐一对应。',
  three: '五段步骤与内侧流程环线同轴；三处缺口用暗红斜线强调，右侧只展示 A / B / C 痛点。'
};
const buttons = [...document.querySelectorAll('[data-option]')];
function selectOption() {
  const requested = location.hash.slice(1);
  const option = Object.hasOwn(descriptions, requested) ? requested : 'one';
  document.querySelectorAll('.variant').forEach(section => { section.hidden = section.id !== 'panel-' + option; });
  buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.option === option)));
  document.getElementById('variant-description').textContent = descriptions[option];
}
buttons.forEach((button, index) => {
  button.addEventListener('click', () => {
    history.replaceState(null, '', '#' + button.dataset.option);
    selectOption();
  });
  button.addEventListener('keydown', event => {
    const key = event.key;
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(key)) return;
    event.preventDefault();
    const next = key === 'Home' ? 0 : key === 'End' ? buttons.length - 1 : (index + (key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].focus();
    buttons[next].click();
  });
});
window.addEventListener('hashchange', selectOption);
selectOption();

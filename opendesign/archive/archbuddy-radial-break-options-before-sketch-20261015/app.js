const descriptions = {
  one: '轻点网：暗红细点融进三处断口，保留清晰的绿色环线和箭头。',
  two: '留白点桥：让空白承担主要断裂感，只在每处中段留下克制的点群。',
  three: '反白点阵：柔和暗红填入断口，浅色微点减轻色块重量。'
};
const stage = document.getElementById('radial-stage');
const buttons = [...document.querySelectorAll('[data-option]')];
function selectOption() {
  const requested = location.hash.slice(1);
  const option = Object.hasOwn(descriptions, requested) ? requested : 'one';
  stage.classList.remove('treatment-one', 'treatment-two', 'treatment-three');
  stage.classList.add('treatment-' + option);
  buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.option === option)));
  document.getElementById('option-description').textContent = descriptions[option];
}
buttons.forEach((button, index) => {
  button.addEventListener('click', () => { history.replaceState(null, '', '#' + button.dataset.option); selectOption(); });
  button.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].focus();
    buttons[next].click();
  });
});
window.addEventListener('hashchange', selectOption);
selectOption();

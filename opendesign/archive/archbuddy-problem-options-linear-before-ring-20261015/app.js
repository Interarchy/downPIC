const descriptions = {
  one: '五步横向等宽排列，三个痛点通过步骤编号明确对应；去掉断链符号与跨栏括线。',
  two: '把路径归为参考、表达、复用三段；小流程、断点与大字结论上下对齐，适合首页快速浏览。',
  three: '左侧按顺序展示五步，右侧对齐三类痛点；逐段建立关系，适合讲解完整创作过程。'
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

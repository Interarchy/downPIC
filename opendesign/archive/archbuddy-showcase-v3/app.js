(() => {
  'use strict';
  const header = document.querySelector('.site-header');
  const updateHeader = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
  window.addEventListener('scroll', updateHeader, { passive: true });
  updateHeader();
  const imageBase = 'case-study/assets/';
  const galleries = {
    prompt: [
      {image:'04-prompt-builder-1280x800.png',alt:'ArchBuddy 提示词构建实际界面',caption:'实际侧栏组合截图 · 建筑素材与 Prompt 为演示资料'},
      {image:'05-prompt-optimization-1280x800.png',alt:'ArchBuddy 效果评估入口实际界面',caption:'实际评估入口 · 演示资料'}
    ],
    assets: [
      {image:'03-prompt-library-1280x800.png',alt:'ArchBuddy 提示词库实际界面',caption:'实际词库界面 · 演示资料'},
      {image:'02-image-description-1280x800.png',alt:'ArchBuddy 参考图详情实际界面',caption:'实际图片详情 · 演示资料'}
    ]
  };
  document.querySelectorAll('[data-gallery]').forEach(figure => {
    figure.querySelectorAll('[data-variant]').forEach(button => button.addEventListener('click',() => {
      const variant = galleries[figure.dataset.gallery][Number(button.dataset.variant)];
      if (!variant) return;
      const image = figure.querySelector('img');
      image.src = imageBase + variant.image;
      image.alt = variant.alt;
      figure.querySelector('[data-caption]').textContent = variant.caption;
      figure.querySelectorAll('[data-variant]').forEach(other => other.setAttribute('aria-pressed',String(other === button)));
    }));
  });
  const dialog = document.getElementById('image-dialog');
  document.querySelectorAll('[data-enlarge]').forEach(button => button.addEventListener('click',() => {
    const source = document.getElementById(button.dataset.enlarge);
    const large = document.getElementById('dialog-image');
    large.src = source.src;
    large.alt = source.alt;
    dialog.showModal();
  }));
  document.querySelector('[data-close-dialog]').addEventListener('click',() => dialog.close());
  dialog.addEventListener('click',event => {
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
  document.querySelector('[data-copy-address]').addEventListener('click',async () => {
    const feedback = document.getElementById('copy-feedback');
    try {await navigator.clipboard.writeText('chrome://extensions/');feedback.textContent = '已复制，请粘贴到 Chrome 地址栏。';}
    catch {feedback.textContent = '请复制：chrome://extensions/';}
  });
})();

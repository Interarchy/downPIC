(() => {
  'use strict';
  const header = document.querySelector('.site-header');
  const updateHeader = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
  window.addEventListener('scroll', updateHeader, { passive: true });
  updateHeader();
  const imageBase = 'case-study/assets/';
  const galleries = {
    prompt: [
      {image:'04-prompt-builder-1280x800.png',alt:'ArchBuddy 提示词构建实际界面'},
      {image:'05-prompt-optimization-1280x800.png',alt:'ArchBuddy 效果评估入口实际界面'}
    ],
    assets: [
      {image:'03-prompt-library-1280x800.png',alt:'ArchBuddy 提示词库实际界面'},
      {image:'02-image-description-1280x800.png',alt:'ArchBuddy 参考图详情实际界面'}
    ]
  };
  document.querySelectorAll('[data-gallery]').forEach(figure => {
    figure.querySelectorAll('[data-variant]').forEach(button => button.addEventListener('click',() => {
      const variant = galleries[figure.dataset.gallery][Number(button.dataset.variant)];
      if (!variant) return;
      const image = figure.querySelector('img');
      image.src = imageBase + variant.image;
      image.alt = variant.alt;
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
  // 仅启用已选定的轻量进入，不改变原有滚轮和阅读位置。
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  if (motionPreference.matches || !('IntersectionObserver' in window)) return;
  const motionParts = [];
  ['problem', 'workflow', 'concept', 'features', 'install'].forEach(id => {
    const section = document.getElementById(id);
    let heading = section.querySelector('.section-heading,.install-heading');
    if (!heading) {
      const label = section.querySelector('.section-label');
      const title = section.querySelector('h2');
      heading = document.createElement('div');
      label.parentElement.insertBefore(heading,label);
      heading.append(label,title);
    }
    heading.classList.add('motion-heading','motion-part');
    const host = heading.parentElement;
    const stage = document.createElement('div');
    stage.className = 'motion-stage motion-part';
    while (heading.nextSibling) stage.append(heading.nextSibling);
    host.append(stage);
    motionParts.push(heading,stage);
  });
  const motionObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-revealed');
        motionObserver.unobserve(entry.target);
      }
    });
  },{rootMargin:'0px 0px -10% 0px',threshold:0});
  motionParts.forEach(part => motionObserver.observe(part));
  document.body.dataset.motion = 'reveal';
  motionPreference.addEventListener('change',event => {
    if (event.matches) {
      motionObserver.disconnect();
      delete document.body.dataset.motion;
    }
  });
})();

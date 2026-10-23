(() => {
  'use strict';
  const supported = matchMedia('(hover:hover) and (pointer:fine) and (prefers-reduced-motion:no-preference)');
  if (!supported.matches) return;
  const aura = document.createElement('div');
  aura.className = 'cursor-aura';
  aura.setAttribute('aria-hidden', 'true');
  aura.innerHTML = '<span class="cursor-aura-glow"></span><span class="cursor-aura-ring"></span>';
  document.body.append(aura);
  let x = -500, y = -500, scheduled = false;
  const draw = () => {
    scheduled = false;
    aura.style.transform = `translate3d(${x}px,${y}px,0)`;
  };
  document.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse') return;
    x = event.clientX; y = event.clientY;
    const target = event.target instanceof Element ? event.target : null;
    aura.dataset.surface = target?.closest('#concept,#features') ? 'light' : 'dark';
    aura.classList.toggle('is-link', Boolean(target?.closest('a,button,summary,[role="button"]')));
    aura.classList.add('is-visible');
    document.body.classList.add('has-cursor-aura');
    if (!scheduled) { scheduled = true; requestAnimationFrame(draw); }
  }, { passive: true });
  const hide = () => {
    aura.classList.remove('is-visible');
    document.body.classList.remove('has-cursor-aura');
  };
  document.addEventListener('pointerleave', hide);
  window.addEventListener('blur', hide);
})();

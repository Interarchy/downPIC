(() => {
  const section = document.querySelector('#concept');
  if (!section) return;

  const cards = [...section.querySelectorAll('[data-concept-card]')];
  const comparison = section.querySelector('.comparison');
  const range = comparison.querySelector('.compare-range');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let wipeFrame = 0;
  let wipeTimer = 0;
  const updateSplit = () => comparison.style.setProperty('--split', `${range.value}%`);
  const stopWipe = () => {
    clearTimeout(wipeTimer);
    cancelAnimationFrame(wipeFrame);
  };
  const startWipe = () => {
    stopWipe();
    range.value = '0';
    updateSplit();
    if (reducedMotion.matches) {
      range.value = '78';
      updateSplit();
      return;
    }
    wipeTimer = setTimeout(() => {
      let startTime;
      const step = time => {
        if (startTime === undefined) startTime = time;
        const progress = Math.min((time - startTime) / 3400, 1);
        range.value = String(Math.round(78 * (1 - Math.pow(1 - progress, 2))));
        updateSplit();
        if (progress < 1) wipeFrame = requestAnimationFrame(step);
      };
      wipeFrame = requestAnimationFrame(step);
    }, 480);
  };
  const setOpen = (card, open) => {
    card.classList.toggle('is-open', open);
    const front = card.querySelector('.concept-front-button');
    const back = card.querySelector('.concept-back');
    front.setAttribute('aria-expanded', String(open));
    front.inert = open;
    back.inert = !open;
  };

  cards.forEach(card => {
    const front = card.querySelector('.concept-front-button');
    const back = card.querySelector('.concept-back');
    const close = card.querySelector('.concept-close');
    back.inert = true;

    front.addEventListener('click', () => {
      cards.forEach(other => { if (other !== card) setOpen(other, false); });
      card.classList.remove('is-hover-suppressed');
      setOpen(card, true);
      if (card.dataset.conceptCard === 'compare') {
        startWipe();
        range.focus({ preventScroll: true });
      }
    });

    close.addEventListener('click', () => {
      setOpen(card, false);
      card.classList.add('is-hover-suppressed');
      if (card.dataset.conceptCard === 'compare') stopWipe();
      front.focus({ preventScroll: true });
    });

    card.addEventListener('pointerenter', event => {
      if (event.pointerType !== 'mouse' || card.classList.contains('is-hover-suppressed')) return;
      back.inert = false;
      if (card.dataset.conceptCard === 'compare') startWipe();
    });
    card.addEventListener('pointerleave', () => {
      card.classList.remove('is-hover-suppressed');
      if (!card.classList.contains('is-open')) {
        back.inert = true;
        if (card.dataset.conceptCard === 'compare') {
          stopWipe();
          range.value = '0';
          updateSplit();
        }
      }
    });
  });

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const active = cards.find(card => card.classList.contains('is-open'));
    if (!active) return;
    setOpen(active, false);
    active.classList.add('is-hover-suppressed');
    if (active.dataset.conceptCard === 'compare') stopWipe();
    active.querySelector('.concept-front-button').focus({ preventScroll: true });
  });

  range.addEventListener('input', () => { stopWipe(); updateSplit(); });
  const setFromPointer = event => {
    const bounds = comparison.getBoundingClientRect();
    range.value = String(Math.round(Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)) * 100));
    updateSplit();
  };
  range.addEventListener('pointerdown', event => {
    stopWipe();
    range.setPointerCapture(event.pointerId);
    setFromPointer(event);
  });
  range.addEventListener('pointermove', event => {
    if (range.hasPointerCapture(event.pointerId)) setFromPointer(event);
  });

  const storage = section.querySelector('.creation-storage');
  const shell = section.querySelector('.creation-storage-shell');
  const reveal = section.querySelector('.creation-reveal');
  const setExpanded = expanded => {
    shell.classList.toggle('is-expanded', expanded);
    storage.setAttribute('aria-expanded', String(expanded));
    storage.setAttribute('aria-label', document.documentElement.lang.startsWith('en') ? `${expanded ? 'Collapse' : 'Expand'} the ArchBuddy Project Library` : `${expanded ? '收起' : '展开查看'} ArchBuddy 项目图库实际界面`);
    reveal.setAttribute('aria-hidden', String(!expanded));
  };
  const hasFineHover = () => matchMedia('(hover:hover) and (pointer:fine)').matches;
  shell.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse' && hasFineHover()) setExpanded(true); });
  storage.addEventListener('click', event => {
    if (event.detail && hasFineHover()) return;
    setExpanded(storage.getAttribute('aria-expanded') !== 'true');
  });
})();

(() => {
  'use strict';
  const menus = [...document.querySelectorAll('.nav-library')];
  if (!menus.length) return;
  const closeOutside = event => {
    for (const menu of menus) if (menu.open && !menu.contains(event.target)) menu.open = false;
  };
  document.addEventListener('pointerdown', closeOutside);
  document.addEventListener('focusin', closeOutside);
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    for (const menu of menus) {
      if (!menu.open) continue;
      menu.open = false;
      menu.querySelector('summary')?.focus();
    }
  });
  for (const menu of menus) {
    menu.querySelectorAll('.nav-library-menu a').forEach(link => {
      link.addEventListener('click', () => { menu.open = false; });
    });
  }
})();

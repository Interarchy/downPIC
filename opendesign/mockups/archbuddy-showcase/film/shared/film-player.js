(() => {
  'use strict';
  const clamp = value => Math.min(1, Math.max(0, value));
  const ramp = (t, start, end) => clamp((t - start) / (end - start));
  const ease = value => { const p = clamp(value); return p * p * (3 - 2 * p); };
  const type = (element, text, t, start, end) => {
    if (!element) return;
    const value = Array.from(text).slice(0, Math.floor(Array.from(text).length * ramp(t, start, end))).join('');
    if (element.textContent !== value) element.textContent = value;
    element.classList.toggle('typing', t >= start && t < end);
  };
  const show = (element, visible) => { if (element) element.classList.toggle('visible', Boolean(visible)); };
  window.__filmErrors = [];
  window.addEventListener('error', event => window.__filmErrors.push(event.message));
  window.ArchBuddyFilm = { ramp, ease, type, show, create({ duration, render }) {
    const film = document.querySelector('.film');
    const params = new URLSearchParams(location.search);
    const clean = params.get('clean') === '1';
    document.body.classList.toggle('clean', clean);
    const fit = () => {
      const scale = Math.min((innerWidth - (clean ? 0 : 40)) / 1440, (innerHeight - (clean ? 0 : 105)) / 810, 1);
      film.style.zoom = String(Math.max(.15, scale));
    };
    let frame = 0, started = 0;
    const draw = t => {
      film.dataset.time = t.toFixed(2);
      film.dataset.complete = String(t >= duration);
      render(t);
      window.renderFilmCaption?.(t);
      const time = document.getElementById('player-time');
      if (time) time.textContent = Math.min(duration, t).toFixed(0) + ' / ' + duration + ' 秒';
    };
    const tick = now => {
      const time = Math.min((now - started) / 1000, duration);
      draw(time);
      if (time < duration) frame = requestAnimationFrame(tick);
    };
    const play = () => { cancelAnimationFrame(frame); started = performance.now(); draw(0); frame = requestAnimationFrame(tick); };
    document.getElementById('replay')?.addEventListener('click', play);
    window.addEventListener('resize', fit, { passive:true });
    fit();
    if (params.get('controlled') === '1') draw(0);
    else if (params.has('t')) draw(Math.max(0, Math.min(duration, Number(params.get('t')) || 0)));
    else if (matchMedia('(prefers-reduced-motion: reduce)').matches) draw(duration);
    else play();
    window.__archbuddyFilm = { seek(t) { cancelAnimationFrame(frame); draw(Math.max(0, Math.min(duration, t))); }, play, duration };
  }};
})();

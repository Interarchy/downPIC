(() => {
  'use strict';
  const W = 1440, H = 810, DURATION = 16000;
  const film = document.getElementById('film');
  const page = document.getElementById('case-page');
  const viewport = document.getElementById('browser-viewport');
  const shots = [...document.querySelectorAll('.case-shot')];
  const saved = [...document.querySelectorAll('.saved-image')];
  const toolbar = document.getElementById('floating-toolbar');
  const saveButton = toolbar.querySelector('[data-action="save"]');
  const feedback = document.getElementById('toolbar-feedback');
  const ring = document.getElementById('click-ring');
  const folder = document.getElementById('new-folder');
  const folderContent = document.getElementById('folder-content');
  const folderSubtitle = document.getElementById('folder-subtitle');
  const fileCount = document.getElementById('file-count');
  const fileStatus = document.getElementById('file-status');
  const footer = document.getElementById('footer-caption');
  const progress = document.getElementById('progress-bar');
  const thumb = document.getElementById('browser-scroll-thumb');
  let timers = [], animations = [], scroll = 0, runId = 0;
  function scaleFactor() { return film.getBoundingClientRect().width / W || 1; }
  function fit() {
    const scale = Math.min((innerWidth - 40) / W, (innerHeight - 100) / H, 1);
    film.style.zoom = String(Math.max(.18, scale));
  }
  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
  function clearRun() {
    timers.forEach(clearTimeout); timers = [];
    animations.forEach(animation => { try { animation.cancel(); } catch {} }); animations = [];
    film.querySelectorAll('.save-flight').forEach(element => element.remove());
  }
  function hideToolbar() {
    toolbar.classList.remove('visible', 'pressed');
    toolbar.setAttribute('aria-hidden', 'true');
    feedback.hidden = true;
    ring.classList.remove('pulse');
    shots.forEach(shot => shot.classList.remove('active'));
    shots.forEach(shot => shot.querySelector('.case-image')?.classList.remove('extracting'));
  }
  function reset() {
    clearRun(); runId++;
    film.classList.remove('is-playing');
    hideToolbar();
    scroll = 0; page.style.transform = 'translateY(0px)';
    folder.classList.remove('visible', 'pulse');
    folderContent.classList.remove('visible');
    saved.forEach(item => item.classList.remove('visible', 'arriving', 'just-arrived'));
    folderSubtitle.textContent = '新建项目文件夹';
    fileStatus.textContent = '已有 2 个项目文件夹';
    fileCount.textContent = '0 张新保存';
    footer.textContent = '遇到好参考，顺手保存。';
    saveButton.textContent = '保存图片';
    progress.style.transition = 'none'; progress.style.width = '0%';
    thumb.style.transform = 'translateY(0px)';
  }
  function scrollToShot(index, token) {
    if (token !== runId) return;
    hideToolbar();
    const image = shots[index].querySelector('.case-image');
    const target = Math.max(0, Math.min(page.scrollHeight - viewport.clientHeight, image.offsetTop - 52));
    const from = scroll;
    const animation = page.animate(
      [{ transform: 'translateY(' + (-from) + 'px)' }, { transform: 'translateY(' + (-target) + 'px)' }],
      { duration: 820, easing: 'cubic-bezier(.35,.04,.23,1)', fill: 'forwards' }
    );
    animations.push(animation);
    animation.onfinish = () => {
      if (token !== runId) return;
      scroll = target;
      page.style.transform = 'translateY(' + (-target) + 'px)';
      animation.cancel();
      const track = document.querySelector('.browser-scroll-track');
      const maxTravel = track.clientHeight - thumb.clientHeight;
      const maxScroll = Math.max(1, page.scrollHeight - viewport.clientHeight);
      thumb.style.transform = 'translateY(' + (maxTravel * target / maxScroll) + 'px)';
    };
    fileStatus.textContent = index === 0 ? '浏览案例页面' : '继续向下浏览';
  }
  function showToolbar(index, token) {
    if (token !== runId) return;
    const shot = shots[index], image = shot.querySelector('.case-image');
    const imageRect = image.getBoundingClientRect(), viewRect = viewport.getBoundingClientRect();
    const scale = scaleFactor();
    toolbar.style.top = ((imageRect.top - viewRect.top) / scale + 10) + 'px';
    toolbar.style.left = ((imageRect.left - viewRect.left + imageRect.width / 2) / scale) + 'px';
    saveButton.textContent = '保存图片';
    feedback.hidden = true;
    shot.classList.add('active');
    toolbar.classList.add('visible');
    toolbar.setAttribute('aria-hidden', 'false');
  }
  function pressSave(index, token) {
    if (token !== runId) return;
    toolbar.classList.add('pressed');
    saveButton.textContent = '保存中…';
    const buttonRect = saveButton.getBoundingClientRect(), viewRect = viewport.getBoundingClientRect(), scale = scaleFactor();
    ring.style.left = ((buttonRect.left - viewRect.left + buttonRect.width / 2) / scale) + 'px';
    ring.style.top = ((buttonRect.top - viewRect.top + buttonRect.height / 2) / scale) + 'px';
    ring.classList.remove('pulse'); void ring.offsetWidth; ring.classList.add('pulse');
    if (index === 0) { folder.classList.add('visible'); folderContent.classList.add('visible'); }
    saved[index].classList.add('arriving');
    fileStatus.textContent = index === 0 ? '正在创建项目文件夹…' : '正在保存第 ' + (index + 1) + ' 张图片…';
  }
  function launchFlight(index, token) {
    if (token !== runId) return;
    const source = shots[index].querySelector('.case-image');
    const destination = saved[index];
    const filmRect = film.getBoundingClientRect();
    const sourceRect = source.getBoundingClientRect();
    const destRect = destination.getBoundingClientRect();
    const scale = scaleFactor();
    const startX = (sourceRect.left - filmRect.left) / scale;
    const startY = (sourceRect.top - filmRect.top) / scale;
    const dx = (destRect.left - sourceRect.left) / scale;
    const dy = (destRect.top - sourceRect.top) / scale;
    const endScaleX = destRect.width / sourceRect.width;
    const endScaleY = destRect.height / sourceRect.height;
    const flight = document.createElement('div');
    flight.className = 'save-flight';
    flight.style.cssText = 'left:' + startX + 'px;top:' + startY + 'px;width:' + (sourceRect.width / scale) + 'px;height:' + (sourceRect.height / scale) + 'px;--x:' + source.style.getPropertyValue('--x') + ';--y:' + source.style.getPropertyValue('--y') + ';';
    film.append(flight);
    source.classList.add('extracting');
    fileStatus.textContent = '图片自动收进项目文件夹';
    const animation = flight.animate([
      { transform: 'translate(0px,0px) scale(1,1)', opacity: .98, filter: 'brightness(1.1)', offset: 0 },
      { transform: 'translate(' + (dx * .36) + 'px,' + (dy * .30 - 40) + 'px) scale(.54,.58)', opacity: .96, filter: 'brightness(1.2) blur(.3px)', offset: .42 },
      { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + endScaleX + ',' + endScaleY + ')', opacity: 1, filter: 'brightness(1.15)', offset: 1 }
    ], { duration: 850, easing: 'cubic-bezier(.22,.75,.2,1)', fill: 'forwards' });
    animations.push(animation);
    animation.onfinish = () => {
      if (token !== runId) return;
      source.classList.remove('extracting');
      flight.remove();
      finishSave(index, token);
    };
  }
  function finishSave(index, token) {
    if (token !== runId) return;
    saved[index].classList.remove('arriving');
    saved[index].classList.add('visible', 'just-arrived');
    later(() => saved[index].classList.remove('just-arrived'), 520);
    folder.classList.add('pulse');
    later(() => folder.classList.remove('pulse'), 450);
    folderSubtitle.textContent = (index + 1) + ' 张图片';
    fileCount.textContent = (index + 1) + ' 张新保存';
    fileStatus.textContent = index === 0 ? '按网页标题自动建立文件夹' : '图片已加入水岸文化中心';
    footer.textContent = index === 0 ? '第一张：自动建立项目文件夹。' : '继续浏览，图片自动归入同一项目。';
    saveButton.textContent = '已保存';
    toolbar.classList.remove('pressed');
    feedback.hidden = false;
  }
  function play() {
    reset(); const token = runId;
    film.classList.add('is-playing');
    void progress.offsetWidth;
    progress.style.transition = 'width ' + DURATION + 'ms linear';
    requestAnimationFrame(() => { if (token === runId) progress.style.width = '100%'; });
    [900, 4100, 7300, 10500].forEach((start, index) => {
      later(() => scrollToShot(index, token), start);
      later(() => showToolbar(index, token), start + 900);
      later(() => pressSave(index, token), start + 1450);
      later(() => launchFlight(index, token), start + 1600);
      later(() => { if (token === runId) hideToolbar(); }, start + 2900);
    });
    later(() => { if (token !== runId) return; fileStatus.textContent = '采集完成 · 1 个项目文件夹'; footer.textContent = '四张参考，沿着浏览路径自然归档。'; }, 14500);
  }
  document.getElementById('replay').addEventListener('click', play);
  window.addEventListener('resize', fit, { passive: true });
  fit();
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    reset(); film.classList.add('is-playing');
    folder.classList.add('visible'); folderContent.classList.add('visible');
    saved.forEach(item => item.classList.add('visible'));
    folderSubtitle.textContent = '4 张图片'; fileCount.textContent = '4 张新保存';
    fileStatus.textContent = '采集完成 · 1 个项目文件夹';
    footer.textContent = '四张参考，沿着浏览路径自然归档。'; progress.style.width = '100%';
  } else play();
})();
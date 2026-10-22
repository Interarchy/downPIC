(() => {
  'use strict';
  const W = 1440, H = 810, DURATION = 16500;
  const film = document.getElementById('film');
  const cards = [...document.querySelectorAll('.reference-card')];
  const panel = document.getElementById('prompt-panel');
  const joinOne = document.getElementById('join-one');
  const joinTwo = document.getElementById('join-two');
  const combineArrow = document.getElementById('combine-arrow');
  const panelRows = [...document.querySelectorAll('.panel-row')];
  const progress = document.getElementById('progress-bar');
  const compositionProgress = document.getElementById('composition-progress');
  const compositionPercent = document.getElementById('composition-percent');
  const compositionLabel = document.getElementById('composition-label');
  const selectedCount = document.getElementById('selected-count');
  const moduleCount = document.getElementById('module-count');
  const confirm = document.getElementById('confirm-button');
  const footer = document.getElementById('footer-caption');
  const copy = [
    ['沿水岸连续展开的公共文化建筑，连接城市步道与亲水平台。', '低矮而舒展的水平体量，以层叠屋面回应河岸的自然走势。'],
    ['高位鸟瞰同时呈现河道、绿地与建筑的整体空间关系。', '滨水步道穿行于草地与树影之间，形成开放连续的公共界面。'],
    ['温润木构搭配浅色石材和通透玻璃，呈现清晰细腻的质感。', '柔和自然光落在廊道与庭院，营造克制而温暖的氛围。']
  ];
  const assembled = copy.flat();
  let timers = [], runId = 0;
  function fit() {
    const scale = Math.min((innerWidth - 40) / W, (innerHeight - 100) / H, 1);
    film.style.zoom = String(Math.max(.18, scale));
  }
  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
  function typeText(element, value, start, speed, token) {
    const chars = Array.from(value);
    later(() => { if (token === runId) element.classList.add('typing'); }, start);
    chars.forEach((_, index) => later(() => {
      if (token === runId) element.textContent = chars.slice(0, index + 1).join('');
    }, start + (index + 1) * speed));
    later(() => { if (token === runId) element.classList.remove('typing'); }, start + (chars.length + 1) * speed);
  }
  function reset() {
    timers.forEach(clearTimeout); timers = []; runId++;
    film.classList.remove('is-playing');
    cards.forEach(card => {
      card.classList.remove('visible', 'has-copy', 'selected');
      card.style.left = '1350px';
      card.querySelectorAll('.typed').forEach(line => { line.textContent = ''; line.classList.remove('typing'); });
      card.querySelector('.action-label').textContent = '加入整体 Prompt';
    });
    panel.classList.remove('visible'); panel.style.left = '1350px';
    joinOne.classList.remove('visible'); joinTwo.classList.remove('visible'); combineArrow.classList.remove('visible');
    panelRows.forEach(row => { row.classList.remove('visible'); const line = row.querySelector('.panel-typed'); line.textContent = ''; line.classList.remove('typing'); });
    compositionProgress.style.width = '0%';
    compositionPercent.textContent = '00%';
    compositionLabel.textContent = '参考图逐张进入构建';
    selectedCount.textContent = '已选 0 / 3 张参考图';
    moduleCount.textContent = '0 个设计维度';
    confirm.classList.remove('ready');
    footer.textContent = '每张参考，都有可用的设计语言。';
    progress.style.transition = 'none'; progress.style.width = '0%';
  }
  function stage(count, token) {
    if (token !== runId) return;
    cards.slice(0, count).forEach((card, index) => {
      if (!card.classList.contains('visible')) { card.classList.add('visible'); void card.offsetWidth; }
      card.style.left = (index * 330) + 'px';
    });
    compositionProgress.style.width = (count * 25) + '%';
    compositionPercent.textContent = String(count * 25).padStart(2, '0') + '%';
    compositionLabel.textContent = count === 1 ? '第一张参考：建筑的主体与体量' : count === 2 ? '第二张参考：补充鸟瞰与景观' : '第三张参考：加入材料与光线';
  }
  function typeCard(index, token) {
    if (token !== runId) return;
    const card = cards[index];
    const lines = [...card.querySelectorAll('.typed')];
    typeText(lines[0], copy[index][0], 0, 42, token);
    typeText(lines[1], copy[index][1], 750, 42, token);
    later(() => { if (token === runId) card.classList.add('has-copy'); }, 1340);
  }
  function selectCard(index, token) {
    if (token !== runId) return;
    cards[index].classList.add('selected');
    cards[index].querySelector('.action-label').textContent = '已加入整体 Prompt';
    selectedCount.textContent = '已选 ' + (index + 1) + ' / 3 张参考图';
    if (index === 0) joinOne.classList.add('visible');
    if (index === 1) joinTwo.classList.add('visible');
    if (index === 2) combineArrow.classList.add('visible');
  }
  function assemble(token) {
    if (token !== runId) return;
    cards.forEach((card, index) => { card.style.left = (index * 330) + 'px'; });
    panel.classList.add('visible'); void panel.offsetWidth; panel.style.left = '1000px';
    compositionProgress.style.width = '100%';
    compositionPercent.textContent = '100%';
    compositionLabel.textContent = '设计维度汇入整体 Prompt';
    panelRows.forEach((row, index) => {
      later(() => { if (token !== runId) return; row.classList.add('visible'); moduleCount.textContent = (index + 1) + ' 个设计维度'; }, 1150 + index * 470);
      typeText(row.querySelector('.panel-typed'), assembled[index], 1280 + index * 470, 22, token);
    });
    later(() => { if (token !== runId) return; confirm.classList.add('ready'); footer.textContent = '三张参考，汇成一个可编辑的 Prompt。'; }, 4550);
  }
  function play() {
    reset(); const token = runId; film.classList.add('is-playing');
    void progress.offsetWidth;
    progress.style.transition = 'width ' + DURATION + 'ms linear';
    requestAnimationFrame(() => { if (token === runId) progress.style.width = '100%'; });
    later(() => stage(1, token), 900);
    later(() => typeCard(0, token), 1800);
    later(() => selectCard(0, token), 3400);
    later(() => stage(2, token), 4100);
    later(() => typeCard(1, token), 5000);
    later(() => selectCard(1, token), 6600);
    later(() => stage(3, token), 7300);
    later(() => typeCard(2, token), 8200);
    later(() => selectCard(2, token), 9800);
    later(() => assemble(token), 10500);
  }
  document.getElementById('replay').addEventListener('click', play);
  window.addEventListener('resize', fit, { passive: true });
  fit();
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    reset(); film.classList.add('is-playing');
    cards.forEach((card, index) => {
      card.classList.add('visible', 'has-copy', 'selected');
      card.style.left = (index * 330) + 'px';
      card.querySelectorAll('.typed').forEach((line, lineIndex) => { line.textContent = copy[index][lineIndex]; });
      card.querySelector('.action-label').textContent = '已加入整体 Prompt';
    });
    joinOne.classList.add('visible'); joinTwo.classList.add('visible'); combineArrow.classList.add('visible');
    panel.classList.add('visible'); panel.style.left = '1000px';
    panelRows.forEach((row, index) => { row.classList.add('visible'); row.querySelector('.panel-typed').textContent = assembled[index]; });
    selectedCount.textContent = '已选 3 / 3 张参考图';
    moduleCount.textContent = '6 个设计维度';
    confirm.classList.add('ready');
    compositionProgress.style.width = '100%'; compositionPercent.textContent = '100%';
    compositionLabel.textContent = '设计维度汇入整体 Prompt';
    footer.textContent = '三张参考，汇成一个可编辑的 Prompt。';
    progress.style.width = '100%';
  } else play();
})();
(() => {
  if (window.__downPicBetaActive) return;
  window.__downPicBetaActive = true;

  const STORAGE = {
    captureEnabled: 'capture_enabled',
    projectType: 'default_project_type',
    customTypes: 'custom_project_types',
  };
  const PRESET_TYPES = ['文化建筑', '教育建筑', '办公建筑', '社区建筑'];
  let captureEnabled = false;
  let defaultType = '文化建筑';
  let customTypes = [];
  let toolbar = null;
  let currentImage = null;
  let showTimer = null;
  let hideTimer = null;
  let busy = false;
  let toolbarPinned = false;

  chrome.storage.local.get([STORAGE.captureEnabled, STORAGE.projectType, STORAGE.customTypes]).then(values => {
    captureEnabled = Boolean(values[STORAGE.captureEnabled]);
    defaultType = normalize(values[STORAGE.projectType]) || defaultType;
    customTypes = Array.isArray(values[STORAGE.customTypes])
      ? values[STORAGE.customTypes].map(normalize).filter(Boolean)
      : [];
    populateCategorySelect();
  });
  chrome.storage.onChanged.addListener(changes => {
    if (changes[STORAGE.captureEnabled]) {
      captureEnabled = Boolean(changes[STORAGE.captureEnabled].newValue);
      if (!captureEnabled) removeToolbar(true);
    }
    if (changes[STORAGE.projectType]) {
      defaultType = normalize(changes[STORAGE.projectType].newValue) || defaultType;
      populateCategorySelect();
    }
    if (changes[STORAGE.customTypes]) {
      customTypes = Array.isArray(changes[STORAGE.customTypes].newValue)
        ? changes[STORAGE.customTypes].newValue.map(normalize).filter(Boolean)
        : [];
      populateCategorySelect();
    }
  });

  function normalize(value) {
    return String(value ?? '').replaceAll('\u3000', ' ').trim().replace(/\s+/g, ' ');
  }

  function usableImageUrl(image) {
    return [
      image.currentSrc,
      image.getAttribute('data-src'),
      image.getAttribute('data-original'),
      image.getAttribute('data-lazy-src'),
      image.src,
    ].map(value => String(value ?? '').trim()).find(Boolean) || '';
  }

  function isContentImage(image) {
    if (!(image instanceof HTMLImageElement)) return false;
    const rect = image.getBoundingClientRect();
    const width = Math.max(image.naturalWidth || 0, rect.width || 0);
    const height = Math.max(image.naturalHeight || 0, rect.height || 0);
    const hint = `${image.className || ''} ${image.alt || ''}`;
    if (image.closest('header, nav') || /(?:avatar|logo|icon)/i.test(hint)) return false;
    if (/\.svg(?:[?#]|$)/i.test(usableImageUrl(image))) return false;
    return rect.width >= 120 && rect.height >= 80 && width >= 160 && height >= 100;
  }

  function imageAtPointer(event) {
    const direct = event.target.closest?.('img');
    if (isContentImage(direct)) return direct;
    return (document.elementsFromPoint?.(event.clientX, event.clientY) ?? [])
      .find(element => isContentImage(element)) || null;
  }

  function clearTimers() {
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
  }

  function removeToolbar(force = false) {
    if (!force && (busy || toolbarPinned || toolbar?.contains(document.activeElement))) return;
    clearTimers();
    toolbar?.remove();
    toolbar = null;
    currentImage = null;
    toolbarPinned = false;
  }

  function scheduleHide() {
    if (toolbarPinned) return;
    clearTimeout(hideTimer);
    hideTimer = setTimeout(removeToolbar, 260);
  }

  function positionToolbar() {
    if (!toolbar || !currentImage) return;
    const rect = currentImage.getBoundingClientRect();
    toolbar.style.top = `${window.scrollY + rect.top + 10}px`;
    toolbar.style.left = `${window.scrollX + rect.left + rect.width / 2}px`;
  }

  function setStatus(message, tone = '') {
    const line = toolbar?.querySelector('.downpic-status');
    if (!line) return;
    line.textContent = message;
    line.dataset.tone = tone;
    line.hidden = !message;
    const feedbackRow = line.closest('.downpic-feedback-row');
    const reveal = feedbackRow?.querySelector('[data-action="reveal"]');
    if (feedbackRow) feedbackRow.hidden = !message && Boolean(reveal?.hidden);
  }

  function populateCategorySelect() {
    const select = toolbar?.querySelector('[data-role="category"]');
    if (!select) return;
    const values = [...new Set([...PRESET_TYPES, ...customTypes])];
    select.replaceChildren(...values.map(value => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      return option;
    }));
    const customOption = document.createElement('option');
    customOption.value = '__custom__';
    customOption.textContent = '＋ 自定义类型';
    select.append(customOption);
    select.value = values.includes(defaultType) ? defaultType : values[0];
  }

  function revealDownload(downloadId) {
    return request({ type: 'download.show', payload: { downloadId } });
  }

  async function request(message) {
    try {
      return await chrome.runtime.sendMessage(message);
    } catch (error) {
      return {
        ok: false,
        error: `扩展后台未响应：${error?.message || String(error)}。请在扩展管理页重新加载 downPIC 后再试。`,
      };
    }
  }

  async function saveImage(image, button) {
    busy = true;
    button.disabled = true;
    button.textContent = '保存中…';
    setStatus(`保存到 ${defaultType}`);
    const url = usableImageUrl(image);
    const response = await request({
      type: 'download.image',
      payload: {
        url,
        title: image.alt || '参考图',
        pageTitle: document.title,
        pageUrl: location.href,
        category: defaultType,
      },
    });
    busy = false;
    if (!response?.ok) {
      button.disabled = false;
      button.textContent = '重试保存';
      setStatus(response?.error || '下载失败，请重试', 'error');
      return;
    }
    button.textContent = '已保存';
    setStatus(`已保存到 下载/downPIC/${defaultType}`, 'success');
    toolbarPinned = true;
    clearTimeout(hideTimer);
    const reveal = toolbar?.querySelector('[data-action="reveal"]');
    if (reveal) {
      reveal.hidden = false;
      reveal.dataset.downloadId = String(response.downloadId);
      reveal.closest('.downpic-feedback-row').hidden = false;
    }
  }

  async function analyzeImage(image, button) {
    busy = true;
    button.disabled = true;
    button.textContent = '正在取图…';
    setStatus('正在截取图片当前可见区域');
    toolbar.style.visibility = 'hidden';
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const rect = image.getBoundingClientRect();
    const response = await request({
      type: 'image.select',
      payload: {
        rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        title: image.alt || document.title || '网页参考图',
        alt: image.alt || '',
        sourceUrl: usableImageUrl(image),
      },
    });
    if (toolbar) toolbar.style.visibility = 'visible';
    busy = false;
    if (!response?.ok) {
      button.disabled = false;
      button.textContent = '重试反推';
      setStatus(response?.error || '图片读取失败，请重试', 'error');
      return;
    }
    button.textContent = '已送入侧栏';
    setStatus('参考图已进入 downPIC 侧栏', 'success');
  }

  function createToolbar(image) {
    toolbar?.remove();
    toolbarPinned = false;
    currentImage = image;
    toolbar = document.createElement('div');
    toolbar.className = 'downpic-toolbar';
    toolbar.setAttribute('aria-label', 'downPIC 图片工具条');
    toolbar.innerHTML = `
      <div class="downpic-toolbar-row">
        <span class="downpic-mark" aria-hidden="true">d</span>
        <label class="downpic-category-label"><span>分类</span><select data-role="category" aria-label="选择图片分类"></select></label>
        <button type="button" data-action="save">保存图片</button>
        <button type="button" data-action="analyze">反推提示词</button>
      </div>
      <div class="downpic-custom-row" hidden>
        <input data-role="custom-type" type="text" maxlength="40" placeholder="输入自定义图片类型" />
        <button type="button" data-action="apply-custom">使用此类型</button>
        <button type="button" data-action="cancel-custom" aria-label="取消自定义">取消</button>
      </div>
      <div class="downpic-feedback-row" hidden>
        <p class="downpic-status" hidden></p>
        <button class="downpic-reveal" type="button" data-action="reveal" hidden>在文件夹中显示</button>
      </div>`;
    document.body.append(toolbar);
    populateCategorySelect();
    positionToolbar();
    toolbar.addEventListener('pointerenter', () => clearTimeout(hideTimer));
    toolbar.addEventListener('pointerleave', scheduleHide);
    toolbar.addEventListener('focusout', scheduleHide);
    toolbar.querySelector('[data-action="save"]').addEventListener('click', event => saveImage(image, event.currentTarget));
    toolbar.querySelector('[data-action="analyze"]').addEventListener('click', event => analyzeImage(image, event.currentTarget));
    toolbar.querySelector('[data-role="category"]').addEventListener('change', async event => {
      if (event.currentTarget.value === '__custom__') {
        toolbar.querySelector('.downpic-custom-row').hidden = false;
        toolbar.querySelector('[data-role="custom-type"]').focus();
        return;
      }
      defaultType = normalize(event.currentTarget.value) || defaultType;
      await chrome.storage.local.set({ [STORAGE.projectType]: defaultType });
      setStatus(`当前分类：${defaultType}`);
    });
    toolbar.querySelector('[data-action="apply-custom"]').addEventListener('click', async () => {
      const input = toolbar.querySelector('[data-role="custom-type"]');
      const value = normalize(input.value).slice(0, 40);
      if (!value) {
        setStatus('请输入有效的自定义类型', 'error');
        input.focus();
        return;
      }
      customTypes = [...new Set([...customTypes, value])];
      defaultType = value;
      await chrome.storage.local.set({
        [STORAGE.customTypes]: customTypes,
        [STORAGE.projectType]: defaultType,
      });
      toolbar.querySelector('.downpic-custom-row').hidden = true;
      populateCategorySelect();
      setStatus(`当前分类：${defaultType}`, 'success');
    });
    toolbar.querySelector('[data-action="cancel-custom"]').addEventListener('click', () => {
      toolbar.querySelector('.downpic-custom-row').hidden = true;
      populateCategorySelect();
    });
    toolbar.querySelector('[data-action="reveal"]').addEventListener('click', async event => {
      const response = await revealDownload(event.currentTarget.dataset.downloadId);
      setStatus(response?.ok ? '已在文件夹中定位这张图片' : response?.error || '无法打开下载位置', response?.ok ? 'success' : 'error');
    });
  }

  document.addEventListener('pointerover', event => {
    if (!captureEnabled) return;
    const image = imageAtPointer(event);
    if (!image || busy || image === currentImage) return;
    clearTimeout(hideTimer);
    clearTimeout(showTimer);
    showTimer = setTimeout(() => createToolbar(image), 120);
  });

  document.addEventListener('pointerout', event => {
    if (!currentImage || event.relatedTarget?.closest?.('.downpic-toolbar')) return;
    clearTimeout(showTimer);
    scheduleHide();
  });
  document.addEventListener('pointerdown', event => {
    if (toolbarPinned && toolbar && !toolbar.contains(event.target)) removeToolbar(true);
  }, true);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') removeToolbar(true);
  });
  window.addEventListener('scroll', positionToolbar, { passive: true });
  window.addEventListener('resize', positionToolbar);
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === 'capture.geometry') {
      if (!currentImage) {
        sendResponse({ ok: false });
        return;
      }
      const rect = currentImage.getBoundingClientRect();
      sendResponse({
        ok: true,
        rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      });
      return;
    }
    if (message?.type !== 'capture.setEnabled') return;
    captureEnabled = Boolean(message.enabled);
    if (!captureEnabled) removeToolbar(true);
  });
})();

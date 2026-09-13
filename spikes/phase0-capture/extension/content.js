(() => {
  const PRESETS = ['文化建筑', '教育建筑', '办公建筑', '社区建筑'];
  const STORAGE = {
    enabled: 'capture_enabled',
    projectType: 'default_project_type',
    customTypes: 'custom_project_types_cache',
  };

  let enabled = false;
  let defaultType = '文化建筑';
  let customTypes = [];
  let toolbar = null;
  let currentImage = null;
  let showTimer = null;
  let hideTimer = null;
  let locked = false;

  function normalize(value) {
    return String(value ?? '').replaceAll('\u3000', ' ').trim().replace(/\s+/g, ' ');
  }

  async function loadState() {
    const result = await chrome.storage.local.get(Object.values(STORAGE));
    enabled = Boolean(result[STORAGE.enabled]);
    defaultType = normalize(result[STORAGE.projectType]) || defaultType;
    customTypes = Array.isArray(result[STORAGE.customTypes])
      ? result[STORAGE.customTypes].map(normalize).filter(Boolean)
      : [];
  }

  loadState();

  chrome.storage.onChanged.addListener((changes) => {
    if (changes[STORAGE.enabled]) enabled = Boolean(changes[STORAGE.enabled].newValue);
    if (changes[STORAGE.projectType]) defaultType = normalize(changes[STORAGE.projectType].newValue) || defaultType;
    if (changes[STORAGE.customTypes]) customTypes = changes[STORAGE.customTypes].newValue ?? [];
    if (!enabled) removeToolbar();
  });

  function clearTimers() {
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
    showTimer = null;
    hideTimer = null;
  }

  function removeToolbar() {
    if (locked) return;
    clearTimers();
    toolbar?.remove();
    toolbar = null;
    currentImage = null;
  }

  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(removeToolbar, 300);
  }

  function status(message, tone = 'normal') {
    const line = toolbar?.querySelector('.sis-capture-status');
    if (!line) return;
    line.textContent = message;
    line.dataset.tone = tone;
    line.hidden = !message;
  }

  function positionToolbar(image) {
    if (!toolbar) return;
    const rect = image.getBoundingClientRect();
    toolbar.style.top = `${window.scrollY + rect.top + 10}px`;
    toolbar.style.left = `${window.scrollX + rect.left + rect.width / 2}px`;
  }

  function usableImageUrl(image) {
    const candidates = [
      image.currentSrc,
      image.getAttribute('data-src'),
      image.getAttribute('data-original'),
      image.getAttribute('data-lazy-src'),
      image.src,
    ];
    return candidates.map((value) => String(value ?? '').trim()).find((value) => value && !value.startsWith('data:'))
      || String(image.currentSrc || image.src || '');
  }

  function isVisibleElement(element) {
    if (!(element instanceof Element)) return false;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none'
      && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0;
  }

  function modalScore(element) {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const zIndex = Number.parseInt(style.zIndex, 10);
    const semantic = element.matches('[role="dialog"], [aria-modal="true"], .note-detail-mask, .note-detail-modal') ? 1_000_000 : 0;
    return semantic + (Number.isFinite(zIndex) ? zIndex * 1_000 : 0) + rect.width * rect.height;
  }

  function activeModalRoot() {
    const minimumWidth = window.innerWidth * 0.4;
    const minimumHeight = window.innerHeight * 0.4;
    const selectors = [
      '[role="dialog"]',
      '[aria-modal="true"]',
      '.note-detail-mask',
      '.note-detail-modal',
      '[class*="lightbox"]',
      '[class*="Lightbox"]',
      '[class*="modal"]',
      '[class*="Modal"]',
    ].join(',');
    const semanticCandidates = [...document.querySelectorAll(selectors)].filter((element) => {
      if (!isVisibleElement(element) || !element.querySelector('img')) return false;
      const rect = element.getBoundingClientRect();
      return rect.width >= minimumWidth && rect.height >= minimumHeight;
    });
    if (semanticCandidates.length) return semanticCandidates.sort((left, right) => modalScore(right) - modalScore(left))[0];

    const centerStack = document.elementsFromPoint?.(window.innerWidth / 2, window.innerHeight / 2) ?? [];
    for (const element of centerStack) {
      for (let current = element; current && current !== document.body; current = current.parentElement) {
        if (!isVisibleElement(current) || !current.querySelector?.('img')) continue;
        const rect = current.getBoundingClientRect();
        const position = getComputedStyle(current).position;
        if (position === 'fixed' && rect.width >= minimumWidth && rect.height >= minimumHeight) return current;
      }
    }
    return null;
  }

  function isContentImage(image, scope = activeModalRoot()) {
    if (!(image instanceof HTMLImageElement)) return false;
    if (scope && !scope.contains(image)) return false;
    const rect = image.getBoundingClientRect();
    const width = Math.max(image.naturalWidth || 0, rect.width || 0);
    const height = Math.max(image.naturalHeight || 0, rect.height || 0);
    const url = usableImageUrl(image);
    const semanticHint = `${image.className || ''} ${image.alt || ''}`;
    if (image.closest('header, nav') || /(?:avatar|logo|icon)/i.test(semanticHint)) return false;
    if (/\.svg(?:[?#]|$)/i.test(url)) return false;
    return width >= 160 && height >= 100 && Boolean(url);
  }

  function imageFromPointer(event) {
    const scope = activeModalRoot();
    const direct = event.target.closest?.('img');
    if (isContentImage(direct, scope)) return direct;

    const stacked = document.elementsFromPoint?.(event.clientX, event.clientY) ?? [];
    const behindOverlay = stacked.find((element) => isContentImage(element, scope));
    if (behindOverlay) return behindOverlay;

    let container = event.target;
    for (let depth = 0; container && depth < 5; depth += 1, container = container.parentElement) {
      if (scope && !scope.contains(container) && container !== scope) continue;
      const candidates = [...(container.querySelectorAll?.('img') ?? [])]
        .filter((image) => isContentImage(image, scope));
      if (candidates.length) {
        return candidates.sort((left, right) => {
          const leftRect = left.getBoundingClientRect();
          const rightRect = right.getBoundingClientRect();
          return rightRect.width * rightRect.height - leftRect.width * leftRect.height;
        })[0];
      }
    }
    return null;
  }

  function blobAsDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  async function prepareSiteDownload(imageUrl) {
    const usePageTransfer = /(?:pinterest\.|pinimg\.com)$/i.test(location.hostname)
      || /(?:pinimg\.com)/i.test(imageUrl);
    if (!usePageTransfer) return { downloadUrl: '', mimeType: '' };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(imageUrl, {
        credentials: 'include',
        referrer: location.href,
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP_${response.status}`);
      const blob = await response.blob();
      if (!blob.type.startsWith('image/') || blob.size <= 0 || blob.size > 20 * 1024 * 1024) {
        throw new Error('IMAGE_PAYLOAD_INVALID');
      }
      return { downloadUrl: await blobAsDataUrl(blob), mimeType: blob.type };
    } catch {
      return { downloadUrl: '', mimeType: '' };
    } finally {
      clearTimeout(timeout);
    }
  }

  function addOption(select, value, group = null) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    (group || select).append(option);
  }

  function populateTypes(select) {
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '预设类型';
    select.append(placeholder);

    const presets = document.createElement('optgroup');
    presets.label = '预设类型';
    PRESETS.forEach((value) => addOption(select, value, presets));
    select.append(presets);

    if (customTypes.length) {
      const personal = document.createElement('optgroup');
      personal.label = '我的类型';
      customTypes.forEach((value) => addOption(select, value, personal));
      select.append(personal);
    }
    select.value = [...PRESETS, ...customTypes].includes(defaultType) ? defaultType : '';
  }

  function createToolbar(image) {
    toolbar?.remove();
    currentImage = image;
    toolbar = document.createElement('section');
    toolbar.className = 'sis-capture-toolbar';
    toolbar.setAttribute('aria-label', '索引室图片保存工具条');

    const row = document.createElement('div');
    row.className = 'sis-capture-row';
    const select = document.createElement('select');
    select.setAttribute('aria-label', '预设项目类型');
    populateTypes(select);
    const input = document.createElement('input');
    input.setAttribute('aria-label', '自定义项目类型');
    input.placeholder = '输入自定义类型';
    input.autocomplete = 'off';
    if (!select.value) input.value = defaultType;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Save';
    row.append(select, input, button);

    const feedback = document.createElement('p');
    feedback.className = 'sis-capture-status';
    feedback.hidden = true;
    const revealButton = document.createElement('button');
    revealButton.className = 'sis-capture-reveal';
    revealButton.type = 'button';
    revealButton.textContent = '打开所在文件夹';
    revealButton.hidden = true;
    toolbar.append(row, feedback, revealButton);
    document.body.append(toolbar);
    positionToolbar(image);

    toolbar.addEventListener('pointerenter', () => clearTimeout(hideTimer));
    toolbar.addEventListener('pointerleave', scheduleHide);

    revealButton.addEventListener('click', async () => {
      if (!revealButton.dataset.managedPath) return;
      revealButton.disabled = true;
      const result = await chrome.runtime.sendMessage({
        type: 'asset.reveal',
        managedPath: revealButton.dataset.managedPath,
      });
      revealButton.disabled = false;
      if (!result?.ok) status('无法打开文件夹，请确认桌面端服务可用', 'error');
    });

    function validate(showMessage = true) {
      const customValue = normalize(input.value);
      const invalidWhitespace = input.value.length > 0 && !customValue;
      const valid = Boolean(customValue || select.value) && !invalidWhitespace;
      button.disabled = !valid;
      input.setAttribute('aria-invalid', String(invalidWhitespace));
      if (showMessage) status(invalidWhitespace ? '请输入项目类型，不能只包含空格。' : '', invalidWhitespace ? 'error' : 'normal');
      return { valid, value: customValue || select.value, isCustom: Boolean(customValue) };
    }

    select.addEventListener('change', () => {
      if (select.value) input.value = '';
      validate();
    });
    input.addEventListener('input', () => {
      if (input.value.length) select.value = '';
      validate();
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !button.disabled) button.click();
    });

    button.addEventListener('click', async () => {
      const selection = validate();
      if (!selection.valid) return;
      locked = true;
      button.disabled = true;
      button.textContent = '保存中…';
      status(`正在下载到${selection.value}…`);

      let originalFilename = '';
      const imageUrl = usableImageUrl(image);
      const prepared = await prepareSiteDownload(imageUrl);
      try { originalFilename = new URL(imageUrl).pathname.split('/').pop() || ''; } catch {}

      const response = await chrome.runtime.sendMessage({
        type: 'capture.request',
        payload: {
          imageUrl,
          downloadUrl: prepared.downloadUrl,
          mimeType: prepared.mimeType,
          projectTypeName: selection.value,
          pageTitle: document.title,
          pageUrl: location.href,
          siteName: location.hostname,
          originalFilename,
        },
      });

      if (!response?.ok) {
        locked = false;
        status(
          response?.message || (response?.errorCode === 'UNSUPPORTED_FORMAT' ? '暂不支持该图片格式' : '下载未开始，请重试'),
          'error',
        );
        button.disabled = false;
        button.textContent = '重试';
        return;
      }

      if (selection.isCustom && !customTypes.includes(selection.value)) customTypes.push(selection.value);
      defaultType = selection.value;
      await chrome.storage.local.set({
        [STORAGE.projectType]: defaultType,
        [STORAGE.customTypes]: customTypes,
      });
      toolbar.dataset.captureId = response.captureId;
      status('正在下载到暂存目录…');
      const latest = await chrome.runtime.sendMessage({
        type: 'capture.get-status',
        captureId: response.captureId,
      });
      if (latest) applyCaptureStatus(latest);
    });
  }

  function scheduleShow(image) {
    clearTimeout(hideTimer);
    clearTimeout(showTimer);
    if (locked || !enabled || !isContentImage(image)) return;
    if (currentImage === image && toolbar) return;
    showTimer = setTimeout(() => createToolbar(image), 150);
  }

  document.addEventListener('pointerover', (event) => {
    const image = imageFromPointer(event);
    if (image) scheduleShow(image);
  });

  document.addEventListener('pointerout', (event) => {
    if (!currentImage || event.relatedTarget?.closest?.('.sis-capture-toolbar')) return;
    clearTimeout(showTimer);
    scheduleHide();
  });

  window.addEventListener('scroll', () => currentImage && positionToolbar(currentImage), { passive: true });
  window.addEventListener('resize', () => currentImage && positionToolbar(currentImage));

  function applyCaptureStatus(message) {
    if (message?.type !== 'capture.status' || toolbar?.dataset.captureId !== message.captureId) return;
    const button = toolbar.querySelector('button');
    const terminal = ['imported', 'duplicate', 'staged'].includes(message.state);
    button.textContent = message.state === 'staged' ? '已暂存' : message.state === 'failed' ? '重试' : '已保存';
    button.disabled = terminal;
    locked = false;
    status(message.message, message.state === 'failed' ? 'error' : message.state === 'staged' ? 'warning' : 'normal');
    const revealButton = toolbar.querySelector('.sis-capture-reveal');
    if (revealButton) {
      revealButton.hidden = !message.managedPath || !['imported', 'duplicate'].includes(message.state);
      revealButton.dataset.managedPath = message.managedPath || '';
    }
  }

  chrome.runtime.onMessage.addListener(applyCaptureStatus);
})();

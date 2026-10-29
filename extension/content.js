/*
 * Lucide chevron-up: https://lucide.dev/icons/chevron-up
 * Source: https://github.com/lucide-icons/lucide/blob/main/icons/chevron-up.svg
 * ISC License
 * Copyright (c) 2026 Lucide Icons and Contributors
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * Chevron-up is derived from Feather and also subject to the MIT License:
 * Copyright (c) 2013-present Cole Bemis
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
(() => {
  // 重新注入时释放上一轮监听，替换重载扩展前遗留的工具条。
  window.__downPicBetaDispose?.();
  document.querySelectorAll('.downpic-toolbar').forEach(element => element.remove());
  window.__downPicBetaActive = true;
  const lifetime = new AbortController();
  let disposed = false;
  const LANGUAGE_KEY = 'archbuddyUiLanguageV1';
  let language = 'zh';
  let languageChanged = false;
  const labels = new Map();
  const PRESET_LABELS = { '文化建筑': 'Cultural buildings', '教育建筑': 'Educational buildings', '办公建筑': 'Office buildings', '社区建筑': 'Community buildings' };
  function t(zh, en, params = {}) {
    return (language === 'en' ? en : zh).replace(/\{(\w+)\}/g, (_match, key) => {
      const value = params[key];
      return String(typeof value === 'function' ? value() : value ?? '');
    });
  }
  function label(element, zh, en, attribute = '', params = {}) {
    if (!element) return;
    let entries = labels.get(element);
    if (!entries) { entries = new Map(); labels.set(element, entries); }
    entries.set(attribute, { zh, en, params });
    const value = t(zh, en, params);
    if (attribute) element.setAttribute(attribute, value);
    else element.textContent = value;
  }
  function categoryLabel(value) { return language === 'en' ? PRESET_LABELS[value] || value : value; }
  function refreshLanguage() {
    if (!toolbar) return;
    toolbar.lang = language === 'en' ? 'en' : 'zh-CN';
    for (const [element, entries] of labels) {
      if (element !== toolbar && !toolbar.contains(element)) { labels.delete(element); continue; }
      for (const [attribute, entry] of entries) label(element, entry.zh, entry.en, attribute, entry.params);
    }
    populateCategorySelect(true);
    positionToolbar();
  }
  void chrome.storage.local.get(LANGUAGE_KEY).then(values => {
    if (disposed || languageChanged) return;
    language = values[LANGUAGE_KEY] === 'en' ? 'en' : 'zh';
    refreshLanguage();
  }).catch(() => {});

  const STORAGE = {
    captureEnabled: 'capture_enabled',
    projectType: 'default_project_type',
    customTypes: 'custom_project_types',
    hiddenTypes: 'hiddenProjectTypesV4',
    typeOrder: 'projectTypeOrderV4',
  };
  const PRESET_TYPES = ['文化建筑', '教育建筑', '办公建筑', '社区建筑'];
  let captureEnabled = false;
  let defaultType = '文化建筑';
  let customTypes = [];
  let hiddenTypes = [];
  let typeOrder = [];
  let toolbar = null;
  let currentImage = null;
  let showTimer = null;
  let hideTimer = null;
  let busy = false;
  let toolbarPinned = false;
  let toolbarCollapsed = false;

  async function loadPreferences() {
    const response = await request({ type: 'capture.preferences' });
    if (disposed || !response?.ok) return;
    const values = response.values || {};
    captureEnabled = Boolean(values[STORAGE.captureEnabled]);
    defaultType = normalize(values[STORAGE.projectType]) || PRESET_TYPES[0];
    customTypes = Array.isArray(values[STORAGE.customTypes]) ? values[STORAGE.customTypes].map(normalize).filter(Boolean) : [];
    hiddenTypes = Array.isArray(values[STORAGE.hiddenTypes]) ? values[STORAGE.hiddenTypes] : [];
    typeOrder = Array.isArray(values[STORAGE.typeOrder]) ? values[STORAGE.typeOrder] : [];
    if (!captureEnabled) { toolbarCollapsed = false; removeToolbar(true); }
    populateCategorySelect();
  }
  void loadPreferences();
  const onStorageChanged = (changes, area) => {
    if (area === 'local' && changes[LANGUAGE_KEY]) {
      languageChanged = true;
      language = changes[LANGUAGE_KEY].newValue === 'en' ? 'en' : 'zh';
      refreshLanguage();
    }
    if (area === 'local' && Object.keys(changes).some(key => Object.values(STORAGE).some(name => key === name || key.endsWith(':' + name)))) void loadPreferences();
  };
  chrome.storage.onChanged.addListener(onStorageChanged);

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
    if (!force && (busy || toolbarPinned || toolbarCollapsed || toolbar?.contains(document.activeElement))) return;
    clearTimers();
    toolbar?.remove();
    labels.clear();
    toolbar = null;
    currentImage = null;
    toolbarPinned = false;
  }

  function scheduleHide() {
    if (toolbarPinned || toolbarCollapsed) return;
    clearTimeout(hideTimer);
    hideTimer = setTimeout(removeToolbar, 260);
  }

  function positionToolbar() {
    if (!toolbar || !currentImage) return;
    const rect = currentImage.getBoundingClientRect();
    toolbar.style.top = `${window.scrollY + rect.top + 10}px`;
    toolbar.style.left = `${window.scrollX + rect.left + rect.width / 2}px`;
  }

  function setToolbarCollapsed(collapsed) {
    toolbarCollapsed = collapsed;
    clearTimers();
    if (!toolbar) return;
    toolbar.dataset.collapsed = String(collapsed);
    positionToolbar();
  }

  function setStatus(zh, en, tone = '', params = {}) {
    const line = toolbar?.querySelector('.downpic-status');
    if (!line) return;
    label(line, zh, en, '', params);
    const message = line.textContent;
    line.dataset.tone = tone;
    line.hidden = !message;
    const feedbackRow = line.closest('.downpic-feedback-row');
    const reveal = feedbackRow?.querySelector('[data-action="reveal"]');
    if (feedbackRow) feedbackRow.hidden = !message && Boolean(reveal?.hidden);
  }

  function populateCategorySelect(preserveSelection = false) {
    const select = toolbar?.querySelector('[data-role="category"]');
    if (!select) return;
    const selected = preserveSelection ? select.value : defaultType;
    const available = [...new Set([...PRESET_TYPES, ...customTypes])].filter(type => !hiddenTypes.includes(type));
    const values = [...new Set([...typeOrder.filter(type => available.includes(type)), ...available])];
    select.replaceChildren(...values.map(value => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = categoryLabel(value);
      return option;
    }));
    const customOption = document.createElement('option');
    customOption.value = '__custom__';
    customOption.textContent = t('＋ 自定义类型', '+ Custom category');
    select.append(customOption);
    select.value = selected === '__custom__' || values.includes(selected) ? selected : values[0];
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
        error: t('扩展后台未响应，请在扩展管理页重新加载 ArchBuddy 后再试。', 'The extension background is not responding. Reload ArchBuddy on your extensions page and try again.'),
        localConnectionError: true,
      };
    }
  }

  function responseError(response, zh, en) {
    if (response?.localConnectionError) {
      setStatus('扩展后台未响应，请在扩展管理页重新加载 ArchBuddy 后再试。', 'The extension background is not responding. Reload ArchBuddy on your extensions page and try again.', 'error');
    } else if (response?.code === 'SIDEPANEL_OPEN_FAILED') {
      setStatus('侧栏未能打开，请再点一次反推；也可点击浏览器工具栏的 ArchBuddy → 打开侧栏。', 'Could not open the sidebar. Retry, or open ArchBuddy in the browser toolbar and choose Open sidebar.', 'error');
    } else if (response?.code === 'SIDEPANEL_UNAVAILABLE') {
      setStatus('当前浏览器不支持侧栏，请更新 Chrome 或 Edge 后重试。', 'The sidebar is unavailable. Update Chrome or Edge and try again.', 'error');
    } else if (response?.error) setStatus(response.error, response.error, 'error');
    else setStatus(zh, en, 'error');
  }

  async function saveImage(image, button) {
    busy = true;
    button.disabled = true;
    label(button, '保存中…', 'Saving…');
    setStatus('保存到 {category}', 'Saving to {category}', '', { category: () => categoryLabel(defaultType) });
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
      label(button, '重试保存', 'Retry saving');
      responseError(response, '下载失败，请重试', 'Download failed. Please retry.');
      return;
    }
    label(button, '已保存', 'Saved');
    setStatus('已保存到 下载/ArchBuddy/{category}', 'Saved to Downloads/ArchBuddy/{category}', 'success', { category: defaultType });
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
    label(button, '正在取图…', 'Capturing…');
    setStatus('正在截取图片当前可见区域', 'Capturing the visible area of this image');
    toolbar.style.visibility = 'hidden';
    // 消息必须在点击调用栈内发送；截图隐藏后的等待交给后台完成。
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
    button.disabled = false;
    toolbarPinned = true;
    clearTimeout(hideTimer);
    if (!response?.ok) {
      button.disabled = false;
      label(button, '重试反推', 'Retry prompt');
      responseError(response, '图片读取失败，请重试', 'Could not read the image. Please retry.');
      return;
    }
    label(button, '已送入侧栏', 'Sent to sidebar');
    setStatus('参考图已进入 ArchBuddy 侧栏', 'Reference image sent to the ArchBuddy sidebar', 'success');
  }

  function createToolbar(image) {
    document.querySelectorAll('.downpic-toolbar').forEach(element => element.remove());
    toolbarPinned = false;
    currentImage = image;
    toolbar = document.createElement('div');
    toolbar.className = 'downpic-toolbar';
    labels.clear();
    label(toolbar, 'ArchBuddy 图片工具条', 'ArchBuddy image tools', 'aria-label');
    toolbar.dataset.collapsed = String(toolbarCollapsed);
    const logo = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" focusable="false"><rect x="8" y="8" width="112" height="112" rx="24" fill="#25634b"/><path fill="#fff" fill-rule="evenodd" d="M30 96 55 32H73L98 96H80L74 80H54L48 96ZM56 66H72V62A8 8 0 0 0 56 62Z"/></svg>`;
    toolbar.innerHTML = `
      <div class="downpic-toolbar-row">
        <button class="downpic-mark" type="button" data-action="open-library" title="打开图词库" aria-label="打开图词库">${logo}</button>
        <button class="downpic-expand" type="button" data-action="expand" title="展开图片工具" aria-label="展开图片工具">展开</button>
        <label class="downpic-category-label"><select data-role="category" aria-label="选择图片分类"></select></label>
        <button type="button" data-action="save">保存图片</button>
        <button type="button" data-action="analyze">反推提示词</button>
        <button class="downpic-collapse" type="button" data-action="collapse" title="收起" aria-label="收起图片工具"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m18 15-6-6-6 6" /></svg></button>
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
    const control = action => toolbar.querySelector(`[data-action="${action}"]`);
    for (const [action, zh, en] of [
      ['expand', '展开', 'Expand'], ['save', '保存图片', 'Save image'],
      ['analyze', '反推提示词', 'Extract prompt'], ['apply-custom', '使用此类型', 'Use category'],
      ['cancel-custom', '取消', 'Cancel'], ['reveal', '在文件夹中显示', 'Show in folder'],
    ]) label(control(action), zh, en);
    for (const [action, zh, en] of [
      ['open-library', '打开图词库', 'Open image and prompt library'],
      ['expand', '展开图片工具', 'Expand image tools'], ['collapse', '收起图片工具', 'Collapse image tools'],
      ['cancel-custom', '取消自定义', 'Cancel custom category'],
    ]) {
      label(control(action), zh, en, 'aria-label');
      label(control(action), zh, en, 'title');
    }
    label(toolbar.querySelector('[data-role="category"]'), '选择图片分类', 'Choose image category', 'aria-label');
    label(toolbar.querySelector('[data-role="custom-type"]'), '输入自定义图片类型', 'Enter a custom image category', 'placeholder');
    document.body.append(toolbar);
    populateCategorySelect();
    refreshLanguage();
    positionToolbar();
    toolbar.addEventListener('pointerenter', () => clearTimeout(hideTimer));
    toolbar.addEventListener('pointerleave', scheduleHide);
    toolbar.addEventListener('focusout', scheduleHide);
    toolbar.querySelector('[data-action="open-library"]').addEventListener('click', async event => {
      const button = event.currentTarget;
      button.disabled = true;
      const response = await request({ type: 'library.open' });
      button.disabled = false;
      if (!response?.ok) {
        setToolbarCollapsed(false);
        responseError(response, '无法打开图词库', 'Could not open the image and prompt library.');
      }
    });
    toolbar.querySelector('[data-action="collapse"]').addEventListener('click', () => setToolbarCollapsed(true));
    toolbar.querySelector('[data-action="expand"]').addEventListener('click', () => setToolbarCollapsed(false));
    toolbar.querySelector('[data-action="save"]').addEventListener('click', event => saveImage(image, event.currentTarget));
    toolbar.querySelector('[data-action="analyze"]').addEventListener('click', event => analyzeImage(image, event.currentTarget));
    toolbar.querySelector('[data-role="category"]').addEventListener('change', async event => {
      if (event.currentTarget.value === '__custom__') {
        toolbar.querySelector('.downpic-custom-row').hidden = false;
        toolbar.querySelector('[data-role="custom-type"]').focus();
        return;
      }
      defaultType = normalize(event.currentTarget.value) || defaultType;
      await request({ type: 'capture.preferences.set', payload: { [STORAGE.projectType]: defaultType } });
      setStatus('当前分类：{category}', 'Current category: {category}', '', { category: () => categoryLabel(defaultType) });
    });
    toolbar.querySelector('[data-action="apply-custom"]').addEventListener('click', async () => {
      const input = toolbar.querySelector('[data-role="custom-type"]');
      const value = normalize(input.value).slice(0, 40);
      if (!value) {
        setStatus('请输入有效的自定义类型', 'Enter a valid custom category.', 'error');
        input.focus();
        return;
      }
      if (PRESET_TYPES.includes(value)) hiddenTypes = hiddenTypes.filter(type => type !== value);
      else customTypes = [...new Set([...customTypes, value])];
      defaultType = value;
      await request({ type: 'capture.preferences.set', payload: {
        [STORAGE.customTypes]: customTypes,
        [STORAGE.hiddenTypes]: hiddenTypes,
        [STORAGE.projectType]: defaultType,
      } });
      toolbar.querySelector('.downpic-custom-row').hidden = true;
      populateCategorySelect();
      setStatus('当前分类：{category}', 'Current category: {category}', 'success', { category: () => categoryLabel(defaultType) });
    });
    toolbar.querySelector('[data-action="cancel-custom"]').addEventListener('click', () => {
      toolbar.querySelector('.downpic-custom-row').hidden = true;
      populateCategorySelect();
    });
    toolbar.querySelector('[data-action="reveal"]').addEventListener('click', async event => {
      const response = await revealDownload(event.currentTarget.dataset.downloadId);
      if (response?.ok) setStatus('已在文件夹中定位这张图片', 'Image located in its folder', 'success');
      else responseError(response, '无法打开下载位置', 'Could not open the download location.');
    });
  }

  document.addEventListener('pointerover', event => {
    if (!chrome.runtime?.id) { window.__downPicBetaDispose?.(); return; }
    if (!captureEnabled || event.target.closest?.('.downpic-toolbar')) return;
    const image = imageAtPointer(event);
    if (!image || busy || image === currentImage) return;
    clearTimeout(hideTimer);
    clearTimeout(showTimer);
    showTimer = setTimeout(() => {
      if (captureEnabled && !disposed && !busy) createToolbar(image);
    }, 120);
  }, { signal: lifetime.signal });

  document.addEventListener('pointerout', event => {
    if (!currentImage || event.relatedTarget?.closest?.('.downpic-toolbar')) return;
    clearTimeout(showTimer);
    scheduleHide();
  }, { signal: lifetime.signal });
  document.addEventListener('pointerdown', event => {
    if (toolbarPinned && !toolbarCollapsed && toolbar && !toolbar.contains(event.target)) removeToolbar(true);
  }, { capture: true, signal: lifetime.signal });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') removeToolbar(true);
  }, { signal: lifetime.signal });
  window.addEventListener('scroll', positionToolbar, { passive: true, signal: lifetime.signal });
  window.addEventListener('resize', positionToolbar, { signal: lifetime.signal });
  const onMessage = (message, sender, sendResponse) => {
    if (message?.type === 'capture.preferences.changed') { defaultType = PRESET_TYPES[0]; customTypes = []; hiddenTypes = []; typeOrder = []; removeToolbar(true); void loadPreferences(); sendResponse({ ok: true }); return; }
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
    if (!captureEnabled) {
      toolbarCollapsed = false;
      removeToolbar(true);
    }
    sendResponse({ ok: true });
  };
  chrome.runtime.onMessage.addListener(onMessage);
  window.__downPicBetaDispose = () => {
    if (disposed) return;
    disposed = true;
    captureEnabled = false;
    toolbarCollapsed = false;
    removeToolbar(true);
    lifetime.abort();
    // 重载后 Chrome API 已失效，DOM 和页面监听仍需释放。
    try { chrome.storage.onChanged.removeListener(onStorageChanged); } catch {}
    try { chrome.runtime.onMessage.removeListener(onMessage); } catch {}
    window.__downPicBetaActive = false;
  };
})();

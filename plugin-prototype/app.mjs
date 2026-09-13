import { REFERENCES, serializePrompt, validateImage } from './prompt-model.mjs';
import { createPrototypeState, setCustomDefaultProjectType, createCustomTypeAndSave } from '../prototype/src/state.mjs';
import { resolveTypeSelection } from '../prototype/src/project-type.mjs';
import { ApiError, describeApiError, fetchStatus, requestAnalysis, requestCapture, revealLibrary } from './api-client.mjs';
import { prepareForVision, prepareReferenceCrop } from './vision-image.mjs';

// 原型的「网页」是本地假页面，所以标题/来源是 fixture，不是真实抓取。
// 真实网站适配（gooood / 小红书 / Pinterest）属于 Chrome 扩展阶段，不在本轮。
const PAGE = { title: '建筑与自然参考图集', siteName: '构筑志', url: location.origin + location.pathname };

const $ = (selector) => document.querySelector(selector);
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const presets = ['文化建筑', '教育建筑', '办公建筑', '社区建筑'];
let capture = createPrototypeState();
let selected = null;
let output = [];
let analyzing = false;
let analysisToken = 0;
let imageToken = 0;
let toastTimer;
let statusTimer;
let panelTab = 'prompt';
let lastTrigger = null;
let failedOnce = false;
let configured = false;
// 光丢结果不够——请求已经发出去了，钱照样花。必须真的断流。
let analysisController = null;
const failureDemo = new URLSearchParams(location.search).get('scenario') === 'analysis-error';

function toast(message) {
  clearTimeout(toastTimer);
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 3800);
}
function options(value) {
  return `<option value="">选择项目类型</option><optgroup label="预设类型">${presets.map(v => `<option ${v === value ? 'selected' : ''}>${v}</option>`).join('')}</optgroup>`
    + (capture.customProjectTypes.filter(v=>!presets.includes(v)).length ? `<optgroup label="我的类型">${capture.customProjectTypes.filter(v=>!presets.includes(v)).map(v => `<option ${v === value ? 'selected' : ''}>${esc(v)}</option>`).join('')}</optgroup>` : '');
}
function syncDefaults() {
  $('#default-preset').innerHTML = options(capture.defaultProjectType);
  $('#default-custom').value = '';
  $('#default-label').textContent = capture.defaultProjectType;
  $('#set-default').disabled = false;
  $('#default-error').hidden = true;
  document.querySelectorAll('.image-toolbar').forEach(toolbar => {
    toolbar.querySelector('select').innerHTML = options(capture.defaultProjectType);
    toolbar.querySelector('input').value = '';
    toolbar.querySelector('.save-image').disabled = false;
    toolbar.querySelector('.save-image').textContent = '保存图片';
  });
}
function selectionIn(container) {
  return resolveTypeSelection({ presetValue: container.querySelector('select').value, customValue: container.querySelector('input').value });
}
function wireTypes(container, error, button) {
  const select = container.querySelector('select');
  const custom = container.querySelector('input');
  const validate = () => {
    const choice = selectionIn(container);
    const invalid = !choice.valid;
    button.disabled = invalid;
    custom.setAttribute('aria-invalid', String(invalid));
    error.hidden = !invalid;
    error.textContent = invalid ? '请选择类型或输入自定义类型，不能只包含空格。' : '';
  };
  select.addEventListener('change', () => { custom.value = ''; validate(); });
  custom.addEventListener('input', () => { select.value = ''; validate(); });
  custom.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); if (!button.disabled) button.click(); }
  });
}
function renderGallery() {
  $('#gallery').innerHTML = REFERENCES.map((ref,i) => `<figure class="reference ${i === 0 ? 'demo-hint' : ''}" data-id="${ref.id}">
    <div class="photo crop-${ref.crop}" role="img" aria-label="${ref.title}"></div>
    <div class="image-toolbar" aria-label="${ref.title}图片工具条"><div class="type-controls"><select aria-label="${ref.title}项目类型">${options(capture.defaultProjectType)}</select><input aria-label="${ref.title}自定义类型" placeholder="自定义类型" maxlength="60"></div>
      <div class="toolbar-buttons"><button class="save-image">保存图片</button><button class="reverse-image primary">反推提示词</button></div>
      <p class="toolbar-message" role="status" hidden></p>
    </div><figcaption><strong>${ref.title}</strong><span>${ref.category}</span></figcaption></figure>`).join('');
  document.querySelectorAll('.reference').forEach(figure => {
    const ref = REFERENCES.find(r => r.id === figure.dataset.id);
    const toolbar = figure.querySelector('.image-toolbar');
    const message = toolbar.querySelector('.toolbar-message');
    const save = toolbar.querySelector('.save-image');
    wireTypes(toolbar, message, save);
    save.addEventListener('click', async () => {
      const choice = selectionIn(toolbar);
      if (!choice.valid) return;
      // 先在内存里记账，自定义类型才会出现在下拉里
      capture = createCustomTypeAndSave(capture, choice.value, ref.id).state;
      syncDefaults();

      save.disabled = true;
      save.textContent = '保存中…';
      message.hidden = false;
      message.textContent = '正在裁切图片…';
      try {
        const prepared = await prepareReferenceCrop(ref);
        const result = await requestCapture({
          ...prepared,
          meta: {
            projectTypeName: choice.value,
            pageTitle: PAGE.title,
            pageUrl: PAGE.url,
            siteName: PAGE.siteName,
            capturedAt: new Date().toISOString(),
          },
        });
        save.textContent = '已保存';
        message.textContent = result.state === 'duplicate'
          ? `这张图已经在「${choice.value}」里了，没有重复保存：${result.relativePath}`
          : `已保存并归类到 ${result.relativePath}`;
        toast(message.textContent);
      } catch (error) {
        save.textContent = '保存图片';
        message.textContent = describeApiError(error);
        toast(message.textContent);
      } finally {
        save.disabled = !selectionIn(toolbar).valid;
      }
    });
    figure.querySelector('.reverse-image').addEventListener('click', event => {
      lastTrigger = event.currentTarget;
      imageToken++;
      selectImage({ ...ref, kind: 'example' });
      openPanel('prompt');
      analyze();
    });
  });
}
function openPanel(tab = panelTab) {
  $('#side-panel').hidden = false;
  $('#workspace').classList.remove('panel-closed');
  $('#extension-button').setAttribute('aria-expanded', 'true');
  switchTab(tab);
}
function closePanel() {
  $('#side-panel').hidden = true;
  $('#workspace').classList.add('panel-closed');
  $('#extension-button').setAttribute('aria-expanded', 'false');
  (lastTrigger?.isConnected ? lastTrigger : $('#extension-button')).focus({preventScroll:true});
}
function switchTab(tab) {
  panelTab = tab;
  $('#prompt-view').hidden = tab !== 'prompt';
  $('#save-view').hidden = tab !== 'save';
  $('#copy-actions').hidden = tab !== 'prompt';
  for (const name of ['prompt','save']) {
    $(`#${name}-tab`).classList.toggle('active', name === tab);
    $(`#${name}-tab`).setAttribute('aria-pressed', String(name === tab));
  }
}
function inputError(message) {
  $('#input-error').textContent = message;
  $('#input-error').hidden = !message;
}
function renderOutput() {
  $('#prompt-view').classList.toggle('has-result', Boolean(output.length));
  $('#results').hidden = !output.length;
  $('#result-empty').hidden = Boolean(output.length) || analyzing;
  $('#copy-all').disabled = !output.length || analyzing;
  $('#manual-copy').hidden = true;
  $('#prompt-sections').innerHTML = output.map((section,i) => `<section class="prompt-section ${i === 0 ? 'principle' : ''}"><h3>${esc(section.title)}</h3><p>${esc(section.text)}</p></section>`).join('');
}
function selectImage(image) {
  analysisToken++;
  analysisController?.abort();
  analyzing = false;
  selected = image;
  output = [];
  inputError('');
  $('#empty-preview').hidden = true;
  $('#selected-preview').hidden = false;
  $('#selected-preview').innerHTML = image.kind === 'example'
    ? `<div class="photo crop-${image.crop}" role="img" aria-label="${esc(image.title)}"></div>`
    : `<img src="${image.dataUrl}" alt="粘贴的参考图">`;
  $('#image-label').textContent = image.kind === 'example' ? image.title : `已粘贴图片 · ${image.width} × ${image.height}`;
  $('#prototype-note').textContent = image.kind === 'example'
    ? '点击「反推提示词」，会把这张示例图裁成 512×512 交给本地服务分析。'
    : '点击「反推提示词」，图片会先发到本地服务，再由它调用模型；浏览器侧不接触密钥。';
  $('#analyze-button').disabled = !configured;
  $('#analyze-button').textContent = '反推提示词';
  $('#cancel-analysis').hidden = true;
  $('#analysis-status').hidden = true;
  $('#prompt-view').scrollTop = 0;
  renderOutput();
}
function setStatus(text, { loading = false, failed = false } = {}) {
  const node = $('#analysis-status');
  node.hidden = !text;
  node.className = `analysis-status${loading ? ' loading' : ''}${failed ? ' failed' : ''}`;
  node.textContent = text;
}

// 两个入口的唯一差别就是「怎么拿到字节」：
// 示例图从精灵图裁，粘贴图直接降采样。拿到之后走的是同一条链路。
async function toVisionPayload(image) {
  return image.kind === 'example' ? prepareReferenceCrop(image) : prepareForVision(image.source);
}

async function analyze() {
  if (!selected || analyzing) return;
  inputError('');
  const token = ++analysisToken;
  const image = selected;

  analysisController?.abort();
  analysisController = new AbortController();

  analyzing = true;
  output = [];
  $('#analyze-button').disabled = true;
  $('#analyze-button').textContent = '正在提取视觉特征…';
  $('#cancel-analysis').hidden = false;
  renderOutput();

  const startedAt = Date.now();
  // 一次调用要等二十多秒，不给计时用户会以为卡死了。
  const tick = () => setStatus(`正在提取视觉特征…已等待 ${Math.round((Date.now() - startedAt) / 1000)}s`, { loading: true });
  tick();
  statusTimer = setInterval(tick, 1000);

  try {
    // 演示失败态：在真正发请求之前短路，既不花钱，也不依赖真实故障复现。
    if (failureDemo && !failedOnce) {
      failedOnce = true;
      throw new ApiError('UPSTREAM_FAILED', '演示用的失败');
    }

    const prepared = await toVisionPayload(image);
    if (token !== analysisToken) return;

    const result = await requestAnalysis({ ...prepared, signal: analysisController.signal });
    if (token !== analysisToken) return;

    output = result.sections;
    $('#result-source').textContent = result.cached ? '缓存结果' : '模型输出';
    setStatus(result.cached
      ? `命中缓存，直接复用上次结果（${(result.durationMs / 1000).toFixed(1)}s）。`
      : `提取完成，用时 ${(result.durationMs / 1000).toFixed(1)}s。可复制到你的生图工具。`);
    $('#analyze-button').textContent = '重新反推';
  } catch (error) {
    if (token !== analysisToken) return;
    if (error?.name === 'AbortError') return; // 取消路径自己会收尾
    setStatus(describeApiError(error), { failed: true });
    $('#analyze-button').textContent = '重试分析';
  } finally {
    if (token === analysisToken) {
      clearInterval(statusTimer);
      analyzing = false;
      $('#cancel-analysis').hidden = true;
      $('#analyze-button').disabled = !configured;
      renderOutput();
    }
  }
}

function cancelAnalysis() {
  analysisToken++;
  analysisController?.abort();
  clearInterval(statusTimer);
  analyzing = false;
  $('#analyze-button').disabled = !configured;
  $('#analyze-button').textContent = '反推提示词';
  $('#cancel-analysis').hidden = true;
  setStatus('已取消，参考图已保留。');
  renderOutput();
}
async function receiveImage(file) {
  const error = validateImage(file);
  if (error) { inputError(error); return; }
  const token = ++imageToken;
  try {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file);
    });
    // 分析要用可绘制到 canvas 的源；预览另用 dataUrl。
    const source = typeof createImageBitmap === 'function' ? await createImageBitmap(file) : await loadElement(dataUrl);
    if (token !== imageToken) return;
    selectImage({ kind: 'paste', dataUrl, source, width: source.width, height: source.height });
    toast('图片已粘贴，可在面板中预览');
  } catch { if (token === imageToken) inputError('无法读取这张图片，请重新复制一张完整的静态图片。'); }
}

async function loadElement(dataUrl) {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  return image;
}
document.addEventListener('paste', event => {
  if ($('#side-panel').hidden || panelTab !== 'prompt') return;
  const file = [...(event.clipboardData?.items ?? [])].find(item => item.kind === 'file')?.getAsFile();
  if (file) { event.preventDefault(); receiveImage(file); }
  else if (!event.target.closest('textarea,input')) { event.preventDefault(); inputError('剪贴板中没有图片。请使用「复制图片」，再到此处粘贴。'); }
});
$('#paste-button').addEventListener('click', async () => {
  inputError('');
  if (!navigator.clipboard?.read) { inputError('请点击上方图片区域，再按 Ctrl + V 粘贴图片。'); $('#image-input').focus(); return; }
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const type = item.types.find(t => ['image/png','image/jpeg','image/webp'].includes(t));
      if (type) { await receiveImage(await item.getType(type)); return; }
    }
    inputError('剪贴板中没有支持的图片。请使用「复制图片」后重试。');
  } catch { inputError('未能读取剪贴板。请点击上方图片区域，再按 Ctrl + V。'); $('#image-input').focus(); }
});
$('#copy-all').addEventListener('click', async () => {
  if (!output.length || analyzing) return;
  const text = serializePrompt(output);
  try {
    if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
    await navigator.clipboard.writeText(text);
    toast('已复制全部提示词，包含整体生成准则');
  } catch {
    $('#manual-copy').hidden = false;
    $('#copy-text').value = text;
    $('#copy-text').focus(); $('#copy-text').select();
    toast('自动复制不可用，请按 Ctrl + C 复制已选文本');
  }
});
$('#try-example').addEventListener('click', () => { imageToken++; selectImage({...REFERENCES[0],kind:'example'}); analyze(); });
$('#extension-button').addEventListener('click', () => {
  if ($('#side-panel').hidden) { openPanel(); $('#prompt-tab').focus(); }
  else closePanel();
});
$('#close-panel').addEventListener('click', closePanel);
$('#prompt-tab').addEventListener('click', () => switchTab('prompt'));
$('#save-tab').addEventListener('click', () => switchTab('save'));
$('#analyze-button').addEventListener('click', analyze);
$('#cancel-analysis').addEventListener('click', cancelAnalysis);
$('#toolbar-enabled').addEventListener('change', event => {
  document.body.classList.toggle('tools-off', !event.target.checked);
  toast(event.target.checked ? '网页图片工具条已开启' : '网页图片工具条已关闭，仍可粘贴图片');
});
$('#panel-width').addEventListener('input', event => {
  document.documentElement.style.setProperty('--panel-width', `${event.target.value}px`);
  $('#width-label').value = event.target.value;
});
$('#default-form').addEventListener('submit', event => {
  event.preventDefault();
  const choice = selectionIn(event.currentTarget);
  if (!choice.valid) return;
  capture = setCustomDefaultProjectType(capture, choice.value).state;
  syncDefaults();
  toast(`默认类型已设为「${choice.value}」`);
});
$('#reveal-library').addEventListener('click', async () => {
  try {
    await revealLibrary();
  } catch (error) {
    toast(describeApiError(error));
  }
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !$('#side-panel').hidden) closePanel();
});

// 启动时问一次服务端的状态：密钥配没配、素材库在哪。
// 拿不到就把反推按钮禁用掉，而不是让用户点下去才失败。
async function loadStatus() {
  try {
    const status = await fetchStatus();
    configured = status.configured;
    $('#library-path').textContent = status.libraryRoot || '未指定';
    $('#reveal-library').disabled = !status.libraryRoot;
    $('#server-note').textContent = configured
      ? `反推使用 ${status.model}，由本地服务调用。`
      : '尚未配置 DeepSeek 密钥，反推不可用。运行 scripts/configure-deepseek.ps1 后重启服务。';
    $('#server-note').hidden = false;
  } catch (error) {
    configured = false;
    $('#library-path').textContent = '未连接';
    $('#reveal-library').disabled = true;
    $('#server-note').textContent = describeApiError(error);
    $('#server-note').hidden = false;
  }
  $('#analyze-button').disabled = !configured || !selected;
}

renderGallery();
syncDefaults();
wireTypes($('#default-form'), $('#default-error'), $('#set-default'));
loadStatus();

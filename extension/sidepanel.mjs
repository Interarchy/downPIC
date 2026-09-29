import {
  PRESET_TYPES, STORAGE, PRINCIPLE, PRINCIPLE_TITLE, compileIntentPrompt, createEmptyIntentModules,
  normalizeIntentModules, normalizePromptScheme, normalizeWorkingDraft, normalizeProjectType, orderedProjectTypes,
} from './shared.mjs';
import { putSourceImage, getSourceImage, deleteSourceImagesByScheme } from './source-image-store.mjs';
import { importLocalFolder, importSummary, wireFolderDrop } from './folder-import.mjs';

// 三参考图构建与效果图直接编辑共用已确认提示词库。
const $ = id => document.getElementById(id);
const state = {
  privacyAccepted: false, backendReady: false, stage: 'analysis', selection: null,
  projectType: PRESET_TYPES[0], customTypes: [], hiddenTypes: [], typeOrder: [], lastDownload: null,
  schemes: [], scheme: null, working: null, generated: null, evaluation: null,
};
const labels = { compliant: '符合', partial: '部分符合', deviation: '明显偏差', unknown: '无法判断' };
let builder;
const analysisJobs = new Map();
const referenceMessages = new Map();
let editingImage = false;
let focusedReference = null;
let evaluating = false;
let confirming = false;
let confirmedRevision = null;
let saveQueue = Promise.resolve();
let workingQueue = Promise.resolve();
let libraryHandoffBusy = false;
let sidepanelReady = false;
const imageUrls = new Map();

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}
function feedback(id, text = '', tone = '') {
  $(id).textContent = text;
  $(id).dataset.tone = tone;
}
async function request(type, payload = {}) {
  const response = await chrome.runtime.sendMessage({ type, payload });
  if (!response?.ok) {
    const error = new Error(response?.error || '操作失败，请重新加载扩展后再试');
    Object.assign(error, response || {});
    throw error;
  }
  return response;
}
function action(element, fn, feedbackId = 'builder-feedback') {
  element.addEventListener('click', () => Promise.resolve().then(fn).catch(error => feedback(feedbackId, error.message, 'error')));
}
function button(text, fn, className = 'secondary-button compact', feedbackId) {
  const element = node('button', className, text);
  element.type = 'button';
  action(element, fn, feedbackId);
  return element;
}
function fit(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = Math.max(88, textarea.scrollHeight) + 'px';
}
function freshReference() {
  return { id: crypto.randomUUID(), sourceReferenceId: null, name: '', result: null };
}
function freshBuilder() {
  return { builderId: crypto.randomUUID(), name: '', references: [freshReference()],
    modules: createEmptyIntentModules(), principleText: PRINCIPLE, bindings: {}, confirmedPrompt: null, versionId: null };
}
function persistBuilder() {
  const snapshot = structuredClone(builder);
  const operation = saveQueue.catch(() => {}).then(() => chrome.storage.session.set({ [STORAGE.builderV3]: snapshot }));
  saveQueue = operation;
  operation.catch(error => feedback('builder-feedback', '编辑内容保存失败：' + error.message, 'error'));
  return operation;
}
function invalidateBuilder() {
  builder.confirmedPrompt = null;
  $('copy-fallback').hidden = true;
  feedback('copy-feedback', '预览已更新，整体确认后可以复制');
}
function promptText() { return compileIntentPrompt(builder.modules, builder.principleText); }
function fitPromptSection(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = Math.max(32, textarea.scrollHeight) + 'px';
}
function editPromptSection(key, value) {
  if (key === 'principle') builder.principleText = value;
  else {
    builder.modules = builder.modules.map(module => module.key === key
      ? { ...module, value, source: 'user', reviewState: 'modified' } : module);
    const ref = builder.references.find(item => item.id === builder.bindings[key]);
    const candidate = ref?.result?.modules.find(item => item.key === key);
    if (candidate) {
      Object.assign(candidate, { value, source: 'user', reviewState: 'modified' });
      const editor = document.querySelector('[data-reference="' + ref.id + '"] [data-module-key="' + key + '"]');
      if (editor) { editor.value = value; fit(editor); }
    }
  }
  invalidateBuilder(); renderPrompt(); updateChoiceButtons(); void persistBuilder();
}
function renderPromptEditor() {
  const container = $('prompt-preview');
  const modules = builder.modules.filter(module => module.enabled);
  const sections = modules.length ? [{ key: 'principle', title: PRINCIPLE_TITLE, value: builder.principleText }, ...modules] : [];
  if (!sections.length) {
    container.replaceChildren(node('p', 'prompt-placeholder', '在参考图中点击“加入”，然后在这里编辑完整提示词。'));
    return;
  }
  container.querySelector('.prompt-placeholder')?.remove();
  const keys = new Set(sections.map(section => section.key));
  for (const element of [...container.children]) {
    if (!keys.has(element.dataset.promptKey)) element.remove();
  }
  sections.forEach((section, index) => {
    let element = [...container.children].find(item => item.dataset.promptKey === section.key);
    if (!element) {
      element = node('section', 'prompt-section');
      element.dataset.promptKey = section.key;
      const editor = node('textarea', 'compiled-section-editor');
      editor.maxLength = 4000;
      editor.placeholder = '编辑这一段提示词';
      editor.addEventListener('input', () => editPromptSection(section.key, editor.value));
      element.append(node('h3', '', '【' + section.title + '】'), editor);
      container.insertBefore(element, container.children[index] || null);
    }
    const editor = element.querySelector('textarea');
    if (editor.value !== section.value) editor.value = section.value;
    editor.disabled = confirming;
    fitPromptSection(editor);
  });
}
function renderPrompt() {
  const count = builder.modules.filter(module => module.enabled && module.value.trim()).length;
  renderPromptEditor();
  $('prompt-count').textContent = count + ' 个维度';
  $('confirm-prompt').disabled = !count || confirming || analysisJobs.size > 0 || editingImage;
  $('copy-prompt').disabled = !count || builder.confirmedPrompt !== promptText() || confirming;
  $('prompt-name').disabled = confirming;
}
function updateChoiceButtons() {
  document.querySelectorAll('[data-candidate-key]').forEach(button => {
    const key = button.dataset.candidateKey;
    const refId = button.dataset.referenceId;
    const chosen = builder.bindings[key] === refId;
    const current = builder.modules.find(module => module.key === key);
    const ref = builder.references.find(item => item.id === refId);
    const candidate = ref?.result?.modules.find(item => item.key === key);
    button.textContent = chosen ? '移除' : current?.enabled && current.value ? '替换' : '加入';
    button.classList.toggle('is-chosen', chosen);
    button.disabled = confirming || analysisJobs.has(refId) || (!chosen && !candidate?.value.trim());
    button.closest('.reference-module').classList.toggle('is-selected', chosen);
  });
}
function applyCandidate(ref, candidate) {
  const selected = builder.bindings[candidate.key] === ref.id;
  builder.modules = normalizeIntentModules(builder.modules).map(module => {
    if (module.key !== candidate.key) return module;
    if (selected) return { ...module, value: '', enabled: false, locked: false };
    return { ...candidate, enabled: true, locked: false, reviewState: 'modified',
      sourceHint: { analysisId: ref.result.analysisId, displayName: ref.name || '参考图' } };
  });
  if (selected) delete builder.bindings[candidate.key];
  else builder.bindings[candidate.key] = ref.id;
  invalidateBuilder();
  renderPrompt();
  updateChoiceButtons();
  return persistBuilder();
}
function releaseImageUrls() {
  for (const url of imageUrls.values()) URL.revokeObjectURL(url);
  imageUrls.clear();
}
function renderReferenceStatus(refId) {
  const status = document.querySelector('[data-reference="' + refId + '"] .reference-feedback');
  if (!status) return;
  const job = analysisJobs.get(refId);
  const message = referenceMessages.get(refId);
  status.textContent = job ? '正在分析，已等待 ' + Math.floor((Date.now() - job.startedAt) / 1000) + ' 秒' : message?.text || '';
  status.dataset.tone = job ? '' : message?.tone || '';
}
function refreshReferenceControls() {
  for (const ref of builder.references) {
    const section = document.querySelector('[data-reference="' + ref.id + '"]');
    if (!section) continue;
    const busy = analysisJobs.has(ref.id);
    section.querySelector('.reference-choose').disabled = busy || editingImage || confirming;
    const analyze = section.querySelector('.reference-analyze');
    analyze.textContent = busy ? '分析中…' : '开始分析';
    analyze.disabled = !ref.sourceReferenceId || busy || editingImage || confirming || !state.backendReady;
    section.querySelectorAll('.prompt-editor').forEach(editor => { editor.disabled = busy || confirming; });
    renderReferenceStatus(ref.id);
  }
  $('add-reference').hidden = builder.references.length >= 3;
  $('add-reference').textContent = builder.references.length === 1 ? '添加参考图二' : '添加参考图三';
  $('add-reference').disabled = editingImage || confirming;
  $('new-builder').disabled = analysisJobs.size > 0 || editingImage || confirming;
  updateChoiceButtons(); renderPrompt();
}
async function renderReferences(targetRefId = null) {
  if (!targetRefId) { releaseImageUrls(); $('reference-list').replaceChildren(); }
  for (const [index, ref] of builder.references.entries()) {
    if (targetRefId && ref.id !== targetRefId) continue;
    const oldSection = document.querySelector('[data-reference="' + ref.id + '"]');
    if (imageUrls.has(ref.id)) { URL.revokeObjectURL(imageUrls.get(ref.id)); imageUrls.delete(ref.id); }
    const section = node('section', 'reference-section');
    section.dataset.reference = ref.id;
    const heading = node('div', 'section-title');
    heading.append(node('h2', '', '参考图' + ['一', '二', '三'][index]));
    section.append(heading);
    const preview = node('figure', 'preview is-empty');
    preview.tabIndex = 0;
    preview.addEventListener('focusin', () => { focusedReference = ref.id; });
    preview.addEventListener('pointerdown', () => { focusedReference = ref.id; });
    const image = node('img');
    image.alt = '参考图' + (index + 1);
    image.hidden = true;
    const caption = node('figcaption', '', ref.name || '粘贴、拖入或选择参考图');
    const input = node('input');
    input.type = 'file'; input.accept = 'image/png,image/jpeg,image/webp'; input.hidden = true;
    const choose = button(ref.sourceReferenceId ? '更换图片' : '选择文件', () => input.click());
    choose.classList.add('reference-choose');
    input.addEventListener('change', () => {
      acceptReference([...input.files], ref.id).catch(error => feedback('builder-feedback', error.message, 'error'));
      input.value = '';
    });
    wireDrop(preview, files => acceptReference(files, ref.id), 'builder-feedback');
    preview.append(image, caption, choose, input);
    section.append(preview);
    const analyze = button('开始分析', () => analyzeReference(ref.id), 'primary-button reference-analyze');
    section.append(analyze, node('p', 'section-note reference-feedback'));
    if (ref.result) {
      const list = node('div', 'reference-modules');
      for (const candidate of ref.result.modules) {
        // 无依据的空维度不占据操作区。
        if (!candidate.value.trim()) continue;
        const card = node('article', 'reference-module');
        const head = node('div', 'section-title');
        const choice = button('', () => applyCandidate(ref, candidate));
        choice.dataset.candidateKey = candidate.key;
        choice.dataset.referenceId = ref.id;
        head.append(node('h3', '', candidate.title), choice);
        const text = node('textarea', 'prompt-editor');
        text.value = candidate.value;
        text.dataset.moduleKey = candidate.key;
        text.maxLength = 4000;
        text.placeholder = '补充这一维度的提示词';
        text.disabled = analysisJobs.has(ref.id) || confirming;
        text.addEventListener('input', () => {
          candidate.value = text.value;
          candidate.source = 'user';
          candidate.reviewState = 'modified';
          if (builder.bindings[candidate.key] === ref.id) {
            builder.modules = builder.modules.map(module => module.key === candidate.key
              ? { ...module, value: text.value, source: 'user' } : module);
            invalidateBuilder();
            renderPrompt();
          }
          fit(text); updateChoiceButtons(); void persistBuilder();
        });
        card.append(head, text);
        list.append(card);
      }
      section.append(list);
    }
    if (oldSection) oldSection.replaceWith(section);
    else $('reference-list').append(section);
    if (ref.sourceReferenceId) {
      const sourceId = ref.sourceReferenceId;
      void getSourceImage(sourceId).then(record => {
        if (!section.isConnected || sourceId !== ref.sourceReferenceId) return;
        if (record.schemeId !== builder.builderId) throw new Error('参考图归属不一致');
        const url = URL.createObjectURL(record.blob);
        imageUrls.set(ref.id, url); image.src = url; image.hidden = false; preview.classList.remove('is-empty');
      }).catch(() => { if (section.isConnected) caption.textContent = '图片无法读取，请重新选择'; });
    }
  }
  refreshReferenceControls();
  requestAnimationFrame(() => document.querySelectorAll('#reference-list textarea').forEach(fit));
}
async function imageFile(files) {
  if (files.length !== 1) throw new Error('一次请选择一张图片');
  const file = files[0];
  if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size < 1 || file.size > 10 * 1024 * 1024) {
    throw new Error('请选择 1 字节至 10 MB 的 PNG、JPEG 或 WebP 图片');
  }
  return file;
}
function fileDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('图片读取失败，请重新选择'));
    reader.readAsDataURL(file);
  });
}
async function acceptReference(files, refId) {
  if (analysisJobs.has(refId) || editingImage || confirming) return;
  const file = await imageFile(files);
  const ref = builder.references.find(item => item.id === refId);
  if (!ref) return;
  editingImage = true;
  refreshReferenceControls();
  try {
    const sourceReferenceId = crypto.randomUUID();
    await putSourceImage({ sourceReferenceId, schemeId: builder.builderId, blob: file });
    for (const [key, chosenId] of Object.entries(builder.bindings)) {
      if (chosenId !== refId) continue;
      builder.modules = builder.modules.map(module => module.key === key ? { ...module, enabled: false, value: '' } : module);
      delete builder.bindings[key];
    }
    ref.sourceReferenceId = sourceReferenceId; ref.name = file.name || '参考图'; ref.result = null;
    referenceMessages.delete(refId);
    focusedReference = refId; invalidateBuilder();
    await persistBuilder();
    feedback('builder-feedback', '图片已就绪，点击开始分析');
  } finally { editingImage = false; await renderReferences(refId); }
}
async function analyzeReference(refId) {
  if (analysisJobs.has(refId) || confirming || editingImage) return;
  const ref = builder.references.find(item => item.id === refId);
  if (!ref?.sourceReferenceId) return;
  const builderId = builder.builderId;
  const sourceReferenceId = ref.sourceReferenceId;
  analysisJobs.set(refId, { startedAt: Date.now() });
  referenceMessages.delete(refId);
  refreshReferenceControls();
  const ticker = setInterval(() => renderReferenceStatus(refId), 1000);
  try {
    const { result } = await request('builder.analyze', {
      builderId, sourceReferenceId, displayName: ref.name,
    });
    if (builder.builderId !== builderId || ref.sourceReferenceId !== sourceReferenceId) return;
    // 已经采用并编辑的维度继续保留；重新分析只补充尚未选用的维度。
    const previous = ref.result;
    result.modules = result.modules.map(module => builder.bindings[module.key] === refId
      ? previous?.modules.find(item => item.key === module.key) || module : module);
    ref.result = result;
    if (Number.isSafeInteger(ref.captureDownloadId)) {
      const summary = result.modules.find(module => module.key === 'reference_summary')?.value;
      if (summary) await request('capture.description.save', { downloadId: ref.captureDownloadId, description: summary.slice(0,1000), previousDescription: '' }).catch(() => {});
    }
    await persistBuilder();
    referenceMessages.set(refId, { text: '分析完成，可编辑并加入需要的维度', tone: 'success' });
  } catch (error) {
    referenceMessages.set(refId, { text: error.message, tone: 'error' });
  } finally { clearInterval(ticker); analysisJobs.delete(refId); await renderReferences(refId); }
}
async function confirmPrompt() {
  if (confirming || analysisJobs.size || editingImage) return;
  confirming = true;
  try {
    await renderReferences();
    await persistBuilder();
    const payload = { builderId: builder.builderId, compiledPrompt: promptText(), confirmed: true, baseVersionId: builder.versionId };
    const response = await request('builder.confirm', payload);
    builder.confirmedPrompt = response.version.compiledPrompt;
    builder.versionId = response.version.versionId;
    await persistBuilder();
    await loadLibrary();
    feedback('copy-feedback', '已确认并保存，现在可以复制', 'success');
  } finally { confirming = false; await renderReferences(); }
}
async function copy(text, fallbackId, feedbackId) {
  try {
    await navigator.clipboard.writeText(text);
    $(fallbackId).hidden = true;
    feedback(feedbackId, '已复制完整提示词', 'success');
  } catch {
    $(fallbackId).value = text; $(fallbackId).hidden = false; $(fallbackId).select();
    feedback(feedbackId, '自动复制未获允许，请按 Ctrl+C 复制已选中的文本');
  }
}
async function newBuilder() {
  if (analysisJobs.size || editingImage || confirming) return;
  if (!confirm('重新构建将清空当前编辑区。已确认的提示词仍保留在库中，继续吗？')) return;
  const oldId = builder.builderId;
  const { schemes } = await request('scheme.list');
  if (!schemes.some(item => item.schemeId === oldId)) await deleteSourceImagesByScheme(oldId);
  builder = freshBuilder(); focusedReference = builder.references[0].id;
  referenceMessages.clear();
  $('prompt-name').value = ''; $('copy-fallback').hidden = true;
  await persistBuilder(); feedback('copy-feedback'); await renderReferences();
}
async function handleLibraryHandoff(handoff) {
  if ((!handoff?.schemeId && !handoff?.sourceReferenceId) || libraryHandoffBusy) return;
  libraryHandoffBusy = true;
  try {
    if (handoff.mode === 'capture') {
      if (analysisJobs.size || editingImage || confirming) throw new Error('请等待当前图片处理完成后再从图库打开');
      if (!state.privacyAccepted) throw new Error('请先确认图片处理说明，然后重新点击生成完整提示词');
      let ref = builder.references.find(item => !item.sourceReferenceId);
      if (!ref && builder.references.length < 3) { ref = freshReference(); builder.references.push(ref); }
      if (!ref) {
        if (!confirm('当前已有三张参考图。重新构建这张图库图片的提示词？已确认方案仍保留。')) return;
        builder = freshBuilder(); ref = builder.references[0];
      }
      const record = await getSourceImage(handoff.sourceReferenceId);
      const wasEmpty = !builder.modules.some(module => module.value);
      switchStage('analysis');
      await acceptReference([new File([record.blob], handoff.name || '图库参考图', { type: record.blob.type })], ref.id);
      ref.captureDownloadId = handoff.downloadId ?? null;
      await analyzeReference(ref.id);
      if (ref.result && wasEmpty) {
        builder.modules = normalizeIntentModules(ref.result.modules);
        builder.bindings = Object.fromEntries(builder.modules.filter(module => module.enabled).map(module => [module.key, ref.id]));
        builder.name ||= handoff.name || '图库参考图'; $('prompt-name').value = builder.name;
        await persistBuilder(); await renderReferences();
      }
    } else if (handoff.mode === 'builder') {
      const currentHasWork = builder && (builder.name.trim() || builder.references.some(ref => ref.sourceReferenceId)
        || builder.modules.some(module => module.enabled && module.value));
      if (currentHasWork && builder.confirmedPrompt !== promptText() && builder.builderId !== handoff.schemeId
          && !confirm('切换到素材库中的方案？当前未确认的构建内容将被替换。')) return;
      const response = await request('scheme.open', { schemeId: handoff.schemeId });
      const scheme = normalizePromptScheme(response.scheme);
      state.scheme = scheme; state.working = response.workingDraft; state.evaluation = null;
      const references = scheme.sourceReferences.slice(0, 3).map(ref => ({
        id: crypto.randomUUID(), sourceReferenceId: ref.sourceReferenceId,
        name: ref.displayName, result: null,
      }));
      if (!references.length) references.push(freshReference());
      const bindings = {};
      for (const module of scheme.modules) {
        if (!module.enabled || !module.value) continue;
        const chosen = references.find(ref => ref.name === module.sourceHint?.displayName) || references[0];
        if (chosen?.sourceReferenceId) bindings[module.key] = chosen.id;
      }
      builder = {
        builderId: scheme.schemeId, name: scheme.name, references,
        modules: normalizeIntentModules(scheme.modules), principleText: scheme.principleText,
        bindings, confirmedPrompt: scheme.currentPrompt, versionId: scheme.currentVersionId,
      };
      focusedReference = references[0].id;
      $('prompt-name').value = builder.name;
      await persistBuilder();
      await renderReferences();
      switchStage('analysis');
      feedback('builder-feedback', '已从素材库载入方案；修改后请重新整体确认。', 'success');
    } else {
      switchStage('optimize');
      await openScheme(handoff.schemeId);
      feedback('evaluation-feedback', '已从素材库选择方案。导入生成图后可开始评估。', 'success');
    }
  } catch (error) {
    feedback('builder-feedback', error.message, 'error');
  } finally {
    await chrome.storage.session.remove(STORAGE.libraryHandoffV4);
    libraryHandoffBusy = false;
  }
}
async function loadLibrary() {
  const response = await request('scheme.list');
  state.schemes = response.schemes;
  $('library-list').replaceChildren();
  const select = $('scheme-select');
  select.replaceChildren(new Option('从最近确认的提示词库中选择', ''));
  for (const scheme of state.schemes.slice(0, 5)) {
    select.add(new Option(scheme.name, scheme.schemeId));
    const row = node('div', 'draft-item');
    const info = node('div');
    info.append(node('strong', '', scheme.name), node('p', 'section-note', new Date(scheme.updatedAt).toLocaleString('zh-CN')));
    const actions = node('div', 'library-actions');
    actions.append(button('使用', async () => { switchStage('optimize'); await openScheme(scheme.schemeId); }),
      button('删除', async () => {
        if (!confirm('删除已确认提示词“' + scheme.name + '”及其本地来源图？')) return;
        await request('scheme.delete', { schemeId: scheme.schemeId, confirmed: true });
        if (state.scheme?.schemeId === scheme.schemeId) { state.scheme = null; state.working = null; state.evaluation = null; renderEvaluation(); }
        if (builder.builderId === scheme.schemeId) { builder.versionId = null; invalidateBuilder(); await persistBuilder(); renderPrompt(); }
        await loadLibrary();
      }));
    row.append(info, actions); $('library-list').append(row);
  }
  if (!state.schemes.length) $('library-list').append(node('p', 'section-note', '整体确认一份提示词后，会出现在这里。'));
  if (state.scheme && ![...select.options].some(option => option.value === state.scheme.schemeId)) {
    select.add(new Option(state.scheme.name, state.scheme.schemeId));
  }
  select.value = state.scheme?.schemeId || '';
  renderEvaluationControls();
}
async function openScheme(schemeId) {
  if (evaluating) return;
  if (!schemeId) { state.scheme = null; state.working = null; state.evaluation = null; renderEvaluation(); return; }
  if (state.working?.dirtyModuleKeys?.length && schemeId !== state.scheme?.schemeId
      && !confirm('当前修改尚未确认。切换基本提示词并丢弃这些修改吗？')) {
    $('scheme-select').value = state.scheme.schemeId; return;
  }
  await workingQueue;
  const response = await request('scheme.open', { schemeId });
  state.scheme = normalizePromptScheme(response.scheme); state.working = response.workingDraft;
  const evaluation = await request('evaluation.get', { schemeId });
  state.generated = evaluation.generatedResult;
  state.evaluation = evaluation.evaluationSession;
  confirmedRevision = null;
  $('scheme-select').value = schemeId;
  feedback('revision-feedback');
  renderGenerated(); renderEvaluation();
}
function renderGenerated() {
  const generated = state.generated;
  $('generated-preview').classList.toggle('is-empty', !generated);
  $('generated-image').hidden = !generated;
  if (generated) $('generated-image').src = 'data:' + generated.mimeType + ';base64,' + generated.imagePayload;
  else $('generated-image').removeAttribute('src');
  $('generated-caption').textContent = generated?.displayName || '放入已经生成的效果图';
  renderEvaluationControls();
}
function renderEvaluationControls() {
  $('run-evaluation').disabled = evaluating || !state.generated || !state.scheme?.currentVersionId || !state.backendReady;
  $('run-evaluation').textContent = evaluating ? '评估中…' : '开始评估';
  $('scheme-select').disabled = evaluating;
  $('generated-choose').disabled = evaluating;
  $('baseline-details').hidden = !state.scheme;
  $('baseline-prompt').textContent = state.scheme?.currentPrompt || '';
}
async function acceptGenerated(files) {
  if (evaluating) return;
  const file = await imageFile(files);
  const dataUrl = await fileDataUrl(file);
  const response = await request('evaluation.image.set', { image: {
    mimeType: file.type, base64: dataUrl.slice(dataUrl.indexOf(',') + 1), byteSize: file.size, displayName: file.name,
  } });
  state.generated = response.generatedResult; state.evaluation = null; confirmedRevision = null;
  feedback('evaluation-feedback', '效果图已就绪，选择基本提示词后可开始评估');
  renderGenerated(); renderEvaluation();
}
async function evaluate() {
  if (evaluating || !state.scheme || !state.generated) return;
  if (state.working?.dirtyModuleKeys?.length && !confirm('重新评估将以已确认的基本提示词为准，当前未确认修改会保留。继续吗？')) return;
  evaluating = true; renderEvaluationControls();
  let seconds = 0;
  feedback('evaluation-feedback', '正在对照生成图与基本提示词…');
  const ticker = setInterval(() => feedback('evaluation-feedback', '正在评估，已等待 ' + (++seconds) + ' 秒'), 1000);
  try {
    const result = await request('evaluation.run', {
      schemeId: state.scheme.schemeId, versionId: state.scheme.currentVersionId,
      generatedResultId: state.generated.generatedResultId, consentConfirmed: true,
    });
    state.evaluation = result.evaluationSession;
    state.working = (await request('scheme.working.get', { schemeId: state.scheme.schemeId })).workingDraft;
    confirmedRevision = null;
    feedback('evaluation-feedback', '评估完成，可在下方直接修改提示词', 'success');
    renderEvaluation();
  } finally { clearInterval(ticker); evaluating = false; renderEvaluationControls(); }
}
function persistWorking() {
  state.working = normalizeWorkingDraft(state.working, state.scheme);
  const snapshot = structuredClone(state.working);
  const operation = workingQueue.catch(() => {}).then(() => chrome.storage.session.set({ [STORAGE.workingDraftV3]: snapshot }));
  workingQueue = operation;
  operation.catch(error => feedback('revision-feedback', '修改保存失败：' + error.message, 'error'));
  return operation;
}
function revisionChanged() {
  confirmedRevision = null;
  $('copy-revision').disabled = true;
  $('confirm-revision').disabled = confirming;
  feedback('revision-feedback', '修改后请确认，再复制');
  void persistWorking();
}
function renderEvaluation() {
  renderEvaluationControls();
  const result = state.evaluation?.status === 'succeeded' ? state.evaluation.result : null;
  $('evaluation-report').hidden = !result || !state.scheme;
  $('finding-list').replaceChildren();
  if (!result || !state.working) return;
  $('overall-conclusion').textContent = result.overallConclusion || '检查各维度的偏差，并在原文中直接调整。';
  const findings = new Map(result.findings.map(finding => [finding.key, finding]));
  for (const module of state.working.modules.filter(item => item.enabled && item.value)) {
    const finding = findings.get(module.key);
    const card = node('article', 'finding-card');
    card.dataset.status = finding?.status || 'unknown';
    const head = node('div', 'section-title');
    head.append(node('h3', '', module.title), node('span', 'finding-status', finding ? labels[finding.status] : '上下文'));
    const notice = node('p', 'deviation-note', finding
      ? finding.gap || (finding.status === 'compliant' ? '未发现明显偏差' : finding.observation)
      : '此项用于表达整体意图，不单独评分。');
    const text = node('textarea', 'prompt-editor');
    text.value = module.value; text.maxLength = 4000; text.disabled = module.locked;
    text.addEventListener('input', () => {
      const current = state.working.modules.find(item => item.key === module.key);
      current.value = text.value; current.source = 'user'; current.reviewState = 'modified';
      fit(text); revisionChanged();
    });
    card.append(head, notice, text);
    if (module.locked) {
      card.append(button('解锁', () => {
        state.working.modules.find(item => item.key === module.key).locked = false;
        text.disabled = false; revisionChanged();
        renderEvaluation();
      }, 'text-button', 'revision-feedback'));
    }
    if (finding?.suggestion || finding?.reliabilityNote) {
      const detail = node('details', 'finding-detail');
      detail.append(node('summary', '', '调整提示'), node('p', '', [finding.suggestion, finding.reliabilityNote].filter(Boolean).join('\n')));
      card.append(detail);
    }
    $('finding-list').append(card);
  }
  $('copy-revision').disabled = !confirmedRevision;
  $('confirm-revision').disabled = false;
  requestAnimationFrame(() => document.querySelectorAll('#finding-list textarea').forEach(fit));
}
async function confirmRevision() {
  if (confirming) return;
  confirming = true;
  $('confirm-revision').disabled = true;
  try {
  await workingQueue;
  if (!state.working || !state.scheme) return;
  const modules = normalizeIntentModules(state.working.modules);
  if (modules.some(item => item.enabled && !item.value)) throw new Error('启用维度的提示词不能为空，请补充后确认');
  const prompt = compileIntentPrompt(modules, state.working.principleText);
  const response = await request('scheme.version.commit', {
    schemeId: state.scheme.schemeId, baseVersionId: state.working.baseVersionId, modules,
    compiledPrompt: prompt, principleText: state.working.principleText, confirmed: true,
    changeSummary: modules.filter((item, i) => item.value !== state.scheme.modules[i].value)
      .map(item => ({ moduleKey: item.key, changeType: 'direct-edit' })),
  }).catch(error => {
    if (error.code === 'NO_CHANGES') return { scheme: state.scheme, workingDraft: state.working, version: state.scheme.versions.at(-1) };
    throw error;
  });
  state.scheme = normalizePromptScheme(response.scheme); state.working = response.workingDraft;
  confirmedRevision = prompt;
  $('copy-revision').disabled = false; $('confirm-revision').disabled = true;
  feedback('revision-feedback', response.version?.generatedResult
    ? '提示词和本次效果图已保存至词库，可查看版本历史和关联图片。'
    : '提示词已确认；当前没有新的效果图入库。', 'success');
  await loadLibrary();
  } finally {
    confirming = false;
    $('confirm-revision').disabled = Boolean(confirmedRevision);
  }
}
function wireDrop(element, accept, feedbackId) {
  element.addEventListener('dragover', event => { event.preventDefault(); element.classList.add('is-over'); });
  element.addEventListener('dragleave', () => element.classList.remove('is-over'));
  element.addEventListener('drop', event => {
    event.preventDefault(); element.classList.remove('is-over');
    accept([...event.dataTransfer.files]).catch(error => feedback(feedbackId, error.message, 'error'));
  });
}
function switchStage(stage) {
  if (!state.privacyAccepted) stage = 'analysis';
  state.stage = stage;
  sessionStorage.setItem('archbuddy-active-stage', stage);
  for (const name of ['analysis','download','optimize']) $(name + '-panel').hidden = stage !== name;
  document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('is-active', tab.dataset.tab === stage));
  requestAnimationFrame(() => document.querySelectorAll('.panel:not([hidden]) textarea.prompt-editor').forEach(fit));
  requestAnimationFrame(() => document.querySelectorAll('#prompt-preview textarea').forEach(fitPromptSection));
  if (stage === 'optimize') loadLibrary().catch(error => feedback('evaluation-feedback', error.message, 'error'));
}
async function refreshBackend() {
  const status = await request('backend.status');
  state.backendReady = Boolean(status.configured && status.online);
  $('session-status').textContent = state.backendReady ? (status.mode === 'local' ? '本地服务已连接' : '服务已连接') : '服务未连接';
  $('session-status').dataset.state = state.backendReady ? 'online' : 'offline';
  await renderReferences(); renderEvaluationControls();
}
function availableTypes() {
  return orderedProjectTypes(state.customTypes, state.hiddenTypes, state.typeOrder);
}
function populateTypes() {
  const target = $('project-type-list');
  target.replaceChildren();
  for (const type of availableTypes()) {
    const row = node('div', 'project-type-row');
    row.setAttribute('role', 'listitem');
    row.draggable = true;
    const grip = node('span', 'type-grip', '⠿');
    grip.title = '拖动调整顺序';
    row.append(grip);
    row.addEventListener('dragstart', event => {
      event.dataTransfer.setData('text/plain', type);
      event.dataTransfer.effectAllowed = 'move';
      row.classList.add('is-dragging');
    });
    row.addEventListener('dragend', () => row.classList.remove('is-dragging'));
    row.addEventListener('dragover', event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; });
    row.addEventListener('drop', async event => {
      event.preventDefault();
      const from = event.dataTransfer.getData('text/plain');
      if (from === type || !availableTypes().includes(from)) return;
      const next = availableTypes().filter(value => value !== from);
      next.splice(next.indexOf(type), 0, from);
      try {
        await chrome.storage.local.set({ [STORAGE.projectTypeOrderV4]: next });
        state.typeOrder = next;
        populateTypes();
      } catch (error) { feedback('type-feedback', error.message, 'error'); }
    });
    const rename = button('改名', async () => {
      const name = prompt('修改项目类型名称', type);
      if (name === null) return;
      await request('project-types.rename', { from: type, name });
      await reloadTypes();
    }, 'type-rename', 'type-feedback');
    row.append(rename);
    const choose = node('button', 'type-choice' + (type === state.projectType ? ' is-selected' : ''), type);
    choose.type = 'button';
    choose.setAttribute('aria-label', type + (type === state.projectType ? '，当前默认类型' : '，设为默认类型'));
    choose.addEventListener('click', async () => {
      state.projectType = type;
      await chrome.storage.local.set({ [STORAGE.projectType]: type });
      populateTypes();
      feedback('type-feedback', '默认类型已设为' + type, 'success');
    });
    const remove = node('button', 'type-remove', '删除');
    remove.type = 'button';
    remove.setAttribute('aria-label', '删除项目类型' + type);
    remove.addEventListener('click', async () => {
      if (availableTypes().length === 1) {
        feedback('type-feedback', '至少保留一个项目类型', 'error');
        return;
      }
      if (PRESET_TYPES.includes(type)) state.hiddenTypes = [...new Set([...state.hiddenTypes, type])];
      state.customTypes = state.customTypes.filter(value => value !== type);
      if (state.projectType === type) state.projectType = availableTypes()[0];
      await chrome.storage.local.set({
        [STORAGE.customTypes]: state.customTypes,
        [STORAGE.hiddenProjectTypesV4]: state.hiddenTypes,
        [STORAGE.projectType]: state.projectType,
      });
      populateTypes();
      feedback('type-feedback', '已移除类型“' + type + '”；已保存图片不受影响', 'success');
    });
    row.append(choose, remove);
    target.append(row);
  }
}
async function refreshCapture() {
  const session = await chrome.storage.session.get([STORAGE.selection, STORAGE.lastDownload]);
  state.selection = session[STORAGE.selection]; state.lastDownload = session[STORAGE.lastDownload];
}

async function useCapture() {
  if (!state.selection || !builder || !state.privacyAccepted || editingImage || confirming) return;
  const refId = focusedReference || builder.references[0].id;
  const blob = await (await fetch(state.selection.imagePayload)).blob();
  await acceptReference([new File([blob], state.selection.displayName || '网页参考图', { type: blob.type })], refId);
}
document.querySelectorAll('.tab').forEach(tab => action(tab, () => switchStage(tab.dataset.tab)));
$('privacy-check').addEventListener('change', () => { $('privacy-accept').disabled = !$('privacy-check').checked; });
action($('privacy-accept'), async () => {
  await request('assets.consent', { enabled: true }); $('asset-ai-toggle').checked = true; state.privacyAccepted = true;
  document.body.classList.remove('needs-consent'); $('privacy-gate').hidden = true; await refreshBackend();
  if (!builder.references.some(ref => ref.sourceReferenceId) && state.selection) await useCapture();
});
action($('asset-ai-toggle'), async () => {
  const enabled = $('asset-ai-toggle').checked;
  if (enabled && !confirm('新下载图片将自动发送预览生成描述；语义检索会发送查询与库内描述/提示词给 ArchBuddy 与 DeepSeek。确认开启？')) { $('asset-ai-toggle').checked = false; return; }
  await request('assets.consent', { enabled });
});
action($('add-reference'), async () => {
  if (builder.references.length >= 3 || confirming || editingImage) return;
  const ref = freshReference(); builder.references.push(ref); focusedReference = ref.id;
  await persistBuilder(); await renderReferences();
  document.querySelector('[data-reference="' + ref.id + '"]').scrollIntoView({ block: 'start', behavior: 'smooth' });
});
action($('new-builder'), newBuilder);
async function importFolders(files) {
  const control = $('import-local-folder');
  if (control.disabled) return;
  control.disabled = true;
  feedback('import-feedback', '正在复制图片到本地图词库…');
  try {
    const result = await importLocalFolder(files, message => feedback('import-feedback', message));
    await reloadTypes();
    feedback('import-feedback', importSummary(result), 'success');
  } catch (error) {
    feedback('import-feedback', '导入失败：' + error.message, 'error');
  } finally { control.disabled = false; }
}
action($('import-local-folder'), () => $('local-folder-files').click(), 'import-feedback');
$('local-folder-files').addEventListener('change', event => {
  const files = [...event.currentTarget.files]; event.currentTarget.value = '';
  if (files.length) void importFolders(files);
});
wireFolderDrop($('folder-import-drop'), importFolders,
  error => feedback('import-feedback', '导入失败：' + error.message, 'error'),
  () => { if ($('import-local-folder').disabled) return false; feedback('import-feedback', '正在读取所拖入的文件夹…'); });
action($('open-library'), async () => {
  const tab = await chrome.tabs.create({ url: chrome.runtime.getURL('library.html') });
  await chrome.sidePanel.close({ windowId: tab.windowId });
});
$('prompt-name').addEventListener('input', () => {
  builder.name = $('prompt-name').value; invalidateBuilder(); renderPrompt(); void persistBuilder();
});
action($('confirm-prompt'), confirmPrompt, 'copy-feedback');
action($('copy-prompt'), async () => {
  if (builder.confirmedPrompt !== promptText()) return;
  await copy(builder.confirmedPrompt, 'copy-fallback', 'copy-feedback');
}, 'copy-feedback');
$('scheme-select').addEventListener('change', () => openScheme($('scheme-select').value).catch(error => feedback('evaluation-feedback', error.message, 'error')));
action($('generated-choose'), () => $('generated-file').click(), 'evaluation-feedback');
$('generated-file').addEventListener('change', () => {
  acceptGenerated([...$('generated-file').files]).catch(error => feedback('evaluation-feedback', error.message, 'error')); $('generated-file').value = '';
});
wireDrop($('generated-preview'), acceptGenerated, 'evaluation-feedback');
action($('run-evaluation'), evaluate, 'evaluation-feedback');
action($('confirm-revision'), confirmRevision, 'revision-feedback');
action($('copy-revision'), () => confirmedRevision && copy(confirmedRevision, 'revision-copy-fallback', 'revision-feedback'), 'revision-feedback');
action($('save-type'), async () => {
  const type = normalizeProjectType($('custom-type').value).slice(0, 40);
  if (!type) throw new Error('请输入分类名称');
  if (PRESET_TYPES.includes(type)) state.hiddenTypes = state.hiddenTypes.filter(value => value !== type);
  else state.customTypes = [...new Set([...state.customTypes, type])];
  state.projectType = type;
  await chrome.storage.local.set({
    [STORAGE.customTypes]: state.customTypes,
    [STORAGE.hiddenProjectTypesV4]: state.hiddenTypes,
    [STORAGE.projectType]: type,
  });
  $('custom-type').value = '';
  populateTypes();
  feedback('type-feedback', '分类已新增并设为默认', 'success');
}, 'type-feedback');
$('custom-type').addEventListener('keydown', event => {
  if (event.key === 'Enter') $('save-type').click();
});
$('analytics-toggle').addEventListener('change', () => request('analytics.consent.set', { enabled: $('analytics-toggle').checked }).catch(error => feedback('builder-feedback', error.message, 'error')));
document.addEventListener('paste', event => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || !state.privacyAccepted) return;
  const files = [...event.clipboardData.files];
  if (!files.some(file => file.type.startsWith('image/'))) return;
  event.preventDefault();
  if (state.stage === 'download') switchStage('analysis');
  const operation = state.stage === 'optimize' ? acceptGenerated(files)
    : acceptReference(files, focusedReference || builder.references[0].id);
  operation.catch(error => feedback(state.stage === 'optimize' ? 'evaluation-feedback' : 'builder-feedback', error.message, 'error'));
});
chrome.runtime.onMessage.addListener(message => {
  if (message?.type === 'selection.changed' || message?.type === 'download.changed') {
    refreshCapture().then(() => {
      if (message.type === 'selection.changed' && state.stage === 'analysis') return useCapture();
    }).catch(error => feedback('builder-feedback', error.message, 'error'));
  }
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[STORAGE.assetAIConsent]) $('asset-ai-toggle').checked = changes[STORAGE.assetAIConsent].newValue === true;
  if (area === 'local' && changes[STORAGE.privacyAccepted]?.newValue) {
    state.privacyAccepted = true; document.body.classList.remove('needs-consent'); $('privacy-gate').hidden = true;
  }
  if (sidepanelReady && area === 'local' && [STORAGE.customTypes, STORAGE.hiddenProjectTypesV4, STORAGE.projectTypeOrderV4, STORAGE.projectType].some(key => changes[key])) {
    void reloadTypes().catch(error => feedback('type-feedback', error.message, 'error'));
  }
  if (sidepanelReady && area === 'session' && changes[STORAGE.requestedStageV4]?.newValue) {
    void handleRequestedStage(changes[STORAGE.requestedStageV4].newValue);
  }
  if (sidepanelReady && area === 'session' && changes[STORAGE.libraryHandoffV4]?.newValue) {
    void handleLibraryHandoff(changes[STORAGE.libraryHandoffV4].newValue);
  }
});
async function handleRequestedStage(stage) {
  if (!['analysis', 'optimize'].includes(stage)) return;
  switchStage(stage);
  await chrome.storage.session.remove(STORAGE.requestedStageV4);
}
window.addEventListener('beforeunload', releaseImageUrls);
async function init() {
  const [local, session] = await Promise.all([
    chrome.storage.local.get([STORAGE.assetAIConsent, STORAGE.privacyAccepted, STORAGE.projectType, STORAGE.customTypes, STORAGE.hiddenProjectTypesV4, STORAGE.projectTypeOrderV4, STORAGE.analyticsConsent]),
    chrome.storage.session.get([STORAGE.builderV3, STORAGE.generatedResultV3]),
  ]);
  state.privacyAccepted = Boolean(local[STORAGE.privacyAccepted]);
  $('asset-ai-toggle').checked = local[STORAGE.assetAIConsent] === true;
  state.projectType = normalizeProjectType(local[STORAGE.projectType]) || PRESET_TYPES[0];
  state.customTypes = Array.isArray(local[STORAGE.customTypes]) ? local[STORAGE.customTypes] : [];
  state.hiddenTypes = Array.isArray(local[STORAGE.hiddenProjectTypesV4]) ? local[STORAGE.hiddenProjectTypesV4] : [];
  state.typeOrder = Array.isArray(local[STORAGE.projectTypeOrderV4]) ? local[STORAGE.projectTypeOrderV4] : [];
  if (!availableTypes().includes(state.projectType)) {
    state.projectType = availableTypes()[0] || PRESET_TYPES[0];
    await chrome.storage.local.set({ [STORAGE.projectType]: state.projectType });
  }
  $('analytics-toggle').checked = local[STORAGE.analyticsConsent]?.enabled === true;
  document.body.classList.toggle('needs-consent', !state.privacyAccepted); $('privacy-gate').hidden = state.privacyAccepted;
  builder = session[STORAGE.builderV3] || freshBuilder();
  builder.references = builder.references.slice(0, 3);
  if (!builder.references.length) builder.references.push(freshReference());
  builder.modules = normalizeIntentModules(builder.modules); builder.bindings ||= {};
  builder.principleText ??= PRINCIPLE;
  focusedReference = builder.references[0].id;
  $('prompt-name').value = builder.name;
  state.generated = session[STORAGE.generatedResultV3] || null;
  await persistBuilder(); populateTypes();
  await refreshCapture(); await renderReferences(); await loadLibrary(); renderGenerated();
  if (!builder.references.some(ref => ref.sourceReferenceId) && state.selection) await useCapture();
  switchStage(sessionStorage.getItem('archbuddy-active-stage') || 'analysis');
  sidepanelReady = true;
  const handoff = await chrome.storage.session.get([STORAGE.libraryHandoffV4, STORAGE.requestedStageV4]);
  if (handoff[STORAGE.libraryHandoffV4]) await handleLibraryHandoff(handoff[STORAGE.libraryHandoffV4]);
  if (handoff[STORAGE.requestedStageV4]) await handleRequestedStage(handoff[STORAGE.requestedStageV4]);
  await refreshBackend();
}
init().catch(error => feedback('builder-feedback', error.message, 'error'));

async function reloadTypes() {
  const local = await chrome.storage.local.get([STORAGE.projectType, STORAGE.customTypes, STORAGE.hiddenProjectTypesV4, STORAGE.projectTypeOrderV4]);
  state.customTypes = local[STORAGE.customTypes] || [];
  state.hiddenTypes = local[STORAGE.hiddenProjectTypesV4] || [];
  state.typeOrder = local[STORAGE.projectTypeOrderV4] || [];
  state.projectType = local[STORAGE.projectType] || availableTypes()[0];
  populateTypes();
}

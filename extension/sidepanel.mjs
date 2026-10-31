import { t, setText, setLocalizedAttribute, onLanguageChange, getLanguage, localizedError } from './i18n.mjs';
import { accountStorage, scopeChanges } from './account-storage.mjs';
import {
  STORAGE, PRINCIPLE, PRINCIPLE_TITLE, compileIntentPrompt, createEmptyIntentModules,
  normalizeIntentModules, normalizePromptScheme, normalizeWorkingDraft,
} from './shared.mjs';
import { putSourceImage, getSourceImage, deleteSourceImagesByScheme } from './source-image-store.mjs';
import { mountAccountUI, ensureAccount, pointsEnabled } from './account-ui.mjs';

// 仅绑定产品界面文案；用户名称、提示词与模型结果保持原文。
const UI_TEXT = {
  "正在连接": "Connecting…",
  "图词库": "Library",
  "提示词生成": "Build prompt",
  "提示词优化": "Refine prompt",
  "开始使用前确认": "Before you begin",
  "我同意图片与图库 AI 处理": "I agree to AI processing of images and library content",
  "新下载图片自动发送预览以生成视觉描述；语义检索发送查询与库内描述/提示词；分析和评估发送所选图片及相关提示词给 ArchBuddy 与 DeepSeek。我确认有权处理这些内容。": "Previews of new downloads are sent for visual descriptions. Semantic search sends your query and library descriptions or prompts. Analysis and evaluation send selected images and related prompts to ArchBuddy and DeepSeek. I confirm that I have permission to process this content.",
  "开启后，下载图片自动生成核心视觉描述，每张 0.1 积分；反推与效果分析每张 1 积分。可在详细说明中关闭自动描述。": "When enabled, visual descriptions cost 0.1 credit per image; reverse prompting and evaluation cost 1 credit per image. You can turn off automatic descriptions in Details.",
  "隐私说明": "Privacy",
  "确认": "Confirm",
  "清空参考图": "Clear references",
  "添加参考图二": "Add reference 2",
  "添加参考图三": "Add reference 3",
  "提示词名称": "Prompt name",
  "例如：山地酒店 · 暖色混凝土": "e.g. Mountain hotel · warm concrete",
  "整体 Prompt 预览": "Complete prompt",
  "正文可直接编辑；上方替换只更新对应段落。": "Edit the text directly. Replacing a dimension above updates only its section.",
  "整体确认": "Confirm prompt",
  "复制": "Copy",
  "详细说明": "Details",
  "在参考图的各维度中编辑，点击“加入”或“替换”汇入整体预览。已选内容继续编辑时，预览同步更新。整体确认后再复制。": "Edit each dimension of a reference and choose Add or Replace to include it in the full prompt. Further edits to selected dimensions update the preview. Confirm the complete prompt before copying.",
  "允许匿名功能统计（不包含图片和提示词）": "Allow anonymous usage statistics (excluding images and prompts)",
  "下载后自动描述与图库语义检索": "Automatic descriptions and semantic library search",
  "自动描述每张 0.1 积分（100 张共 10 积分）；向量建索引与检索不扣积分，均受每日调用上限保护。": "Automatic descriptions cost 0.1 credit per image (10 credits per 100 images). Indexing and search do not deduct credits; daily request limits still apply.",
  "前往 AI 生图网站": "Open an AI image generation website",
  "生成效果图": "Generated image",
  "粘贴、拖入或选择文件": "Paste, drop or choose a file",
  "放入已经生成的效果图": "Add your generated image",
  "选择文件": "Choose file",
  "选择已确认的基本提示词": "Choose a confirmed base prompt",
  "从最近确认的提示词库中选择": "Choose a recently confirmed prompt",
  "查看原文": "View original",
  "本次分析 1 张效果图，消耗 1 积分；失败释放。": "Evaluate one generated image for 1 credit. Failed requests release the reservation.",
  "点击后发送生成图与所选提示词给 ArchBuddy 与 DeepSeek 进行评估": "Send the generated image and selected prompt to ArchBuddy and DeepSeek for evaluation",
  "开始评估": "Evaluate",
  "评估与调整": "Evaluate and refine",
  "在原文中直接编辑": "Edit the original text directly",
  "确认提示词并入库": "Confirm and save prompt",
  "最近确认的提示词库": "Recent confirmed prompts",
  "符合": "Matches",
  "部分符合": "Partly matches",
  "明显偏差": "Clear mismatch",
  "无法判断": "Unclear",
  "操作失败，请重新加载扩展后再试": "The operation failed. Reload the extension and try again.",
  "预览已更新，整体确认后可以复制": "Preview updated. Confirm the complete prompt before copying.",
  "在参考图中点击“加入”，然后在这里编辑完整提示词。": "Choose Add on a reference dimension, then edit the complete prompt here.",
  "编辑这一段提示词": "Edit this prompt section",
  "移除": "Remove",
  "替换": "Replace",
  "加入": "Add",
  "反推提示词：每张 1 积分，失败释放。": "Reverse prompting costs 1 credit per image. Failed requests release the reservation.",
  "分析中…": "Analyzing…",
  "开始分析": "Analyze",
  "粘贴、拖入或选择参考图": "Paste, drop or choose a reference image",
  "更换图片": "Change image",
  "本次分析 1 张参考图，消耗 1 积分；失败释放。": "Analyze one reference image for 1 credit. Failed requests release the reservation.",
  "补充这一维度的提示词": "Add detail for this dimension",
  "参考图归属不一致": "This reference image belongs to a different project.",
  "图片无法读取，请重新选择": "The image could not be read. Choose it again.",
  "一次请选择一张图片": "Choose one image at a time.",
  "请选择 1 字节至 10 MB 的 PNG、JPEG 或 WebP 图片": "Choose a PNG, JPEG or WebP image between 1 byte and 10 MB.",
  "图片读取失败，请重新选择": "The image could not be loaded. Choose it again.",
  "图片已就绪，点击开始分析": "Image ready. Select Analyze to continue.",
  "分析完成，可编辑并加入需要的维度": "Analysis complete. Edit and add the dimensions you need.",
  "已确认并保存，现在可以复制": "Confirmed and saved. You can now copy the prompt.",
  "已复制完整提示词": "Complete prompt copied.",
  "自动复制未获允许，请按 Ctrl+C 复制已选中的文本": "Clipboard access was blocked. Press Ctrl+C to copy the selected text.",
  "清空当前参考图及编辑内容？已确认的提示词仍保留在库中。": "Clear the current references and edits? Confirmed prompts will remain in your library.",
  "请等待当前图片处理完成后再从图库打开": "Wait for image processing to finish before opening a library item.",
  "请先确认图片处理说明，然后重新点击生成完整提示词": "Accept the image processing notice, then choose Generate complete prompt again.",
  "当前已有三张参考图。重新构建这张图库图片的提示词？已确认方案仍保留。": "You already have three references. Start a new prompt for this library image? Confirmed prompts will be kept.",
  "切换到素材库中的方案？当前未确认的构建内容将被替换。": "Switch to this library prompt? Your current unconfirmed draft will be replaced.",
  "已从素材库载入方案；修改后请重新整体确认。": "Prompt loaded from the library. Confirm it again after editing.",
  "已从素材库选择方案。导入生成图后可开始评估。": "Library prompt selected. Add a generated image to begin evaluation.",
  "使用": "Use",
  "删除": "Delete",
  "整体确认一份提示词后，会出现在这里。": "Your confirmed prompts will appear here.",
  "当前修改尚未确认。切换基本提示词并丢弃这些修改吗？": "Your changes are not confirmed. Switch the base prompt and discard these edits?",
  "评估中…": "Evaluating…",
  "效果图已就绪，选择基本提示词后可开始评估": "Image ready. Choose a base prompt to begin evaluation.",
  "重新评估将以已确认的基本提示词为准，当前未确认修改会保留。继续吗？": "Evaluate against the confirmed base prompt again? Your unconfirmed edits will be preserved.",
  "正在对照生成图与基本提示词…": "Comparing the generated image with the base prompt…",
  "评估完成，可在下方直接修改提示词": "Evaluation complete. Edit the prompt below.",
  "修改后请确认，再复制": "Confirm your edits before copying.",
  "检查各维度的偏差，并在原文中直接调整。": "Review each dimension and edit the original prompt directly.",
  "上下文": "Context",
  "未发现明显偏差": "No clear mismatch found.",
  "此项用于表达整体意图，不单独评分。": "This section provides overall context and is not scored separately.",
  "解锁": "Unlock",
  "调整提示": "Refinement guidance",
  "启用维度的提示词不能为空，请补充后确认": "Enabled prompt dimensions cannot be empty. Fill them in before confirming.",
  "提示词和本次效果图已保存至词库，可查看版本历史和关联图片。": "The prompt and generated image are saved. You can view version history and linked images in the library.",
  "提示词已确认；当前没有新的效果图入库。": "Prompt confirmed. No new generated image was saved.",
  "本地账号服务未连接，请先启动本地服务。": "Local account service is offline. Start the local service first.",
  "本地演示：验证码和 AI 结果均为模拟，未发送短信。": "Local demo: verification codes and AI results are simulated. No SMS is sent.",
  "当前服务不是本地模拟模式，请启动账号积分演示服务。": "This service is not in local demo mode. Start the account and credits demo service.",
  "本地服务已连接": "Local service connected",
  "服务已连接": "Connected",
  "服务未连接": "Offline",
  "新下载图片会自动发送预览生成核心视觉描述，每张 0.1 积分（100 张共 10 积分）。反推和效果分析每张 1 积分；向量检索不扣积分。所有模型请求受每日调用上限保护。确认开启自动描述？": "New downloads will automatically send previews for visual descriptions at 0.1 credit per image (10 credits per 100 images). Reverse prompting and evaluation cost 1 credit per image; vector search is free. Daily model request limits apply. Enable automatic descriptions?",
  "新下载图片将自动发送预览生成描述；语义检索会发送查询与库内描述/提示词给 ArchBuddy 与 DeepSeek。确认开启？": "New downloads will automatically send previews for descriptions. Semantic search sends queries and library descriptions or prompts to ArchBuddy and DeepSeek. Enable this?",
  "整体生成准则": "Overall generation guidelines",
  "参考摘要": "Reference summary",
  "场景与主体": "Scene and subject",
  "空间与体量": "Space and massing",
  "立面与构件": "Facade and elements",
  "材料与表面": "Materials and surfaces",
  "景观与配景": "Landscape and context",
  "视角与构图": "View and composition",
  "色彩与明暗": "Color and tone",
  "光线与氛围": "Lighting and atmosphere",
  "图像表现": "Image expression",
  "负向约束": "Negative constraints",
  "{count} 个维度": "{count} dimensions",
  "参考图{number}": "Reference {number}",
  "正在分析，已等待 {seconds} 秒": "Analyzing · {seconds}s elapsed",
  "正在评估，已等待 {seconds} 秒": "Evaluating · {seconds}s elapsed",
  "已放入 {count} 张参考图，全部分析共 {count} 积分；每张单独点击开始。": "{count} reference images added. Analyzing all costs {count} credits; start each separately.",
  "删除已确认提示词“{name}”及其本地来源图？": "Delete the confirmed prompt “{name}” and its local source images?",
  "编辑内容保存失败：{error}": "Could not save your draft: {error}",
  "修改保存失败：{error}": "Could not save changes: {error}",
  "当前页面状态保存失败：{error}": "Could not save the current view: {error}"
};
const ui = (zh, params = {}) => ({ zh, en: UI_TEXT[zh] ?? zh, params });
const nowText = (zh, params = {}) => t(zh, UI_TEXT[zh] ?? zh, params);
function putText(element, value) {
  if (value && typeof value === 'object' && 'zh' in value) setText(element, value.zh, value.en, value.params);
  else setText(element, String(value ?? ''), String(value ?? ''));
}
function placeholder(element, zh) {
  setLocalizedAttribute(element, 'placeholder', zh, UI_TEXT[zh] ?? zh);
}
function errorText(message) {
  if (message && typeof message === 'object') return message;
  if (UI_TEXT[message]) return ui(message);
  const original = Object.keys(UI_TEXT).find(zh => UI_TEXT[zh] === message);
  return original ? ui(original) : message;
}
function errorUi(error) {
  const known = errorText(error?.zh || error?.message);
  const source = typeof known === 'object' ? { ...error, zh: known.zh, en: known.en } : error;
  const detail = localizedError(source, '操作失败，请重新加载扩展后再试', UI_TEXT['操作失败，请重新加载扩展后再试']);
  return { zh: detail.zh, en: detail.en, params: {} };
}

function errorWithPrefix(zh, en, error) {
  const detail = errorUi(error);
  return { zh: zh + detail.zh, en: en + detail.en, params: {} };
}

// 三参考图构建与效果图直接编辑共用已确认提示词库。
const $ = id => document.getElementById(id);
mountAccountUI(document.querySelector('.header-actions'));
if (pointsEnabled()) {
  for (const id of ['privacy-points-note', 'auto-description-points', 'evaluation-points-cost', 'analysis-points-total']) $(id).hidden = false;
}
// 重绘参考图时移动同一个按钮，保留已绑定的清空参考图操作。
const newBuilderControl = $('new-builder');
const state = {
  privacyAccepted: false, backendReady: false, stage: 'analysis', selection: null,
  schemes: [], scheme: null, working: null, generated: null, evaluation: null,
};
const labels = { compliant: ui('符合'), partial: ui('部分符合'), deviation: ui('明显偏差'), unknown: ui('无法判断') };
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
let captureHandoffBusy = false;
let captureRetry = null;
const imageUrls = new Map();

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) putText(element, text);
  return element;
}
function feedback(id, text = '', tone = '') {
  putText($(id), typeof text === 'string' ? errorText(text) : text);
  $(id).dataset.tone = tone;
}
async function request(type, payload = {}) {
  const response = await chrome.runtime.sendMessage({ type, payload });
  if (!response?.ok) throw localizedError(response, '操作失败，请重新加载扩展后再试', UI_TEXT['操作失败，请重新加载扩展后再试']);
  return response;
}
function action(element, fn, feedbackId = 'builder-feedback') {
  element.addEventListener('click', () => Promise.resolve().then(fn).catch(error => feedback(feedbackId, errorUi(error), 'error')));
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
  operation.catch(error => feedback('builder-feedback', errorWithPrefix('编辑内容保存失败：', 'Could not save your draft: ', error), 'error'));
  return operation;
}
function invalidateBuilder() {
  builder.confirmedPrompt = null;
  $('copy-fallback').hidden = true;
  feedback('copy-feedback', ui("预览已更新，整体确认后可以复制"));
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
    container.replaceChildren(node('p', 'prompt-placeholder', ui("在参考图中点击“加入”，然后在这里编辑完整提示词。")));
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
      placeholder(editor, '编辑这一段提示词');
      editor.addEventListener('input', () => editPromptSection(section.key, editor.value));
      element.append(node('h3', '', ui(section.title)), editor);
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
  putText($('prompt-count'), ui('{count} 个维度', { count }));
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
    putText(button, ui(chosen ? '移除' : current?.enabled && current.value ? '替换' : '加入'));
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
  putText(status, job ? ui('正在分析，已等待 {seconds} 秒', { seconds: Math.floor((Date.now() - job.startedAt) / 1000) }) : errorText(message?.text || ''));
  status.dataset.tone = job ? '' : message?.tone || '';
}
function refreshReferenceControls() {
  if (pointsEnabled()) {
    const count = builder.references.filter(ref => ref.sourceReferenceId).length;
    putText($('analysis-points-total'), count ? ui('已放入 {count} 张参考图，全部分析共 {count} 积分；每张单独点击开始。', { count }) : ui('反推提示词：每张 1 积分，失败释放。'));
  }
  for (const ref of builder.references) {
    const section = document.querySelector('[data-reference="' + ref.id + '"]');
    if (!section) continue;
    const busy = analysisJobs.has(ref.id);
    section.querySelector('.reference-choose').disabled = busy || editingImage || confirming;
    const analyze = section.querySelector('.reference-analyze');
    putText(analyze, ui(busy ? '分析中…' : '开始分析'));
    analyze.disabled = !ref.sourceReferenceId || busy || editingImage || confirming || !state.backendReady;
    section.querySelectorAll('.prompt-editor').forEach(editor => { editor.disabled = busy || confirming; });
    renderReferenceStatus(ref.id);
  }
  $('add-reference').hidden = builder.references.length >= 3;
  putText($('add-reference'), ui(builder.references.length === 1 ? '添加参考图二' : '添加参考图三'));
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
    heading.append(node('h2', '', ui('参考图{number}', { number: index + 1 })));
    if (index === 0) { newBuilderControl.hidden = false; heading.append(newBuilderControl); }
    section.append(heading);
    const preview = node('figure', 'preview is-empty');
    preview.tabIndex = 0;
    preview.addEventListener('focusin', () => { focusedReference = ref.id; });
    preview.addEventListener('pointerdown', () => { focusedReference = ref.id; });
    const image = node('img');
    image.dataset.referenceNumber = String(index + 1); image.alt = nowText('参考图{number}', { number: index + 1 });
    image.hidden = true;
    const caption = node('figcaption', '', ref.name || ui('粘贴、拖入或选择参考图'));
    const input = node('input');
    input.type = 'file'; input.accept = 'image/png,image/jpeg,image/webp'; input.hidden = true;
    const choose = button(ui(ref.sourceReferenceId ? '更换图片' : '选择文件'), () => input.click());
    choose.classList.add('reference-choose');
    input.addEventListener('change', () => {
      acceptReference([...input.files], ref.id).catch(error => feedback('builder-feedback', errorUi(error), 'error'));
      input.value = '';
    });
    wireDrop(preview, files => acceptReference(files, ref.id), 'builder-feedback');
    preview.append(image, caption, choose, input);
    section.append(preview);
    const analyze = button(ui("开始分析"), () => analyzeReference(ref.id), 'primary-button reference-analyze');
    if (pointsEnabled()) section.append(node('p', 'points-cost-note', ui("本次分析 1 张参考图，消耗 1 积分；失败释放。")));
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
        head.append(node('h3', '', ui(candidate.title)), choice);
        const text = node('textarea', 'prompt-editor');
        text.value = candidate.value;
        text.dataset.moduleKey = candidate.key;
        text.maxLength = 4000;
        placeholder(text, '补充这一维度的提示词');
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
        if (record.schemeId !== builder.builderId) throw new Error(nowText("参考图归属不一致"));
        const url = URL.createObjectURL(record.blob);
        imageUrls.set(ref.id, url); image.src = url; image.hidden = false; preview.classList.remove('is-empty');
      }).catch(() => { if (section.isConnected) putText(caption, ui('图片无法读取，请重新选择')); });
    }
  }
  refreshReferenceControls();
  requestAnimationFrame(() => document.querySelectorAll('#reference-list textarea').forEach(fit));
}
async function imageFile(files) {
  if (files.length !== 1) throw new Error(nowText("一次请选择一张图片"));
  const file = files[0];
  if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size < 1 || file.size > 10 * 1024 * 1024) {
    throw new Error(nowText("请选择 1 字节至 10 MB 的 PNG、JPEG 或 WebP 图片"));
  }
  return file;
}
function fileDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(nowText("图片读取失败，请重新选择")));
    reader.readAsDataURL(file);
  });
}
async function acceptReference(files, refId, webSelectionId = null) {
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
    if (webSelectionId) builder.lastWebSelectionId = webSelectionId;
    await persistBuilder();
    feedback('builder-feedback', ui("图片已就绪，点击开始分析"));
    return true;
  } finally { editingImage = false; await renderReferences(refId); }
}
async function analyzeReference(refId) {
  if (analysisJobs.has(refId) || confirming || editingImage) return;
  const ref = builder.references.find(item => item.id === refId);
  if (!ref?.sourceReferenceId) return;
  if (!(await ensureAccount())) return;
  if (analysisJobs.has(refId) || confirming || editingImage) return;
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
    referenceMessages.set(refId, { text: errorUi(error), tone: 'error' });
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
    feedback('copy-feedback', ui("已确认并保存，现在可以复制"), 'success');
  } finally { confirming = false; await renderReferences(); }
}
async function copy(text, fallbackId, feedbackId) {
  try {
    await navigator.clipboard.writeText(text);
    $(fallbackId).hidden = true;
    feedback(feedbackId, ui("已复制完整提示词"), 'success');
  } catch {
    $(fallbackId).value = text; $(fallbackId).hidden = false; $(fallbackId).select();
    feedback(feedbackId, ui("自动复制未获允许，请按 Ctrl+C 复制已选中的文本"));
  }
}
async function newBuilder() {
  if (analysisJobs.size || editingImage || confirming) return;
  if (!confirm(nowText("清空当前参考图及编辑内容？已确认的提示词仍保留在库中。"))) return;
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
      if (analysisJobs.size || editingImage || confirming) throw new Error(nowText("请等待当前图片处理完成后再从图库打开"));
      if (!state.privacyAccepted) throw new Error(nowText("请先确认图片处理说明，然后重新点击生成完整提示词"));
      let ref = builder.references.find(item => !item.sourceReferenceId);
      if (!ref && builder.references.length < 3) { ref = freshReference(); builder.references.push(ref); }
      if (!ref) {
        if (!confirm(nowText("当前已有三张参考图。重新构建这张图库图片的提示词？已确认方案仍保留。"))) return;
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
          && !confirm(nowText("切换到素材库中的方案？当前未确认的构建内容将被替换。"))) return;
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
      feedback('builder-feedback', ui("已从素材库载入方案；修改后请重新整体确认。"), 'success');
    } else {
      switchStage('optimize');
      await openScheme(handoff.schemeId);
      feedback('evaluation-feedback', ui("已从素材库选择方案。导入生成图后可开始评估。"), 'success');
    }
  } catch (error) {
    feedback('builder-feedback', errorUi(error), 'error');
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
  const emptyOption = new Option('', ''); putText(emptyOption, ui('从最近确认的提示词库中选择')); select.replaceChildren(emptyOption);
  for (const scheme of state.schemes.slice(0, 5)) {
    select.add(new Option(scheme.name, scheme.schemeId));
    const row = node('div', 'draft-item');
    const info = node('div');
    info.append(node('strong', '', scheme.name), dateNode(scheme.updatedAt));
    const actions = node('div', 'library-actions');
    actions.append(button(ui("使用"), async () => { switchStage('optimize'); await openScheme(scheme.schemeId); }),
      button(ui("删除"), async () => {
        if (!confirm(nowText('删除已确认提示词“{name}”及其本地来源图？', { name: scheme.name }))) return;
        await request('scheme.delete', { schemeId: scheme.schemeId, confirmed: true });
        if (state.scheme?.schemeId === scheme.schemeId) { state.scheme = null; state.working = null; state.evaluation = null; renderEvaluation(); }
        if (builder.builderId === scheme.schemeId) { builder.versionId = null; invalidateBuilder(); await persistBuilder(); renderPrompt(); }
        await loadLibrary();
      }));
    row.append(info, actions); $('library-list').append(row);
  }
  if (!state.schemes.length) $('library-list').append(node('p', 'section-note', ui("整体确认一份提示词后，会出现在这里。")));
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
      && !confirm(nowText("当前修改尚未确认。切换基本提示词并丢弃这些修改吗？"))) {
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
  putText($('generated-caption'), generated?.displayName || ui('放入已经生成的效果图'));
  renderEvaluationControls();
}
function renderEvaluationControls() {
  $('run-evaluation').disabled = evaluating || !state.generated || !state.scheme?.currentVersionId || !state.backendReady;
  putText($('run-evaluation'), ui(evaluating ? '评估中…' : '开始评估'));
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
  feedback('evaluation-feedback', ui("效果图已就绪，选择基本提示词后可开始评估"));
  renderGenerated(); renderEvaluation();
}
async function evaluate() {
  if (evaluating || !state.scheme || !state.generated) return;
  if (!(await ensureAccount()) || evaluating) return;
  if (state.working?.dirtyModuleKeys?.length && !confirm(nowText("重新评估将以已确认的基本提示词为准，当前未确认修改会保留。继续吗？"))) return;
  evaluating = true; renderEvaluationControls();
  let seconds = 0;
  feedback('evaluation-feedback', ui("正在对照生成图与基本提示词…"));
  const ticker = setInterval(() => feedback('evaluation-feedback', ui('正在评估，已等待 {seconds} 秒', { seconds: ++seconds })), 1000);
  try {
    const result = await request('evaluation.run', {
      schemeId: state.scheme.schemeId, versionId: state.scheme.currentVersionId,
      generatedResultId: state.generated.generatedResultId, consentConfirmed: true,
    });
    state.evaluation = result.evaluationSession;
    state.working = (await request('scheme.working.get', { schemeId: state.scheme.schemeId })).workingDraft;
    confirmedRevision = null;
    feedback('evaluation-feedback', ui("评估完成，可在下方直接修改提示词"), 'success');
    renderEvaluation();
  } finally { clearInterval(ticker); evaluating = false; renderEvaluationControls(); }
}
function persistWorking() {
  state.working = normalizeWorkingDraft(state.working, state.scheme);
  const snapshot = structuredClone(state.working);
  const operation = workingQueue.catch(() => {}).then(() => chrome.storage.session.set({ [STORAGE.workingDraftV3]: snapshot }));
  workingQueue = operation;
  operation.catch(error => feedback('revision-feedback', errorWithPrefix('修改保存失败：', 'Could not save changes: ', error), 'error'));
  return operation;
}
function revisionChanged() {
  confirmedRevision = null;
  $('copy-revision').disabled = true;
  $('confirm-revision').disabled = confirming;
  feedback('revision-feedback', ui("修改后请确认，再复制"));
  void persistWorking();
}
function renderEvaluation() {
  renderEvaluationControls();
  const result = state.evaluation?.status === 'succeeded' ? state.evaluation.result : null;
  $('evaluation-report').hidden = !result || !state.scheme;
  $('finding-list').replaceChildren();
  if (!result || !state.working) return;
  putText($('overall-conclusion'), result.overallConclusion || ui('检查各维度的偏差，并在原文中直接调整。'));
  const findings = new Map(result.findings.map(finding => [finding.key, finding]));
  for (const module of state.working.modules.filter(item => item.enabled && item.value)) {
    const finding = findings.get(module.key);
    const card = node('article', 'finding-card');
    card.dataset.status = finding?.status || 'unknown';
    const head = node('div', 'section-title');
    head.append(node('h3', '', ui(module.title)), node('span', 'finding-status', finding ? labels[finding.status] : ui('上下文')));
    const notice = node('p', 'deviation-note', finding
      ? finding.gap || (finding.status === 'compliant' ? ui('未发现明显偏差') : finding.observation)
      : ui('此项用于表达整体意图，不单独评分。'));
    const text = node('textarea', 'prompt-editor');
    text.value = module.value; text.maxLength = 4000; text.disabled = module.locked;
    text.addEventListener('input', () => {
      const current = state.working.modules.find(item => item.key === module.key);
      current.value = text.value; current.source = 'user'; current.reviewState = 'modified';
      fit(text); revisionChanged();
    });
    card.append(head, notice, text);
    if (module.locked) {
      card.append(button(ui("解锁"), () => {
        state.working.modules.find(item => item.key === module.key).locked = false;
        text.disabled = false; revisionChanged();
        renderEvaluation();
      }, 'text-button', 'revision-feedback'));
    }
    if (finding?.suggestion || finding?.reliabilityNote) {
      const detail = node('details', 'finding-detail');
      detail.append(node('summary', '', ui("调整提示")), node('p', '', [finding.suggestion, finding.reliabilityNote].filter(Boolean).join('\n')));
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
  if (modules.some(item => item.enabled && !item.value)) throw new Error(nowText("启用维度的提示词不能为空，请补充后确认"));
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
    ? ui('提示词和本次效果图已保存至词库，可查看版本历史和关联图片。')
    : ui('提示词已确认；当前没有新的效果图入库。'), 'success');
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
    accept([...event.dataTransfer.files]).catch(error => feedback(feedbackId, errorUi(error), 'error'));
  });
}
function switchStage(stage) {
  if (!state.privacyAccepted || !['analysis', 'optimize'].includes(stage)) stage = 'analysis';
  state.stage = stage;
  sessionStorage.setItem('archbuddy-active-stage', stage);
  // 原生侧栏关闭会销毁页面；扩展会话保留当前任务，供下次打开恢复。
  void chrome.storage.session.set({ [STORAGE.activeStageV4]: stage })
    .catch(error => feedback(stage === 'optimize' ? 'evaluation-feedback' : 'builder-feedback', errorWithPrefix('当前页面状态保存失败：', 'Could not save the current view: ', error), 'error'));
  for (const name of ['analysis','optimize']) $(name + '-panel').hidden = stage !== name;
  document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('is-active', tab.dataset.tab === stage));
  requestAnimationFrame(() => document.querySelectorAll('.panel:not([hidden]) textarea.prompt-editor').forEach(fit));
  requestAnimationFrame(() => document.querySelectorAll('#prompt-preview textarea').forEach(fitPromptSection));
  if (stage === 'optimize') loadLibrary().catch(error => feedback('evaluation-feedback', errorUi(error), 'error'));
}
async function refreshBackend() {
  const status = await request('backend.status');
  $('local-demo-notice').hidden = !pointsEnabled();
  if (pointsEnabled()) putText($('local-demo-notice'), ui(!status.online || !status.configured
    ? '本地账号服务未连接，请先启动本地服务。' : status.mockAI
    ? '本地演示：验证码和 AI 结果均为模拟，未发送短信。'
    : '当前服务不是本地模拟模式，请启动账号积分演示服务。'));
  state.backendReady = Boolean(status.configured && status.online);
  putText($('session-status'), ui(state.backendReady ? (status.mode === 'local' ? '本地服务已连接' : '服务已连接') : '服务未连接'));
  $('session-status').dataset.state = state.backendReady ? 'online' : 'offline';
  await renderReferences(); renderEvaluationControls();
}
async function refreshCapture() {
  const session = await chrome.storage.session.get(STORAGE.selection);
  state.selection = session[STORAGE.selection];
}

async function useCapture() {
  const selection = state.selection;
  if (!selection || !builder || !state.privacyAccepted || captureHandoffBusy
      || builder.lastWebSelectionId === selection.selectionId) return;
  const refId = focusedReference || builder.references[0].id;
  if (editingImage || confirming || analysisJobs.has(refId)) {
    clearTimeout(captureRetry);
    captureRetry = setTimeout(() => {
      refreshCapture().then(useCapture).catch(error => feedback('builder-feedback', errorUi(error), 'error'));
    }, 300);
    return;
  }
  captureHandoffBusy = true;
  try {
    if (selection.pendingCapture) switchStage('analysis');
    const blob = await (await fetch(selection.imagePayload)).blob();
    await acceptReference([new File([blob], selection.displayName || '网页参考图', { type: blob.type })], refId, selection.selectionId);
  } finally {
    captureHandoffBusy = false;
    // 如果期间又点了另一张图片，继续交接最新一张；从不自动发起模型调用。
    if (state.selection?.selectionId !== selection.selectionId) {
      void useCapture().catch(error => feedback('builder-feedback', errorUi(error), 'error'));
    }
  }
}

document.querySelectorAll('.tab[data-tab]').forEach(tab => {
  if (tab.dataset.tab !== 'library') action(tab, () => switchStage(tab.dataset.tab));
});
$('privacy-check').addEventListener('change', () => { $('privacy-accept').disabled = !$('privacy-check').checked; });
action($('privacy-accept'), async () => {
  if (!(await ensureAccount())) return;
  await request('assets.consent', { enabled: true }); $('asset-ai-toggle').checked = true; state.privacyAccepted = true;
  document.body.classList.remove('needs-consent'); $('privacy-gate').hidden = true; await refreshBackend();
  if (state.selection?.pendingCapture || (!builder.references.some(ref => ref.sourceReferenceId) && state.selection)) await useCapture();
});
action($('asset-ai-toggle'), async () => {
  const enabled = $('asset-ai-toggle').checked;
  if (enabled && !(await ensureAccount())) { $('asset-ai-toggle').checked = false; return; }
  const consentText = pointsEnabled()
    ? '新下载图片会自动发送预览生成核心视觉描述，每张 0.1 积分（100 张共 10 积分）。反推和效果分析每张 1 积分；向量检索不扣积分。所有模型请求受每日调用上限保护。确认开启自动描述？'
    : '新下载图片将自动发送预览生成描述；语义检索会发送查询与库内描述/提示词给 ArchBuddy 与 DeepSeek。确认开启？';
  if (enabled && !confirm(nowText(consentText))) { $('asset-ai-toggle').checked = false; return; }
  await request('assets.consent', { enabled });
});
action($('add-reference'), async () => {
  if (builder.references.length >= 3 || confirming || editingImage) return;
  const ref = freshReference(); builder.references.push(ref); focusedReference = ref.id;
  await persistBuilder(); await renderReferences();
  document.querySelector('[data-reference="' + ref.id + '"]').scrollIntoView({ block: 'start', behavior: 'smooth' });
});
action($('new-builder'), newBuilder);
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
$('scheme-select').addEventListener('change', () => openScheme($('scheme-select').value).catch(error => feedback('evaluation-feedback', errorUi(error), 'error')));
action($('generated-choose'), () => $('generated-file').click(), 'evaluation-feedback');
$('generated-file').addEventListener('change', () => {
  acceptGenerated([...$('generated-file').files]).catch(error => feedback('evaluation-feedback', errorUi(error), 'error')); $('generated-file').value = '';
});
wireDrop($('generated-preview'), acceptGenerated, 'evaluation-feedback');
action($('run-evaluation'), evaluate, 'evaluation-feedback');
action($('confirm-revision'), confirmRevision, 'revision-feedback');
action($('copy-revision'), () => confirmedRevision && copy(confirmedRevision, 'revision-copy-fallback', 'revision-feedback'), 'revision-feedback');
$('analytics-toggle').addEventListener('change', () => request('analytics.consent.set', { enabled: $('analytics-toggle').checked }).catch(error => feedback('builder-feedback', errorUi(error), 'error')));
document.addEventListener('paste', event => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || !state.privacyAccepted) return;
  const files = [...event.clipboardData.files];
  if (!files.some(file => file.type.startsWith('image/'))) return;
  event.preventDefault();
  const operation = state.stage === 'optimize' ? acceptGenerated(files)
    : acceptReference(files, focusedReference || builder.references[0].id);
  operation.catch(error => feedback(state.stage === 'optimize' ? 'evaluation-feedback' : 'builder-feedback', errorUi(error), 'error'));
});
chrome.runtime.onMessage.addListener(message => {
  if (message?.type === 'selection.changed' || message?.type === 'download.changed') {
    refreshCapture().then(() => {
      if (sidepanelReady && message.type === 'selection.changed') return useCapture();
    }).catch(error => feedback('builder-feedback', errorUi(error), 'error'));
  }
});
chrome.storage.onChanged.addListener(async (changes, area) => {
  changes = await scopeChanges(changes, area);
  if (area === 'local' && changes[STORAGE.assetAIConsent]) $('asset-ai-toggle').checked = changes[STORAGE.assetAIConsent].newValue === true;
  if (area === 'local' && changes[STORAGE.privacyAccepted]?.newValue) {
    state.privacyAccepted = true; document.body.classList.remove('needs-consent'); $('privacy-gate').hidden = true;
  }
  if (sidepanelReady && area === 'session' && changes[STORAGE.requestedStageV4]?.newValue) {
    void handleRequestedStage(changes[STORAGE.requestedStageV4].newValue);
  }
  if (sidepanelReady && area === 'session' && changes[STORAGE.libraryHandoffV4]?.newValue) {
    void handleLibraryHandoff(changes[STORAGE.libraryHandoffV4].newValue);
  }
});
async function handleRequestedStage(stage) {
  if (!['analysis', 'optimize', 'download'].includes(stage)) return;
  // 旧版下载页状态恢复到提示词生成；图词库入口直接打开全页。
  if (stage === 'download') stage = 'analysis';
  switchStage(stage);
  await chrome.storage.session.remove(STORAGE.requestedStageV4);
}
window.addEventListener('beforeunload', releaseImageUrls);
async function init() {
  const [local, session] = await Promise.all([
    accountStorage.get([STORAGE.assetAIConsent, STORAGE.privacyAccepted, STORAGE.analyticsConsent]),
    chrome.storage.session.get([STORAGE.builderV3, STORAGE.generatedResultV3, STORAGE.activeStageV4]),
  ]);
  state.privacyAccepted = Boolean(local[STORAGE.privacyAccepted]);
  $('asset-ai-toggle').checked = local[STORAGE.assetAIConsent] === true;
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
  await persistBuilder();
  await refreshCapture(); await renderReferences(); await loadLibrary(); renderGenerated();
  switchStage(session[STORAGE.activeStageV4] || sessionStorage.getItem('archbuddy-active-stage') || 'analysis');
  sidepanelReady = true;
  await refreshCapture();
  if (state.selection?.pendingCapture || (!builder.references.some(ref => ref.sourceReferenceId) && state.selection)) await useCapture();
  const handoff = await chrome.storage.session.get([STORAGE.libraryHandoffV4, STORAGE.requestedStageV4]);
  if (handoff[STORAGE.libraryHandoffV4]) await handleLibraryHandoff(handoff[STORAGE.libraryHandoffV4]);
  if (handoff[STORAGE.requestedStageV4]) await handleRequestedStage(handoff[STORAGE.requestedStageV4]);
  await refreshBackend();
}
init().catch(error => feedback('builder-feedback', errorUi(error), 'error'));

function dateNode(value) {
  const element = node('p', 'section-note'); element.dataset.uiDate = value;
  element.textContent = new Date(value).toLocaleString(getLanguage() === 'en' ? 'en-US' : 'zh-CN');
  return element;
}
onLanguageChange(() => {
  // 只更新标签与测量，不重新创建编辑器、切换标签或触碰用户输入。
  document.querySelectorAll('[data-reference-number]').forEach(image => { image.alt = nowText('参考图{number}', { number: image.dataset.referenceNumber }); });
  document.querySelectorAll('[data-ui-date]').forEach(element => { element.textContent = new Date(element.dataset.uiDate).toLocaleString(getLanguage() === 'en' ? 'en-US' : 'zh-CN'); });
  requestAnimationFrame(() => { document.querySelectorAll('textarea.prompt-editor').forEach(fit); document.querySelectorAll('#prompt-preview textarea').forEach(fitPromptSection); });
});

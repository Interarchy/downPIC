import { createHoverIntent } from './hover-intent.mjs';
import {
  createPrototypeState,
  acknowledgeCopyright,
  createCustomTypeAndSave,
  hasSavedInProject,
  hasStagedInProject,
  saveImageToProject,
  setDesktopConnected,
  setCaptureEnabled,
  setCustomDefaultProjectType,
  setDefaultProjectType,
  stageImageToProject,
} from './state.mjs';
import {
  applyCustomInput,
  applyPresetSelection,
  createTypeSelection,
  resolveTypeSelection,
} from './project-type.mjs';
import { createToolbar, renderPopup } from './render.mjs';
import { getCaptureOutcome, resolveCaptureScenario } from './capture-outcome.mjs';

let state = createPrototypeState();
const captureScenario = resolveCaptureScenario(window.location.search);
if (captureScenario === 'offline' || captureScenario === 'staging-error') {
  state = setDesktopConnected(state, false);
}
let popupSelection = createTypeSelection(state.defaultProjectType);
let popupError = '';
let activeToolbar = null;
let activeImageId = null;
let toolbarSelection = createTypeSelection(state.defaultProjectType);
let toolbarStatus = 'ready';
let toolbarFeedback = '';
let toolbarError = '';

const extensionButton = document.querySelector('#extension-button');
const extensionPopup = document.querySelector('#extension-popup');
const extensionActiveMark = document.querySelector('#extension-active-mark');
const liveRegion = document.querySelector('#live-region');
const captureTargets = [...document.querySelectorAll('.capture-target')];
const copyrightDialog = document.querySelector('#copyright-dialog');
const copyrightCheckbox = document.querySelector('#copyright-checkbox');
const acceptCopyright = document.querySelector('#accept-copyright');
const cancelCopyright = document.querySelector('#cancel-copyright');

const announce = (message) => {
  liveRegion.textContent = '';
  requestAnimationFrame(() => {
    liveRegion.textContent = message;
  });
};

const hoverIntent = createHoverIntent({
  schedule: (callback, delay) => window.setTimeout(callback, delay),
  cancel: (timer) => window.clearTimeout(timer),
  onShow: (imageId) => showToolbar(imageId),
  onHide: () => removeToolbar(),
});

function syncCaptureIndicator() {
  extensionActiveMark.hidden = !state.captureEnabled;
  document.body.classList.toggle('capture-enabled', state.captureEnabled);
}

function openCopyrightDialog() {
  closePopup();
  copyrightCheckbox.checked = false;
  acceptCopyright.disabled = true;
  copyrightDialog.hidden = false;
  copyrightCheckbox.focus();
}

function closeCopyrightDialog() {
  copyrightDialog.hidden = true;
}

function statusForProject(imageId, projectType) {
  if (hasStagedInProject(state, imageId, projectType)) return 'staged';
  if (hasSavedInProject(state, imageId, projectType)) return 'duplicate';
  return 'ready';
}

function updatePopupFormState() {
  const preset = extensionPopup.querySelector('#popup-preset-control');
  const custom = extensionPopup.querySelector('#popup-custom-control');
  const apply = extensionPopup.querySelector('#apply-default');
  const error = extensionPopup.querySelector('#popup-type-error');
  const resolved = resolveTypeSelection(popupSelection);

  preset.value = popupSelection.presetValue;
  custom.value = popupSelection.customValue;
  custom.setAttribute('aria-invalid', String(Boolean(popupError)));
  apply.disabled = !resolved.valid;
  error.textContent = popupError;
  error.hidden = !popupError;
}

function wirePopup() {
  const toggle = extensionPopup.querySelector('#capture-toggle');
  const preset = extensionPopup.querySelector('#popup-preset-control');
  const custom = extensionPopup.querySelector('#popup-custom-control');
  const apply = extensionPopup.querySelector('#apply-default');
  const desktopButton = extensionPopup.querySelector('#open-desktop');

  toggle.addEventListener('change', () => {
    if (toggle.checked && !state.copyrightAcknowledged) {
      openCopyrightDialog();
      announce('请先确认图片使用边界');
      return;
    }
    state = setCaptureEnabled(state, toggle.checked);
    syncCaptureIndicator();
    if (!state.captureEnabled) {
      hoverIntent.reset();
      removeToolbar();
    }
    renderPopup(extensionPopup, state, {
      selection: popupSelection,
      error: popupError,
    });
    wirePopup();
    announce(state.captureEnabled ? '图片保存功能已开启' : '图片保存功能已关闭');
  });

  preset.addEventListener('change', () => {
    popupSelection = applyPresetSelection(popupSelection, preset.value);
    popupError = '';
    updatePopupFormState();
  });

  custom.addEventListener('input', () => {
    popupSelection = applyCustomInput(popupSelection, custom.value);
    const resolved = resolveTypeSelection(popupSelection);
    popupError = custom.value.length > 0 && !resolved.valid ? resolved.error : '';
    updatePopupFormState();
  });

  custom.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !apply.disabled) apply.click();
  });

  apply.addEventListener('click', () => {
    const resolved = resolveTypeSelection(popupSelection);
    if (!resolved.valid) {
      popupError = resolved.error;
      updatePopupFormState();
      return;
    }

    const result = resolved.source === 'custom'
      ? setCustomDefaultProjectType(state, resolved.value)
      : setDefaultProjectType(state, resolved.value);
    state = result.state;
    popupSelection = createTypeSelection(state.defaultProjectType);
    popupError = '';
    toolbarSelection = createTypeSelection(state.defaultProjectType);
    if (activeImageId) {
      toolbarStatus = statusForProject(activeImageId, state.defaultProjectType);
      toolbarFeedback = '';
      toolbarError = '';
    }
    updatePopup();
    refreshActiveToolbar();
    announce(`默认项目类型已设为${state.defaultProjectType}`);
  });

  desktopButton.addEventListener('click', () => {
    announce('正在打开桌面应用原型');
    window.open('http://127.0.0.1:4174/desktop-prototype/', '_blank', 'noopener,noreferrer');
  });
}

function updatePopup() {
  renderPopup(extensionPopup, state, { selection: popupSelection, error: popupError });
  wirePopup();
}

function openPopup() {
  extensionPopup.hidden = false;
  extensionButton.setAttribute('aria-expanded', 'true');
  popupSelection = createTypeSelection(state.defaultProjectType);
  popupError = '';
  updatePopup();
}

function closePopup() {
  extensionPopup.hidden = true;
  extensionButton.setAttribute('aria-expanded', 'false');
  popupSelection = createTypeSelection(state.defaultProjectType);
  popupError = '';
}

function removeToolbar() {
  activeToolbar?.remove();
  activeToolbar = null;
  activeImageId = null;
  toolbarSelection = createTypeSelection(state.defaultProjectType);
  toolbarStatus = 'ready';
  toolbarFeedback = '';
  toolbarError = '';
}

function refreshActiveToolbar() {
  if (!activeImageId || !state.captureEnabled) return;
  showToolbar(activeImageId, true);
}

function showToolbar(imageId, preserveState = false) {
  if (!state.captureEnabled) return;
  const target = document.querySelector(`[data-image-id="${CSS.escape(imageId)}"]`);
  if (!target) return;

  activeToolbar?.remove();
  activeImageId = imageId;
  if (!preserveState) {
    toolbarSelection = createTypeSelection(state.defaultProjectType);
    toolbarError = '';
    toolbarFeedback = '';
    toolbarStatus = statusForProject(imageId, state.defaultProjectType);
    if (toolbarStatus === 'staged') toolbarFeedback = '已暂存，打开桌面端后自动整理';
  }

  activeToolbar = createToolbar(state, imageId, {
    selection: toolbarSelection,
    status: toolbarStatus,
    feedback: toolbarFeedback,
    error: toolbarError,
  });
  target.append(activeToolbar);
  wireToolbar(activeToolbar, imageId);
}

function updateToolbarFormState(toolbar, imageId) {
  const preset = toolbar.querySelector('.toolbar-project-select');
  const custom = toolbar.querySelector('.toolbar-custom-input');
  const saveButton = toolbar.querySelector('.save-button');
  const feedback = toolbar.querySelector('.toolbar-feedback');
  const resolved = resolveTypeSelection(toolbarSelection);
  const staged = resolved.valid && hasStagedInProject(state, imageId, resolved.value);
  const duplicate = resolved.valid && hasSavedInProject(state, imageId, resolved.value);

  preset.value = toolbarSelection.presetValue;
  custom.value = toolbarSelection.customValue;
  toolbarError = custom.value.length > 0 && !resolved.valid ? resolved.error : '';
  custom.setAttribute('aria-invalid', String(Boolean(toolbarError)));
  saveButton.disabled = !resolved.valid || duplicate;
  saveButton.textContent = staged ? '已暂存' : duplicate ? '已保存' : 'Save';
  toolbarStatus = staged ? 'staged' : duplicate ? 'duplicate' : 'ready';
  toolbarFeedback = staged ? '已暂存，打开桌面端后自动整理' : duplicate ? '当前项目已保存' : '';
  feedback.textContent = toolbarError || toolbarFeedback;
  feedback.dataset.tone = toolbarError ? 'error' : 'normal';
  feedback.hidden = !(toolbarError || toolbarFeedback);
}

function wireToolbar(toolbar, imageId) {
  toolbar.addEventListener('pointerenter', () => hoverIntent.enterToolbar());
  toolbar.addEventListener('pointerleave', () => hoverIntent.leaveToolbar());

  const preset = toolbar.querySelector('.toolbar-project-select');
  const custom = toolbar.querySelector('.toolbar-custom-input');
  const saveButton = toolbar.querySelector('.save-button');

  preset.addEventListener('change', () => {
    toolbarSelection = applyPresetSelection(toolbarSelection, preset.value);
    toolbarError = '';
    toolbarFeedback = '';
    updateToolbarFormState(toolbar, imageId);
  });

  custom.addEventListener('input', () => {
    toolbarSelection = applyCustomInput(toolbarSelection, custom.value);
    updateToolbarFormState(toolbar, imageId);
  });

  custom.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !saveButton.disabled) saveButton.click();
  });

  saveButton.addEventListener('click', () => {
    const resolved = resolveTypeSelection(toolbarSelection);
    if (!resolved.valid) {
      toolbarError = resolved.error;
      updateToolbarFormState(toolbar, imageId);
      return;
    }
    beginCaptureFeedback(imageId, resolved);
  });
}

function beginCaptureFeedback(imageId, selectedType) {
  hoverIntent.lock();
  toolbarStatus = 'saving';
  toolbarFeedback = `正在保存到${selectedType.value}…`;
  toolbarError = '';
  showToolbar(imageId, true);

  window.setTimeout(() => {
    const outcome = getCaptureOutcome(captureScenario, selectedType.value);
    let result = { state, status: outcome.status };

    if (outcome.status === 'saved') {
      result = selectedType.source === 'custom'
        ? createCustomTypeAndSave(state, selectedType.value, imageId)
        : saveImageToProject(state, imageId, selectedType.value);
    } else if (outcome.status === 'staged') {
      const selected = selectedType.source === 'custom'
        ? setCustomDefaultProjectType(state, selectedType.value)
        : setDefaultProjectType(state, selectedType.value);
      result = selected.error
        ? { state, status: 'invalid' }
        : stageImageToProject(selected.state, imageId, selectedType.value);
    }

    state = result.state;
    toolbarSelection = createTypeSelection(state.defaultProjectType);
    popupSelection = createTypeSelection(state.defaultProjectType);
    toolbarStatus = result.status === 'duplicate' ? statusForProject(imageId, selectedType.value) : outcome.status;
    toolbarFeedback = result.status === 'duplicate'
      ? toolbarStatus === 'staged' ? '已暂存，打开桌面端后自动整理' : '当前项目已保存'
      : outcome.feedback;
    updatePopup();
    showToolbar(imageId, true);
    announce(result.status === 'duplicate' ? toolbarFeedback : outcome.announce);

    if (outcome.status === 'saved' || outcome.status === 'staged') {
      window.setTimeout(() => {
        toolbarStatus = statusForProject(imageId, selectedType.value);
        toolbarFeedback = toolbarStatus === 'staged'
          ? '已暂存，打开桌面端后自动整理'
          : '当前项目已保存';
        if (activeImageId === imageId) showToolbar(imageId, true);
        hoverIntent.unlock();
      }, 900);
    } else {
      hoverIntent.unlock();
    }
  }, 520);
}

copyrightCheckbox.addEventListener('change', () => {
  acceptCopyright.disabled = !copyrightCheckbox.checked;
});

acceptCopyright.addEventListener('click', () => {
  state = acknowledgeCopyright(state);
  state = setCaptureEnabled(state, true);
  closeCopyrightDialog();
  syncCaptureIndicator();
  announce('已确认使用边界，图片保存功能已开启');
});

cancelCopyright.addEventListener('click', () => {
  closeCopyrightDialog();
  announce('图片保存功能仍为关闭状态');
});

extensionButton.addEventListener('click', (event) => {
  event.stopPropagation();
  extensionPopup.hidden ? openPopup() : closePopup();
});

extensionPopup.addEventListener('click', (event) => event.stopPropagation());
document.addEventListener('click', () => {
  if (!extensionPopup.hidden) closePopup();
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (!extensionPopup.hidden) closePopup();
  hoverIntent.reset();
});

for (const target of captureTargets) {
  const imageId = target.dataset.imageId;
  target.addEventListener('pointerenter', () => {
    if (state.captureEnabled) hoverIntent.enterImage(imageId);
  });
  target.addEventListener('pointerleave', () => {
    if (state.captureEnabled) hoverIntent.leaveImage(imageId);
  });
}

syncCaptureIndicator();

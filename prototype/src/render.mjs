import { resolveTypeSelection } from './project-type.mjs';
import { isRetryableCaptureStatus } from './capture-outcome.mjs';

export const PRESET_PROJECT_TYPES = ['文化建筑', '教育建筑', '办公建筑', '社区建筑'];

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function optionMarkup(type, selectedValue) {
  return `<option value="${escapeHtml(type)}" ${type === selectedValue ? 'selected' : ''}>${escapeHtml(type)}</option>`;
}

function projectTypeOptions(state, selectedValue) {
  const presets = PRESET_PROJECT_TYPES
    .map((type) => optionMarkup(type, selectedValue))
    .join('');
  const personal = state.customProjectTypes.length
    ? `<optgroup label="我的类型">${state.customProjectTypes.map((type) => optionMarkup(type, selectedValue)).join('')}</optgroup>`
    : '';
  return `<option value="" ${selectedValue ? '' : 'selected'}>预设类型</option><optgroup label="预设类型">${presets}</optgroup>${personal}`;
}

export function renderPopup(container, state, { selection, error = '' }) {
  const resolved = resolveTypeSelection(selection);
  const connectionLabel = state.desktopConnected ? '桌面端已连接' : '桌面端未运行 · 可暂存';
  container.innerHTML = `
    <div class="popup-title-row">
      <h2 class="popup-heading">图片保存插件</h2>
      <p class="popup-status" data-connected="${state.desktopConnected}"><span class="status-dot"></span>${connectionLabel}</p>
    </div>
    <div class="popup-divider"></div>
    <div class="capture-switch-row">
      <span>${state.captureEnabled ? '图片保存功能已开启' : '开启图片保存功能'}</span>
      <label class="switch">
        <span class="sr-only">${state.captureEnabled ? '关闭图片保存功能' : '开启图片保存功能'}</span>
        <input id="capture-toggle" type="checkbox" ${state.captureEnabled ? 'checked' : ''} />
        <span class="switch-track"></span>
      </label>
    </div>
    <div class="popup-divider"></div>
    <div class="project-field">
      <span class="field-label">默认项目类型</span>
      <div class="popup-type-controls">
        <label class="sr-only" for="popup-preset-control">预设项目类型</label>
        <select id="popup-preset-control" class="project-select">
          ${projectTypeOptions(state, selection.presetValue)}
        </select>
        <label class="sr-only" for="popup-custom-control">自定义项目类型</label>
        <input
          id="popup-custom-control"
          class="project-input"
          type="text"
          autocomplete="off"
          placeholder="输入自定义类型"
          value="${escapeHtml(selection.customValue)}"
          aria-invalid="${Boolean(error)}"
        />
        <button id="apply-default" class="apply-default-button" type="button" ${resolved.valid ? '' : 'disabled'}>设为默认</button>
      </div>
      <p id="popup-type-error" class="field-error" ${error ? '' : 'hidden'}>${escapeHtml(error)}</p>
      <p class="popup-hint">预设与自定义互斥，网页标题自动成为第二级项目名称。</p>
    </div>
    <button id="open-desktop" class="desktop-button" type="button">打开桌面应用</button>
  `;
}

export function createToolbar(state, imageId, {
  selection,
  status = 'ready',
  feedback = '',
  error = '',
}) {
  const toolbar = document.createElement('section');
  toolbar.className = 'capture-toolbar';
  toolbar.dataset.imageId = imageId;
  toolbar.setAttribute('aria-label', '图片保存工具条');

  const resolved = resolveTypeSelection(selection);
  const duplicate = status === 'duplicate';
  const saving = status === 'saving';
  const saved = status === 'saved';
  const staged = status === 'staged';
  const retryable = isRetryableCaptureStatus(status);
  const blocked = ['restricted', 'unsupported', 'inaccessible'].includes(status);
  const disabled = duplicate || saving || saved || staged || blocked || !resolved.valid;
  const buttonText = saving
    ? '保存中…'
    : retryable
      ? '重试'
      : staged
        ? '已暂存'
        : duplicate || saved
          ? '已保存'
          : blocked
            ? '未保存'
            : 'Save';
  const feedbackTone = error || retryable || blocked ? 'error' : staged ? 'warning' : 'normal';

  toolbar.innerHTML = `
    <div class="capture-toolbar-row">
      <select class="project-select toolbar-project-select" aria-label="预设项目类型">
        ${projectTypeOptions(state, selection.presetValue)}
      </select>
      <input
        class="project-input toolbar-custom-input"
        type="text"
        autocomplete="off"
        placeholder="输入自定义类型"
        aria-label="自定义项目类型"
        value="${escapeHtml(selection.customValue)}"
        aria-invalid="${Boolean(error)}"
      />
      <button class="save-button" type="button" ${disabled ? 'disabled' : ''}>${buttonText}</button>
    </div>
    <p class="toolbar-feedback" data-tone="${feedbackTone}" ${(feedback || error) ? '' : 'hidden'}>${escapeHtml(error || feedback)}</p>
  `;
  return toolbar;
}

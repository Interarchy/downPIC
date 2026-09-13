export function normalizeProjectType(value) {
  return String(value ?? '').trim();
}

export function validateProjectType(value) {
  const normalized = normalizeProjectType(value);
  if (!normalized) {
    return {
      valid: false,
      value: '',
      error: '请输入项目类型',
    };
  }

  return {
    valid: true,
    value: normalized,
    error: null,
  };
}

export function createTypeSelection(defaultProjectType = '') {
  return {
    presetValue: normalizeProjectType(defaultProjectType),
    customValue: '',
  };
}

export function applyPresetSelection(selection, value) {
  return {
    presetValue: normalizeProjectType(value),
    customValue: '',
  };
}

export function applyCustomInput(selection, value) {
  return {
    presetValue: '',
    customValue: String(value ?? ''),
  };
}

export function resolveTypeSelection(selection) {
  const hasCustomInput = String(selection.customValue ?? '').length > 0;
  const source = hasCustomInput ? 'custom' : 'preset';
  const validation = validateProjectType(
    hasCustomInput ? selection.customValue : selection.presetValue,
  );
  return {
    valid: validation.valid,
    value: validation.value,
    source,
    error: validation.error,
  };
}

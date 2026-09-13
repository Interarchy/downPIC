import { validateProjectType } from './project-type.mjs';

export function createPrototypeState() {
  return {
    desktopConnected: true,
    captureEnabled: false,
    copyrightAcknowledged: false,
    defaultProjectType: '文化建筑',
    customProjectTypes: [],
    images: {},
  };
}

export function setDesktopConnected(state, connected) {
  return { ...state, desktopConnected: Boolean(connected) };
}

export function acknowledgeCopyright(state) {
  return { ...state, copyrightAcknowledged: true };
}

export function setCaptureEnabled(state, enabled) {
  return {
    ...state,
    captureEnabled: Boolean(enabled),
  };
}

export function setDefaultProjectType(state, value) {
  const validation = validateProjectType(value);
  if (!validation.valid) {
    return { state, error: validation.error };
  }

  return {
    state: {
      ...state,
      defaultProjectType: validation.value,
    },
    error: null,
  };
}

export function getSavedProjectTypes(state, imageId) {
  return [...(state.images[imageId]?.savedProjectTypes ?? [])];
}

export function getStagedProjectTypes(state, imageId) {
  return [...(state.images[imageId]?.stagedProjectTypes ?? [])];
}

export function hasSavedInCurrentProject(state, imageId) {
  return getSavedProjectTypes(state, imageId).includes(state.defaultProjectType);
}

export function hasSavedInProject(state, imageId, projectType) {
  return getSavedProjectTypes(state, imageId).includes(projectType)
    || getStagedProjectTypes(state, imageId).includes(projectType);
}

export function hasStagedInProject(state, imageId, projectType) {
  return getStagedProjectTypes(state, imageId).includes(projectType);
}

export function saveImage(state, imageId) {
  const savedProjectTypes = getSavedProjectTypes(state, imageId);
  if (savedProjectTypes.includes(state.defaultProjectType)) {
    return { state, status: 'duplicate', error: null };
  }

  return {
    state: {
      ...state,
      images: {
        ...state.images,
        [imageId]: {
          ...state.images[imageId],
          savedProjectTypes: [...savedProjectTypes, state.defaultProjectType],
        },
      },
    },
    status: 'saved',
    error: null,
  };
}

export function stageImage(state, imageId) {
  const stagedProjectTypes = getStagedProjectTypes(state, imageId);
  if (hasSavedInProject(state, imageId, state.defaultProjectType)) {
    return { state, status: 'duplicate', error: null };
  }

  return {
    state: {
      ...state,
      images: {
        ...state.images,
        [imageId]: {
          ...state.images[imageId],
          stagedProjectTypes: [...stagedProjectTypes, state.defaultProjectType],
        },
      },
    },
    status: 'staged',
    error: null,
  };
}

export function createCustomTypeAndSave(state, value, imageId) {
  const validation = validateProjectType(value);
  if (!validation.valid) {
    return {
      state,
      status: 'invalid',
      error: validation.error,
    };
  }

  const customProjectTypes = state.customProjectTypes.includes(validation.value)
    ? state.customProjectTypes
    : [...state.customProjectTypes, validation.value];
  const withType = {
    ...state,
    defaultProjectType: validation.value,
    customProjectTypes,
  };
  return saveImage(withType, imageId);
}

export function setCustomDefaultProjectType(state, value) {
  const validation = validateProjectType(value);
  if (!validation.valid) {
    return { state, error: validation.error };
  }
  return {
    state: {
      ...state,
      defaultProjectType: validation.value,
      customProjectTypes: state.customProjectTypes.includes(validation.value)
        ? state.customProjectTypes
        : [...state.customProjectTypes, validation.value],
    },
    error: null,
  };
}

export function saveImageToProject(state, imageId, projectType) {
  const selected = setDefaultProjectType(state, projectType);
  if (selected.error) {
    return { state, status: 'invalid', error: selected.error };
  }
  return saveImage(selected.state, imageId);
}

export function stageImageToProject(state, imageId, projectType) {
  const selected = setDefaultProjectType(state, projectType);
  if (selected.error) {
    return { state, status: 'invalid', error: selected.error };
  }
  return stageImage(selected.state, imageId);
}

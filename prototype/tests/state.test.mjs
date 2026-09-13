import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createPrototypeState,
  acknowledgeCopyright,
  createCustomTypeAndSave,
  getSavedProjectTypes,
  getStagedProjectTypes,
  hasSavedInCurrentProject,
  saveImage,
  saveImageToProject,
  setDesktopConnected,
  setCustomDefaultProjectType,
  setDefaultProjectType,
  stageImageToProject,
} from '../src/state.mjs';

test('starts connected, disabled, and defaults to cultural architecture', () => {
  const state = createPrototypeState();
  assert.equal(state.desktopConnected, true);
  assert.equal(state.captureEnabled, false);
  assert.equal(state.defaultProjectType, '文化建筑');
});

test('tracks connection and one-time copyright acknowledgement independently', () => {
  const offline = setDesktopConnected(createPrototypeState(), false);
  const acknowledged = acknowledgeCopyright(offline);
  assert.equal(acknowledged.desktopConnected, false);
  assert.equal(acknowledged.copyrightAcknowledged, true);
  assert.equal(acknowledged.captureEnabled, false);
});

test('uses one shared default project type for popup and overlays', () => {
  const initial = createPrototypeState();
  const result = setDefaultProjectType(initial, '教育建筑');
  assert.equal(result.error, null);
  assert.equal(result.state.defaultProjectType, '教育建筑');
});

test('prevents exact duplicate saves inside the current project', () => {
  const first = saveImage(createPrototypeState(), 'image-01');
  const second = saveImage(first.state, 'image-01');
  assert.equal(first.status, 'saved');
  assert.equal(second.status, 'duplicate');
  assert.deepEqual(getSavedProjectTypes(second.state, 'image-01'), ['文化建筑']);
});

test('allows the same image to be saved to another project type', () => {
  const first = saveImage(createPrototypeState(), 'image-01');
  const changed = setDefaultProjectType(first.state, '教育建筑');
  const second = saveImage(changed.state, 'image-01');
  assert.equal(second.status, 'saved');
  assert.deepEqual(getSavedProjectTypes(second.state, 'image-01'), ['文化建筑', '教育建筑']);
  assert.equal(hasSavedInCurrentProject(second.state, 'image-01'), true);
});

test('creates a custom type, saves the image, and updates the default in one action', () => {
  const result = createCustomTypeAndSave(createPrototypeState(), '  社区建筑  ', 'image-03');
  assert.equal(result.error, null);
  assert.equal(result.status, 'saved');
  assert.equal(result.state.defaultProjectType, '社区建筑');
  assert.deepEqual(result.state.customProjectTypes, ['社区建筑']);
  assert.deepEqual(getSavedProjectTypes(result.state, 'image-03'), ['社区建筑']);
});

test('invalid custom type changes no state and saves no image', () => {
  const initial = createPrototypeState();
  const result = createCustomTypeAndSave(initial, '　 \n\t ', 'image-03');
  assert.equal(result.error, '请输入项目类型');
  assert.equal(result.state, initial);
  assert.deepEqual(getSavedProjectTypes(result.state, 'image-03'), []);
});

test('sets a custom default without saving an image', () => {
  const initial = createPrototypeState();
  const result = setCustomDefaultProjectType(initial, '  复合文化空间  ');
  assert.equal(result.error, null);
  assert.equal(result.state.defaultProjectType, '复合文化空间');
  assert.deepEqual(result.state.customProjectTypes, ['复合文化空间']);
  assert.deepEqual(result.state.images, {});
});

test('selects a preset and saves atomically to that project', () => {
  const result = saveImageToProject(createPrototypeState(), 'image-02', '教育建筑');
  assert.equal(result.error, null);
  assert.equal(result.status, 'saved');
  assert.equal(result.state.defaultProjectType, '教育建筑');
  assert.deepEqual(getSavedProjectTypes(result.state, 'image-02'), ['教育建筑']);
});

test('stages a download while desktop is offline and prevents duplicate capture', () => {
  const first = stageImageToProject(createPrototypeState(), 'image-04', '办公建筑');
  const second = stageImageToProject(first.state, 'image-04', '办公建筑');
  assert.equal(first.status, 'staged');
  assert.equal(second.status, 'duplicate');
  assert.deepEqual(getStagedProjectTypes(second.state, 'image-04'), ['办公建筑']);
  assert.deepEqual(getSavedProjectTypes(second.state, 'image-04'), []);
});

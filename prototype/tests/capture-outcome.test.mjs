import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getCaptureOutcome,
  isRetryableCaptureStatus,
  resolveCaptureScenario,
} from '../src/capture-outcome.mjs';

test('defaults unknown scenarios to a real saved outcome', () => {
  assert.equal(resolveCaptureScenario('?scenario=unknown'), 'normal');
  assert.equal(getCaptureOutcome('normal', '文化建筑').status, 'saved');
  assert.match(getCaptureOutcome('normal', '文化建筑').feedback, /已下载/);
});

test('distinguishes offline staging from formal archive', () => {
  assert.equal(resolveCaptureScenario('?scenario=offline'), 'offline');
  const outcome = getCaptureOutcome('offline', '文化建筑');
  assert.equal(outcome.status, 'staged');
  assert.match(outcome.feedback, /打开桌面端后自动整理/);
});

test('only transient download and staging failures can retry in place', () => {
  assert.equal(isRetryableCaptureStatus('download-error'), true);
  assert.equal(isRetryableCaptureStatus('staging-error'), true);
  assert.equal(isRetryableCaptureStatus('restricted'), false);
  assert.equal(isRetryableCaptureStatus('unsupported'), false);
});

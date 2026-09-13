import test from 'node:test';
import assert from 'node:assert/strict';

import { createHoverIntent } from '../src/hover-intent.mjs';

function createFakeScheduler() {
  let now = 0;
  let nextId = 1;
  const jobs = new Map();

  return {
    schedule(callback, delay) {
      const id = nextId++;
      jobs.set(id, { at: now + delay, callback });
      return id;
    },
    cancel(id) {
      jobs.delete(id);
    },
    advance(milliseconds) {
      const target = now + milliseconds;
      while (true) {
        const due = [...jobs.entries()]
          .filter(([, job]) => job.at <= target)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        const [id, job] = due;
        jobs.delete(id);
        now = job.at;
        job.callback();
      }
      now = target;
    },
  };
}

test('shows only after 150ms and hides only after 300ms', () => {
  const scheduler = createFakeScheduler();
  const events = [];
  const hover = createHoverIntent({
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
    onShow: (id) => events.push(`show:${id}`),
    onHide: () => events.push('hide'),
  });

  hover.enterImage('image-01');
  scheduler.advance(149);
  assert.deepEqual(events, []);
  scheduler.advance(1);
  assert.deepEqual(events, ['show:image-01']);

  hover.leaveImage('image-01');
  scheduler.advance(299);
  assert.deepEqual(events, ['show:image-01']);
  scheduler.advance(1);
  assert.deepEqual(events, ['show:image-01', 'hide']);
});

test('moving from the image into its toolbar cancels hiding', () => {
  const scheduler = createFakeScheduler();
  const events = [];
  const hover = createHoverIntent({
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
    onShow: (id) => events.push(`show:${id}`),
    onHide: () => events.push('hide'),
  });

  hover.enterImage('image-01');
  scheduler.advance(150);
  hover.leaveImage('image-01');
  scheduler.advance(100);
  hover.enterToolbar();
  scheduler.advance(300);
  assert.deepEqual(events, ['show:image-01']);
});

test('locked feedback remains visible until unlocked and left', () => {
  const scheduler = createFakeScheduler();
  const events = [];
  const hover = createHoverIntent({
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
    onShow: (id) => events.push(`show:${id}`),
    onHide: () => events.push('hide'),
  });

  hover.enterImage('image-01');
  scheduler.advance(150);
  hover.lock();
  hover.leaveImage('image-01');
  scheduler.advance(500);
  assert.deepEqual(events, ['show:image-01']);

  hover.unlock();
  scheduler.advance(300);
  assert.deepEqual(events, ['show:image-01', 'hide']);
});

test('moving quickly to another image cancels the old show timer', () => {
  const scheduler = createFakeScheduler();
  const events = [];
  const hover = createHoverIntent({
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
    onShow: (id) => events.push(`show:${id}`),
    onHide: () => events.push('hide'),
  });

  hover.enterImage('image-01');
  scheduler.advance(100);
  hover.enterImage('image-02');
  scheduler.advance(149);
  assert.deepEqual(events, []);
  scheduler.advance(1);
  assert.deepEqual(events, ['show:image-02']);
});

test('moving from a visible image to another image applies a fresh show delay', () => {
  const scheduler = createFakeScheduler();
  const events = [];
  const hover = createHoverIntent({
    schedule: scheduler.schedule,
    cancel: scheduler.cancel,
    onShow: (id) => events.push(`show:${id}`),
    onHide: () => events.push('hide'),
  });

  hover.enterImage('image-01');
  scheduler.advance(150);
  hover.leaveImage('image-01');
  hover.enterImage('image-02');
  assert.deepEqual(events, ['show:image-01', 'hide']);
  scheduler.advance(149);
  assert.deepEqual(events, ['show:image-01', 'hide']);
  scheduler.advance(1);
  assert.deepEqual(events, ['show:image-01', 'hide', 'show:image-02']);
});

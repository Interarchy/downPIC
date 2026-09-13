import test from 'node:test';
import assert from 'node:assert/strict';

// 浏览器侧取图管线的回归测试。
// 这里没有真 canvas，所以用一个记录实参的桩——要验的正是 drawImage 的 9 个实参，
// 「源区域」和「画布落点」这组参数一旦搞混，产出的是一张空图，而肉眼要等点开才发现。

const DRAW_CALLS = [];

globalThis.document = {
  createElement() {
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: (...args) => DRAW_CALLS.push(args) }),
      toBlob: callback => callback({ type: 'image/png' }),
    };
    return canvas;
  },
};

const SPRITE = { width: 1536, height: 1024 };
globalThis.fetch = async () => ({ ok: true, blob: async () => ({ type: 'image/png' }) });
globalThis.createImageBitmap = async () => SPRITE;

const { readReferenceCrop, normalizeForVision } = await import('../vision-image.mjs');

test('裁第一张示例图：源区从精灵图左上角取，落点是画布原点', async () => {
  DRAW_CALLS.length = 0;
  const result = await readReferenceCrop({ crop: 0 });

  assert.deepEqual(DRAW_CALLS, [[SPRITE, 0, 0, 512, 512, 0, 0, 512, 512]]);
  assert.deepEqual([result.width, result.height], [512, 512]);
});

test('裁第二、三张：源区横移，落点仍在画布原点', async () => {
  DRAW_CALLS.length = 0;
  await readReferenceCrop({ crop: 1 });
  await readReferenceCrop({ crop: 2 });

  // 落点必须是 0,0。若把源图的 x 当成落点，画会跑到画布外面，得到空图。
  assert.deepEqual(DRAW_CALLS[0], [SPRITE, 512, 0, 512, 512, 0, 0, 512, 512]);
  assert.deepEqual(DRAW_CALLS[1], [SPRITE, 1024, 0, 512, 512, 0, 0, 512, 512]);
});

test('粘贴的大图按长边 1600 等比缩小', async () => {
  DRAW_CALLS.length = 0;
  const source = { width: 4000, height: 3000 };
  const result = await normalizeForVision(source);

  assert.deepEqual(DRAW_CALLS, [[source, 0, 0, 4000, 3000, 0, 0, 1600, 1200]]);
  assert.deepEqual([result.width, result.height], [1600, 1200]);
  assert.equal(result.mimeType, 'image/png');
});

test('小图不放大，源区与画布一一对应', async () => {
  DRAW_CALLS.length = 0;
  const source = { width: 800, height: 600 };
  await normalizeForVision(source);

  assert.deepEqual(DRAW_CALLS, [[source, 0, 0, 800, 600, 0, 0, 800, 600]]);
});

test('示例图缺少裁剪序号时明确报错，不去猜', async () => {
  await assert.rejects(readReferenceCrop({}), /裁剪序号/);
  await assert.rejects(readReferenceCrop({ crop: 1.5 }), /裁剪序号/);
});

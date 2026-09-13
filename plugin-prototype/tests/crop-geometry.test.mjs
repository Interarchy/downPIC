import test from 'node:test';
import assert from 'node:assert/strict';
import { SPRITE_COLUMNS, SPRITE_ROWS, cropRectFor, visionSize } from '../crop-geometry.mjs';
import { cropRectFor as fromPngTools } from '../scripts/png-tools.mjs';

// 原型实际用的精灵图尺寸：3×2 的 512×512 网格。
const SHEET = { width: 1536, height: 1024 };

test('三张示例图的裁剪区正好是三个 512×512 单元格', () => {
  for (const index of [0, 1, 2]) {
    assert.deepEqual(cropRectFor(index, SHEET.width, SHEET.height), {
      x: index * 512,
      y: 0,
      width: 512,
      height: 512,
    });
  }
});

test('裁剪区与 styles.css 里 .crop-N 的背景定位一致', () => {
  // .photo 用 background-size:300% 200%，.crop-0/1/2 分别是 0% / 50% / 100% 横向偏移，
  // 换算成像素就是 x = 0 / 512 / 1024。这条断言是 CSS 与 JS 两个世界之间的对账。
  const offsets = [0, 0.5, 1].map(ratio => (SHEET.width - 512) * ratio);
  assert.deepEqual(
    [0, 1, 2].map(index => cropRectFor(index, SHEET.width, SHEET.height).x),
    offsets,
  );
});

test('越界的裁剪序号直接报错，不返回半个区域', () => {
  for (const index of [-1, 6, 1.5, NaN, undefined]) {
    assert.throws(() => cropRectFor(index, SHEET.width, SHEET.height), /超出/);
  }
});

test('png-tools 转出去的是同一份实现，不会各算各的', () => {
  assert.equal(fromPngTools, cropRectFor);
});

test('visionSize 只缩小不放大，且保持长宽比', () => {
  assert.deepEqual(visionSize(4000, 3000, 1600), { width: 1600, height: 1200 });
  assert.deepEqual(visionSize(3000, 4000, 1600), { width: 1200, height: 1600 });
  // 小图原样保留：放大只会让上传变大，不会多出信息
  assert.deepEqual(visionSize(512, 512, 1600), { width: 512, height: 512 });
  assert.deepEqual(visionSize(1600, 900, 1600), { width: 1600, height: 900 });
});

test('visionSize 在极端长宽比下也不会算出 0 边长', () => {
  const size = visionSize(20000, 3, 1600);
  assert.equal(size.width, 1600);
  assert.ok(size.height >= 1, '高度四舍五入到 0 会让 canvas 直接报错');
});

test('默认网格就是原型精灵图的 3×2', () => {
  assert.equal(SPRITE_COLUMNS, 3);
  assert.equal(SPRITE_ROWS, 2);
  assert.deepEqual(cropRectFor(3, SHEET.width, SHEET.height), { x: 0, y: 512, width: 512, height: 512 });
});

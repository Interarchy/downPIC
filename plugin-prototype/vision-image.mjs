import { SPRITE_COLUMNS, SPRITE_ROWS, cropRectFor, visionSize } from './crop-geometry.mjs';

// 浏览器侧的取图管线：把「网页图片」和「粘贴的图片」变成同一份 {blob, mimeType}。
//
// 原型的「网页图片」不是 <img>，而是 styles.css 里 .photo 用 background-image
// 从一张 1536×1024 的精灵图裁出来的。所以拿不到现成字节，必须走 canvas 裁。

const SPRITE_URL = '../prototype/assets/architecture-board.png';

// 模块级 memo：精灵图 2.88MB，每次点「反推」都重下既慢又浪费。
let spritePromise = null;

export { cropRectFor, visionSize };

export function loadSprite() {
  spritePromise ??= loadImage(SPRITE_URL);
  return spritePromise;
}

async function loadImage(url) {
  const response = await fetch(url, { cache: 'force-cache' });
  if (!response.ok) throw new Error(`精灵图加载失败（HTTP ${response.status}）`);
  const blob = await response.blob();
  if (typeof createImageBitmap === 'function') return createImageBitmap(blob);
  // Safari 旧版没有 createImageBitmap，退回 <img>
  const image = new Image();
  image.src = URL.createObjectURL(blob);
  await image.decode();
  return image;
}

// 示例图 → 512×512 的 PNG。与 check-vision 脚本用的是同一套行列几何。
export async function readReferenceCrop(reference) {
  if (!Number.isInteger(reference?.crop)) throw new Error('示例图缺少裁剪序号');
  const sprite = await loadSprite();
  const rect = cropRectFor(reference.crop, sprite.width, sprite.height, SPRITE_COLUMNS, SPRITE_ROWS);
  return drawToBlob(sprite, rect, { width: rect.width, height: rect.height });
}

// 粘贴的图片 → 长边不超过 1600 的 PNG。
// 上传的是「模型看到的那一份」，所以这里不做有损压缩，避免归档件与模型输入不一致。
export async function normalizeForVision(source) {
  const target = visionSize(source.width, source.height);
  return drawToBlob(source, { x: 0, y: 0, width: source.width, height: source.height }, target);
}

// target 只有尺寸，没有坐标：画布上的落点恒为左上角。
// 早先这里传的是「目标矩形」，源图的 x/y 会被当成画布内坐标用——
// 裁第二、三张图时源 x 是 512/1024，整张图直接被画到画布外面，得到的是一张空图。
function drawToBlob(source, sourceRect, target) {
  const canvas = document.createElement('canvas');
  canvas.width = target.width;
  canvas.height = target.height;
  canvas.getContext('2d').drawImage(
    source,
    sourceRect.x, sourceRect.y, sourceRect.width, sourceRect.height,
    0, 0, target.width, target.height,
  );
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) { reject(new Error('图片编码失败')); return; }
      resolve({ blob, mimeType: blob.type, width: target.width, height: target.height });
    }, 'image/png');
  });
}

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.readAsDataURL(blob);
  });
}

export async function prepareForVision(source) {
  const { blob, mimeType, width, height } = await normalizeForVision(source);
  return { base64: await blobToBase64(blob), mimeType, width, height };
}

export async function prepareReferenceCrop(reference) {
  const { blob, mimeType, width, height } = await readReferenceCrop(reference);
  return { base64: await blobToBase64(blob), mimeType, width, height };
}

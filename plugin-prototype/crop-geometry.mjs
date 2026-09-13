// 纯粹的行列几何，两边都要用：Node 侧的 check-vision 脚本按它裁精灵图，
// 浏览器侧按它从同一张精灵图里 canvas 取图。
// 单独成模块是为了只有一份实现——两处各写一遍迟早会算不到一块去。

export const SPRITE_COLUMNS = 3;
export const SPRITE_ROWS = 2;

export function cropRectFor(index, sheetWidth, sheetHeight, columns = SPRITE_COLUMNS, rows = SPRITE_ROWS) {
  if (!Number.isInteger(index) || index < 0 || index >= columns * rows) {
    throw new Error(`裁剪序号 ${index} 超出 ${columns}x${rows} 的表格范围`);
  }
  const width = Math.floor(sheetWidth / columns);
  const height = Math.floor(sheetHeight / rows);
  return {
    x: (index % columns) * width,
    y: Math.floor(index / columns) * height,
    width,
    height,
  };
}

// 等比缩到长边不超过 maxEdge，且绝不放大——放大只会让上传变大而不增加信息。
export function visionSize(width, height, maxEdge = 1600) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

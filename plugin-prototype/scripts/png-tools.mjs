import { deflateSync, inflateSync } from 'node:zlib';

// 纯 Node 的 PNG 读写，零依赖。只支持 bitDepth=8、非交错的灰度/RGB/RGBA——
// 覆盖仓库里所有素材，足够给脚本和测试造 fixture 用。

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CHANNELS = { 0: 1, 2: 3, 4: 2, 6: 4 };

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

export function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(SIGNATURE)) throw new Error('不是 PNG 文件');

  let width = 0;
  let height = 0;
  let channels = 0;
  const idat = [];

  for (let offset = 8; offset < buffer.length; ) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);

    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8) throw new Error(`仅支持 8 位色深，实际 ${data[8]}`);
      if (data[12] !== 0) throw new Error('不支持交错 PNG');
      channels = CHANNELS[data[9]];
      if (!channels) throw new Error(`不支持的 colorType ${data[9]}`);
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }

    offset += 12 + length;
  }

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  // 统一归一化成 RGBA，下游不用再分情况
  const pixels = Buffer.alloc(width * height * 4);

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const out = Buffer.alloc(stride);
    const prior = y ? pixels.subarray((y - 1) * width * 4, y * width * 4) : null;

    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? out[x - channels] : 0;
      const up = prior ? prior[(x / channels | 0) * 4 + (x % channels)] : 0;
      const upLeft = prior && x >= channels
        ? prior[((x - channels) / channels | 0) * 4 + ((x - channels) % channels)]
        : 0;
      const value = line[x];

      if (filter === 0) out[x] = value;
      else if (filter === 1) out[x] = (value + left) & 0xff;
      else if (filter === 2) out[x] = (value + up) & 0xff;
      else if (filter === 3) out[x] = (value + ((left + up) >> 1)) & 0xff;
      else if (filter === 4) out[x] = (value + paeth(left, up, upLeft)) & 0xff;
      else throw new Error(`未知的行过滤器 ${filter}`);
    }

    for (let x = 0; x < width; x++) {
      const target = (y * width + x) * 4;
      if (channels === 1) {
        pixels[target] = pixels[target + 1] = pixels[target + 2] = out[x];
        pixels[target + 3] = 255;
      } else if (channels === 2) {
        pixels[target] = pixels[target + 1] = pixels[target + 2] = out[x * 2];
        pixels[target + 3] = out[x * 2 + 1];
      } else if (channels === 3) {
        pixels[target] = out[x * 3];
        pixels[target + 1] = out[x * 3 + 1];
        pixels[target + 2] = out[x * 3 + 2];
        pixels[target + 3] = 255;
      } else {
        pixels[target] = out[x * 4];
        pixels[target + 1] = out[x * 4 + 1];
        pixels[target + 2] = out[x * 4 + 2];
        pixels[target + 3] = out[x * 4 + 3];
      }
    }
  }

  return { width, height, pixels };
}

export function encodePng({ width, height, pixels }) {
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 3);
    raw[rowStart] = 0;
    for (let x = 0; x < width; x++) {
      const source = (y * width + x) * 4;
      const target = rowStart + 1 + x * 3;
      raw[target] = pixels[source];
      raw[target + 1] = pixels[source + 1];
      raw[target + 2] = pixels[source + 2];
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;

  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export function cropPng(image, { x, y, width, height }) {
  if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > image.width || y + height > image.height) {
    throw new Error(`裁剪区域超出图片范围：${width}x${height}+${x}+${y} 于 ${image.width}x${image.height}`);
  }

  const pixels = Buffer.alloc(width * height * 4);
  for (let row = 0; row < height; row++) {
    const from = ((y + row) * image.width + x) * 4;
    image.pixels.copy(pixels, row * width * 4, from, from + width * 4);
  }

  return { width, height, pixels };
}

// 实现搬到 crop-geometry.mjs：浏览器侧也要用同一个几何，不能各写一份。
// 这里转出去，脚本的调用方不受影响。
export { cropRectFor } from '../crop-geometry.mjs';

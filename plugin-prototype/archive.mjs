import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

// 归档层：把一张图片落到「素材根目录 / 项目类型 / 项目名 / 文件」，
// 同项目内按内容 SHA-256 去重，并写一份 .source.json 来源旁车。
//
// 这是 spikes/phase0-capture/native-host/Program.cs 的 JS 移植版，行为对齐：
// 目录消歧的三级策略、旁车字段、非法字符清理都逐条照搬。
// 差异在于来源：C# 从下载目录读暂存文件，这里字节已经在内存里，
// 所以省掉暂存拷贝，只保留「写 .partial → 原子重命名」的语义。

const SUPPORTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const MAX_SEGMENT_LENGTH = 60; // 比 C# 的 80 更保守：Windows 默认 MAX_PATH 260，旁车还会再加 13 字符
const RESERVED_NAMES = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
// 浏览器会传出这些非标准写法，不归一会把合法 JPEG 误判成格式不符。
const MIME_ALIASES = { 'image/jpg': 'image/jpeg', 'image/pjpeg': 'image/jpeg', 'image/x-png': 'image/png' };

export class ArchiveError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ArchiveError';
    this.code = code;
  }
}

export { SUPPORTED_EXTENSIONS };

export function createCaptureId(now = Date.now(), random = randomBytes(8)) {
  return now.toString(16) + random.toString('hex');
}

// 客户端传来的 id 要进文件名，只留字母数字和下划线连字符。
export function safeId(value) {
  const safe = String(value ?? '').replace(/[^A-Za-z0-9_-]/g, '');
  if (!safe) throw new ArchiveError('INVALID_CAPTURE_ID', 'capture_id 无效');
  return safe;
}

// 清掉 Windows 文件名非法字符并折叠空白。
//
// 末尾那步 `[.\s]+$` 是防目录穿越的关键，别删：
// 分隔符被换成空格后，'../..' 会变成 '.. ..'，而 Windows 会静默忽略
// 路径分量末尾的点和空格——把它当目录名创建，实际指向的是上一级。
// 只有把末尾的点和空格一起剥光、剥空了再回落成 fallback，才是真的安全。
export function sanitizeSegment(value, fallback) {
  let text = String(value ?? '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.\s]+$/, '');
  if (!text) text = fallback;
  if (RESERVED_NAMES.test(text)) text = `_${text}`;
  // 截断后可能又露出末尾的点或空格，再剥一次
  return text.length > MAX_SEGMENT_LENGTH
    ? text.slice(0, MAX_SEGMENT_LENGTH).replace(/[.\s]+$/, '')
    : text;
}

// C# 的 UriBuilder{Fragment=""} 等价物：只剥锚点，其余原样。
// 刻意不动 query——图片 URL 的 query 常带尺寸参数，剥了就没法区分裁切点。
export function normalizePageUrl(value) {
  const text = String(value ?? '').trim();
  try {
    const url = new URL(text);
    url.hash = '';
    return url.href;
  } catch {
    return text;
  }
}

// 扩展名由文件头推导，不信客户端传的 mimeType——浏览器可以随便声明。
export function detectImageFormat(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { extension: '.png', mimeType: 'image/png' };
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { extension: '.jpg', mimeType: 'image/jpeg' };
  }
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return { extension: '.webp', mimeType: 'image/webp' };
  }
  return null;
}

export function sha256Hex(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

// 用 path.relative 而不是字符串 startsWith 判定越界：后者在大小写、
// 尾部分隔符和 '..' 上的边界容易漏。
//
// 逃逸判定要按「路径分量」而不是前缀：relative 为 '..' 或 '..\x' 才是真的出去了，
// 而 '..hello' 是一个合法目录名，用 startsWith('..') 会把它误判成越界。
export function assertInside(root, candidate) {
  const resolved = path.resolve(candidate);
  const relative = path.relative(path.resolve(root), resolved);
  const escaped = relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
  if (escaped) {
    throw new ArchiveError('PATH_OUTSIDE_LIBRARY', `目标路径超出素材根目录：${resolved}`);
  }
  return resolved;
}

export async function projectContainsSource(projectRoot, pageUrl) {
  if (!pageUrl) return false;
  const expected = normalizePageUrl(pageUrl);
  let entries;
  try {
    entries = await readdir(projectRoot);
  } catch {
    return false;
  }

  for (const entry of entries) {
    if (!entry.endsWith('.source.json')) continue;
    try {
      const sidecar = JSON.parse(await readFile(path.join(projectRoot, entry), 'utf8'));
      if (normalizePageUrl(sidecar?.page_url) === expected) return true;
    } catch {
      // 坏掉的旁车不能挡住后续采集——与 C# 的 catch 行为一致。
    }
  }
  return false;
}

// 同名网页的三级消歧：同源复用原目录 → 加网站名 → 再加编号。
//
// 没有 pageUrl 时不消歧，一律复用主目录：来源未知就没法判断「是不是同一个网页」，
// 这时新建目录只会把同一个项目拆成一堆，而不会带来任何区分度。
export async function resolveProjectRoot(projectTypeRoot, { pageTitle, siteName, pageUrl }) {
  const primary = path.join(projectTypeRoot, pageTitle);
  if (!pageUrl || !(await exists(primary)) || await projectContainsSource(primary, pageUrl)) return primary;

  const siteName_ = sanitizeSegment(`${pageTitle} - ${siteName}`, `${pageTitle} 2`);
  const siteCandidate = path.join(projectTypeRoot, siteName_);
  if (!(await exists(siteCandidate)) || await projectContainsSource(siteCandidate, pageUrl)) return siteCandidate;

  for (let index = 2; index < 10000; index++) {
    const numberedName = sanitizeSegment(`${pageTitle} - ${siteName} ${index}`, `${pageTitle} ${index}`);
    const numbered = path.join(projectTypeRoot, numberedName);
    if (!(await exists(numbered)) || await projectContainsSource(numbered, pageUrl)) return numbered;
  }
  throw new ArchiveError('PROJECT_NAME_CONFLICT', '无法为同名网页生成唯一项目目录');
}

// 必须用 stat 而不是 readdir：readdir 遇到「文件」会抛 ENOTDIR，
// 被 catch 吞掉后会得出「不存在的文件」这一反向结论，uniquePath 的避让就失效了。
async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

async function uniquePath(directory, filename) {
  const candidate = path.join(directory, filename);
  if (!(await exists(candidate))) return candidate;

  const extension = path.extname(filename);
  const stem = path.basename(filename, extension);
  for (let index = 2; index < 10000; index++) {
    const numbered = path.join(directory, `${stem}_${index}${extension}`);
    if (!(await exists(numbered))) return numbered;
  }
  throw new ArchiveError('FILENAME_CONFLICT', '无法生成唯一文件名');
}

async function findDuplicate(projectRoot, hash) {
  let entries;
  try {
    entries = await readdir(projectRoot);
  } catch {
    return null;
  }

  for (const entry of entries) {
    if (!SUPPORTED_EXTENSIONS.has(path.extname(entry).toLowerCase())) continue;
    const candidate = path.join(projectRoot, entry);
    if (sha256Hex(await readFile(candidate)) === hash) return candidate;
  }
  return null;
}

const pad = value => String(value).padStart(2, '0');

// 一律用本地时间：用户看到的文件名应该和他按下保存的时刻一致。
function timestamp(date) {
  return `${localDate(date).replace(/-/g, '')}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function localDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function sourceSidecar({ captureId, contentHash, metadata, managedPath }) {
  return {
    schema_version: 1,
    capture_id: captureId,
    content_hash: `sha256:${contentHash}`,
    project_type_name: metadata.projectTypeName ?? '',
    page_title: metadata.pageTitle ?? '',
    page_url: metadata.pageUrl ?? '',
    image_url: metadata.imageUrl ?? '',
    site_name: metadata.siteName ?? '',
    captured_at: metadata.capturedAt ?? '',
    managed_path: managedPath,
  };
}

export async function archiveCapture({ libraryRoot, imageBuffer, metadata = {}, now = new Date() }) {
  if (!libraryRoot) throw new ArchiveError('LIBRARY_ROOT_MISSING', '未指定素材根目录');

  const format = detectImageFormat(imageBuffer);
  if (!format) throw new ArchiveError('UNSUPPORTED_FORMAT', '暂不支持该图片格式，仅接受 PNG、JPEG 和 WebP');

  const raw = String(metadata.mimeType ?? '').trim().toLowerCase().split(';')[0];
  const declared = MIME_ALIASES[raw] ?? raw;
  if (declared && declared !== format.mimeType) {
    throw new ArchiveError('FORMAT_MISMATCH', `声明的格式是 ${declared}，但文件内容实际是 ${format.mimeType}`);
  }

  const root = path.resolve(libraryRoot);
  const captureId = safeId(metadata.captureId || createCaptureId());
  const projectType = sanitizeSegment(metadata.projectTypeName, '未分类');
  const siteName = sanitizeSegment(metadata.siteName, '未命名项目');
  const pageTitle = sanitizeSegment(metadata.pageTitle, `${siteName} ${localDate(now)}`);

  const projectTypeRoot = assertInside(root, path.join(root, projectType));
  const projectRoot = assertInside(
    root,
    await resolveProjectRoot(projectTypeRoot, { pageTitle, siteName, pageUrl: metadata.pageUrl }),
  );
  await mkdir(projectRoot, { recursive: true });

  const contentHash = sha256Hex(imageBuffer);
  const duplicate = await findDuplicate(projectRoot, contentHash);
  if (duplicate) {
    return {
      state: 'duplicate',
      captureId,
      managedPath: duplicate,
      relativePath: path.relative(root, duplicate),
      contentHash: `sha256:${contentHash}`,
    };
  }

  const filename = `${timestamp(now)}_${captureId.slice(0, 8)}${format.extension}`;
  const target = assertInside(root, await uniquePath(projectRoot, filename));

  // 先写 .partial 再重命名：目标文件要么不存在，要么是完整的。
  const partial = `${target}.partial`;
  await writeFile(partial, imageBuffer);
  await rename(partial, target);

  await writeFile(
    `${target}.source.json`,
    `${JSON.stringify(sourceSidecar({ captureId, contentHash, metadata, managedPath: target }), null, 2)}\n`,
    'utf8',
  );

  return {
    state: 'imported',
    captureId,
    managedPath: target,
    relativePath: path.relative(root, target),
    contentHash: `sha256:${contentHash}`,
  };
}

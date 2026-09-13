import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { encodePng } from '../scripts/png-tools.mjs';
import {
  ArchiveError,
  archiveCapture,
  assertInside,
  detectImageFormat,
  normalizePageUrl,
  sanitizeSegment,
  sha256Hex,
} from '../archive.mjs';

// 归档层直接写磁盘，所以每个用例都独占一个临时素材根目录，跑完删掉。
async function withLibrary(run) {
  const libraryRoot = await mkdtemp(path.join(tmpdir(), 'downpic-archive-'));
  try {
    return await run(libraryRoot);
  } finally {
    await rm(libraryRoot, { recursive: true, force: true });
  }
}

// 真 PNG 而不是伪造的文件头：这样哈希、去重、扩展名推导走的都是真实字节。
function solidPng(red, green, blue, size = 4) {
  const pixels = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    pixels[i * 4] = red;
    pixels[i * 4 + 1] = green;
    pixels[i * 4 + 2] = blue;
    pixels[i * 4 + 3] = 255;
  }
  return encodePng({ width: size, height: size, pixels });
}

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);

const baseMeta = {
  captureId: 'a1b2c3d4e5f60718',
  projectTypeName: '建筑外观',
  pageTitle: '山谷中的混凝土建筑',
  pageUrl: 'https://example.com/projects/valley',
  imageUrl: 'https://example.com/img/valley.jpg',
  siteName: '示例建筑网',
  capturedAt: '2026-09-13T10:00:00.000Z',
};

async function listAll(root) {
  const found = [];
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else found.push(path.relative(root, full));
    }
  }
  await walk(root);
  return found.sort();
}

test('sanitizeSegment 清掉 Windows 非法字符并折叠空白', () => {
  assert.equal(sanitizeSegment('  山谷 / 混凝土:建筑  ', '兜底'), '山谷 混凝土 建筑');
  assert.equal(sanitizeSegment('a<b>c"d|e?f*g', '兜底'), 'a b c d e f g');
});

test('sanitizeSegment 用兜底值接住空输入', () => {
  assert.equal(sanitizeSegment('', '未分类'), '未分类');
  assert.equal(sanitizeSegment('   ', '未分类'), '未分类');
  assert.equal(sanitizeSegment(undefined, '未分类'), '未分类');
  assert.equal(sanitizeSegment(null, '未分类'), '未分类');
});

test('sanitizeSegment 消灭 ".." —— 这是标题字段防目录穿越的唯一依据', () => {
  assert.equal(sanitizeSegment('..', '兜底'), '兜底');
  assert.equal(sanitizeSegment('../..', '兜底'), '兜底');
  assert.equal(sanitizeSegment('....', '兜底'), '兜底');
  // 末尾的点和空格在 Windows 上被静默忽略，'.. ' 实际指向上一级，必须一起剥掉
  assert.equal(sanitizeSegment('.. ', '兜底'), '兜底');
  assert.equal(sanitizeSegment('.. . . ', '兜底'), '兜底');
  // 分隔符没了就不再是穿越，只剩一个普通目录名
  assert.equal(sanitizeSegment('..\\..\\Windows', '兜底'), '.. .. Windows');
});

test('sanitizeSegment 给 Windows 保留设备名加前缀，并截断过长标题', () => {
  assert.equal(sanitizeSegment('CON', '兜底'), '_CON');
  assert.equal(sanitizeSegment('com1', '兜底'), '_com1');
  assert.equal(sanitizeSegment('建筑'.repeat(100), '兜底').length, 60);
});

test('detectImageFormat 由文件头推导扩展名，不认的文件返回 null', () => {
  assert.deepEqual(detectImageFormat(solidPng(10, 20, 30)), { extension: '.png', mimeType: 'image/png' });
  assert.deepEqual(detectImageFormat(JPEG), { extension: '.jpg', mimeType: 'image/jpeg' });

  const webp = Buffer.alloc(24);
  webp.write('RIFF', 0, 'ascii');
  webp.write('WEBP', 8, 'ascii');
  assert.deepEqual(detectImageFormat(webp), { extension: '.webp', mimeType: 'image/webp' });

  assert.equal(detectImageFormat(Buffer.from('GIF89a............')), null);
  assert.equal(detectImageFormat(Buffer.alloc(0)), null);
  assert.equal(detectImageFormat(Buffer.from('RIFF....WAVE')), null);
});

test('normalizePageUrl 只剥锚点，保留 query 里的裁切参数', () => {
  assert.equal(
    normalizePageUrl('https://example.com/a#section'),
    'https://example.com/a',
  );
  assert.equal(
    normalizePageUrl('https://example.com/a?crop=2#top'),
    'https://example.com/a?crop=2',
  );
  assert.equal(normalizePageUrl('  不是 URL  '), '不是 URL');
  assert.equal(normalizePageUrl(undefined), '');
});

test('assertInside 放行子路径，拦住任何形式的越界', () => {
  const root = path.resolve('C:/library');
  assert.equal(assertInside(root, path.join(root, '建筑外观', '项目', 'a.png')), path.join(root, '建筑外观', '项目', 'a.png'));
  assert.equal(assertInside(root, root), root);

  // 前缀相同的兄弟目录不是「在根目录内」，startsWith 判定会在这里放行。
  assert.throws(() => assertInside(root, path.resolve('C:/library-备份/a.png')), ArchiveError);
  assert.throws(() => assertInside(root, path.resolve('C:/library/../outside.png')), ArchiveError);
  assert.throws(() => assertInside(root, path.resolve('D:/elsewhere/a.png')), ArchiveError);
});

test('首次采集：落到「项目类型/项目名」两级目录并写出来源旁车', async () => {
  await withLibrary(async libraryRoot => {
    const image = solidPng(10, 20, 30);
    const result = await archiveCapture({
      libraryRoot,
      imageBuffer: image,
      metadata: baseMeta,
      now: new Date(2026, 8, 13, 10, 30, 0),
    });

    assert.equal(result.state, 'imported');
    assert.equal(result.relativePath, path.join('建筑外观', '山谷中的混凝土建筑', '20260913-103000_a1b2c3d4.png'));
    assert.equal(result.contentHash, `sha256:${sha256Hex(image)}`);
    assert.ok(path.isAbsolute(result.managedPath));

    // 落盘的是原字节，没有经过任何转码
    assert.deepEqual(await readFile(result.managedPath), image);

    const sidecar = JSON.parse(await readFile(`${result.managedPath}.source.json`, 'utf8'));
    assert.deepEqual(sidecar, {
      schema_version: 1,
      capture_id: 'a1b2c3d4e5f60718',
      content_hash: `sha256:${sha256Hex(image)}`,
      project_type_name: '建筑外观',
      page_title: '山谷中的混凝土建筑',
      page_url: 'https://example.com/projects/valley',
      image_url: 'https://example.com/img/valley.jpg',
      site_name: '示例建筑网',
      captured_at: '2026-09-13T10:00:00.000Z',
      managed_path: result.managedPath,
    });

    // 无 BOM：带 BOM 的 JSON 会被不少解析器拒掉
    const raw = await readFile(`${result.managedPath}.source.json`);
    assert.notDeepEqual(raw.subarray(0, 3), Buffer.from([0xef, 0xbb, 0xbf]));
  });
});

test('同一张图再采一次返回 duplicate，磁盘上一个字节都不多写', async () => {
  await withLibrary(async libraryRoot => {
    const image = solidPng(10, 20, 30);
    const first = await archiveCapture({ libraryRoot, imageBuffer: image, metadata: baseMeta });
    const before = await listAll(libraryRoot);

    const second = await archiveCapture({
      libraryRoot,
      // 换一个 capture_id 和采集时间，证明去重靠的是内容而不是文件名
      imageBuffer: image,
      metadata: { ...baseMeta, captureId: 'ffffffffffffffff' },
      now: new Date(2027, 0, 1, 0, 0, 0),
    });

    assert.equal(second.state, 'duplicate');
    assert.equal(second.managedPath, first.managedPath);
    assert.equal(second.contentHash, first.contentHash);
    assert.deepEqual(await listAll(libraryRoot), before);
  });
});

test('同标题同 pageUrl 复用原目录，不同内容各自落盘', async () => {
  await withLibrary(async libraryRoot => {
    const first = await archiveCapture({ libraryRoot, imageBuffer: solidPng(1, 2, 3), metadata: baseMeta });
    const second = await archiveCapture({ libraryRoot, imageBuffer: solidPng(4, 5, 6), metadata: baseMeta });

    assert.equal(second.state, 'imported');
    assert.equal(path.dirname(first.managedPath), path.dirname(second.managedPath));
    assert.equal(await readdir(path.dirname(first.managedPath)).then(files => files.length), 4);
  });
});

test('没有 pageUrl 时不消歧，同一标题一律进同一个目录', async () => {
  await withLibrary(async libraryRoot => {
    // 来源未知就没法判断「是不是同一个网页」，此时新建目录只会把同一个项目拆散
    const noUrl = { ...baseMeta, pageUrl: undefined };
    const first = await archiveCapture({ libraryRoot, imageBuffer: solidPng(1, 2, 3), metadata: noUrl });
    const second = await archiveCapture({
      libraryRoot,
      imageBuffer: solidPng(4, 5, 6),
      metadata: { ...noUrl, captureId: 'beefbeefbeefbeef' },
    });

    assert.equal(path.dirname(second.managedPath), path.dirname(first.managedPath));
    assert.equal((await listAll(libraryRoot)).filter(file => file.endsWith('.png')).length, 2);
  });
});

test('标题相同但来源不同，先加网站名消歧', async () => {
  await withLibrary(async libraryRoot => {
    const first = await archiveCapture({ libraryRoot, imageBuffer: solidPng(1, 2, 3), metadata: baseMeta });
    const second = await archiveCapture({
      libraryRoot,
      imageBuffer: solidPng(4, 5, 6),
      metadata: { ...baseMeta, pageUrl: 'https://other.com/valley', siteName: '另一家建筑网' },
    });

    assert.equal(
      path.dirname(second.managedPath),
      path.join(libraryRoot, '建筑外观', '山谷中的混凝土建筑 - 另一家建筑网'),
    );
    assert.notEqual(path.dirname(first.managedPath), path.dirname(second.managedPath));
  });
});

test('网站名也撞车时退化到编号，仍然不会互相覆盖', async () => {
  await withLibrary(async libraryRoot => {
    const meta = pageUrl => ({ ...baseMeta, pageUrl });

    await archiveCapture({ libraryRoot, imageBuffer: solidPng(1, 1, 1), metadata: meta('https://a.com/1') });
    await archiveCapture({ libraryRoot, imageBuffer: solidPng(2, 2, 2), metadata: meta('https://b.com/2') });

    const third = await archiveCapture({ libraryRoot, imageBuffer: solidPng(3, 3, 3), metadata: meta('https://c.com/3') });
    assert.equal(
      path.dirname(third.managedPath),
      path.join(libraryRoot, '建筑外观', '山谷中的混凝土建筑 - 示例建筑网 2'),
    );
    assert.equal((await listAll(libraryRoot)).filter(file => file.endsWith('.png')).length, 3);
  });
});

test('同一秒内同 capture_id 不同内容不会互相覆盖', async () => {
  await withLibrary(async libraryRoot => {
    const now = new Date(2026, 8, 13, 10, 30, 0);
    const first = await archiveCapture({ libraryRoot, imageBuffer: solidPng(1, 1, 1), metadata: baseMeta, now });
    const second = await archiveCapture({ libraryRoot, imageBuffer: solidPng(2, 2, 2), metadata: baseMeta, now });

    assert.equal(second.relativePath, path.join('建筑外观', '山谷中的混凝土建筑', '20260913-103000_a1b2c3d4_2.png'));
    assert.notEqual(first.managedPath, second.managedPath);
    // 避让出来的第二个文件不能把第一个覆盖掉
    assert.deepEqual(await readFile(first.managedPath), solidPng(1, 1, 1));
    assert.deepEqual(await readFile(second.managedPath), solidPng(2, 2, 2));
  });
});

test('声明的 MIME 与真实字节不符时拒绝，而不是落一个名不副实的文件', async () => {
  await withLibrary(async libraryRoot => {
    await assert.rejects(
      archiveCapture({
        libraryRoot,
        imageBuffer: JPEG,
        metadata: { ...baseMeta, mimeType: 'image/png' },
      }),
      error => error instanceof ArchiveError && error.code === 'FORMAT_MISMATCH',
    );
    assert.deepEqual(await listAll(libraryRoot), []);
  });
});

test('浏览器传来的非标准 MIME 别名不算格式不符', async () => {
  await withLibrary(async libraryRoot => {
    const accepted = await archiveCapture({
      libraryRoot,
      imageBuffer: JPEG,
      metadata: { ...baseMeta, mimeType: 'image/jpg' },
    });
    assert.ok(accepted.managedPath.endsWith('.jpg'));

    const withParams = await archiveCapture({
      libraryRoot,
      imageBuffer: solidPng(9, 9, 9),
      metadata: { ...baseMeta, mimeType: 'image/png; charset=binary', captureId: 'beefbeefbeefbeef' },
    });
    assert.ok(withParams.managedPath.endsWith('.png'));
  });
});

test('不支持的格式被拒绝，磁盘上不留任何文件', async () => {
  await withLibrary(async libraryRoot => {
    await assert.rejects(
      archiveCapture({ libraryRoot, imageBuffer: Buffer.from('GIF89a not really a gif'), metadata: baseMeta }),
      error => error instanceof ArchiveError && error.code === 'UNSUPPORTED_FORMAT',
    );
    assert.deepEqual(await listAll(libraryRoot), []);
  });
});

test('恶意的项目类型与标题写不出素材根目录', async () => {
  await withLibrary(async libraryRoot => {
    const result = await archiveCapture({
      libraryRoot,
      imageBuffer: solidPng(7, 7, 7),
      metadata: {
        ...baseMeta,
        projectTypeName: '../../..',
        pageTitle: '..\\..\\Windows\\System32',
      },
      now: new Date(2026, 8, 13, 10, 30, 0),
    });

    // 分隔符被换成空格后已不构成穿越，目标文件老老实实待在 root 里面
    const projectDir = path.join('未分类', '.. .. Windows System32');
    assert.equal(result.relativePath, path.join(projectDir, '20260913-103000_a1b2c3d4.png'));
    assert.deepEqual(await listAll(libraryRoot), [
      path.join(projectDir, '20260913-103000_a1b2c3d4.png'),
      path.join(projectDir, '20260913-103000_a1b2c3d4.png.source.json'),
    ]);
  });
});

test('缺少素材根目录时明确报错', async () => {
  await assert.rejects(
    archiveCapture({ libraryRoot: '', imageBuffer: solidPng(1, 1, 1), metadata: baseMeta }),
    error => error instanceof ArchiveError && error.code === 'LIBRARY_ROOT_MISSING',
  );
});

test('损坏的来源旁车不会挡住后续采集', async () => {
  await withLibrary(async libraryRoot => {
    const image = solidPng(1, 2, 3);
    const first = await archiveCapture({ libraryRoot, imageBuffer: image, metadata: baseMeta });
    await writeFile(`${first.managedPath}.source.json`, '{ 这不是 JSON', 'utf8');

    // 旁车读不出来 → 视为「未见过该来源」→ 不复用目录，走消歧分支而不是崩掉
    const second = await archiveCapture({
      libraryRoot,
      imageBuffer: solidPng(4, 5, 6),
      metadata: { ...baseMeta, captureId: 'beefbeefbeefbeef' },
    });
    assert.equal(second.state, 'imported');
    assert.notEqual(path.dirname(second.managedPath), path.dirname(first.managedPath));
  });
});

test('缺字段的元数据靠兜底值仍然能落盘', async () => {
  await withLibrary(async libraryRoot => {
    const result = await archiveCapture({
      libraryRoot,
      imageBuffer: solidPng(1, 2, 3),
      metadata: {},
      now: new Date(2026, 8, 13, 0, 0, 0),
    });

    assert.equal(result.state, 'imported');
    assert.equal(path.dirname(result.relativePath), path.join('未分类', '未命名项目 2026-09-13'));
    assert.match(result.captureId, /^[0-9a-f]{16,}$/); // 未提供时自动生成，且只含可进文件名的字符
  });
});

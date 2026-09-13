import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const SIDECAR_SUFFIX = '.source.json';

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(fullPath));
    else files.push(fullPath);
  }
  return files;
}

function stableId(metadata, imagePath) {
  if (metadata.capture_id) return `capture-${metadata.capture_id}`;
  if (metadata.content_hash) return `content-${metadata.content_hash.replace(/^sha256:/, '').slice(0, 24)}`;
  return `file-${createHash('sha256').update(imagePath).digest('hex').slice(0, 24)}`;
}

function webPathFromAbsolute(workspaceRoot, imagePath) {
  const relative = path.relative(workspaceRoot, imagePath).split(path.sep);
  return `/${relative.map(encodeURIComponent).join('/')}`;
}

export async function scanLibrary({ libraryRoot, workspaceRoot }) {
  const files = await walk(libraryRoot);
  const images = files.filter((file) => !file.endsWith(SIDECAR_SUFFIX));
  const assets = [];

  for (const imagePath of images) {
    let metadata = {};
    try {
      metadata = JSON.parse(await readFile(`${imagePath}${SIDECAR_SUFFIX}`, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }

    const imageStat = await stat(imagePath);
    const relativeParts = path.relative(libraryRoot, imagePath).split(path.sep);
    const projectType = metadata.project_type_name || relativeParts[0] || '未分类';
    const projectName = relativeParts.length > 2 ? relativeParts.at(-2) : '未命名项目';
    const capturedAt = metadata.captured_at || imageStat.birthtime.toISOString();
    assets.push({
      id: stableId(metadata, imagePath),
      title: metadata.page_title || projectName || path.parse(imagePath).name,
      projectType,
      projectName,
      status: '未解析',
      tags: [],
      description: '',
      analysis: { stage: '等待 AI 解析', queuedAt: capturedAt, retryCount: 0 },
      sourceSite: metadata.site_name || '未知来源',
      sourcePageTitle: metadata.page_title || projectName,
      sourceUrl: metadata.page_url || '',
      sourceImageUrl: metadata.image_url || '',
      sourceCapturedAt: capturedAt,
      contentHash: metadata.content_hash || '',
      managedPath: metadata.managed_path || imagePath,
      webPath: webPathFromAbsolute(workspaceRoot, imagePath),
      capturedAt,
      byteSize: imageStat.size,
    });
  }

  return assets.sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
}

export function buildProjectTree(assets) {
  const groups = new Map();
  for (const asset of assets) {
    const group = groups.get(asset.projectType) ?? { type: asset.projectType, count: 0, projects: new Set() };
    group.count += 1;
    group.projects.add(asset.projectName);
    groups.set(asset.projectType, group);
  }
  return [...groups.values()].map((group) => ({
    type: group.type,
    count: group.count,
    projects: [...group.projects].sort((a, b) => a.localeCompare(b, 'zh-CN')),
  }));
}

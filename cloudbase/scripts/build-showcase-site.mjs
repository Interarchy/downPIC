import { mkdir, readFile, writeFile, copyFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

// 仅构建公开静态站的明确白名单；真实环境配置、开发目录与用户资料不进入上传目录。
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = path.join(root, 'opendesign/mockups/archbuddy-showcase');
const delivery = path.join(root, 'cloudbase/dist/showcase-reference-collection-20261007');
const output = path.join(delivery, 'site');
const pages = ['index.html', 'problem.html', 'workflow.html', 'decisions.html', 'outcomes.html'];
const assets = ['01-project-library-1280x800.png', '02-image-description-1280x800.png', '03-prompt-library-1280x800.png', '04-prompt-builder-1280x800.png', '05-prompt-optimization-1280x800.png', 'logo.svg', 'tokens.css'];
const files = ['index.html', 'styles.css', 'app.js', ...pages.map(name => 'case-study/' + name), 'case-study/styles.css', 'case-study/app.js', ...assets.map(name => 'case-study/assets/' + name), 'downloads/ArchBuddy-0.6.0-Chrome.zip', 'downloads/ArchBuddy-test-images.7z', 'assets/lucide.svg', 'assets/lucide-LICENSE.txt', 'assets/favicon.svg', 'assets/brand-mark.svg'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const archivePath = path.join(root, 'extension/dist/browser-load-20261005/ArchBuddy-0.6.0-Chrome.zip');
const expectedArchiveHash = '34B10BDF1C17FB712FDD721CCF06ED33EA72D87B318402C3471212A021FC113D';
const expectedTestsetHash = '18E01EDB67EDCF5A1AC32CB6545DAED6C064D0AFA3C3DD3B2EBFA7BF91D7D8AD';
const originalArchive = await readFile(archivePath);
if (hash(originalArchive) !== expectedArchiveHash) throw new Error('插件原始交付包哈希发生变化，请先重新核验。');
await mkdir(output, { recursive: true });
const results = [];
for (const name of files) {
  const bytes = await readFile(path.join(source, name));
  if (name.endsWith('.zip') && hash(bytes) !== expectedArchiveHash) throw new Error('公开下载包与原交付包不一致。');
  if (name.endsWith('.7z') && hash(bytes) !== expectedTestsetHash) throw new Error('公开测试集与用户提供的原归档不一致。');
  if (/\.(html|css|js)$/.test(name) && /(?:sk-[A-Za-z0-9_-]{16,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})/.test(bytes.toString('utf8'))) throw new Error('疑似凭据文件，停止构建：' + name);
  const destination = path.join(output, name);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(path.join(source, name), destination);
  results.push({ path: name, bytes: bytes.length, sha256: hash(bytes) });
}
async function list(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const found = [];
  for (const entry of entries) {
    const name = prefix + entry.name;
    if (entry.isDirectory()) found.push(...await list(path.join(directory, entry.name), name + '/'));
    else found.push(name);
  }
  return found;
}
const actual = await list(output);
if (actual.length !== files.length || actual.some(name => !files.includes(name))) throw new Error('上传目录出现非白名单文件，请只处理本展示站目录后再构建。');
for (const name of files.filter(name => /\.(html|css|js)$/.test(name))) {
  const sourceText = await readFile(path.join(output,name),'utf8');
  const patterns = name.endsWith('.html') ? [/(?:src|href)=["']([^"']+)["']/g] : name.endsWith('.css') ? [/url\(["']?([^\s)"']+)["']?\)/g, /@import\s+["']([^"']+)["']/g] : [/["']((?:assets\/)?0[1-5]-[^"']+\.png)["']/g];
  for (const pattern of patterns) for (const match of sourceText.matchAll(pattern)) {
    let reference = match[1];
    if (/^(?:[a-z]+:|#|\/\/)/i.test(reference)) continue;
    if (name.endsWith('.js') && !reference.startsWith('assets/')) reference = (name.startsWith('case-study/') ? 'assets/' : 'case-study/assets/') + reference;
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(name),reference.split(/[?#]/)[0]));
    if (!files.includes(resolved)) throw new Error('缺少公开引用资源：' + name + ' → ' + resolved);
  }
}
const manifest = { date: '2026-10-07', projectId: 'archbuddy', stage: 'development', application: 'archbuddy-dev-showcase', cloudPath: 'archbuddy/dev/showcase/', fileCount: results.length, bytes: results.reduce((sum,item)=>sum+item.bytes,0), archiveSha256: expectedArchiveHash, testsetSha256: expectedTestsetHash, contentVersion: 'reference-collection-20261007', files: results };
await writeFile(path.join(delivery,'deployment-manifest.json'),JSON.stringify(manifest,null,2));
console.log(JSON.stringify({ output, fileCount: manifest.fileCount, bytes:manifest.bytes, archiveSha256:expectedArchiveHash }));

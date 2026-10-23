import fs from 'node:fs';
import { createHash } from 'node:crypto';
const manifest = JSON.parse(fs.readFileSync('cloudbase/dist/showcase-concept-interactions-20261023/deployment-manifest.json', 'utf8'));
const base = 'https://archbuddy-dev-showcase-dev-mel-d9guu8bpu44029179.webapps.tcloudbase.com/';
const hash = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const files = await Promise.all(manifest.files.map(async file => {
  try {
    const response = await fetch(`${base}${file.path}?v=concept-interactions-20261023`, { signal: AbortSignal.timeout(30000) });
    const bytes = Buffer.from(await response.arrayBuffer());
    return { path: file.path, status: response.status, bytes: bytes.length, match: response.ok && hash(bytes) === file.sha256 };
  } catch (error) { return { path: file.path, error: String(error), match: false }; }
}));
const privacy = await fetch('https://archbuddy-privacy-dev-mel-d9guu8bpu44029179.webapps.tcloudbase.com/', { signal: AbortSignal.timeout(30000) });
const privacyBytes = Buffer.from(await privacy.arrayBuffer());
const report = { version: manifest.contentVersion, matched: files.filter(file => file.match).length, total: files.length, mismatches: files.filter(file => !file.match), privacy: { status: privacy.status, bytes: privacyBytes.length, sha256: hash(privacyBytes) }, files };
fs.writeFileSync('opendesign/review/archbuddy-concept-interactions-20261023/public-hashes.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ version: report.version, matched: report.matched, total: report.total, mismatches: report.mismatches, privacy: report.privacy }));
if (report.matched !== report.total || report.privacy.status !== 200 || report.privacy.bytes !== 6364 || report.privacy.sha256 !== 'D01C5E2B44C55F6C64CB1647749B2C307326255CAA1259304B45E5B169A05DA8') process.exitCode = 1;

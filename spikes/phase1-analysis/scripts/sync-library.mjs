import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { synchronizeLibrary } from '../src/sync.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDirectory, '../../..');
const runtimeRoot = path.join(workspaceRoot, 'spikes/phase0-capture/runtime');
const libraryRoot = path.join(runtimeRoot, 'library');
const databasePath = path.join(runtimeRoot, 'asset-library.sqlite');
const projectionPath = path.join(runtimeRoot, 'assets-index.json');

await mkdir(runtimeRoot, { recursive: true });
const projection = await synchronizeLibrary({ libraryRoot, workspaceRoot, databasePath, projectionPath });
console.log(`Indexed ${projection.assets.length} assets`);
console.log(projectionPath);

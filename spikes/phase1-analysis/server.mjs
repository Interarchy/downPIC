import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { synchronizeLibrary } from './src/sync.mjs';
import { getAnalysisConfiguration, processAnalysisQueue, processNextAnalysis } from './src/queue-worker.mjs';
import { openAssetDatabase, recoverInterruptedAnalyses } from './src/database.mjs';
import { loadDeveloperAIEnvironment } from './src/developer-settings.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(here, '../..');
const runtimeRoot = path.join(workspaceRoot, 'spikes/phase0-capture/runtime');
const syncOptions = {
  workspaceRoot,
  libraryRoot: path.join(runtimeRoot, 'library'),
  databasePath: path.join(runtimeRoot, 'asset-library.sqlite'),
  projectionPath: path.join(runtimeRoot, 'assets-index.json'),
};
const analysisEnvironment = await loadDeveloperAIEnvironment(runtimeRoot);
const port = Number(process.argv.find((value) => value.startsWith('--port='))?.split('=')[1] || 4174);
const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'], ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json; charset=utf-8'], ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'], ['.png', 'image/png'], ['.webp', 'image/webp'], ['.svg', 'image/svg+xml'],
]);

function safeLocalPath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const relative = decoded === '/' ? 'desktop-prototype/index.html' : decoded.replace(/^\/+/, '');
  const candidate = path.resolve(workspaceRoot, relative.endsWith('/') ? `${relative}index.html` : relative);
  return candidate.startsWith(`${workspaceRoot}${path.sep}`) ? candidate : null;
}

const server = createServer(async (request, response) => {
  try {
    if (request.method === 'GET' && request.url?.split('?')[0] === '/api/assets') {
      const projection = await synchronizeLibrary(syncOptions);
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      response.end(JSON.stringify(projection));
      return;
    }
    if (request.method === 'GET' && request.url?.split('?')[0] === '/api/analysis/status') {
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      response.end(JSON.stringify(getAnalysisConfiguration(analysisEnvironment)));
      return;
    }
    if (request.method === 'POST' && request.url?.split('?')[0] === '/api/analysis/run') {
      const result = await processNextAnalysis({ syncOptions, environment: analysisEnvironment });
      response.writeHead(result.code === 'not_configured' ? 503 : 200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      response.end(JSON.stringify(result));
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405).end('Method not allowed');
      return;
    }
    const filename = safeLocalPath(request.url || '/');
    if (!filename) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    const fileStat = await stat(filename);
    if (!fileStat.isFile()) throw Object.assign(new Error('Not found'), { code: 'ENOENT' });
    response.writeHead(200, { 'content-type': mimeTypes.get(path.extname(filename).toLowerCase()) || 'application/octet-stream' });
    if (request.method === 'HEAD') response.end();
    else createReadStream(filename).pipe(response);
  } catch (error) {
    response.writeHead(error.code === 'ENOENT' ? 404 : 500, { 'content-type': 'text/plain; charset=utf-8' });
    response.end(error.code === 'ENOENT' ? 'Not found' : 'Local service error');
  }
});

server.listen(port, '127.0.0.1', () => {
  const database = openAssetDatabase(syncOptions.databasePath);
  recoverInterruptedAnalyses(database);
  database.close();
  console.log(`Asset library service: http://127.0.0.1:${port}/desktop-prototype/`);
  if (getAnalysisConfiguration(analysisEnvironment).autoAnalyze) {
    processAnalysisQueue({ syncOptions, environment: analysisEnvironment }).then((results) => {
      console.log(`Automatic analysis processed ${results.length} asset(s)`);
    }).catch((error) => console.error(`Automatic analysis paused: ${error.message}`));
  }
});

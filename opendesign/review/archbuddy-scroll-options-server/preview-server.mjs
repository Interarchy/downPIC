import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
const root = await fsp.realpath('F:/MelyAI-CODEX/downPIC-plugin/opendesign');
const mime = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2','.zip':'application/zip','.7z':'application/x-7z-compressed'};
function inRoot(file) { const relative = path.relative(root,file); return !relative.startsWith('..') && !path.isAbsolute(relative); }
const server = http.createServer(async (req,res) => {
  if (!['GET','HEAD'].includes(req.method)) {res.writeHead(405,{'Allow':'GET, HEAD'});res.end();return;}
  try {
    const pathname = decodeURIComponent(new URL(req.url,'http://127.0.0.1:8766').pathname);
    let file = path.resolve(root,'.'+pathname);
    if (!inRoot(file)) {res.writeHead(403);res.end('Forbidden');return;}
    let stats = await fsp.stat(file);
    if (stats.isDirectory()) {file = path.join(file,'index.html');stats = await fsp.stat(file);}
    file = await fsp.realpath(file);
    if (!inRoot(file) || !stats.isFile()) {res.writeHead(403);res.end('Forbidden');return;}
    res.writeHead(200,{'Content-Type':mime[path.extname(file).toLowerCase()] || 'application/octet-stream','Content-Length':stats.size,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    if (req.method === 'HEAD') {res.end();return;}
    fs.createReadStream(file).on('error',() => res.destroy()).pipe(res);
  } catch (error) {
    res.writeHead(['ENOENT','ENOTDIR'].includes(error.code) ? 404 : 400,{'Content-Type':'text/plain; charset=utf-8'});res.end('Not found');
  }
});
server.on('error',error => {console.error(error);process.exit(1);});
server.listen(8766,'127.0.0.1',() => console.log(JSON.stringify({pid:process.pid,root,address:'127.0.0.1',port:8766,startedAt:new Date().toISOString()})));

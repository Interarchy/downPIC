import http from "node:http";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = await realpath(path.dirname(fileURLToPath(import.meta.url)));
const host = "127.0.0.1";
const preferredPort = Number(process.env.ARCHBUDDY_PREVIEW_PORT || 8766);
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

function insideRoot(target) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

const server = http.createServer(async (request, response) => {
  const reply = (status, message) => {
    response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(request.method === "HEAD" ? undefined : message);
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.setHeader("Allow", "GET, HEAD");
    return reply(405, "仅支持读取预览文件。");
  }
  let pathname;
  try {
    pathname = decodeURIComponent((request.url || "/").split("?")[0]);
  } catch {
    return reply(400, "路径格式无效。");
  }
  if (!pathname.startsWith("/") || pathname.includes("\\") || pathname.includes("\0") || pathname.split("/").includes("..")) {
    return reply(403, "仅可读取本地演示目录。");
  }
  let target = path.resolve(root, `.${pathname}`);
  if (!insideRoot(target)) return reply(403, "仅可读取本地演示目录。");
  try {
    if ((await stat(target)).isDirectory()) target = path.join(target, "index.html");
    target = await realpath(target);
    if (!insideRoot(target)) return reply(403, "仅可读取本地演示目录。");
    const content = await readFile(target);
    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(target).toLowerCase()] || "application/octet-stream",
      "Content-Length": content.length,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(request.method === "HEAD" ? undefined : content);
  } catch (error) {
    return reply(error.code === "ENOENT" || error.code === "ENOTDIR" ? 404 : 500, "无法读取此预览文件。");
  }
});

let port = preferredPort;
server.on("error", (error) => {
  if (error.code === "EADDRINUSE" && port < preferredPort + 5) {
    port += 1;
    server.listen(port, host);
  } else {
    console.error(error.message);
    process.exitCode = 1;
  }
});
server.listen(port, host);
server.on("listening", () => console.log(`ArchBuddy 本地演示：http://${host}:${port}/`));

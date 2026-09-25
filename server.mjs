import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 5174);
const HOST = process.env.HOST || "127.0.0.1";
const DATA_DIR = path.join(ROOT, "data");
const STATE_FILE = path.join(DATA_DIR, "sync-state.json");
const MAX_BODY_SIZE = 2 * 1024 * 1024;
const clients = new Map();
const STATIC_FILES = new Set([
  "index.html",
  "style.css",
  "phrases.js",
  "app.js",
  "sw.js",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
]);

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

function emptyState() {
  return {
    app: "kotoba-karute",
    version: 2,
    updatedAt: new Date(0).toISOString(),
    revision: 0,
    knowledge: {},
    bookmarks: {},
    settings: { detailFontLarge: false },
  };
}

async function readState() {
  try {
    return JSON.parse(await fs.readFile(STATE_FILE, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return emptyState();
  }
}

function cleanRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value));
}

async function writeState(payload) {
  const previous = await readState();
  const next = {
    app: "kotoba-karute",
    version: 2,
    updatedAt: new Date().toISOString(),
    revision: Number(previous.revision || 0) + 1,
    knowledge: cleanRecord(payload.knowledge),
    bookmarks: cleanRecord(payload.bookmarks),
    settings: { detailFontLarge: Boolean(payload.settings?.detailFontLarge) },
  };
  await fs.mkdir(DATA_DIR, { recursive: true });
  const temporary = `${STATE_FILE}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  await fs.rename(temporary, STATE_FILE);
  return next;
}

function sendJson(response, status, value) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_SIZE) throw new Error("payload too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function broadcast(state, sourceClientId) {
  const message = `data: ${JSON.stringify({ revision: state.revision, updatedAt: state.updatedAt })}\n\n`;
  for (const [clientId, response] of clients) {
    if (clientId !== sourceClientId) response.write(message);
  }
}

async function serveFile(requestUrl, response) {
  const pathname = decodeURIComponent(requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname);
  const relative = pathname.replace(/^\/+/, "");
  if (!STATIC_FILES.has(relative)) {
    response.writeHead(404).end("Not found");
    return;
  }
  const filePath = path.resolve(ROOT, relative);
  if (!filePath.startsWith(`${ROOT}${path.sep}`)) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) throw Object.assign(new Error("not a file"), { code: "ENOENT" });
    const content = await fs.readFile(filePath);
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": pathname === "/index.html" ? "no-cache" : "public, max-age=300",
    });
    response.end(content);
  } catch (error) {
    response.writeHead(error.code === "ENOENT" ? 404 : 500).end("Not found");
  }
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  try {
    if (requestUrl.pathname === "/api/state" && request.method === "GET") {
      sendJson(response, 200, await readState());
      return;
    }
    if (requestUrl.pathname === "/api/state" && request.method === "PUT") {
      const payload = await readJson(request);
      if (payload.app !== "kotoba-karute") {
        sendJson(response, 400, { error: "invalid app" });
        return;
      }
      const next = await writeState(payload);
      broadcast(next, String(payload.clientId || ""));
      sendJson(response, 200, next);
      return;
    }
    if (requestUrl.pathname === "/api/events" && request.method === "GET") {
      const clientId = requestUrl.searchParams.get("clientId") || crypto.randomUUID();
      response.writeHead(200, {
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "Content-Type": "text/event-stream",
      });
      response.write(": connected\n\n");
      clients.set(clientId, response);
      request.on("close", () => clients.delete(clientId));
      return;
    }
    if (request.method === "GET" || request.method === "HEAD") {
      await serveFile(requestUrl, response);
      return;
    }
    response.writeHead(405).end("Method not allowed");
  } catch (error) {
    sendJson(response, error.message === "payload too large" ? 413 : 500, { error: error.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`ことばカルテ: http://${HOST}:${PORT}`);
});

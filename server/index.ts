import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { resolve } from "node:path";
import { Readable } from "node:stream";
import { appFetch } from "../src/index.js";
import { sweepExpired } from "../src/retention.js";
import { LocalFileStorage } from "../src/storage-fs.js";

const PORT = Number(process.env.PORT) || 3000;
const AUTH_TOKEN = process.env.AUTH_TOKEN || "";
const dataDir = resolve(process.env.DATA_DIR || "./data");
const demoMode = process.env.DEMO_MODE === "1";
const retentionDays = process.env.RETENTION_DAYS === undefined ? 30 : Number(process.env.RETENTION_DAYS);

if (!AUTH_TOKEN) {
  console.error("AUTH_TOKEN is required. Generate one with: openssl rand -hex 24");
  process.exit(1);
}
if (!Number.isFinite(retentionDays) || retentionDays < 0) {
  console.error(`RETENTION_DAYS must be a non-negative number, got ${JSON.stringify(process.env.RETENTION_DAYS)}`);
  process.exit(1);
}

const ctx = {
  storage: new LocalFileStorage(dataDir),
  authToken: AUTH_TOKEN,
  demoMode,
};

// Raw multipart bodies are buffered before handing the request to the app; the
// app itself caps an item at 25 MB, this only bounds the wire representation.
const MAX_RAW_BODY_BYTES = 32 * 1024 * 1024;

function requestUrl(req: IncomingMessage): string {
  if (req.url && /^https?:\/\//.test(req.url)) return req.url;
  return `http://${req.headers.host || `127.0.0.1:${PORT}`}${req.url || "/"}`;
}

async function readBody(req: IncomingMessage): Promise<Buffer | "too-large"> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    size += buf.length;
    if (size > MAX_RAW_BODY_BYTES) return "too-large";
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = req.method === "GET" || req.method === "HEAD" ? Buffer.alloc(0) : await readBody(req);
  if (body === "too-large") {
    res.writeHead(413, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "payload too large" }));
    return;
  }
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined || name === "transfer-encoding" || name === "connection" || name === "content-length") continue;
    headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }
  const hasBody = body.length > 0;
  const request = new Request(requestUrl(req), {
    method: req.method,
    headers,
    ...(hasBody ? { body } : {}),
  });
  const response = await appFetch(request, ctx);
  const outHeaders: Record<string, string> = {};
  response.headers.forEach((value, name) => {
    if (name === "transfer-encoding" || name === "connection") return;
    outHeaders[name] = value;
  });
  res.writeHead(response.status, outHeaders);
  if (!response.body || req.method === "HEAD") {
    res.end();
    return;
  }
  const stream = Readable.fromWeb(response.body);
  stream.on("error", () => res.destroy());
  stream.pipe(res);
}

const server = createServer((req, res) => {
  handle(req, res).catch((error) => {
    console.error("request failed:", error);
    if (!res.headersSent) res.writeHead(500, { "content-type": "application/json" });
    if (!res.writableEnded) res.end(JSON.stringify({ error: "internal server error" }));
  });
});

const sweep = async (): Promise<void> => {
  try {
    const removed = await sweepExpired(ctx, retentionDays);
    if (removed > 0) console.log(`retention: removed ${removed} expired item(s)`);
  } catch (error) {
    console.error("retention sweep failed:", error);
  }
};

await sweep();
const sweepTimer = setInterval(() => void sweep(), 3600_000);
sweepTimer.unref();

server.listen(PORT, () => {
  console.log(`shotsync listening on http://127.0.0.1:${PORT} (data dir: ${dataDir})`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    clearInterval(sweepTimer);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}

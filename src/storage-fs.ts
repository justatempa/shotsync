import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, sep } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ListedObject, ListResult, PutOptions, Storage, StoredObject } from "./storage.js";

const META_SUFFIX = ".meta.json";

interface Sidecar {
  contentType: string;
  metadata: Record<string, string>;
}

// Keys become relative file paths below root, so anything that could escape it
// is invalid. R2 treated keys as opaque strings (no traversal risk); the fs
// backend must enforce the boundary itself since ids arrive from URL paths.
// Reads treat an invalid key as "not there" so handlers keep their 404/no-op
// contracts without extra catch layers; writes throw (they are internal calls
// built from validated parts, so an invalid one is a programming error).
function isSafeKey(key: string): boolean {
  return !!key && !key.includes("..") && !key.includes("\\") && !key.includes("\0") && !key.startsWith("/") && !key.includes("//");
}

async function readSidecar(path: string): Promise<Sidecar> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    if (parsed && typeof parsed === "object") {
      const { contentType, metadata } = parsed as { contentType?: unknown; metadata?: unknown };
      if (typeof contentType === "string") {
        return {
          contentType,
          metadata: metadata && typeof metadata === "object" && !Array.isArray(metadata)
            ? Object.fromEntries(Object.entries(metadata as Record<string, unknown>).filter(([, v]) => typeof v === "string") as [string, string][])
            : {},
        };
      }
    }
  } catch {
    // Missing or corrupt sidecar: fall through to defaults (e.g. a file someone
    // dropped into the pool directory by hand).
  }
  return { contentType: "application/octet-stream", metadata: {} };
}

export class LocalFileStorage implements Storage {
  constructor(private root: string) {}

  private pathFor(key: string): string | null {
    if (!isSafeKey(key)) return null;
    return join(this.root, key.split("/").join(sep));
  }

  async put(key: string, data: ReadableStream | Uint8Array, opts: PutOptions): Promise<void> {
    const target = this.pathFor(key);
    if (!target) throw new Error(`unsafe storage key: ${JSON.stringify(key)}`);
    await mkdir(dirname(target), { recursive: true });
    const tmp = `${target}.tmp-${process.pid}`;
    try {
      if (data instanceof Uint8Array) await writeFile(tmp, data);
      else await pipeline(Readable.fromWeb(data), createWriteStream(tmp));
      await rename(tmp, target);
    } finally {
      await rm(tmp, { force: true }).catch(() => {});
    }
    await writeFile(target + META_SUFFIX, JSON.stringify({ contentType: opts.contentType, metadata: opts.metadata ?? {} } satisfies Sidecar));
  }

  async get(key: string): Promise<StoredObject | null> {
    const target = this.pathFor(key);
    if (!target) return null;
    let info;
    try {
      info = await stat(target);
    } catch {
      return null;
    }
    if (!info.isFile()) return null;
    const { contentType, metadata } = await readSidecar(target + META_SUFFIX);
    return {
      key,
      contentType,
      size: info.size,
      metadata,
      body: Readable.toWeb(createReadStream(target)) as ReadableStream,
      text: () => readFile(target, "utf8"),
    };
  }

  async delete(keys: string[]): Promise<void> {
    for (const key of keys) {
      const target = this.pathFor(key);
      if (!target) continue;
      await rm(target, { force: true });
      await rm(target + META_SUFFIX, { force: true });
    }
  }

  async list({ prefix, limit, cursor }: { prefix: string; limit: number; cursor?: string }): Promise<ListResult> {
    const dir = this.pathFor(prefix.replace(/\/$/, ""));
    if (!dir) return { objects: [], truncated: false, cursor: null };
    let names: string[] = [];
    try {
      names = await readdir(dir);
    } catch {
      return { objects: [], truncated: false, cursor: null };
    }
    const keys = names.filter((n) => !n.endsWith(META_SUFFIX) && !n.includes(".tmp-")).sort().map((n) => prefix + n);
    const offset = cursor ? Number.parseInt(cursor, 10) || 0 : 0;
    const page = keys.slice(offset, offset + limit);
    const objects: ListedObject[] = await Promise.all(
      page.map(async (key) => {
        const { contentType, metadata } = await readSidecar(this.pathFor(key) + META_SUFFIX);
        return { key, contentType, metadata };
      })
    );
    const next = offset + page.length;
    return { objects, truncated: next < keys.length, cursor: next < keys.length ? String(next) : null };
  }
}

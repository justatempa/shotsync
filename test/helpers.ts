import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach } from "vitest";
import type { AppContext } from "../src/responses.js";
import { LocalFileStorage } from "../src/storage-fs.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

// Fresh pool per call: temp dir + local file storage + the same test token the
// old Miniflare bindings used. Replaces the isolated `env` from cloudflare:test.
export async function makeCtx(overrides: Partial<AppContext> = {}): Promise<AppContext> {
  const dir = await mkdtemp(join(tmpdir(), "shotsync-test-"));
  tempDirs.push(dir);
  return { storage: new LocalFileStorage(dir), authToken: "test-token", demoMode: false, ...overrides };
}

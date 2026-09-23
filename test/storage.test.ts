import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalFileStorage } from "../src/storage-fs.js";

const tempDirs: string[] = [];
afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makeStorage(): Promise<LocalFileStorage> {
  const dir = await mkdtemp(join(tmpdir(), "shotsync-storage-"));
  tempDirs.push(dir);
  return new LocalFileStorage(dir);
}

describe("LocalFileStorage", () => {
  it("put/get round-trips bytes, content type and metadata", async () => {
    const s = await makeStorage();
    await s.put("full/a.png", new Uint8Array([1, 2, 3]), {
      contentType: "image/png",
      metadata: { source: "mac", hasThumb: "false" },
    });
    const obj = await s.get("full/a.png");
    expect(obj).not.toBeNull();
    expect(obj!.key).toBe("full/a.png");
    expect(obj!.contentType).toBe("image/png");
    expect(obj!.size).toBe(3);
    expect(obj!.metadata).toEqual({ source: "mac", hasThumb: "false" });
    expect(new Uint8Array(await new Response(obj!.body).arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("text() returns the stored utf-8 content", async () => {
    const s = await makeStorage();
    await s.put("full/note.txt", new TextEncoder().encode("你好 cross-device"), { contentType: "text/plain" });
    expect(await (await s.get("full/note.txt"))!.text()).toBe("你好 cross-device");
  });

  it("get returns null for missing keys and delete is idempotent", async () => {
    const s = await makeStorage();
    expect(await s.get("full/ghost.png")).toBeNull();
    await s.put("full/a.png", new Uint8Array([1]), { contentType: "image/png" });
    await s.delete(["full/a.png", "thumb/a.jpg"]);
    await s.delete(["full/a.png"]);
    expect(await s.get("full/a.png")).toBeNull();
  });

  it("delete removes the metadata sidecar too", async () => {
    const s = await makeStorage();
    await s.put("full/a.png", new Uint8Array([1]), { contentType: "image/png", metadata: { source: "x" } });
    await s.delete(["full/a.png"]);
    const again = await s.get("full/a.png");
    expect(again).toBeNull();
  });

  it("list sorts keys, paginates with offset cursors and survives the roundtrip", async () => {
    const s = await makeStorage();
    for (let i = 0; i < 5; i++) {
      await s.put(`full/k${i}.png`, new Uint8Array([i]), { contentType: "image/png", metadata: { n: String(i) } });
    }
    const page1 = await s.list({ prefix: "full/", limit: 2 });
    expect(page1.objects.map((o) => o.key)).toEqual(["full/k0.png", "full/k1.png"]);
    expect(page1.truncated).toBe(true);
    expect(page1.cursor).toBe("2");
    const page2 = await s.list({ prefix: "full/", limit: 2, cursor: page1.cursor! });
    expect(page2.objects.map((o) => o.key)).toEqual(["full/k2.png", "full/k3.png"]);
    const page3 = await s.list({ prefix: "full/", limit: 2, cursor: page2.cursor! });
    expect(page3.objects.map((o) => o.key)).toEqual(["full/k4.png"]);
    expect(page3.truncated).toBe(false);
    expect(page3.cursor).toBeNull();
    expect(page3.objects[0].metadata).toEqual({ n: "4" });
  });

  it("list on a missing prefix returns empty instead of throwing", async () => {
    const s = await makeStorage();
    expect(await s.list({ prefix: "nope/", limit: 10 })).toEqual({ objects: [], truncated: false, cursor: null });
  });

  it("list skips sidecar files and in-flight tmp writes", async () => {
    const s = await makeStorage();
    await s.put("full/a.png", new Uint8Array([1]), { contentType: "image/png" });
    expect((await s.list({ prefix: "full/", limit: 10 })).objects.map((o) => o.key)).toEqual(["full/a.png"]);
  });

  it("neutralizes path-traversal keys", async () => {
    const s = await makeStorage();
    // Writes are internal calls built from validated parts: an unsafe key is a bug.
    await expect(s.put("../evil.png", new Uint8Array([1]), { contentType: "image/png" })).rejects.toThrow();
    // Reads keep the handler contracts: not found / empty / no-op.
    expect(await s.get("full/../../etc/passwd")).toBeNull();
    expect(await s.list({ prefix: "../", limit: 10 })).toEqual({ objects: [], truncated: false, cursor: null });
    await s.delete(["../evil.png", "full/../../x"]);
  });
});

import { describe, it, expect } from "vitest";
import { appFetch } from "../src/index.js";
import { handleDelete } from "../src/handlers/del.js";
import { handleImage } from "../src/handlers/image.js";
import { handleList } from "../src/handlers/list.js";
import { handleUpload } from "../src/handlers/upload.js";
import { fullKey, makeId } from "../src/ids.js";
import type { AppContext } from "../src/responses.js";
import { makeCtx } from "./helpers.js";

async function seedOne(ctx: AppContext): Promise<string> {
  const id = makeId(1000, "aaaa1");
  await ctx.storage.put(fullKey(id, "png"), new Uint8Array([1]), {
    contentType: "image/png",
    metadata: { hasThumb: "false", source: "mac", uploadedAt: "x", origName: "" },
  });
  return id;
}

describe("demo mode", () => {
  it("list is public in demo mode", async () => {
    const ctx = await makeCtx({ demoMode: true });
    await seedOne(ctx);
    const res = await handleList(new Request("https://x/api/list"), ctx);
    expect(res.status).toBe(200);
    const body = ((await res.json()) as { items: unknown[] });
    expect(body.items.length).toBe(1);
  });

  it("image view is public in demo mode", async () => {
    const ctx = await makeCtx({ demoMode: true });
    const id = await seedOne(ctx);
    const res = await handleImage(new Request(`https://x/i/${id}`), ctx, id);
    expect(res.status).toBe(200);
    await res.arrayBuffer(); // drain the body stream
  });

  it("upload still requires token in demo mode", async () => {
    const res = await handleUpload(
      new Request("https://x/api/upload", { method: "POST" }),
      await makeCtx({ demoMode: true }),
    );
    expect(res.status).toBe(401);
  });

  it("delete still requires token in demo mode", async () => {
    const ctx = await makeCtx({ demoMode: true });
    const id = await seedOne(ctx);
    const res = await handleDelete(
      new Request(`https://x/api/img/${id}`, { method: "DELETE" }),
      ctx,
      id,
    );
    expect(res.status).toBe(401);
  });

  it("list stays gated in normal mode", async () => {
    const res = await handleList(new Request("https://x/api/list"), await makeCtx());
    expect(res.status).toBe(401);
  });

  // Guards the string-replace marker: if the `const DEMO = false` line in
  // gallery/page.ts ever drifts, replace() silently no-ops and the demo
  // frontend ships with the token gate still on. Assert the served HTML.
  it("gallery HTML has the demo flag flipped in demo mode", async () => {
    const res = await appFetch(new Request("https://x/"), await makeCtx({ demoMode: true }));
    const html = await res.text();
    expect(html).toContain("const DEMO = true");
  });

  it("gallery HTML keeps the flag off in normal mode", async () => {
    const res = await appFetch(new Request("https://x/"), await makeCtx());
    const html = await res.text();
    expect(html).toContain("const DEMO = false");
  });
});

import { describe, it, expect } from "vitest";
import { handleImage } from "../src/handlers/image.js";
import { fullKey, thumbKey } from "../src/ids.js";
import type { AppContext } from "../src/responses.js";
import { makeCtx } from "./helpers.js";

async function put(ctx: AppContext, key: string, type: string, bytes: number[]) {
  await ctx.storage.put(key, new Uint8Array(bytes), { contentType: type });
}
function req(size?: string, token = "test-token"): Request {
  const qs = size ? `?size=${size}` : "";
  return new Request(`https://x/i/ID${qs}`, { headers: { authorization: `Bearer ${token}` } });
}

describe("handleImage", () => {
  it("401 without token", async () => {
    const res = await handleImage(new Request("https://x/i/ID"), await makeCtx(), "ID");
    expect(res.status).toBe(401);
  });

  it("404 when nothing stored", async () => {
    const res = await handleImage(req(), await makeCtx(), "ID");
    expect(res.status).toBe(404);
  });

  it("serves full with content-type + cache header", async () => {
    const ctx = await makeCtx();
    await put(ctx, fullKey("ID", "png"), "image/png", [1, 2, 3]);
    const res = await handleImage(req(), ctx, "ID");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toContain("max-age=31536000");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("serves thumb when size=thumb and thumb exists", async () => {
    const ctx = await makeCtx();
    await put(ctx, fullKey("ID", "png"), "image/png", [1, 2, 3]);
    await put(ctx, thumbKey("ID"), "image/jpeg", [9, 9]);
    const res = await handleImage(req("thumb"), ctx, "ID");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([9, 9]));
  });

  it("falls back to full when size=thumb but no thumb", async () => {
    const ctx = await makeCtx();
    await put(ctx, fullKey("ID", "jpg"), "image/jpeg", [7]);
    const res = await handleImage(req("thumb"), ctx, "ID");
    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([7]));
  });

  it("refuses path-traversal ids instead of touching files outside the pool", async () => {
    const ctx = await makeCtx();
    const res = await handleImage(req(), ctx, "../../escape");
    expect(res.status).toBe(404);
  });
});

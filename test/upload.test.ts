import { describe, it, expect } from "vitest";
import { handleUpload } from "../src/handlers/upload.js";
import { makeCtx } from "./helpers.js";

function uploadReq(opts: { token?: string; full?: Blob; thumb?: Blob; source?: string }): Request {
  const fd = new FormData();
  if (opts.full) fd.set("full", opts.full, "shot.png");
  if (opts.thumb) fd.set("thumb", opts.thumb, "shot.jpg");
  const headers: Record<string, string> = {};
  if (opts.token) headers["authorization"] = `Bearer ${opts.token}`;
  if (opts.source) headers["x-source"] = opts.source;
  return new Request("https://x/api/upload", { method: "POST", headers, body: fd });
}

const png = () => new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
const jpg = () => new Blob([new Uint8Array([4, 5])], { type: "image/jpeg" });

describe("handleUpload", () => {
  it("401 without token", async () => {
    const res = await handleUpload(uploadReq({ full: png() }), await makeCtx());
    expect(res.status).toBe(401);
  });

  it("400 without full field", async () => {
    const res = await handleUpload(uploadReq({ token: "test-token" }), await makeCtx());
    expect(res.status).toBe(400);
  });

  it("415 for non-web-safe full type", async () => {
    const heic = new Blob([new Uint8Array([9])], { type: "image/heic" });
    const res = await handleUpload(uploadReq({ token: "test-token", full: heic }), await makeCtx());
    expect(res.status).toBe(415);
  });

  it("stores full, returns id, hasThumb=false when no thumb", async () => {
    const ctx = await makeCtx();
    const res = await handleUpload(uploadReq({ token: "test-token", full: png(), source: "pwa" }), ctx);
    expect(res.status).toBe(200);
    const { id } = ((await res.json()) as { id: string });
    expect(id).toMatch(/^\d{16}-[0-9a-z]{6}$/);
    const obj = await ctx.storage.get(`full/${id}.png`);
    expect(obj).not.toBeNull();
    expect(obj!.metadata?.hasThumb).toBe("false");
    expect(obj!.metadata?.source).toBe("pwa");
    // Consume the stream to avoid cleanup issues
    await obj!.body.cancel();
  });

  it("stores thumb too when provided", async () => {
    const ctx = await makeCtx();
    const res = await handleUpload(uploadReq({ token: "test-token", full: png(), thumb: jpg() }), ctx);
    const { id } = ((await res.json()) as { id: string });
    const thumb = await ctx.storage.get(`thumb/${id}.jpg`);
    expect(thumb).not.toBeNull();
    await thumb!.body.cancel();
    const full = await ctx.storage.get(`full/${id}.png`);
    expect(full!.metadata?.hasThumb).toBe("true");
    // Consume the stream to avoid cleanup issues
    await full!.body.cancel();
  });
});

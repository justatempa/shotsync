import { describe, it, expect } from "vitest";
import { handleDelete } from "../src/handlers/del.js";
import { fullKey, thumbKey } from "../src/ids.js";
import { makeCtx } from "./helpers.js";

function req(token = "test-token"): Request {
  return new Request("https://x/api/img/ID", { method: "DELETE", headers: { authorization: `Bearer ${token}` } });
}

describe("handleDelete", () => {
  it("401 without token", async () => {
    const res = await handleDelete(new Request("https://x/api/img/ID", { method: "DELETE" }), await makeCtx(), "ID");
    expect(res.status).toBe(401);
  });

  it("deletes both full and thumb objects", async () => {
    const ctx = await makeCtx();
    await ctx.storage.put(fullKey("ID", "png"), new Uint8Array([1]), { contentType: "image/png" });
    await ctx.storage.put(thumbKey("ID"), new Uint8Array([2]), { contentType: "image/jpeg" });
    const res = await handleDelete(req(), ctx, "ID");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: true });
    expect(await ctx.storage.get(fullKey("ID", "png"))).toBeNull();
    expect(await ctx.storage.get(thumbKey("ID"))).toBeNull();
  });

  it("idempotent when nothing exists", async () => {
    const res = await handleDelete(req(), await makeCtx(), "GHOST");
    expect(res.status).toBe(200);
  });

  it("treats path-traversal ids as a no-op (nothing outside the pool is touched)", async () => {
    const ctx = await makeCtx();
    const res = await handleDelete(req(), ctx, "../../escape");
    expect(res.status).toBe(200);
    expect((await ctx.storage.list({ prefix: "", limit: 10 })).objects).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { fullKey, makeId, thumbKey } from "../src/ids.js";
import { sweepExpired } from "../src/retention.js";
import { makeCtx } from "./helpers.js";

const DAY = 24 * 3600 * 1000;

describe("sweepExpired", () => {
  it("removes full+thumb for items older than the retention window", async () => {
    const ctx = await makeCtx();
    const old = makeId(Date.now() - 40 * DAY, "aaaaaa");
    const fresh = makeId(Date.now() - 1 * DAY, "bbbbbb");
    await ctx.storage.put(fullKey(old, "png"), new Uint8Array([1]), { contentType: "image/png" });
    await ctx.storage.put(thumbKey(old), new Uint8Array([2]), { contentType: "image/jpeg" });
    await ctx.storage.put(fullKey(fresh, "png"), new Uint8Array([3]), { contentType: "image/png" });

    expect(await sweepExpired(ctx, 30)).toBe(1);
    expect(await ctx.storage.get(fullKey(old, "png"))).toBeNull();
    expect(await ctx.storage.get(thumbKey(old))).toBeNull();
    expect(await ctx.storage.get(fullKey(fresh, "png"))).not.toBeNull();
  });

  it("respects `now` so the window math is deterministic", async () => {
    const ctx = await makeCtx();
    const id = makeId(1000, "cccccc");
    await ctx.storage.put(fullKey(id, "txt"), new Uint8Array([1]), { contentType: "text/plain" });
    expect(await sweepExpired(ctx, 30, 1000 + 29 * DAY)).toBe(0);
    expect(await sweepExpired(ctx, 30, 1000 + 31 * DAY)).toBe(1);
  });

  it("does nothing when retention is disabled", async () => {
    const ctx = await makeCtx();
    const old = makeId(1000, "dddddd");
    await ctx.storage.put(fullKey(old, "png"), new Uint8Array([1]), { contentType: "image/png" });
    expect(await sweepExpired(ctx, 0, Date.now())).toBe(0);
    expect(await ctx.storage.get(fullKey(old, "png"))).not.toBeNull();
  });

  it("skips files whose names do not decode to a timestamp (e.g. manual drops)", async () => {
    const ctx = await makeCtx();
    await ctx.storage.put("full/random.png", new Uint8Array([1]), { contentType: "image/png" });
    expect(await sweepExpired(ctx, 30, Date.now())).toBe(0);
    expect(await ctx.storage.get("full/random.png")).not.toBeNull();
  });
});

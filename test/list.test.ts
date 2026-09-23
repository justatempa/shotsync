import { describe, it, expect } from "vitest";
import { handleList } from "../src/handlers/list.js";
import { fullKey, makeId } from "../src/ids.js";
import type { AppContext } from "../src/responses.js";
import { makeCtx } from "./helpers.js";

async function seed(ctx: AppContext, epochMs: number, hasThumb: string) {
  const id = makeId(epochMs, "aaaaa" + (epochMs % 10));
  await ctx.storage.put(fullKey(id, "png"), new Uint8Array([1]), {
    contentType: "image/png",
    metadata: { hasThumb, source: "mac", uploadedAt: "x", origName: "" },
  });
  return id;
}

function listReq(qs = "", token = "test-token"): Request {
  return new Request(`https://x/api/list${qs}`, { headers: { authorization: `Bearer ${token}` } });
}

describe("handleList", () => {
  it("401 without token", async () => {
    const res = await handleList(new Request("https://x/api/list"), await makeCtx());
    expect(res.status).toBe(401);
  });

  it("returns items newest-first with metadata", async () => {
    const ctx = await makeCtx();
    await seed(ctx, 1000, "false");
    await seed(ctx, 3000, "true");
    await seed(ctx, 2000, "false");
    const res = await handleList(listReq(), ctx);
    const body = ((await res.json()) as { items: any[]; cursor: string | null });
    const times = body.items.map((i) => i.time);
    expect(times).toEqual([3000, 2000, 1000]); // reversed order
    const newest = body.items[0];
    expect(newest.hasThumb).toBe(true);
    expect(newest.contentType).toBe("image/png");
    expect(newest.source).toBe("mac");
  });

  it("respects limit and returns cursor", async () => {
    const ctx = await makeCtx();
    await seed(ctx, 1000, "false");
    await seed(ctx, 2000, "false");
    await seed(ctx, 3000, "false");
    const res = await handleList(listReq("?limit=2"), ctx);
    const body = ((await res.json()) as { items: any[]; cursor: string | null });
    expect(body.items.length).toBe(2);
    expect(body.cursor).toBeTruthy();
  });
});

// The gallery used to render every text card as "…" and then fetch each one
// separately. On the live demo pool that left four cards visibly empty from
// 1.8s (list resolved) until 3.6s (last fetch landed). The snippet now travels
// with the list, so these tests pin the three properties that make that safe.
describe("handleList: inline text snippets", () => {
  async function seedText(ctx: AppContext, epochMs: number, body: string) {
    const id = makeId(epochMs, "t" + (epochMs % 10000));
    await ctx.storage.put(fullKey(id, "txt"), new TextEncoder().encode(body), {
      contentType: "text/plain",
      metadata: { hasThumb: "false", source: "mac", uploadedAt: "x", origName: "" },
    });
    return id;
  }

  it("carries a text item's preview so the card needs no follow-up request", async () => {
    const ctx = await makeCtx();
    await seedText(ctx, 1_700_000_000_000, "会议室改到 3F-北，14:00 见");
    const body = (await (await handleList(listReq(), ctx)).json()) as {
      items: { contentType: string; snippet?: string }[];
    };
    const text = body.items.find(i => i.contentType.startsWith("text/"))!;
    expect(text.snippet).toBe("会议室改到 3F-北，14:00 见");
  });

  it("truncates to the same length the client used to slice to", async () => {
    const ctx = await makeCtx();
    await seedText(ctx, 1_700_000_001_000, "x".repeat(400));
    const body = (await (await handleList(listReq(), ctx)).json()) as {
      items: { snippet?: string }[];
    };
    expect(body.items.find(i => i.snippet)!.snippet).toHaveLength(140);
  });

  it("leaves image items alone — no snippet, and their bodies are never read", async () => {
    const ctx = await makeCtx();
    await seed(ctx, 1_700_000_002_000, "true");
    const body = (await (await handleList(listReq(), ctx)).json()) as {
      items: { contentType: string; snippet?: string }[];
    };
    const img = body.items.find(i => i.contentType.startsWith("image/"))!;
    expect(img.snippet).toBeUndefined();
  });

  it("never leaks the internal storage key, which only exists to read the snippet", async () => {
    const ctx = await makeCtx();
    await seedText(ctx, 1_700_000_003_000, "hi");
    const raw = await (await handleList(listReq(), ctx)).text();
    expect(raw).not.toContain("full/");
    expect(JSON.parse(raw).items.every((i: Record<string, unknown>) => !("key" in i))).toBe(true);
  });

  it("inlines at most MAX_INLINE_SNIPPETS, leaving the rest for the client", async () => {
    // A pool that is all text must not turn one list call into `limit` reads.
    const ctx = await makeCtx();
    for (let i = 0; i < 25; i++) await seedText(ctx, 1_700_000_100_000 + i * 1000, "line " + i);
    const body = (await (await handleList(listReq("?limit=40"), ctx)).json()) as {
      items: { contentType: string; snippet?: string }[];
    };
    const texts = body.items.filter(i => i.contentType.startsWith("text/"));
    expect(texts.length).toBe(25);
    expect(texts.filter(i => i.snippet !== undefined).length).toBe(20);
  });
});

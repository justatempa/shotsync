import { describe, it, expect } from "vitest";
import { appFetch } from "../src/index.js";
import { makeCtx } from "./helpers.js";

const T = { authorization: "Bearer test-token" };

describe("routing end-to-end", () => {
  it("GET / returns html", async () => {
    const res = await appFetch(new Request("https://x/"), await makeCtx());
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  it("upload -> list -> image -> delete full cycle", async () => {
    const ctx = await makeCtx();
    const fd = new FormData();
    fd.set("full", new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }), "s.png");
    const up = await appFetch(new Request("https://x/api/upload", { method: "POST", headers: T, body: fd }), ctx);
    expect(up.status).toBe(200);
    const { id } = ((await up.json()) as { id: string });

    const list = await appFetch(new Request("https://x/api/list", { headers: T }), ctx);
    const body = ((await list.json()) as { items: any[] });
    expect(body.items.some((i) => i.id === id)).toBe(true);

    const img = await appFetch(new Request(`https://x/i/${id}`, { headers: T }), ctx);
    expect(img.status).toBe(200);
    await img.arrayBuffer();

    const del = await appFetch(new Request(`https://x/api/img/${id}`, { method: "DELETE", headers: T }), ctx);
    expect(del.status).toBe(200);
    await del.json();

    const img2 = await appFetch(new Request(`https://x/i/${id}`, { headers: T }), ctx);
    expect(img2.status).toBe(404);
    await img2.json();
  });

  it("405 on wrong method", async () => {
    const res = await appFetch(new Request("https://x/api/list", { method: "POST", headers: T }), await makeCtx());
    expect(res.status).toBe(405);
  });

  it("401 on missing token for api", async () => {
    const res = await appFetch(new Request("https://x/api/list"), await makeCtx());
    expect(res.status).toBe(401);
  });

  it("unknown path returns 404", async () => {
    const res = await appFetch(new Request("https://x/nope"), await makeCtx());
    expect(res.status).toBe(404);
    await res.json();
  });

  it("serves manifest and sw", async () => {
    const ctx = await makeCtx();
    const mani = await appFetch(new Request("https://x/manifest.webmanifest"), ctx);
    expect(mani.status).toBe(200);
    expect(mani.headers.get("content-type")).toContain("manifest");
    const sw = await appFetch(new Request("https://x/sw.js"), ctx);
    expect(sw.status).toBe(200);
    expect(sw.headers.get("content-type")).toContain("javascript");
  });
});

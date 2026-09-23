import { describe, expect, it } from "vitest";
import { appFetch } from "../src/index.js";
import { makeCtx } from "./helpers.js";

const origin = "https://shotsync.example.com";

describe("public product page", () => {
  it("serves useful content and metadata without executing JavaScript or providing a token", async () => {
    const res = await appFetch(new Request(`${origin}/about`), await makeCtx({ demoMode: true }));
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(res.headers.get("x-robots-tag")).toBeNull();
    expect(html).toContain(`<link rel="canonical" href="${origin}/about">`);
    expect(html).toContain("共享 token");
    expect(html).toContain("由服务器每小时自动清理过期内容");
    expect(html).toContain('href="https://github.com/Defiabell/shotsync"');
    expect(html).not.toContain("test-token");
    const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
    expect(scripts).toHaveLength(1);
    expect(scripts[0][1]).toContain('type="application/ld+json"');
    expect(JSON.parse(scripts[0][2]).url).toBe(`${origin}/about`);
  });

  it("only lists the public product page in the demo sitemap", async () => {
    const ctx = await makeCtx({ demoMode: true });
    const res = await appFetch(new Request(`${origin}/sitemap.xml`), ctx);
    expect(res.headers.get("content-type")).toContain("application/xml");
    const xml = await res.text();
    expect([...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1])).toEqual([`${origin}/about`]);
    const robots = await appFetch(new Request(`${origin}/robots.txt`), ctx);
    expect(robots.headers.get("content-type")).toContain("text/plain");
    const text = await robots.text();
    expect(text).toContain(`Sitemap: ${origin}/sitemap.xml`);
    for (const path of ["/api/", "/i/", "/s/"]) expect(text).toContain(`Disallow: ${path}`);
    expect(text).not.toContain("Disallow: /about");
  });

  it("keeps private instances out of the index and their sitemaps empty", async () => {
    const ctx = await makeCtx();
    const res = await appFetch(new Request("https://private.example/about"), ctx);
    expect(res.headers.get("x-robots-tag")).toBe("noindex, follow");
    await res.text();
    const sitemap = await appFetch(new Request("https://private.example/sitemap.xml"), ctx);
    expect(await sitemap.text()).not.toContain("<loc>");
    const api = await appFetch(new Request("https://private.example/api/list"), ctx);
    expect(api.status).toBe(401);
    await api.text();
  });

  it("preserves the gallery at / with a discoverable product link", async () => {
    for (const demoMode of [false, true]) {
      const res = await appFetch(new Request(`${origin}/`), await makeCtx({ demoMode }));
      const html = await res.text();
      expect(html).toContain('id="grid"');
      expect(html).toContain('href="/about"');
      expect(html).toContain('<meta name="robots" content="noindex, follow">');
    }
  });

  it("normalizes trailing slashes, supports HEAD, and rejects writes", async () => {
    const ctx = await makeCtx({ demoMode: true });
    const redirect = await appFetch(new Request(`${origin}/about/`), ctx);
    expect(redirect.status).toBe(308);
    expect(redirect.headers.get("location")).toBe("/about");
    for (const path of ["/about", "/robots.txt", "/sitemap.xml"]) {
      const head = await appFetch(new Request(`${origin}${path}`, { method: "HEAD" }), ctx);
      expect(head.status).toBe(200);
      expect(await head.text()).toBe("");
      const post = await appFetch(new Request(`${origin}${path}`, { method: "POST" }), ctx);
      expect(post.status).toBe(405);
      await post.text();
    }
  });
});

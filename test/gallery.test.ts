import { describe, it, expect } from "vitest";
import { appFetch } from "../src/index.js";
import { makeCtx } from "./helpers.js";

async function galleryHTML(demoMode: boolean): Promise<string> {
  const res = await appFetch(new Request("https://x/"), await makeCtx({ demoMode }));
  return res.text();
}

describe("gallery settings panel", () => {
  it("normal mode ships a settings button, a token panel, and a logout control", async () => {
    const html = await galleryHTML(false);
    expect(html).toContain('id="settingsBtn"');
    expect(html).toContain('id="settings"');
    expect(html).toContain('id="tokenReveal"');
    expect(html).toContain('id="tokenCopy"');
    expect(html).toContain('id="logoutBtn"');
  });

  it("inlines the same maskToken the unit tests cover, not a hand-copied variant", async () => {
    const html = await galleryHTML(false);
    expect(html).toContain("const maskToken = function");
  });

  it("demo mode hides the settings button along with the other write controls", async () => {
    const html = await galleryHTML(true);
    // The hide list is an array literal followed by .forEach(...); the settings
    // button must be in that list, not merely referenced elsewhere in the page.
    expect(html).toMatch(/\[[^\]]*"#settingsBtn"[^\]]*\]\.forEach/);
  });
});

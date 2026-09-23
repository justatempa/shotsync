import { describe, it, expect } from "vitest";
import { isAuthed } from "../src/auth.js";
import type { AppContext } from "../src/responses.js";

const ctx = { authToken: "secret123" } as AppContext;

function req(authz?: string): Request {
  return new Request("https://x/api/list", authz ? { headers: { authorization: authz } } : {});
}

describe("isAuthed", () => {
  it("accepts correct bearer", () => {
    expect(isAuthed(req("Bearer secret123"), ctx)).toBe(true);
  });
  it("rejects wrong token", () => {
    expect(isAuthed(req("Bearer nope"), ctx)).toBe(false);
  });
  it("rejects missing header", () => {
    expect(isAuthed(req(), ctx)).toBe(false);
  });
  it("rejects non-bearer scheme", () => {
    expect(isAuthed(req("Basic secret123"), ctx)).toBe(false);
  });
  it("rejects length mismatch without throwing", () => {
    expect(isAuthed(req("Bearer secret123extra"), ctx)).toBe(false);
  });
  it("returns false (does not throw) when the token is unset", () => {
    expect(isAuthed(req("Bearer anything"), {} as AppContext)).toBe(false);
    expect(isAuthed(req("Bearer anything"), { authToken: "" } as AppContext)).toBe(false);
  });
});

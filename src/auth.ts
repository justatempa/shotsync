import { AppContext } from "./responses.js";

function constantTimeEqual(a: string, b: string): boolean {
  // Lengths differ -> result is false, but still iterate to reduce timing variance.
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

// Read access: on a demo pool everyone may view; otherwise same as isAuthed.
export function canRead(request: Request, ctx: AppContext): boolean {
  return ctx.demoMode || isAuthed(request, ctx);
}

export function isAuthed(request: Request, ctx: AppContext): boolean {
  // No server token configured -> deny cleanly. Never fall through to the
  // comparison, which would read .length of undefined and throw.
  if (!ctx.authToken) return false;
  const h = request.headers.get("authorization") || "";
  const prefix = "Bearer ";
  if (!h.startsWith(prefix)) return false;
  return constantTimeEqual(h.slice(prefix.length), ctx.authToken);
}

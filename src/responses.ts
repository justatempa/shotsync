import type { Storage } from "./storage.js";

export interface AppContext {
  storage: Storage;
  authToken: string;
  // true on a public demo pool: reads (list/view) skip auth, writes
  // (upload/delete/share-create) still require the token. False in normal pools.
  demoMode: boolean;
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function err(status: number, message: string): Response {
  return json({ error: message }, status);
}

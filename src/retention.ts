import { FULL_EXTS, epochMsFromId, idFromFullKey, thumbKey } from "./ids.js";
import type { AppContext } from "./responses.js";

const DAY_MS = 24 * 3600 * 1000;

// Deletes full+thumb objects older than the retention window. The upload
// timestamp is embedded in the id itself (see ids.ts), so no metadata read is
// needed. Returns the number of items removed. `retentionDays <= 0` disables.
export async function sweepExpired(ctx: AppContext, retentionDays: number, now = Date.now()): Promise<number> {
  if (retentionDays <= 0) return 0;
  const maxAgeMs = retentionDays * DAY_MS;
  let cursor: string | undefined;
  let swept = 0;
  do {
    const page = await ctx.storage.list({ prefix: "full/", limit: 100, cursor });
    cursor = page.truncated ? (page.cursor ?? undefined) : undefined;
    for (const obj of page.objects) {
      const uploadedAt = epochMsFromId(idFromFullKey(obj.key));
      if (!Number.isFinite(uploadedAt) || now - uploadedAt <= maxAgeMs) continue;
      const keys = FULL_EXTS.map((ext) => `full/${idFromFullKey(obj.key)}.${ext}`);
      keys.push(thumbKey(idFromFullKey(obj.key)));
      await ctx.storage.delete(keys);
      swept += 1;
    }
  } while (cursor);
  return swept;
}

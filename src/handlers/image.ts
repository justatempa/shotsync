import { AppContext, err } from "../responses.js";
import { canRead } from "../auth.js";
import { FULL_EXTS, thumbKey } from "../ids.js";
import type { StoredObject } from "../storage.js";

// Try to find full image with one of the supported extensions
export async function getFull(ctx: AppContext, id: string): Promise<StoredObject | null> {
  for (const ext of FULL_EXTS) {
    const obj = await ctx.storage.get(`full/${id}.${ext}`);
    if (obj) return obj;
  }
  return null;
}

export async function handleImage(request: Request, ctx: AppContext, id: string): Promise<Response> {
  // Check authentication
  if (!canRead(request, ctx)) return err(401, "unauthorized");

  // Get size parameter from query string
  const size = new URL(request.url).searchParams.get("size");

  let obj: StoredObject | null = null;

  // If size=thumb is requested, try to fetch thumb
  if (size === "thumb") obj = await ctx.storage.get(thumbKey(id));

  // Fall back to full image if thumb not found or not requested
  if (!obj) obj = await getFull(ctx, id);

  // Return 404 if nothing found
  if (!obj) return err(404, "not found");

  // Return image with proper headers
  return new Response(obj.body, {
    headers: {
      "content-type": obj.contentType || "application/octet-stream",
      "cache-control": "private, max-age=31536000, immutable",
    },
  });
}

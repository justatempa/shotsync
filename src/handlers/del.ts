import { AppContext, err, json } from "../responses.js";
import { isAuthed } from "../auth.js";
import { FULL_EXTS, thumbKey } from "../ids.js";

export async function handleDelete(request: Request, ctx: AppContext, id: string): Promise<Response> {
  if (!isAuthed(request, ctx)) return err(401, "unauthorized");

  const keys = FULL_EXTS.map((ext) => `full/${id}.${ext}`);
  keys.push(thumbKey(id));
  await ctx.storage.delete(keys);

  return json({ deleted: true });
}

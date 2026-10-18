import { recentItems } from "@archive/core";

/** Return recent archived items without changing their read state. */
export async function handleGetItems(db: D1Database) {
  return Response.json(await recentItems(db));
}

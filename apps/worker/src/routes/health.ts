/** Check that the archive database is available. */
export async function handleGetHealth(db: D1Database) {
  await db.prepare("SELECT 1").first();
  return Response.json({ status: "ok" });
}

/** Return the fifty most recently created collection jobs. */
export async function handleGetJobs(db: D1Database) {
  return Response.json(
    (await db.prepare("SELECT * FROM jobs ORDER BY created_at DESC LIMIT 50").all()).results,
  );
}

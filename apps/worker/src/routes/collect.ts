import { scheduleCollections } from "../jobs/schedule";
import type { Env } from "../env";

/** Schedule collection using the current time slot. */
export async function handlePostCollect(env: Env) {
  await scheduleCollections(env, Date.now());

  return Response.json({ status: "queued" }, { status: 202 });
}

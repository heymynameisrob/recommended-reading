import type { Env } from "../env";

/** Persist scheduled job intent before sending messages; later ticks republish unfinished intents. */
export async function scheduleCollections(env: Env, timestamp: number) {
  const sources = await env.DB.prepare(
    "SELECT id FROM sources WHERE enabled = 1 AND kind IN ('website', 'rss', 'twitter')",
  ).all<{ id: string }>();

  const slot = Math.floor(timestamp / (30 * 60 * 1000));

  for (const source of sources.results) {
    await env.DB.prepare("INSERT OR IGNORE INTO jobs (id, source_id) VALUES (?, ?)")
      .bind(`${source.id}:${slot}`, source.id)
      .run();
  }

  const pending = await env.DB.prepare(
    "SELECT id, source_id FROM jobs WHERE status = 'queued' ORDER BY created_at LIMIT 100",
  ).all<{ id: string; source_id: string }>();

  for (const job of pending.results) {
    await env.JOBS.send({ jobId: job.id, sourceId: job.source_id });
  }
}

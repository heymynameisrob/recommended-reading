import type { CollectedItem } from "../collectors/types";
import type { Env } from "../env";

/** Store artifacts first, then commit deduplicated items and job completion together. */
export async function storeCollection(
  env: Env,
  jobId: string,
  sourceId: string,
  items: CollectedItem[],
) {
  for (const item of items) {
    for (const artifact of item.artifacts) {
      await env.ARTIFACTS.put(artifact.key, artifact.body, {
        httpMetadata: { contentType: artifact.contentType },
      });
    }
  }

  const inserts = items.map((item) =>
    env.DB.prepare(
      "INSERT OR IGNORE INTO items (id, source_id, url, title, content, content_hash, screenshot_key, collected_at, external_id, author, published_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(
      crypto.randomUUID(),
      sourceId,
      item.url,
      item.title,
      item.content,
      item.contentHash,
      item.screenshotKey ?? null,
      new Date().toISOString(),
      item.externalId ?? null,
      item.author ?? null,
      item.publishedAt ?? null,
    ),
  );

  await env.DB.batch([
    ...inserts,
    env.DB.prepare(
      "UPDATE jobs SET status = 'completed', completed_at = ?, error = NULL WHERE id = ?",
    ).bind(new Date().toISOString(), jobId),
  ]);
}

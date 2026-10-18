import type { CollectionMessage, Source } from "@archive/core";
import { collectWebsite } from "../collectors/website";
import { collectRss } from "../collectors/rss";
import { collectTwitter } from "../collectors/twitter";
import type { CollectedItem } from "../collectors/types";
import type { Env } from "../env";
import { storeCollection } from "../storage/collection";

/** Select a source collector and store its results using the shared archive writer. */
export async function dispatchCollection(env: Env, message: CollectionMessage) {
  const job = await env.DB.prepare("SELECT status FROM jobs WHERE id = ?")
    .bind(message.jobId)
    .first<{ status: string }>();
  if (!job || job.status === "completed") return;

  const source = await env.DB.prepare(
    "SELECT id, kind, url FROM sources WHERE id = ? AND enabled = 1",
  )
    .bind(message.sourceId)
    .first<Source>();
  if (!source) throw new Error("Enabled source required");

  await env.DB.prepare("UPDATE jobs SET status = 'running', error = NULL WHERE id = ?")
    .bind(message.jobId)
    .run();
  let items: CollectedItem[];
  switch (source.kind) {
    case "website":
      items = await collectWebsite(env.BROWSER, source);
      break;
    case "rss":
      items = await collectRss(source);
      break;
    case "twitter":
      items = await collectTwitter(source, env.X_API_BEARER_TOKEN);
      break;
    default:
      throw new Error("Unsupported source kind");
  }
  await storeCollection(env, message.jobId, source.id, items);
}

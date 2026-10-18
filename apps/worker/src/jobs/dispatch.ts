import type { CollectionMessage, Source } from "@archive/core";
import type { collectWebsite } from "../collectors/website";
import type { collectRss } from "../collectors/rss";
import type { collectTwitter } from "../collectors/twitter";
import type { CollectedItem } from "../collectors/types";
import type { Env } from "../env";
import type { storeCollection } from "../storage/collection";

/** Collectors and archive writer that one dispatch selects between. */
export interface DispatchDependencies {
  collectWebsite: typeof collectWebsite;
  collectRss: typeof collectRss;
  collectTwitter: typeof collectTwitter;
  storeCollection: typeof storeCollection;
}

/** Select a source collector and store its results using the shared archive writer. */
export async function dispatchCollection(
  env: Env,
  message: CollectionMessage,
  dependencies: DispatchDependencies,
) {
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
      items = await dependencies.collectWebsite(env.BROWSER, source);
      break;
    case "rss":
      items = await dependencies.collectRss(source);
      break;
    case "twitter":
      items = await dependencies.collectTwitter(source, env.X_API_BEARER_TOKEN);
      break;
    default:
      throw new Error("Unsupported source kind");
  }

  await dependencies.storeCollection(env, message.jobId, source.id, items);
}

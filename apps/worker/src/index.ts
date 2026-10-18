import type { CollectionMessage } from "@archive/core";
import { dispatchCollection } from "./jobs/dispatch";
import { scheduleCollections } from "./jobs/schedule";
import { handlePostCollect } from "./routes/collect";
import { handleGetCollections } from "./routes/collections";
import { handleGetHealth } from "./routes/health";
import { handleGetItems } from "./routes/items";
import { handleGetJobs } from "./routes/jobs";
import { handleMcp } from "./routes/mcp";
import type { Env } from "./env";

/** Compare fixed-length secret digests without an early mismatch return. */
async function isAuthorized(request: Request, secret: string | undefined) {
  if (!secret) return false;
  const supplied = request.headers.get("Authorization") ?? "";
  const encode = new TextEncoder();
  const [actual, expected] = await Promise.all([
    crypto.subtle.digest("SHA-256", encode.encode(supplied)),
    crypto.subtle.digest("SHA-256", encode.encode(`Bearer ${secret}`)),
  ]);
  const left = new Uint8Array(actual);
  const right = new Uint8Array(expected);
  let mismatch = 0;
  for (let index = 0; index < left.length; index++) mismatch |= left[index] ^ right[index];
  return mismatch === 0;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    if (!(await isAuthorized(request, env.ARCHIVE_API_KEY))) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = new URL(request.url);
    if (url.pathname === "/mcp") {
      return handleMcp(request, env, ctx);
    }
    if (request.method === "GET" && url.pathname === "/health") {
      return handleGetHealth(env.DB);
    }
    if (request.method === "GET" && url.pathname === "/api/collections") {
      return handleGetCollections(url, env.DB);
    }
    if (request.method === "GET" && url.pathname === "/api/items") {
      return handleGetItems(env.DB);
    }
    if (request.method === "POST" && url.pathname === "/api/collect") {
      return handlePostCollect(env);
    }
    if (request.method === "GET" && url.pathname === "/api/jobs") {
      return handleGetJobs(env.DB);
    }
    return Response.json({ error: "Not found" }, { status: 404 });
  },

  async scheduled(event: ScheduledController, env: Env) {
    await scheduleCollections(env, event.scheduledTime);
  },

  async queue(batch: MessageBatch<CollectionMessage>, env: Env) {
    for (const message of batch.messages) {
      try {
        await dispatchCollection(env, message.body);
        message.ack();
      } catch (error) {
        const details = error instanceof Error ? error.message : "Collection failed";
        await env.DB.prepare("UPDATE jobs SET status = 'failed', error = ? WHERE id = ?")
          .bind(details.slice(0, 1000), message.body.jobId)
          .run();
        message.retry({ delaySeconds: 60 });
      }
    }
  },
} satisfies ExportedHandler<Env, CollectionMessage>;

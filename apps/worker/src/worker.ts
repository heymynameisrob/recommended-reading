import type { CollectionMessage } from "@archive/core";
import type { Env } from "./env";

/** Every request handler and queued job function the worker routes to. */
export interface WorkerDependencies {
  handleMcp(request: Request, env: Env, ctx: ExecutionContext): Response | Promise<Response>;
  handleGetHealth(db: D1Database): Response | Promise<Response>;
  handleGetItems(db: D1Database): Response | Promise<Response>;
  handleGetJobs(db: D1Database): Response | Promise<Response>;
  handleGetCollections(url: URL, db: D1Database): Response | Promise<Response>;
  handlePostCollect(env: Env): Response | Promise<Response>;
  dispatchCollection(env: Env, message: CollectionMessage): Promise<void>;
  scheduleCollections(env: Env, timestamp: number): Promise<void>;
}

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

/** Wire the worker to an explicit dependency table so tests replace behaviour, not modules. */
export function createWorker(dependencies: WorkerDependencies) {
  return {
    async fetch(request: Request, env: Env, ctx: ExecutionContext) {
      if (!(await isAuthorized(request, env.ARCHIVE_API_KEY))) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }

      const url = new URL(request.url);

      if (url.pathname === "/mcp") {
        return dependencies.handleMcp(request, env, ctx);
      }

      if (request.method === "GET" && url.pathname === "/health") {
        return dependencies.handleGetHealth(env.DB);
      }

      if (request.method === "GET" && url.pathname === "/api/collections") {
        return dependencies.handleGetCollections(url, env.DB);
      }

      if (request.method === "GET" && url.pathname === "/api/items") {
        return dependencies.handleGetItems(env.DB);
      }

      if (request.method === "POST" && url.pathname === "/api/collect") {
        return dependencies.handlePostCollect(env);
      }

      if (request.method === "GET" && url.pathname === "/api/jobs") {
        return dependencies.handleGetJobs(env.DB);
      }

      return Response.json({ error: "Not found" }, { status: 404 });
    },

    async scheduled(event: ScheduledController, env: Env) {
      await dependencies.scheduleCollections(env, event.scheduledTime);
    },

    async queue(batch: MessageBatch<CollectionMessage>, env: Env) {
      for (const message of batch.messages) {
        try {
          await dependencies.dispatchCollection(env, message.body);
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
}

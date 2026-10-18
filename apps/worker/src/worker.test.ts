import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWorker } from "./worker";
import {
  createDatabase,
  createEnv,
  createExecutionContext,
  createQueueBatch,
  createQueueMessage,
} from "./test-helpers";

function createWorkerDependencies() {
  return {
    handleMcp: vi.fn(),
    handleGetHealth: vi.fn(),
    handleGetItems: vi.fn(),
    handleGetJobs: vi.fn(),
    handleGetCollections: vi.fn(),
    handlePostCollect: vi.fn(),
    dispatchCollection: vi.fn(),
    scheduleCollections: vi.fn(),
  };
}

const dependencies = createWorkerDependencies();
const worker = createWorker(dependencies);
const ctx = createExecutionContext();

const routes = [
  ["GET", "/health", dependencies.handleGetHealth],
  ["GET", "/api/items", dependencies.handleGetItems],
  ["GET", "/api/jobs", dependencies.handleGetJobs],
  ["GET", "/api/collections", dependencies.handleGetCollections],
  ["POST", "/api/collect", dependencies.handlePostCollect],
  ["POST", "/mcp", dependencies.handleMcp],
] as const;

describe("HTTP access", () => {
  beforeEach(() => {
    for (const [, , handler] of routes) {
      handler.mockResolvedValue(Response.json({ ok: true }));
    }
  });

  it.each(routes)("protects %s %s", async (method, path, handler) => {
    for (const authorization of [undefined, "Bearer wrong", "secret"]) {
      const response = await worker.fetch(
        new Request(`https://archive.test${path}`, {
          method,
          headers: authorization ? { Authorization: authorization } : {},
        }),
        createEnv({ ARCHIVE_API_KEY: "secret" }),
        ctx,
      );

      expect(response.status).toBe(401);
    }

    expect(handler).not.toHaveBeenCalled();
  });

  it.each(routes)("routes authorized %s %s", async (method, path, handler) => {
    const response = await worker.fetch(
      new Request(`https://archive.test${path}`, {
        method,
        headers: { Authorization: "Bearer secret" },
      }),
      createEnv({ ARCHIVE_API_KEY: "secret" }),
      ctx,
    );

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("denies access when the server secret is absent", async () => {
    const response = await worker.fetch(
      new Request("https://archive.test/health", {
        headers: { Authorization: "Bearer undefined" },
      }),
      createEnv({ ARCHIVE_API_KEY: undefined }),
      ctx,
    );

    expect(response.status).toBe(401);
    expect(dependencies.handleGetHealth).not.toHaveBeenCalled();
  });

  it.each([
    ["GET", "/missing"],
    ["POST", "/health"],
  ])("returns 404 for %s %s", async (method, path) => {
    const response = await worker.fetch(
      new Request(`https://archive.test${path}`, {
        method,
        headers: { Authorization: "Bearer secret" },
      }),
      createEnv({ ARCHIVE_API_KEY: "secret" }),
      ctx,
    );

    expect(response.status).toBe(404);
  });
});

describe("queue handling", () => {
  it("acknowledges a successful dispatch", async () => {
    const message = createQueueMessage({ jobId: "job", sourceId: "source" });
    const env = createEnv();

    dependencies.dispatchCollection.mockResolvedValueOnce(undefined);
    await worker.queue(createQueueBatch([message]), env);
    expect(dependencies.dispatchCollection).toHaveBeenCalledWith(env, message.body);
    expect(message.ack).toHaveBeenCalledOnce();
    expect(message.retry).not.toHaveBeenCalled();
  });

  it("records a bounded error and retries without acknowledging", async () => {
    const { db, statement } = createDatabase();
    const message = createQueueMessage({ jobId: "job", sourceId: "source" });

    dependencies.dispatchCollection.mockRejectedValueOnce(new Error("x".repeat(1200)));
    await worker.queue(createQueueBatch([message]), createEnv({ DB: db }));
    expect(statement.bind).toHaveBeenCalledWith("x".repeat(1000), "job");
    expect(statement.run).toHaveBeenCalledOnce();
    expect(message.retry).toHaveBeenCalledWith({ delaySeconds: 60 });
    expect(message.ack).not.toHaveBeenCalled();
  });
});

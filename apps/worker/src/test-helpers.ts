import { vi } from "vitest";
import type { Mock } from "vitest";
import type { CollectionMessage } from "@archive/core";
import type { Env } from "./env";

/** Prepared-statement double that exposes its mock handles for assertions. */
export interface StatementDouble extends D1PreparedStatement {
  bind: Mock;
  first: Mock;
  all: Mock;
  run: Mock;
}

/** Database double that exposes its mock handles for assertions. */
export interface DatabaseDouble extends D1Database {
  prepare: Mock;
  batch: Mock;
}

/** Queue double that records published job messages. */
export interface QueueDouble extends Queue<CollectionMessage> {
  metrics: Mock;
  send: Mock;
  sendBatch: Mock;
}

/** Request-context double; tracing throws because tests never record a span. */
export function createExecutionContext(): ExecutionContext {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
    abort: vi.fn(),
    props: {},
    exports: {},
    tracing: {
      enterSpan: vi.fn(),
      startActiveSpan: vi.fn(),
      startSpan: vi.fn(),
      getActiveSpan: vi.fn(),
      get Span(): typeof Span {
        throw new Error("Tracing spans are unavailable in tests");
      },
    },
  };
}

/** Browser-rendering double for bindings a focused test never calls. */
export function createBrowser(): Fetcher {
  return {
    fetch: vi.fn(),
    connect: vi.fn(),
  };
}

/** Artifact-store double that records writes and tolerates untouched read methods. */
export function createArtifactStore() {
  return {
    head: vi.fn(),
    get: vi.fn(),
    put: vi.fn(),
    createMultipartUpload: vi.fn(),
    resumeMultipartUpload: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(),
  } satisfies R2Bucket;
}

/** Queue double that records published job messages. */
export function createQueue(): QueueDouble {
  return {
    metrics: vi.fn(),
    send: vi.fn(),
    sendBatch: vi.fn(),
  };
}

/** Database double plus the single statement it hands out. */
export interface DatabaseFixture {
  db: DatabaseDouble;
  statement: StatementDouble;
}

/** Supply a small D1 double while preserving statements and bound values for assertions. */
export function createDatabase(): DatabaseFixture {
  const bind = vi.fn();
  const first = vi.fn();
  const all = vi.fn();
  const run = vi.fn();
  const statement: StatementDouble = { bind, first, all, run, raw: vi.fn() };

  bind.mockReturnValue(statement);
  all.mockResolvedValue({ results: [] });
  run.mockResolvedValue({ success: true });

  const db: DatabaseDouble = {
    prepare: vi.fn().mockReturnValue(statement),
    batch: vi.fn().mockResolvedValue([]),
    exec: vi.fn(),
    dump: vi.fn(),
    withSession: vi.fn(),
  };

  return { db, statement };
}

/** Message double that records acknowledgement and retry decisions. */
export interface MessageDouble extends Message<CollectionMessage> {
  ack: Mock;
  retry: Mock;
}

/** Build one queue message for the archive worker to consume. */
export function createQueueMessage(body: CollectionMessage): MessageDouble {
  return {
    id: `${body.jobId}:${body.sourceId}`,
    timestamp: new Date(0),
    attempts: 1,
    body,
    ack: vi.fn(),
    retry: vi.fn(),
  };
}

/** Wrap messages in the batch shape the queue consumer receives. */
export function createQueueBatch(messages: MessageDouble[]): MessageBatch<CollectionMessage> {
  return {
    queue: "archive-collection",
    messages,
    metadata: { metrics: { backlogCount: messages.length, backlogBytes: 0 } },
    retryAll: vi.fn(),
    ackAll: vi.fn(),
  };
}

/** Complete environment built from inert doubles, with the bindings a test cares about. */
export function createEnv(overrides: Partial<Env> = {}): Env {
  return {
    DB: createDatabase().db,
    ARTIFACTS: createArtifactStore(),
    BROWSER: createBrowser(),
    JOBS: createQueue(),
    ARCHIVE_API_KEY: "test-key",
    ...overrides,
  };
}

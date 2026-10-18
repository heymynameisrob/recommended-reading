import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CollectionMessage } from "@archive/core";
import { createDatabase, createEnv } from "../test-helpers";
import { dispatchCollection } from "./dispatch";

const message: CollectionMessage = { jobId: "job", sourceId: "source" };

function createDependencies() {
  return {
    collectWebsite: vi.fn(),
    collectRss: vi.fn(),
    collectTwitter: vi.fn(),
    storeCollection: vi.fn(),
  };
}

describe("dispatchCollection", () => {
  let dependencies: ReturnType<typeof createDependencies>;

  beforeEach(() => {
    dependencies = createDependencies();
    dependencies.collectWebsite.mockResolvedValue([]);
    dependencies.collectRss.mockResolvedValue([]);
    dependencies.collectTwitter.mockResolvedValue([]);
    dependencies.storeCollection.mockResolvedValue(undefined);
  });

  it.each([null, { status: "completed" }])("skips missing or completed jobs", async (job) => {
    const { db, statement } = createDatabase();

    statement.first.mockResolvedValue(job);
    await dispatchCollection(createEnv({ DB: db }), message, dependencies);
    expect(statement.first).toHaveBeenCalledTimes(1);
    expect(dependencies.storeCollection).not.toHaveBeenCalled();
    expect(dependencies.collectRss).not.toHaveBeenCalled();
    expect(dependencies.collectWebsite).not.toHaveBeenCalled();
    expect(dependencies.collectTwitter).not.toHaveBeenCalled();
  });

  it.each(["website", "rss", "twitter"])("dispatches %s and stores empty results", async (kind) => {
    const { db, statement } = createDatabase();
    const source = { id: "source", kind, url: "https://example.com" };

    statement.first.mockResolvedValueOnce({ status: "queued" }).mockResolvedValueOnce(source);
    const env = createEnv({ DB: db, X_API_BEARER_TOKEN: "token" });

    await dispatchCollection(env, message, dependencies);

    const collector = {
      website: dependencies.collectWebsite,
      rss: dependencies.collectRss,
      twitter: dependencies.collectTwitter,
    }[kind];

    expect(collector).toHaveBeenCalledTimes(1);

    if (kind === "website") {
      expect(dependencies.collectWebsite).toHaveBeenCalledWith(env.BROWSER, source);
    }

    if (kind === "rss") expect(dependencies.collectRss).toHaveBeenCalledWith(source);

    if (kind === "twitter") {
      expect(dependencies.collectTwitter).toHaveBeenCalledWith(source, "token");
    }

    expect(dependencies.storeCollection).toHaveBeenCalledWith(env, "job", "source", []);
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining("status = 'running'"));
  });

  it("rejects an unavailable source", async () => {
    const { db, statement } = createDatabase();

    statement.first.mockResolvedValueOnce({ status: "queued" }).mockResolvedValueOnce(null);
    await expect(dispatchCollection(createEnv({ DB: db }), message, dependencies)).rejects.toThrow(
      "Enabled source required",
    );
    expect(dependencies.storeCollection).not.toHaveBeenCalled();
  });

  it("does not store results after a collector failure", async () => {
    const { db, statement } = createDatabase();

    statement.first.mockResolvedValueOnce({ status: "failed" }).mockResolvedValueOnce({
      id: "source",
      kind: "rss",
      url: "https://example.com",
    });
    dependencies.collectRss.mockRejectedValueOnce(new Error("Feed unavailable"));
    await expect(dispatchCollection(createEnv({ DB: db }), message, dependencies)).rejects.toThrow(
      "Feed unavailable",
    );
    expect(dependencies.storeCollection).not.toHaveBeenCalled();
  });
});

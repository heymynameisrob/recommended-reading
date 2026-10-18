import { describe, expect, it } from "vitest";
import { createDatabase, createEnv, createQueue } from "../test-helpers";
import { scheduleCollections } from "./schedule";

describe("scheduleCollections", () => {
  it("uses stable slot IDs and sends only the pending jobs returned by D1", async () => {
    const { db, statement } = createDatabase();
    const queue = createQueue();
    const env = createEnv({ DB: db, JOBS: queue });

    for (const timestamp of [0, 1000, 1_800_000]) {
      statement.all.mockResolvedValueOnce({ results: [{ id: "rss" }] });
      statement.all.mockResolvedValueOnce({ results: [{ id: "pending", source_id: "rss" }] });
      await scheduleCollections(env, timestamp);
    }

    expect(statement.bind.mock.calls).toEqual([
      ["rss:0", "rss"],
      ["rss:0", "rss"],
      ["rss:1", "rss"],
    ]);
    expect(queue.send).toHaveBeenCalledTimes(3);
    expect(queue.send).toHaveBeenCalledWith({ jobId: "pending", sourceId: "rss" });
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining("enabled = 1"));
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining("status = 'queued'"));
  });

  it("does not send messages when no jobs are pending", async () => {
    const { db } = createDatabase();
    const queue = createQueue();

    await scheduleCollections(createEnv({ DB: db, JOBS: queue }), 0);
    expect(queue.send).not.toHaveBeenCalled();
  });
});

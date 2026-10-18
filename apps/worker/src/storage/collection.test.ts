import { describe, expect, it } from "vitest";
import { createArtifactStore, createDatabase, createEnv } from "../test-helpers";
import { storeCollection } from "./collection";

describe("storeCollection", () => {
  it("writes artifacts before batching items and job completion", async () => {
    const { db, statement } = createDatabase();
    const artifacts = createArtifactStore();

    await storeCollection(createEnv({ DB: db, ARTIFACTS: artifacts }), "job", "source", [
      {
        url: "https://example.com",
        title: "Title",
        content: "Text",
        contentHash: "hash",
        artifacts: [{ key: "image.png", body: new Uint8Array([1]), contentType: "image/png" }],
      },
    ]);
    expect(artifacts.put).toHaveBeenCalledWith("image.png", expect.any(Uint8Array), {
      httpMetadata: { contentType: "image/png" },
    });
    expect(artifacts.put.mock.invocationCallOrder[0]).toBeLessThan(
      db.batch.mock.invocationCallOrder[0],
    );
    expect(statement.bind).toHaveBeenCalledWith(
      expect.any(String),
      "source",
      "https://example.com",
      "Title",
      "Text",
      "hash",
      null,
      expect.any(String),
      null,
      null,
      null,
    );
    expect(db.batch).toHaveBeenCalledWith([statement, statement]);
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining("status = 'completed'"));
  });

  it("completes an empty collection", async () => {
    const { db, statement } = createDatabase();

    await storeCollection(createEnv({ DB: db }), "job", "source", []);
    expect(db.batch).toHaveBeenCalledWith([statement]);
    expect(statement.bind).toHaveBeenCalledWith(expect.any(String), "job");
  });

  it("does not commit when an artifact write fails", async () => {
    const { db } = createDatabase();
    const artifacts = createArtifactStore();

    artifacts.put.mockRejectedValue(new Error("R2 unavailable"));
    await expect(
      storeCollection(createEnv({ DB: db, ARTIFACTS: artifacts }), "job", "source", [
        {
          url: "https://example.com",
          title: "Title",
          content: "Text",
          contentHash: "hash",
          artifacts: [{ key: "image.png", body: new Uint8Array(), contentType: "image/png" }],
        },
      ]),
    ).rejects.toThrow("R2 unavailable");
    expect(db.batch).not.toHaveBeenCalled();
  });
});

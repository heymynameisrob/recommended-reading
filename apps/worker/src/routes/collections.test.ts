import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDatabase } from "../test-helpers";
import { handleGetCollections } from "./collections";

const { db } = createDatabase();
const dependencies = { recentCollections: vi.fn() };

describe("collection parameters", () => {
  beforeEach(() => {
    dependencies.recentCollections.mockResolvedValue({ items: [], nextCursor: null });
  });

  it.each([undefined, "1", "100"])("accepts limit %s", async (limit) => {
    const url = new URL("https://archive.test/api/collections");

    if (limit !== undefined) url.searchParams.set("limit", limit);
    const response = await handleGetCollections(url, db, dependencies);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(dependencies.recentCollections).toHaveBeenCalledWith(db, Number(limit ?? 20), undefined);
    expect(await response.json()).toEqual({ items: [], nextCursor: null });
  });

  it.each(["0", "101", "1.5", "-1", "abc", ""])("rejects limit %s", async (limit) => {
    const url = new URL("https://archive.test/api/collections");

    url.searchParams.set("limit", limit);
    expect((await handleGetCollections(url, db, dependencies)).status).toBe(400);
    expect(dependencies.recentCollections).not.toHaveBeenCalled();
  });

  it("decodes a valid cursor", async () => {
    const cursor = { collectedAt: "2026-01-01T00:00:00.000Z", id: "item-1" };
    const url = new URL("https://archive.test/api/collections");

    url.searchParams.set("cursor", btoa(JSON.stringify(cursor)).replace(/=+$/, ""));
    expect((await handleGetCollections(url, db, dependencies)).status).toBe(200);
    expect(dependencies.recentCollections).toHaveBeenCalledWith(db, 20, cursor);
  });

  it.each(["", "!", btoa("{}"), btoa("null"), "a".repeat(1025)])(
    "rejects malformed cursor %s",
    async (cursor) => {
      const url = new URL("https://archive.test/api/collections");

      url.searchParams.set("cursor", cursor);
      expect((await handleGetCollections(url, db, dependencies)).status).toBe(400);
      expect(dependencies.recentCollections).not.toHaveBeenCalled();
    },
  );
});

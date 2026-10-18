import { describe, expect, it } from "vitest";
import { recentCollections } from "./index";
import { createDatabase } from "../../../apps/worker/src/test-helpers";

describe("recentCollections", () => {
  it("returns an empty page", async () => {
    const { db } = createDatabase();

    expect(await recentCollections(db)).toEqual({ items: [], nextCursor: null });
  });

  it("builds the cursor from the last returned item, not the extra item", async () => {
    const { db, statement } = createDatabase();

    const rows = [
      { id: "c", collected_at: "2026-01-01T00:00:00.000Z" },
      { id: "b", collected_at: "2026-01-01T00:00:00.000Z" },
      { id: "a", collected_at: "2026-01-01T00:00:00.000Z" },
    ];

    statement.all.mockResolvedValue({ results: rows });
    const page = await recentCollections(db, 2);

    expect(page.items).toEqual(rows.slice(0, 2));
    expect(JSON.parse(atob(page.nextCursor!))).toEqual({
      collectedAt: rows[1].collected_at,
      id: "b",
    });
    expect(statement.bind).toHaveBeenCalledWith(3);
    expect(db.prepare).toHaveBeenCalledWith(expect.stringContaining("collected_at DESC, id DESC"));
  });

  it("binds the cursor and returns no next cursor for an exact page", async () => {
    const { db, statement } = createDatabase();

    statement.all.mockResolvedValue({ results: [{ id: "a" }] });
    const cursor = { collectedAt: "2026-01-01T00:00:00.000Z", id: "b" };
    const page = await recentCollections(db, 1, cursor);

    expect(statement.bind).toHaveBeenCalledWith(cursor.collectedAt, cursor.id, 2);
    expect(page.nextCursor).toBeNull();
  });
});

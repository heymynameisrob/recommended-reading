import { z } from "zod";
import { recentCollections, type CollectionCursor } from "@archive/core";

const cursorSchema = z.object({
  collectedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    .refine((value) => Number.isFinite(Date.parse(value))),
  id: z.string().min(1).max(200),
});

/** Query functions the collections route reads archived pages through. */
export interface CollectionsDependencies {
  recentCollections: typeof recentCollections;
}

const defaultDependencies: CollectionsDependencies = { recentCollections };

/** Reject malformed cursors before using their values in a database query. */
function parseCollectionCursor(value: string): CollectionCursor {
  if (value.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("Invalid cursor");
  }

  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");

  return cursorSchema.parse(JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="))));
}

/** Validate pagination parameters and return the latest archived collections. */
export async function handleGetCollections(
  url: URL,
  db: D1Database,
  dependencies: CollectionsDependencies = defaultDependencies,
) {
  const limitValue = url.searchParams.get("limit") ?? "20";
  const limit = Number(limitValue);

  if (!/^\d+$/.test(limitValue) || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    return Response.json({ error: "limit must be an integer from 1 to 100" }, { status: 400 });
  }

  let cursor: CollectionCursor | undefined;
  const cursorValue = url.searchParams.get("cursor");

  if (cursorValue !== null) {
    try {
      cursor = parseCollectionCursor(cursorValue);
    } catch {
      return Response.json({ error: "Invalid cursor" }, { status: 400 });
    }
  }

  return Response.json(await dependencies.recentCollections(db, limit, cursor), {
    headers: { "Cache-Control": "no-store" },
  });
}

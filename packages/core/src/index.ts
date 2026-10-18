export interface Source {
  id: string;
  kind: "website" | "rss" | "twitter";
  url: string;
}

/** Add a source and enable scheduled collection unless disabled by the caller. */
export async function addSource(db: D1Database, source: Source, enabled = true) {
  await db
    .prepare("INSERT INTO sources (id, kind, url, enabled) VALUES (?, ?, ?, ?)")
    .bind(source.id, source.kind, source.url, enabled ? 1 : 0)
    .run();

  return { ...source, enabled };
}

export interface CollectionMessage {
  jobId: string;
  sourceId: string;
}

/** Search archived text with SQLite FTS5 syntax and bound parameters. */
export async function searchItems(db: D1Database, query: string, limit = 20) {
  const result = await db
    .prepare(
      "SELECT items.* FROM items JOIN items_fts ON items.rowid = items_fts.rowid WHERE items_fts MATCH ? ORDER BY rank LIMIT ?",
    )
    .bind(query, limit)
    .all();

  return result.results;
}

/** Read recent records without changing their read state. */
export async function recentItems(db: D1Database, limit = 20) {
  const result = await db
    .prepare(
      "SELECT id, source_id, url, title, collected_at, screenshot_key, external_id, author, published_at FROM items ORDER BY collected_at DESC LIMIT ?",
    )
    .bind(limit)
    .all();

  return result.results;
}

export interface CollectionCursor {
  collectedAt: string;
  id: string;
}

interface CollectionSummary {
  id: string;
  source_id: string;
  url: string;
  title: string;
  collected_at: string;
  screenshot_key: string | null;
  external_id: string | null;
  author: string | null;
  published_at: string | null;
}

/** Read one page using a stable order, including items with equal collection times. */
export async function recentCollections(db: D1Database, limit = 20, cursor?: CollectionCursor) {
  const columns =
    "SELECT id, source_id, url, title, collected_at, screenshot_key, external_id, author, published_at FROM items";

  const statement = cursor
    ? db
        .prepare(
          `${columns} WHERE (collected_at, id) < (?, ?) ORDER BY collected_at DESC, id DESC LIMIT ?`,
        )
        .bind(cursor.collectedAt, cursor.id, limit + 1)
    : db.prepare(`${columns} ORDER BY collected_at DESC, id DESC LIMIT ?`).bind(limit + 1);

  const result = await statement.all<CollectionSummary>();
  const items = result.results.slice(0, limit);
  const last = items[items.length - 1];

  const nextCursor =
    result.results.length > limit && last
      ? btoa(JSON.stringify({ collectedAt: last.collected_at, id: last.id }))
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "")
      : null;

  return { items, nextCursor };
}

/** Read one complete archived item. */
export async function getItem(db: D1Database, id: string) {
  return db.prepare("SELECT * FROM items WHERE id = ?").bind(id).first();
}

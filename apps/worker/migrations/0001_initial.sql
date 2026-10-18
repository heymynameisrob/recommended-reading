CREATE TABLE sources (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('website', 'rss', 'twitter')),
  url TEXT NOT NULL UNIQUE,
  enabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  completed_at TEXT
);

CREATE TABLE items (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES sources(id),
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  screenshot_key TEXT,
  collected_at TEXT NOT NULL,
  UNIQUE(source_id, content_hash)
);

CREATE INDEX items_collected_at ON items(collected_at);
CREATE INDEX jobs_status ON jobs(status);

CREATE VIRTUAL TABLE items_fts USING fts5(title, content, content='items', content_rowid='rowid');

CREATE TRIGGER items_ai AFTER INSERT ON items BEGIN
  INSERT INTO items_fts(rowid, title, content) VALUES (new.rowid, new.title, new.content);
END;

CREATE TRIGGER items_ad AFTER DELETE ON items BEGIN
  INSERT INTO items_fts(items_fts, rowid, title, content) VALUES ('delete', old.rowid, old.title, old.content);
END;

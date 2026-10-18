ALTER TABLE items ADD COLUMN external_id TEXT;
ALTER TABLE items ADD COLUMN author TEXT;
ALTER TABLE items ADD COLUMN published_at TEXT;

CREATE INDEX items_external_id ON items(source_id, external_id);
CREATE INDEX items_published_at ON items(published_at);

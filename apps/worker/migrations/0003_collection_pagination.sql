/** Support stable pagination by collection time and item ID. */
CREATE INDEX items_collected_at_id ON items(collected_at DESC, id DESC);

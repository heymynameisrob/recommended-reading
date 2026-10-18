/** Enable the sources listed in SEED.md. Run separately from schema migrations. */
INSERT INTO sources (id, kind, url, enabled)
VALUES
  ('mariozechner', 'rss', 'https://mariozechner.at/recommended-reading/rss.xml', 1),
  ('hackernews', 'rss', 'https://hnrss.org/frontpage', 1),
  ('joshwcomeau', 'rss', 'https://www.joshwcomeau.com/rss.xml', 1),
  ('designers', 'twitter', 'https://x.com/i/lists/2054157691715481663', 1),
  ('design-engineers', 'twitter', 'https://x.com/i/lists/1586859150285631488', 1),
  ('devs', 'twitter', 'https://x.com/i/lists/2102065185636634667', 1),
  ('base-ui', 'website', 'https://base-ui.com/blog', 1),
  ('openai', 'website', 'https://developers.openai.com/blog', 1),
  ('anthropic', 'website', 'https://www.anthropic.com/engineering', 1)
ON CONFLICT(url) DO UPDATE SET kind = excluded.kind, enabled = 1;

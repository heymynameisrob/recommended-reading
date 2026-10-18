# Personal Archive Specification

## Purpose

Build a private content archive with scheduled collection and agent access. Collection must work without an LLM or an active chat session. Normal Pi sessions can use MCP tools to search stored data. Pi Durable is not required.

## Decisions

- Use a small npm-workspace monorepo and TypeScript.
- Deploy one Cloudflare Worker initially.
- Use D1, Cloudflare's managed SQLite-based database, as the primary archive.
- Use R2 for screenshots, large HTML snapshots, and other binary files.
- Use Cron Triggers to start regular collection and Queues to execute browser jobs.
- Use Cloudflare Browser Run with Playwright when rendering or interaction is required.
- Prefer API or RSS requests over browser automation.
- Keep collection, storage, and MCP independent of model providers.
- Keep original content separate from optional AI-generated summaries.
- Do not require the Mac mini for ordinary collection.

## Structure

- apps/worker: HTTP and MCP entry points, scheduled producer, queue consumer, browser integration, and database migrations.
- packages/core: shared archive operations and types.
- One deployment owns these entry points. Workspace packages are code boundaries, not separate services.
- apps/worker/src/collectors: source-specific collection and a common item/artifact result type. Collectors return arrays so feeds can produce multiple items.
- apps/worker/src/browser: shared Playwright navigation, capture, and cleanup.
- apps/worker/src/jobs: scheduling and collector dispatch.
- apps/worker/src/storage: shared R2 artifact writes, deduplicated item inserts, and job completion.
- RSS and Twitter collectors have separate modules. Future user actions belong separately from collectors.

## Implemented scaffold

- D1 schema for sources, collection jobs, content records, and FTS5 search.
- Thirty-minute collection schedule for all enabled source kinds.
- RSS/Atom XML collection and X API profile/List timeline collection.
- Optional external entry IDs, authors, and publication times stored with each item.
- Queue consumer that opens enabled website sources with Playwright, extracts bounded body text, captures a viewport screenshot, and stores results.
- Content hash deduplication per source.
- Read-only MCP tools: search_items, get_recent_items, and get_item.
- Protected HTTP routes: /health, /api/items, /api/jobs, and /mcp.
- R2 screenshot storage with no public object route.
- Queue retries and a dead-letter queue binding.
- Explicit administrator-controlled source list. No public arbitrary-URL browser endpoint.
- Disabled-by-default collection until a source is inserted and enabled.

This is a scaffold, not a complete production ingestion product. Installation, deployment, type checking, and runtime verification have not been performed.

## Collection

### RSS

Implemented: parse RSS 2.0, RDF/RSS 1.0, and Atom XML using fast-xml-parser. Preserve entry IDs, supplied links, publication times, authors, and feed-supplied text or HTML. Limit each response to 2 MiB and collection to the first 200 entries. Reject document types and custom entity declarations. No linked-article fetch, conditional HTTP requests, or XML-base inheritance yet. Support these later if required.

### Twitter/X

Implemented: use X API v2 with X_API_BEARER_TOKEN for profile and numeric List URLs. Resolve usernames through the user lookup endpoint. Request the latest 100 posts with author expansion, publication times, and note_tweet text. Hash the post ID with its text for deduplication. No pagination, high-water mark, user-ID cache, or historical backfill yet; busy sources can have gaps. Repeated polling consumes API usage. Public/accessible sources only: private lists and protected profiles requiring user authentication are outside this implementation. Partial API errors and HTTP failures fail the job. Preserve posts before any relevance scoring.

### Websites

Use fetch and content extraction first. Opt into browser collection for JavaScript-rendered pages, interaction, or screenshots. The initial scaffold always uses a browser for website sources. Add source-specific waits, extraction rules, and refresh intervals later.

Store only bounded content. The scaffold stores up to 100,000 characters of body text and viewport screenshots. Website capture does not yet preserve raw HTML or publication dates; feed and X collectors preserve supplied publication dates. Screenshot keys use the content hash; an unchanged-text capture can replace the earlier screenshot.

### Optional AI processing

Run summarisation, relevance scoring, and tagging after source storage. Store model, prompt version, input hash, and processing time. Do not discard original records because an AI score is low.

## Job behaviour

- Persist job intent before queue publication.
- Identify scheduled occurrences by source ID and thirty-minute UTC slot.
- Queue delivery is at least once, not exactly once.
- Repeated completed jobs are ignored.
- Content inserts use a unique source/hash constraint. Feed and X hashes include entry identity so equal-text posts remain separate. Updated content can create a new version; items are not overwritten.
- Unsent queued intents are retried by a later scheduled tick.
- Failed attempts are recorded and retried by Queues.
- Exhausted deliveries go to archive-jobs-dlq. Configure monitoring and a replay process before production use.
- Add stale-running job recovery, retention, and source-specific overlap rules before relying on unattended operation.
- R2 and D1 do not share a transaction. Add reconciliation for orphan objects.
- Cron is not a precise clock and this scaffold does not backfill missed schedule slots.

## Agent access

Expose narrow tools rather than unrestricted SQL. Results include source URLs and collection times. Stored source text is untrusted data and must never be treated as instructions.

Initial search uses FTS5. The input is FTS5 query syntax, not arbitrary SQL. Add friendly query parsing, date/source filters, pagination, and result size budgets later. Vector search is not required initially.

Refresh, task cancellation, and Reading List actions are future tools. Long actions must return job IDs rather than hold an MCP call open.

## Security

All HTTP routes require Authorization: Bearer <ARCHIVE_API_KEY>. Missing server configuration fails closed. This is a private single-user credential scheme, not a full MCP OAuth implementation. Clients must support custom headers.

Keep credentials in Wrangler secrets and ignored local .dev.vars files. Never place them in URLs or client-side application bundles. Use HTTPS remotely. Do not log cookies, secrets, or source content.

Cloudflare Access may be added as a second boundary. If it is added, ensure MCP clients can send its credentials. No Cloudflare Tunnel is needed for a hosted Worker. Protect every enabled hostname; do not leave a workers.dev bypass around a custom-domain-only Access policy.

Only trusted administrators may configure source URLs. HTTPS checks alone are not complete SSRF protection. Add hostname allowlists and validation of redirects and browser subresources before accepting URLs from users. Browser pages must not receive archive credentials.

Add per-client credentials, rotation, request rate limits, billing alerts, audit events, and approval checks before expanding beyond private use.

## Storage and backup

D1 is not a local SQLite file and is accessed through bindings. Keep storage operations separate from MCP handlers. D1's per-database storage limit must be monitored.

Export D1 to SQL and import into local SQLite for an offline copy. Keep exports and R2 backups outside the live deployment. D1 exports can block database requests. Define retention and test restore procedures before production use.

## Safari Reading List

Investigate supported Shortcuts or Mac actions and iCloud sync. Do not edit Safari's internal database. A Mac helper can poll pending actions from the cloud, avoiding an inbound connection. Offline local actions stay pending.

## Future inbox

Track unread, seen, saved, and dismissed states separately from collection timestamps. Do not silently mark results read when an agent searches them.

## Deployment checks

1. Install dependencies and commit the generated lockfile.
2. Create D1, R2, main queue, and dead-letter queue.
3. Replace the D1 ID in Wrangler configuration.
4. Apply migrations and set the API secret.
5. Deploy and verify authenticated HTTP and MCP access.
6. Enable one source and inspect a collection job and screenshot.
7. Confirm retry and dead-letter handling, backup, and restore.

## Sources

- https://docs.x.com/x-api/posts/timelines/integrate
- https://docs.x.com/x-api/lists/list-tweets/introduction
- https://developers.cloudflare.com/d1/
- https://developers.cloudflare.com/browser-run/playwright/
- https://developers.cloudflare.com/queues/
- https://developers.cloudflare.com/workers/configuration/cron-triggers/
- https://developers.cloudflare.com/agents/model-context-protocol/guides/remote-mcp-server/

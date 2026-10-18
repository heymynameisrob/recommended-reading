# Personal Archive

A Cloudflare content archive with scheduled website, RSS, and X API collection and a private MCP endpoint. See [SPEC.md](./SPEC.md) for scope, decisions, and unfinished work.

## Requirements

- Node.js 22 or later and npm.
- A Cloudflare account with Workers, D1, R2, Queues, and Browser Run enabled.
- Account billing as required by those services. Review browser and storage charges.

Dependencies are pinned to the versions checked when this scaffold was created. No dependencies have been installed and no checks have been run.

## Install and provision

Run commands from the repository root:

```bash
npm install
npm run cf -- login
npm run cf -- whoami
npm run cf -- d1 create archive
```

Copy the returned database ID into `apps/worker/wrangler.json`, replacing `REPLACE_WITH_D1_DATABASE_ID`.

R2 bucket names can need changing if unavailable. If you change the name below, update the matching Wrangler binding too.

```bash
npm run cf -- r2 bucket create personal-archive-artifacts
npm run cf -- queues create archive-jobs
npm run cf -- queues create archive-jobs-dlq
npm run db:remote
```

Generate a secret in your password manager or with:

```bash
openssl rand -hex 32
```

Save it securely, then paste it at the prompt:

```bash
npm run cf -- secret put ARCHIVE_API_KEY
npm run deploy
```

If Wrangler asks to create the Worker while setting its first secret, allow it. If the account requires a workers.dev subdomain, complete that setup when prompted. No Tunnel is required.

All HTTP routes, including health checks and MCP, require the bearer secret. Missing configuration denies access.

## Check deployment

Set `ARCHIVE_URL` to the URL printed by deployment, without a trailing slash. Set `ARCHIVE_API_KEY` in your shell using your password manager; do not commit it.

```bash
export ARCHIVE_URL="https://personal-archive.heymynameisrob.workers.dev"
curl --fail-with-body "$ARCHIVE_URL/health" -H "Authorization: Bearer $ARCHIVE_API_KEY"
curl --fail-with-body "$ARCHIVE_URL/api/items" -H "Authorization: Bearer $ARCHIVE_API_KEY"
```

An empty item list is expected before collection.

### Read the latest collections

`GET /api/collections` returns archived item summaries, newest collection time first.
Use the same `Authorization: Bearer <ARCHIVE_API_KEY>` header as the other routes.

```bash
curl --fail-with-body --get "$ARCHIVE_URL/api/collections" \
  -H "Authorization: Bearer $ARCHIVE_API_KEY" \
  --data-urlencode "limit=20"
```

The response has this shape:

```json
{ "items": [], "nextCursor": null }
```

Each item includes its ID, source ID, URL, title, collection time, screenshot key,
external ID, author, and publication time. Full item content is not included.
`limit` defaults to 20 and must be an integer from 1 to 100.
When `nextCursor` is not null, pass it unchanged to get the next page:

```bash
curl --fail-with-body --get "$ARCHIVE_URL/api/collections" \
  -H "Authorization: Bearer $ARCHIVE_API_KEY" \
  --data-urlencode "limit=20" \
  --data-urlencode "cursor=$NEXT_CURSOR"
```

`nextCursor: null` means there are no more results. Invalid limits or cursors return
HTTP 400. Items with the same collection time are ordered by ID to keep pagination
stable. New items appear when you request the first page again. The existing
`GET /api/items` route is unchanged. Apply database migrations before deployment
so the pagination index is available.

## Enable the seed sources

```bash
npm run cf -- d1 execute archive --remote --file=seed.sql
```

This enables the nine sources in [SEED.md](./SEED.md): three RSS feeds, three X lists, and three websites. The seed can run again without adding duplicate URLs. X list collection requires `X_API_BEARER_TOKEN`, as described below. Collection runs every thirty minutes in UTC after Cron configuration has propagated. Propagation can take several minutes. Cron is not an exact execution-time guarantee.

```bash
curl --fail-with-body "$ARCHIVE_URL/api/jobs" -H "Authorization: Bearer $ARCHIVE_API_KEY"
npm run cf -- tail
```

To request collection without waiting for the next scheduled run:

```bash
curl --fail-with-body -X POST "$ARCHIVE_URL/api/collect" \
  -H "Authorization: Bearer $ARCHIVE_API_KEY"
```

This protected endpoint returns HTTP 202 after scheduling collection. Collection runs in the background; check `/api/jobs` for results. Jobs use 30-minute time slots, so repeated requests in the same slot do not run completed jobs again. The response does not confirm that any enabled sources exist or that collection succeeded.

Manage other sources with administrator-run SQL for now. There is no source-management API yet. All enabled source kinds run every thirty minutes.

## RSS and Twitter/X sources

Install the XML parser dependency and apply the metadata migration when updating an existing deployment:

```bash
npm install
npm run db:local
npm run db:remote
```

RSS collection accepts an HTTPS feed URL and parses RSS 2.0, RDF/RSS 1.0, and Atom. It stores up to 200 entries per run, including feed-supplied text or HTML, entry ID, author, and publication time when supplied. It does not visit linked articles. Feeds with document type or custom entity declarations are rejected. Responses are bounded to 2 MiB and requests time out after thirty seconds.

Twitter collection uses X API v2, not browser scraping. Set an X developer application bearer token with access to the relevant timeline endpoints:

```bash
npm run cf -- secret put X_API_BEARER_TOKEN
```

For local development, set the same secret in the ignored `apps/worker/.dev.vars` file. Do not use your archive API key as the X token. A missing token fails Twitter jobs, not RSS or website jobs.

Supported source URLs:

- Profile: `https://x.com/USERNAME`
- List: `https://x.com/i/lists/LIST_ID`
- Equivalent `twitter.com` URLs are also accepted.

The collector looks up profile IDs through `/2/users/by/username/:username` and reads `/2/users/:id/tweets` or `/2/lists/:id/tweets`. It requests the latest 100 posts, including authors, publication times, and long-form text when available. There is no pagination, cursor, or historical backfill yet. Busy timelines can have gaps between runs. Repeated polls consume X API usage; access and billing depend on your X account. Private lists and protected profiles can need a different user-authenticated flow and are not supported by this app-only collector. HTTP failures and partial API errors fail the job rather than silently marking it complete.

Example source inserts:

```bash
npm run cf -- d1 execute archive --remote --command="INSERT INTO sources (id, kind, url, enabled) VALUES ('hn', 'rss', 'https://hnrss.org/frontpage', 1);"
npm run cf -- d1 execute archive --remote --command="INSERT INTO sources (id, kind, url, enabled) VALUES ('designers', 'twitter', 'https://x.com/i/lists/2054157691715481663', 1);"
npm run cf -- d1 execute archive --remote --command="INSERT INTO sources (id, kind, url, enabled) VALUES ('x-profile', 'twitter', 'https://x.com/USERNAME', 1);"
```

Replace `USERNAME` before inserting the profile source. These commands are examples, not repeatable seed migrations. Content hashes include entry identity so distinct posts with identical text are not collapsed. Copies from different configured sources remain separate.

After installing, migrating, and setting the secret, run `npm run deploy`.

## Code checks

Run these commands from the repository root after `pnpm install`:

```bash
pnpm typecheck     # Check TypeScript with tsgo
pnpm lint          # Check code with oxlint
pnpm lint:fix      # Apply automatic lint fixes
pnpm format:check  # Check formatting with oxfmt
pnpm format        # Apply formatting
pnpm check         # Run all three checks without changing files
```

Type checking uses the root `tsconfig.json` for both workspaces. Lint and format settings are in `.oxlintrc.json` and `.oxfmtrc.json`. Generated Worker files and backups are excluded.

## Local development

```bash
cp apps/worker/.dev.vars.example apps/worker/.dev.vars
```

Replace the placeholder secret in that ignored file, then:

```bash
npm run db:local
npm run cf -- d1 execute archive --local --file=seed.sql
npm run cf -- dev --test-scheduled
```

The browser binding uses remote Browser Run even during local development. It needs login and can incur charges. D1, R2, and Queues otherwise use Wrangler's local development support; local queue behaviour is not a complete production simulation.

Trigger the local scheduled handler from another terminal:

```bash
curl "http://localhost:8787/__scheduled?cron=*/30+*+*+*+*"
```

Wrangler's test-only scheduled endpoint does not use application authentication. It is not a deployed application route.

## Connect an MCP client

- Endpoint: `https://YOUR-WORKER-URL/mcp`
- Header: `Authorization: Bearer YOUR_SECRET`
- Tools: `search_items`, `get_recent_items`, `get_item`

Use the remote HTTP transport supported by your client. The MCP handler includes compatibility for older Streamable HTTP clients. This server does not provide an OAuth login flow. Pi configuration depends on the MCP integration installed in your Pi setup; configure the URL and header there, not in a committed file.

The server is read-only. Search accepts SQLite FTS5 syntax. Browser and write actions are not exposed to the agent.

## Back up D1

```bash
mkdir -p backups
npm run cf -- d1 export archive --remote --output=../../backups/archive.sql
sqlite3 backups/archive.sqlite < backups/archive.sql
```

Workspace scripts run inside `apps/worker`, so export output paths are relative to that directory. The SQLite import command runs at the repository root. Import into a new database file; do not repeatedly import the same dump into an existing file. D1 exports can block requests. Back up R2 separately and store copies outside this repository.

## Current limits

This is an unverified scaffold, not a finished product. It includes browser website, RSS/Atom, and X API collectors, but not AI summaries, a UI, or Reading List integration. Inspect SPEC.md before relying on unattended operation. Browser jobs retry through Queues; inspect the dead-letter queue after exhausted retries. Add alerts, stale-job recovery, and restore verification before production use.

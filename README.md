# Recommended Reading

Service to scrape and read interesting content and collate into a personal archive. An RSS feed on steroids.

- HTTP endpoint to add and manage content sources
- Scheduled worker that automatically looks for new content from sources (e.g RSS feeds, X accounts) and stores those in SQLite
- An MCP that queries and writes for agent to use
- All of this is secured behind a private key so it just works for me.


## Commands
FYI Run `nvm use` to make sure you use correct Node version (24)

| **Description**             | **Command**        |
| --------------------------- | ------------------ |
| Install deps                | `pnpm install`     |
| Start dev server            | `pnpm dev`         |
| Deploy worker               | `pnpm run deploy`  |
| Typecheck, lint, and format | `pnpm check`       |
| Apply local DB migrations   | `pnpm db:local`    |
| Apply remote DB migrations  | `pnpm db:remote`   |

## Connect Pi to the archive

Add this to `~/.pi/agent/mcp.json`, keeping any existing server entries.
Replace `<YOUR_API_KEY>` with the Worker's `ARCHIVE_API_KEY`. Do not commit this file.

```json
{
  "mcpServers": {
    "recommended-reading": {
      "url": "https://personal-archive.heymynameisrob.workers.dev/mcp",
      "headers": {
        "Authorization": "Bearer <YOUR_API_KEY>"
      }
    }
  }
}
```

Run `pi mcp list` to check the connection, then `/reload` in Pi.

## Goal
Our attention is our most precious resource. 99 times out of 100 when I scroll X or Instagram to find interesting things to look at it, it ends with consuming slop. Ads, ragebait, AI bro content. I'm tired of an endless search for quality food and only finding junk.

The idea here is to create an automated system that pulls content from sources with a high rate of quality. Then organise those into long-form and short-form content I can read and scan. 

The secondary goal is to learn more about building automated services. This is 100% AI written but over time I'll learn more about how each part works and refactor it until it's mostly human re-written.

## Ideas
- [ ] Add AI summary for new content
- [ ] Create Twitter-like feed of snippets of long form I can save later
- [ ] Consider AI agent to browse web pages so we can instruct it e.g 'Look at the latest blog post'

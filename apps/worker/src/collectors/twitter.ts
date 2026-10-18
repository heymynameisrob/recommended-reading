import { z } from "zod";
import type { Source } from "@archive/core";
import type { CollectedItem } from "./types";
import { fetchSourceText, hashEntry, parsePublishedAt } from "./http";

const userSchema = z.object({
  id: z.string().regex(/^\d+$/),
  username: z.string(),
  name: z.string().optional(),
});

const timelineSchema = z.object({
  data: z
    .array(
      z.object({
        id: z.string().regex(/^\d+$/),
        text: z.string(),
        author_id: z.string().optional(),
        created_at: z.string().optional(),
        note_tweet: z.object({ text: z.string() }).optional(),
      }),
    )
    .optional(),
  includes: z.object({ users: z.array(userSchema).optional() }).optional(),
  meta: z
    .object({ result_count: z.number().optional(), next_token: z.string().optional() })
    .optional(),
  errors: z.array(z.unknown()).optional(),
});

/** Accept an X/Twitter profile URL or numeric List URL, not arbitrary API paths. */
function parseTarget(value: string) {
  const url = new URL(value);

  if (
    url.protocol !== "https:" ||
    !["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.port
  ) {
    throw new Error("Twitter source must be an HTTPS x.com or twitter.com URL");
  }

  const list = /^\/i\/lists\/(\d+)\/?$/.exec(url.pathname);

  if (list) return { kind: "list" as const, id: list[1] };
  const profile = /^\/([A-Za-z0-9_]{1,15})\/?$/.exec(url.pathname);

  if (
    profile &&
    !["home", "explore", "search", "settings", "notifications", "messages", "i"].includes(
      profile[1].toLowerCase(),
    )
  ) {
    return { kind: "profile" as const, username: profile[1] };
  }

  throw new Error("Use a profile URL or https://x.com/i/lists/LIST_ID");
}

/** Send the API credential only to the fixed X API origin, without redirects. */
async function requestX<Payload>(
  path: string,
  schema: z.ZodType<Payload>,
  token: string,
  params?: URLSearchParams,
): Promise<Payload> {
  const url = new URL(`https://api.x.com/2/${path}`);

  if (params) url.search = params.toString();

  const response = await fetchSourceText(
    url.href,
    {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    true,
  );

  return schema.parse(JSON.parse(response));
}

/** Collect the latest 100 posts from a public profile or accessible X List. */
export async function collectTwitter(
  source: Source,
  bearerToken: string | undefined,
): Promise<CollectedItem[]> {
  if (!bearerToken) throw new Error("X_API_BEARER_TOKEN is required for Twitter collection");
  const target = parseTarget(source.url);
  let path: string;

  if (target.kind === "list") {
    path = `lists/${target.id}/tweets`;
  } else {
    const lookup = await requestX(
      `users/by/username/${encodeURIComponent(target.username)}`,
      z.object({ data: userSchema }),
      bearerToken,
    );

    path = `users/${lookup.data.id}/tweets`;
  }

  const params = new URLSearchParams({
    max_results: "100",
    "tweet.fields": "created_at,author_id,note_tweet",
    expansions: "author_id",
    "user.fields": "username,name",
  });

  const timeline = await requestX(path, timelineSchema, bearerToken, params);

  if (timeline.errors?.length)
    throw new Error("X API returned partial errors; collection will retry");

  if (!timeline.data && timeline.meta?.result_count !== 0)
    throw new Error("X API response is missing timeline data");
  const authors = new Map((timeline.includes?.users ?? []).map((user) => [user.id, user.username]));
  const items: CollectedItem[] = [];

  for (const tweet of timeline.data ?? []) {
    const author = tweet.author_id ? authors.get(tweet.author_id) : undefined;
    const content = (tweet.note_tweet?.text ?? tweet.text).slice(0, 100_000);

    const url = author
      ? `https://x.com/${author}/status/${tweet.id}`
      : `https://x.com/i/web/status/${tweet.id}`;

    const publishedAt = tweet.created_at ? parsePublishedAt(tweet.created_at) : undefined;
    items.push({
      externalId: tweet.id,
      url,
      title: `${author ? `@${author}: ` : ""}${content.slice(0, 160)}`,
      content,
      author: author ?? tweet.author_id,
      publishedAt,
      contentHash: await hashEntry({ id: tweet.id, content }),
      artifacts: [],
    });
  }

  return items;
}

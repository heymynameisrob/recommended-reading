import type { Source } from "@archive/core";
import { capturePage } from "../browser/capture-page";
import type { CollectedItem } from "./types";

/** Collect a configured website without writing archive or job state. */
export async function collectWebsite(binding: Fetcher, source: Source): Promise<CollectedItem[]> {
  const url = new URL(source.url);
  if (url.protocol !== "https:") throw new Error("Only HTTPS sources are supported");

  const capture = await capturePage(binding, source.url);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(capture.content));
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const screenshotKey = `screenshots/${source.id}/${hash}.png`;

  return [
    {
      url: source.url,
      title: capture.title,
      content: capture.content,
      contentHash: hash,
      screenshotKey,
      artifacts: [
        {
          key: screenshotKey,
          body: capture.screenshot,
          contentType: "image/png",
        },
      ],
    },
  ];
}

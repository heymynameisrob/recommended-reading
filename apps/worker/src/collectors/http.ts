const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

/** Fetch bounded source data with a timeout; authenticated calls must not follow redirects. */
export async function fetchSourceText(
  url: string,
  headers: Record<string, string> = {},
  authenticated = false,
) {
  const response = await fetch(url, {
    headers,
    redirect: authenticated ? "error" : "follow",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Source request failed with HTTP ${response.status}`);
  }
  if (!response.body) throw new Error("Source response has no body");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) throw new Error("Source response exceeds 2 MiB");
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
}

/** Hash stable entry identity and content so equal-text posts remain separate items. */
export async function hashEntry(value: unknown) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Resolve only HTTP article links; never expose active URL schemes to clients. */
export function resolveArticleUrl(value: string, base: string) {
  try {
    const url = new URL(value, base);
    return ["https:", "http:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/** Normalize valid publication dates without replacing absent dates with collection time. */
export function parsePublishedAt(value: string) {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? undefined : new Date(timestamp).toISOString();
}

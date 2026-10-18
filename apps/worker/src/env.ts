import type { CollectionMessage } from "@archive/core";

export interface Env {
  DB: D1Database;
  ARTIFACTS: R2Bucket;
  BROWSER: Fetcher;
  JOBS: Queue<CollectionMessage>;
  ARCHIVE_API_KEY: string;
  X_API_BEARER_TOKEN?: string;
}

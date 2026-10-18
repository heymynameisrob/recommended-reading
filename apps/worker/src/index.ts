import type { CollectionMessage } from "@archive/core";
import { collectWebsite } from "./collectors/website";
import { collectRss } from "./collectors/rss";
import { collectTwitter } from "./collectors/twitter";
import { dispatchCollection } from "./jobs/dispatch";
import { scheduleCollections } from "./jobs/schedule";
import { storeCollection } from "./storage/collection";
import { handlePostCollect } from "./routes/collect";
import { handleGetCollections } from "./routes/collections";
import { handleGetHealth } from "./routes/health";
import { handleGetItems } from "./routes/items";
import { handleGetJobs } from "./routes/jobs";
import { handleMcp } from "./routes/mcp";
import { createWorker } from "./worker";
import type { Env } from "./env";

/** Composition root: the only module that binds the worker to the real collectors. */
export default createWorker({
  handleMcp,
  handleGetHealth,
  handleGetCollections,
  handleGetItems,
  handlePostCollect,
  handleGetJobs,
  dispatchCollection: (env: Env, message: CollectionMessage) =>
    dispatchCollection(env, message, {
      collectWebsite,
      collectRss,
      collectTwitter,
      storeCollection,
    }),
  scheduleCollections,
});

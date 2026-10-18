import { createMcpHandler } from "agents/mcp/server";
import { createArchiveServer } from "../mcp";
import type { Env } from "../env";

/** Handle an MCP request with a request-scoped archive server. */
export function handleMcp(request: Request, env: Env, ctx: ExecutionContext) {
  return createMcpHandler(() => createArchiveServer(env))(request, env, ctx);
}

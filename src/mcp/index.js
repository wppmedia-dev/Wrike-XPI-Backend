import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCampaignTools } from "./tools/campaign.js";
import { registerChannelTools } from "./tools/channel.js";
import { registerTaskTools } from "./tools/task.js";
import { registerDatahubTools } from "./tools/datahub.js";
import { registerAuthTools } from "./tools/auth.js";
import { sessionAuthStore } from "./sessionAuth.js";

export { sessionAuthStore };

/**
 * Create a fully-configured MCP server with all tools registered.
 *
 * Unlike the previous per-request pattern, this creates a SINGLE server
 * instance. Authentication is resolved per-session via the sessionAuthStore,
 * using the MCP session ID provided in the `extra` callback parameter.
 *
 * @param {object} fastify - Fastify instance (passed to create tool)
 * @param {string} serverUrl - Base URL for auth instructions
 * @returns {McpServer}
 */
export const createMcpServer = (fastify, serverUrl) => {
  const server = new McpServer(
    {
      name: "wrikexpi-mcp",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  // Auth tools (do NOT require pre-existing auth)
  registerAuthTools(server, sessionAuthStore, serverUrl);

  // All other tools resolve auth from the session store keyed by session ID
  registerCampaignTools(server, sessionAuthStore, fastify, serverUrl);
  registerChannelTools(server, sessionAuthStore, serverUrl);
  registerTaskTools(server, sessionAuthStore, serverUrl);
  registerDatahubTools(server, sessionAuthStore, serverUrl);

  return server;
};

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCampaignTools } from "./tools/campaign.js";
import { registerChannelTools } from "./tools/channel.js";
import { registerTaskTools } from "./tools/task.js";
import { registerDatahubTools } from "./tools/datahub.js";
import { registerAuthTools } from "./tools/auth.js";

/**
 * Create a fully-configured MCP server with all tools registered.
 * Authentication is done via auth_token passed directly to each tool.
 *
 * @param {object} fastify - Fastify instance
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

  // Auth tools
  registerAuthTools(server, serverUrl);

  // All other tools
  registerCampaignTools(server, fastify, serverUrl);
  registerChannelTools(server, serverUrl);
  registerTaskTools(server, serverUrl);
  registerDatahubTools(server, serverUrl);

  return server;
};

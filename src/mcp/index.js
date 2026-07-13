import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCampaignTools } from "./tools/campaign.js";
import { registerChannelTools } from "./tools/channel.js";
import { registerTaskTools } from "./tools/task.js";
import { registerDatahubTools } from "./tools/datahub.js";

/**
 * Create a fully-configured MCP server with all tools registered.
 *
 * A new server instance is created per-request so that each invocation
 * gets the correct auth context (wrikeToken, environmentName) bound
 * via closure. This avoids any global mutable session state.
 *
 * @param {{wrikeToken: string, environmentName: string, fastify?: object}} ctx
 * @returns {McpServer}
 */
export const createMcpServer = (ctx) => {
  const server = new McpServer(
    {
      name: "wrikexpi-mcp",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {}, // advertise tools capability
      },
    },
  );

  // Register every tool group — each receives the server and auth context
  registerCampaignTools(server, ctx);
  registerChannelTools(server, ctx);
  registerTaskTools(server, ctx);
  registerDatahubTools(server, ctx);

  return server;
};

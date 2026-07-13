import { z } from "zod";
import { GetAllChannels } from "../../routes/channel/handlers/getAllChannels";
import { GetChannel } from "../../routes/channel/handlers/getChannel";
import { UpdateChannel } from "../../routes/channel/handlers/updateChannel";
import { DeleteChannel } from "../../routes/channel/handlers/deleteChannel";

const serializeResult = (result) => {
  if (!result) return { success: true, data: null };
  if (typeof result === "object" && "statusCode" in result) {
    const { statusCode, ...rest } = result;
    return { success: statusCode < 400, statusCode, ...rest };
  }
  return result;
};

/**
 * Register all channel-related MCP tools on the given server instance.
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server
 * @param {{wrikeToken: string, environmentName: string}} ctx
 */
export const registerChannelTools = (server, ctx) => {
  const { wrikeToken, environmentName } = ctx;

  server.registerTool(
    "channel_list",
    {
      description:
        "List channels for a campaign using the existing channel list workflow.",
      inputSchema: {
        campaignId: z
          .string()
          .describe("The Wrike folder ID of the parent campaign"),
        filter: z.string().optional().describe("OData filter expression"),
        pageSize: z
          .number()
          .int()
          .optional()
          .describe("Number of results per page"),
        nextPageToken: z
          .string()
          .optional()
          .describe("Token for the next page of results"),
      },
    },
    async ({ campaignId, filter, pageSize, nextPageToken }) => {
      try {
        const result = await GetAllChannels(
          wrikeToken,
          { campaignId, filter, pageSize, nextPageToken },
          environmentName,
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(serializeResult(result), null, 2),
            },
          ],
        };
      } catch (err) {
        throw new Error(err?.message || "Failed to list channels");
      }
    },
  );

  server.registerTool(
    "channel_get",
    {
      description: "Read a single channel by its Wrike task/folder ID.",
      inputSchema: {
        channelId: z.string().describe("The Wrike ID of the channel"),
      },
    },
    async ({ channelId }) => {
      try {
        const result = await GetChannel(
          wrikeToken,
          { channelId },
          environmentName,
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(serializeResult(result), null, 2),
            },
          ],
        };
      } catch (err) {
        throw new Error(err?.message || "Failed to get channel");
      }
    },
  );

  server.registerTool(
    "channel_update",
    {
      description:
        "Update a channel by its Wrike ID. Provide formFields as a key-value object of field names to values.",
      inputSchema: {
        channelId: z.string().describe("The Wrike ID of the channel"),
        formFields: z
          .record(z.any())
          .default({})
          .describe("Key-value map of field names to new values"),
      },
    },
    async ({ channelId, formFields }) => {
      try {
        const result = await UpdateChannel(
          wrikeToken,
          { channelId, formFields },
          environmentName,
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(serializeResult(result), null, 2),
            },
          ],
        };
      } catch (err) {
        throw new Error(err?.message || "Failed to update channel");
      }
    },
  );

  server.registerTool(
    "channel_delete",
    {
      description: "Delete a channel by its Wrike ID.",
      inputSchema: {
        channelId: z.string().describe("The Wrike ID of the channel"),
      },
    },
    async ({ channelId }) => {
      try {
        const result = await DeleteChannel(
          wrikeToken,
          { channelId },
          environmentName,
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(serializeResult(result), null, 2),
            },
          ],
        };
      } catch (err) {
        throw new Error(err?.message || "Failed to delete channel");
      }
    },
  );
};

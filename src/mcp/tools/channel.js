import { z } from "zod";
import { GetAllChannels } from "../../routes/channel/handlers/getAllChannels";
import { GetChannel } from "../../routes/channel/handlers/getChannel";
import { UpdateChannel } from "../../routes/channel/handlers/updateChannel";
import { DeleteChannel } from "../../routes/channel/handlers/deleteChannel";
import { getAuthError, resolveAuth, authTokenField } from "./auth.js";

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
 * Auth is resolved from the auth_token parameter passed to each tool.
 *
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server
 * @param {string} serverUrl
 */
export const registerChannelTools = (server, serverUrl) => {
  server.registerTool(
    "channel_list",
    {
      description:
        "List channels for a campaign using the existing channel list workflow.\n\n" +
        "FILTER PARAMETERS:\n" +
        "  Field names are the short codes from datahub_list_fields where isChannelField=true.\n" +
        "\n" +
        "  OPERATORS: eq, ne, lt, le, gt, ge, has, startswith, endswith\n" +
        "\n" +
        "  RULES:\n" +
        "    - String values must be in single quotes.\n" +
        "    - Multiple conditions use 'and' only (OR not supported).\n" +
        "    - Wrap expression in parentheses.\n" +
        "\n" +
        "  EXAMPLES:\n" +
        "    (channelname eq 'TV Spot')\n" +
        "    (channelname eq 'TV Spot' and mediabuytype eq 'Programmatic')\n" +
        "    has(channelname, 'Digital')",
      inputSchema: {
        auth_token: authTokenField,
        campaignId: z
          .string()
          .describe("The Wrike folder ID of the parent campaign"),
        filter: z
          .string()
          .optional()
          .describe(
            "OData filter expression. 'and' supported. OR not supported. Example: (channelname eq 'TV Spot' and mediabuytype eq 'Programmatic')",
          ),
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
    async (
      { auth_token, campaignId, filter, pageSize, nextPageToken },
      extra,
    ) => {
      const auth = await resolveAuth(auth_token);
      if (!auth) return getAuthError(serverUrl);
      try {
        const result = await GetAllChannels(
          auth.wrikeToken,
          { campaignId, filter, pageSize, nextPageToken },
          auth.environmentName,
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
        auth_token: authTokenField,
        channelId: z.string().describe("The Wrike ID of the channel"),
      },
    },
    async ({ auth_token, channelId }, extra) => {
      const auth = await resolveAuth(auth_token);
      if (!auth) return getAuthError(serverUrl);
      try {
        const result = await GetChannel(
          auth.wrikeToken,
          { channelId },
          auth.environmentName,
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
        auth_token: authTokenField,
        channelId: z.string().describe("The Wrike ID of the channel"),
        formFields: z
          .record(z.any())
          .default({})
          .describe("Key-value map of field names to new values"),
      },
    },
    async ({ auth_token, channelId, formFields }, extra) => {
      const auth = await resolveAuth(auth_token);
      if (!auth) return getAuthError(serverUrl);
      try {
        const result = await UpdateChannel(
          auth.wrikeToken,
          { channelId, formFields },
          auth.environmentName,
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
        auth_token: authTokenField,
        channelId: z.string().describe("The Wrike ID of the channel"),
      },
    },
    async ({ auth_token, channelId }, extra) => {
      const auth = await resolveAuth(auth_token);
      if (!auth) return getAuthError(serverUrl);
      try {
        const result = await DeleteChannel(
          auth.wrikeToken,
          { channelId },
          auth.environmentName,
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

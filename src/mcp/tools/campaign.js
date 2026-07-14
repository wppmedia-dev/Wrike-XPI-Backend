import { z } from "zod";
import { GetAllCampaigns } from "../../routes/campaign/handlers/getAllCampaigns";
import { GetCampaign } from "../../routes/campaign/handlers/getCampaign";
import { CreateCampaign } from "../../routes/campaign/handlers/createCampaign";
import { UpdateCampaign } from "../../routes/campaign/handlers/updateCampaign";
import { DeleteCampaign } from "../../routes/campaign/handlers/deleteCampaign";
import { getAuthError } from "./auth.js";

const serializeResult = (result) => {
  if (!result) return { success: true, data: null };
  if (typeof result === "object" && "statusCode" in result) {
    const { statusCode, ...rest } = result;
    return { success: statusCode < 400, statusCode, ...rest };
  }
  return result;
};

/**
 * Register all campaign-related MCP tools on the given server instance.
 * Auth is resolved per-session from the sessionAuthStore.
 *
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server
 * @param {{get: Function}} sessionAuthStore
 * @param {object} fastify
 * @param {string} serverUrl
 */
export const registerCampaignTools = (
  server,
  sessionAuthStore,
  fastify,
  serverUrl,
) => {
  server.registerTool(
    "campaign.list",
    {
      description:
        "List campaigns using the existing campaign API logic. " +
        "Supports OData-style filters and pagination.\n\n" +
        "FILTER PARAMETERS:\n" +
        "  Field names are the short codes returned by datahub_list_fields (e.g. agency, campaignname, campaignbudget, brand, client).\n" +
        "\n" +
        "  OPERATORS:\n" +
        "    eq         – equals (case-insensitive string match)\n" +
        "    ne         – not equal\n" +
        "    lt / le    – less than / less or equal\n" +
        "    gt / ge    – greater than / greater or equal\n" +
        "    has        – contains (substring match)\n" +
        "    startswith – starts with a value\n" +
        "    endswith   – ends with a value\n" +
        "\n" +
        "  IMPORTANT:\n" +
        "    - String values MUST be wrapped in single quotes.\n" +
        "    - Multiple conditions are combined with 'and' only (OR is NOT supported).\n" +
        "    - Always wrap the full expression in parentheses.\n" +
        "    - Numeric values (budget, dates) can be compared with lt/le/gt/ge without quotes.\n" +
        "\n" +
        "  EXAMPLES:\n" +
        "    Single condition:\n" +
        "      (agency eq 'EssenceMediacom')\n" +
        "\n" +
        "    Multiple AND conditions:\n" +
        "      (agency eq 'EssenceMediacom' and campaignname eq 'Lacer - Pilexil - AO Diciembre')\n" +
        "\n" +
        "    Method call-style:\n" +
        "      startswith(campaignname, 'Industry')\n" +
        "\n" +
        "    Contains (substring):\n" +
        "      has(campaignname, 'Fidelity')\n" +
        "\n" +
        "    Numeric comparison:\n" +
        "      (campaignbudget gt '1000')\n" +
        "\n" +
        "  URL equivalent: filter=(agency eq 'EssenceMediacom' and campaignname eq 'Lacer - Pilexil - AO Diciembre')&pageSize=5",
      inputSchema: {
        filter: z
          .string()
          .optional()
          .describe(
            "OData filter expression. Use 'and' to combine conditions. OR not supported. " +
              "Example: (agency eq 'EssenceMediacom' and campaignname eq 'Campaign Name'). " +
              "Field names are the short codes from datahub_list_fields.",
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
    async ({ filter, pageSize, nextPageToken }, extra) => {
      const auth = sessionAuthStore.get(extra.sessionId);
      if (!auth) return getAuthError(serverUrl);
      try {
        const result = await GetAllCampaigns(
          auth.wrikeToken,
          { filter, pageSize, nextPageToken },
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
        throw new Error(err?.message || "Failed to list campaigns");
      }
    },
  );

  server.registerTool(
    "campaign.get",
    {
      description: "Read a single campaign by its Wrike folder ID.",
      inputSchema: {
        campaignId: z.string().describe("The Wrike folder ID of the campaign"),
      },
    },
    async ({ campaignId }, extra) => {
      const auth = sessionAuthStore.get(extra.sessionId);
      if (!auth) return getAuthError(serverUrl);
      try {
        const result = await GetCampaign(
          auth.wrikeToken,
          { campaignId },
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
        throw new Error(err?.message || "Failed to get campaign");
      }
    },
  );

  server.registerTool(
    "campaign.create",
    {
      description:
        "Create a campaign using the existing request-form workflow. Requires space, entity, variantId, and optional fields.",
      inputSchema: {
        space: z.string().describe("Wrike space identifier"),
        entity: z.string().describe("Entity type for the request form"),
        variantId: z.number().int().describe("Variant ID for the request form"),
        fields: z
          .record(z.any())
          .optional()
          .describe("Field values for the campaign request form"),
        isCreatedByURL: z
          .boolean()
          .optional()
          .describe("If true, returns a pre-fill URL instead of submitting"),
      },
    },
    async ({ space, entity, variantId, fields, isCreatedByURL }, extra) => {
      const auth = sessionAuthStore.get(extra.sessionId);
      if (!auth) return getAuthError(serverUrl);
      try {
        const result = await CreateCampaign(
          auth.wrikeToken,
          {
            space,
            entity,
            variantId,
            fields: fields || {},
            isCreatedByURL: !!isCreatedByURL,
          },
          fastify,
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
        throw new Error(err?.message || "Failed to create campaign");
      }
    },
  );

  server.registerTool(
    "campaign.update",
    {
      description:
        "Update a campaign by its Wrike folder ID. Provide formFields as a key-value object of field names to values.",
      inputSchema: {
        campaignId: z.string().describe("The Wrike folder ID of the campaign"),
        formFields: z
          .record(z.any())
          .default({})
          .describe("Key-value map of field names to new values"),
      },
    },
    async ({ campaignId, formFields }, extra) => {
      const auth = sessionAuthStore.get(extra.sessionId);
      if (!auth) return getAuthError(serverUrl);
      try {
        const result = await UpdateCampaign(
          auth.wrikeToken,
          { campaignId, formFields },
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
        throw new Error(err?.message || "Failed to update campaign");
      }
    },
  );

  server.registerTool(
    "campaign.delete",
    {
      description: "Delete a campaign by its Wrike folder ID.",
      inputSchema: {
        campaignId: z.string().describe("The Wrike folder ID of the campaign"),
      },
    },
    async ({ campaignId }, extra) => {
      const auth = sessionAuthStore.get(extra.sessionId);
      if (!auth) return getAuthError(serverUrl);
      try {
        const result = await DeleteCampaign(
          auth.wrikeToken,
          { campaignId },
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
        throw new Error(err?.message || "Failed to delete campaign");
      }
    },
  );
};

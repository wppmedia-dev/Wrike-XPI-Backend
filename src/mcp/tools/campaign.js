import { z } from "zod";
import { GetAllCampaigns } from "../../routes/campaign/handlers/getAllCampaigns";
import { GetCampaign } from "../../routes/campaign/handlers/getCampaign";
import { CreateCampaign } from "../../routes/campaign/handlers/createCampaign";
import { UpdateCampaign } from "../../routes/campaign/handlers/updateCampaign";
import { DeleteCampaign } from "../../routes/campaign/handlers/deleteCampaign";

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
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server
 * @param {{wrikeToken: string, environmentName: string, fastify: object}} ctx
 */
export const registerCampaignTools = (server, ctx) => {
  const { wrikeToken, environmentName, fastify } = ctx;

  server.registerTool(
    "campaign.list",
    {
      description:
        "List campaigns using the existing campaign API logic. Supports OData-style filters and pagination.",
      inputSchema: {
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
    async ({ filter, pageSize, nextPageToken }) => {
      try {
        const result = await GetAllCampaigns(
          wrikeToken,
          { filter, pageSize, nextPageToken },
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
    async ({ campaignId }) => {
      try {
        const result = await GetCampaign(
          wrikeToken,
          { campaignId },
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
    async ({ space, entity, variantId, fields, isCreatedByURL }) => {
      try {
        const result = await CreateCampaign(
          wrikeToken,
          {
            space,
            entity,
            variantId,
            fields: fields || {},
            isCreatedByURL: !!isCreatedByURL,
          },
          fastify,
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
    async ({ campaignId, formFields }) => {
      try {
        const result = await UpdateCampaign(
          wrikeToken,
          { campaignId, formFields },
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
    async ({ campaignId }) => {
      try {
        const result = await DeleteCampaign(
          wrikeToken,
          { campaignId },
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
        throw new Error(err?.message || "Failed to delete campaign");
      }
    },
  );
};

import { z } from "zod";
import { getDatahubCustomFields } from "../../utils/wrike";

const normalizeFieldMap = (fieldMapping = {}) => {
  if (!fieldMapping || typeof fieldMapping !== "object") return {};
  const normalized = {};
  Object.entries(fieldMapping).forEach(([key, value]) => {
    const fieldKey = String(key || "")
      .trim()
      .toLowerCase();
    if (!fieldKey) return;
    normalized[fieldKey] = { ...(value || {}), rawKey: key };
  });
  return normalized;
};

/**
 * Register the Datahub field discovery tool on the given server instance.
 * This tool exposes the field mapping metadata that agents use to resolve
 * friendly field names to the correct internal identifiers before calling
 * campaign, channel, or task CRUD tools.
 *
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server
 * @param {{wrikeToken: string, environmentName: string}} ctx
 */
export const registerDatahubTools = (server, ctx) => {
  const { wrikeToken, environmentName } = ctx;

  server.registerTool(
    "datahub.list_fields",
    {
      description:
        "Return the Datahub field mapping metadata for campaign, channel, and task CRUD tools. " +
        "Agents should call this first to discover valid field keys and their properties " +
        "(isCampaignField, isChannelField, isTaskField, isWritable, isReadable) before " +
        "invoking update or create operations.",
      inputSchema: {
        includeMetadata: z
          .boolean()
          .optional()
          .describe("Include raw metadata alongside field definitions"),
      },
    },
    async ({ includeMetadata }) => {
      try {
        if (!wrikeToken) {
          throw new Error("Authentication token is not available.");
        }

        const fieldMapping = await getDatahubCustomFields(
          wrikeToken,
          null,
          false,
          true,
          null,
          environmentName,
        );
        const normalizedFieldMap = normalizeFieldMap(fieldMapping);

        const fields = Object.entries(normalizedFieldMap).map(
          ([key, value]) => ({
            key,
            cfId: value?.cfId,
            isCampaignField: value?.isCampaignField,
            isChannelField: value?.isChannelField,
            isTaskField: value?.isTaskField,
            isWritable: value?.isWritable,
            isReadable: value?.isReadable,
            xpiFieldType: value?.xpiFieldType,
            description: value?.description,
          }),
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message:
                    "Field metadata resolved via the Datahub custom field mapping API.",
                  count: fields.length,
                  data: fields,
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        throw new Error(err?.message || "Failed to list Datahub custom fields");
      }
    },
  );
};

import { z } from "zod";
import { GetAllTasks } from "../../routes/task/handlers/getAllTasks";
import { GetTask } from "../../routes/task/handlers/getTask";
import { UpdateTask } from "../../routes/task/handlers/updateTask";
import { DeleteTask } from "../../routes/task/handlers/deleteTask";

const serializeResult = (result) => {
  if (!result) return { success: true, data: null };
  if (typeof result === "object" && "statusCode" in result) {
    const { statusCode, ...rest } = result;
    return { success: statusCode < 400, statusCode, ...rest };
  }
  return result;
};

/**
 * Register all task-related MCP tools on the given server instance.
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server
 * @param {{wrikeToken: string, environmentName: string}} ctx
 */
export const registerTaskTools = (server, ctx) => {
  const { wrikeToken, environmentName } = ctx;

  server.registerTool(
    "task_list_channel",
    {
      description:
        "List tasks for a channel using the existing channel-task collection logic.",
      inputSchema: {
        channelId: z.string().describe("The Wrike ID of the parent channel"),
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
    async ({ channelId, filter, pageSize, nextPageToken }) => {
      try {
        const result = await GetAllTasks(
          wrikeToken,
          { channelId, filter, pageSize, nextPageToken },
          "channel",
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
        throw new Error(err?.message || "Failed to list channel tasks");
      }
    },
  );

  server.registerTool(
    "task_list_campaign",
    {
      description:
        "List tasks for a campaign using the existing campaign-task collection logic.",
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
        const result = await GetAllTasks(
          wrikeToken,
          { campaignId, filter, pageSize, nextPageToken },
          "campaign",
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
        throw new Error(err?.message || "Failed to list campaign tasks");
      }
    },
  );

  server.registerTool(
    "task_get",
    {
      description: "Read a single task by its Wrike task ID.",
      inputSchema: {
        taskId: z.string().describe("The Wrike task ID"),
      },
    },
    async ({ taskId }) => {
      try {
        const result = await GetTask(wrikeToken, { taskId }, environmentName);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(serializeResult(result), null, 2),
            },
          ],
        };
      } catch (err) {
        throw new Error(err?.message || "Failed to get task");
      }
    },
  );

  server.registerTool(
    "task_update",
    {
      description:
        "Update a task by its Wrike task ID. Provide formFields as a key-value object of field names to values.",
      inputSchema: {
        taskId: z.string().describe("The Wrike task ID"),
        formFields: z
          .record(z.any())
          .default({})
          .describe("Key-value map of field names to new values"),
      },
    },
    async ({ taskId, formFields }) => {
      try {
        const result = await UpdateTask(
          wrikeToken,
          { taskId, formFields },
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
        throw new Error(err?.message || "Failed to update task");
      }
    },
  );

  server.registerTool(
    "task_delete",
    {
      description: "Delete a task by its Wrike task ID.",
      inputSchema: {
        taskId: z.string().describe("The Wrike task ID"),
      },
    },
    async ({ taskId }) => {
      try {
        const result = await DeleteTask(
          wrikeToken,
          { taskId },
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
        throw new Error(err?.message || "Failed to delete task");
      }
    },
  );
};

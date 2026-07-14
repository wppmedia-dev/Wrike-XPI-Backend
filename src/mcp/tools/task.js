import { z } from "zod";
import { GetAllTasks } from "../../routes/task/handlers/getAllTasks";
import { GetTask } from "../../routes/task/handlers/getTask";
import { UpdateTask } from "../../routes/task/handlers/updateTask";
import { DeleteTask } from "../../routes/task/handlers/deleteTask";
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
 * Register all task-related MCP tools on the given server instance.
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server
 * @param {{get: Function}} sessionAuthStore
 * @param {string} serverUrl
 */
export const registerTaskTools = (server, sessionAuthStore, serverUrl) => {
  server.registerTool(
    "task_list_channel",
    {
      description:
        "List tasks for a channel using the existing channel-task collection logic.\n\n" +
        "FILTER SYNTAX (OData):\n" +
        "  Operators: eq, ne, lt, le, gt, ge, startswith, endswith, has\n" +
        "  Values in single quotes.\n" +
        "  Example: (taskstatus eq 'In Progress')\n" +
        "  Field keys from datahub_list_fields where isTaskField=true.",
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
    async ({ channelId, filter, pageSize, nextPageToken }, extra) => {
      const auth = sessionAuthStore.get(extra.sessionId);
      if (!auth) return getAuthError(serverUrl);
      try {
        const result = await GetAllTasks(
          auth.wrikeToken,
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
        "List tasks for a campaign using the existing campaign-task collection logic.\n\n" +
        "FILTER PARAMETERS:\n" +
        "  Field names are the short codes from datahub_list_fields where isTaskField=true.\n" +
        "\n" +
        "  OPERATORS: eq, ne, lt, le, gt, ge, has, startswith, endswith\n" +
        "\n" +
        "  RULES:\n" +
        "    - String values must be in single quotes.\n" +
        "    - Multiple conditions use 'and' only (OR not supported).\n" +
        "    - Wrap expression in parentheses.\n" +
        "\n" +
        "  EXAMPLES:\n" +
        "    (taskstatus eq 'Completed')\n" +
        "    (taskstatus eq 'In Progress' and campaignname eq 'Campaign X')\n" +
        "    startswith(taskname, 'Q1')",
      inputSchema: {
        campaignId: z
          .string()
          .describe("The Wrike folder ID of the parent campaign"),
        filter: z
          .string()
          .optional()
          .describe(
            "OData filter expression. 'and' supported. OR not supported. Example: (taskstatus eq 'Completed' and campaignname eq 'Campaign Name')",
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
    async ({ campaignId, filter, pageSize, nextPageToken }, extra) => {
      const auth = sessionAuthStore.get(extra.sessionId);
      if (!auth) return getAuthError(serverUrl);
      try {
        const result = await GetAllTasks(
          auth.wrikeToken,
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
    "task.get",
    {
      description: "Read a single task by its Wrike task ID.",
      inputSchema: {
        taskId: z.string().describe("The Wrike task ID"),
      },
    },
    async ({ taskId }, extra) => {
      const auth = sessionAuthStore.get(extra.sessionId);
      if (!auth) return getAuthError(serverUrl);
      try {
        const result = await GetTask(
          auth.wrikeToken,
          { taskId },
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
        throw new Error(err?.message || "Failed to get task");
      }
    },
  );

  server.registerTool(
    "task.update",
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
    async ({ taskId, formFields }, extra) => {
      const auth = sessionAuthStore.get(extra.sessionId);
      if (!auth) return getAuthError(serverUrl);
      try {
        const result = await UpdateTask(
          auth.wrikeToken,
          { taskId, formFields },
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
        throw new Error(err?.message || "Failed to update task");
      }
    },
  );

  server.registerTool(
    "task.delete",
    {
      description: "Delete a task by its Wrike task ID.",
      inputSchema: {
        taskId: z.string().describe("The Wrike task ID"),
      },
    },
    async ({ taskId }, extra) => {
      const auth = sessionAuthStore.get(extra.sessionId);
      if (!auth) return getAuthError(serverUrl);
      try {
        const result = await DeleteTask(
          auth.wrikeToken,
          { taskId },
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
        throw new Error(err?.message || "Failed to delete task");
      }
    },
  );
};

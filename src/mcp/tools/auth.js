import { z } from "zod";
import {
  ResolveAuthFromJWT,
  ResolveAuthFromCredentials,
} from "../../middlewares/authentication";

/**
 * Register authentication-related MCP tools (auth_login, auth_logout).
 *
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server
 * @param {{get: Function, set: Function, delete: Function}} sessionAuthStore
 * @param {string} serverUrl - Base URL shown in auth instructions
 */
export const registerAuthTools = (server, sessionAuthStore, serverUrl) => {
  server.registerTool(
    "auth_login",

    {
      description:
        "Authenticate this MCP session. " +
        `Open this URL for the user: ${serverUrl}/ ` +
        "Tell the user to open it in their browser, log in with their Wrike account, then paste the XPI token here. " +
        "Or the user can provide their XPI username and password directly. " +
        "Call this first after connecting.",
      inputSchema: z
        .object({
          token: z
            .string()
            .optional()
            .describe(
              "XPI access token. The user opens the URL in a browser, logs in with their XPI account, then pastes the token here.",
            ),
          username: z
            .string()
            .optional()
            .describe("XPI account username or email."),
          password: z.string().optional().describe("XPI account password."),
        })
        .refine(
          (data) =>
            (data.token && data.token.trim().length > 0) ||
            (data.username &&
              data.username.trim().length > 0 &&
              data.password &&
              data.password.trim().length > 0),
          {
            message: "Provide either a token, or both username and password.",
          },
        )
        .describe(
          "Authenticate with a token (from browser login) or username/password.",
        ),
    },
    async ({ token, username, password }, extra) => {
      let auth;
      if (token && token.trim()) {
        auth = await ResolveAuthFromJWT(token.trim());
      } else {
        auth = await ResolveAuthFromCredentials(
          username?.trim(),
          password?.trim(),
        );
      }

      console.error(
        "[auth_login] sessionId:",
        extra.sessionId,
        "env:",
        auth?.environmentName,
      );
      sessionAuthStore.set(extra.sessionId, auth);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                message: `Authenticated successfully for environment: ${auth.environmentName}. You can now use all tools.`,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.registerTool(
    "auth_logout",

    {
      description: "Clear the authentication for the current session.",
      inputSchema: {
        reason: z.string().optional().describe("Optional reason for logout"),
      },
    },
    async (_, extra) => {
      sessionAuthStore.delete(extra.sessionId);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { success: true, message: "Logged out successfully." },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
};

/**
 * Return a standard MCP error response when a tool is called without auth.
 * Includes the login URL so the agent knows what to do.
 *
 * @param {string} serverUrl
 * @returns {{content: Array, isError: boolean}}
 */
export const getAuthError = (serverUrl) => ({
  content: [
    {
      type: "text",
      text: JSON.stringify(
        {
          success: false,
          message: "Authentication required. You must log in first.",
          instructions: {
            step1: {
              action: "Open this URL in your browser:",
              url: `${serverUrl}/`,
            },
            step2: {
              action:
                "Log in with your Wrike account. After successful login, you will see a token on the page.",
            },
            step3: {
              action:
                "Copy the full token and call the 'auth_login' tool with it:",
              example: { token: "eyJhbGciOiJIUzI1NiIs..." },
            },
          },
        },
        null,
        2,
      ),
    },
  ],
  isError: true,
});

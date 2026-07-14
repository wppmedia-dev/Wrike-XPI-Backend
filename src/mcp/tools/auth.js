import { z } from "zod";
import {
  ResolveAuthFromJWT,
  ResolveAuthFromCredentials,
} from "../../middlewares/authentication";

/**
 * Register authentication-related MCP tools (auth.login, auth.logout).
 *
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server
 * @param {{get: Function, set: Function, delete: Function}} sessionAuthStore
 * @param {string} serverUrl - Base URL shown in auth instructions
 */
export const registerAuthTools = (server, sessionAuthStore, serverUrl) => {
  server.registerTool(
    "auth.login",
    {
      description:
        "Authenticate this MCP session. Provide either a JWE token from the WrikeXPI login page, " +
        "or your Wrike username and password. " +
        "Call this first after connecting.",
      inputSchema: z
        .union([
          z
            .object({
              token: z
                .string()
                .describe(
                  "Your JWE access token from the WrikeXPI login page. If you already have a token, paste it here.",
                ),
            })
            .describe(
              "Authenticate with a token from the WrikeXPI login page.",
            ),
          z
            .object({
              username: z
                .string()
                .describe("Your Wrike account username or email."),
              password: z.string().describe("Your Wrike account password."),
            })
            .describe("Authenticate with your Wrike username and password."),
        ])
        .describe(
          "Authenticate this MCP session. Provide either a JWE token, or your Wrike username and password. Call this first after connecting.",
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
    "auth.logout",
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
                "Copy the full token and call the 'auth.login' tool with it:",
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

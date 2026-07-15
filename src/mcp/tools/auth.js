import { z } from "zod";
import {
  ResolveAuthFromJWT,
  ResolveAuthFromCredentials,
} from "../../middlewares/authentication";

/**
 * Resolve auth from a direct XPI token.
 * Returns null if no token is provided.
 */
export const resolveAuth = async (authToken) => {
  if (authToken && authToken.trim()) {
    return await ResolveAuthFromJWT(authToken.trim());
  }
  return null;
};

/**
 * Common optional auth_token field for all tools.
 */
export const authTokenField = z
  .string()
  .optional()
  .describe(
    "XPI access token returned by auth_token_validator. " +
      "Pass the same token here that you received from auth_token_validator. " +
      "This is the primary authentication method and works with any MCP client.",
  );

/**
 * Register authentication-related MCP tools (auth_token_validator, auth_logout).
 *
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server
 * @param {string} serverUrl - Base URL shown in auth instructions
 */
export const registerAuthTools = (server, serverUrl) => {
  server.registerTool(
    "auth_token_validator",

    {
      description:
        "Authenticate with XPI.\n" +
        `Ask the user to open this URL in their browser: ${serverUrl}/ ` +
        "They can log in with their XPI account and will receive a token to paste here,\n" +
        "or they can provide their XPI username and password directly.\n" +
        "Once validated, pass the SAME token as the auth_token parameter to every other tool call.",
      inputSchema: z
        .object({
          token: z
            .string()
            .optional()
            .describe(
              "XPI access token. User opens the URL in a browser, logs in with Wrike, then pastes the token here.",
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
            message:
              "Provide a token (recommended), or both username and password.",
          },
        )
        .describe(
          "Validate an XPI token or authenticate with username/password. " +
            "After validation, pass the token as auth_token to every other tool.",
        ),
    },
    async ({ token, username, password }) => {
      let auth;
      if (token && token.trim()) {
        auth = await ResolveAuthFromJWT(token.trim());
      } else {
        auth = await ResolveAuthFromCredentials(
          username?.trim(),
          password?.trim(),
        );
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                message: `Token validated successfully for environment: ${auth.environmentName}.`,
                instruction:
                  "Use this token as the auth_token parameter for all other tools: " +
                    token?.trim() ||
                  "Username/password authenticated — you can now use tools without auth_token.",
                token_hint: token?.trim()
                  ? "Pass auth_token=" +
                    token.trim().substring(0, 20) +
                    "... to every tool call."
                  : "",
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
    async () => {
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
          message: "Authentication required.",
          action: `Ask the user to open this URL in their browser: ${serverUrl}/`,
          details:
            "After logging in with Wrike, they will see a token. " +
            "Ask them to paste the token here via auth_token_validator. " +
            "Then pass that same token as auth_token to every tool call.",
        },
        null,
        2,
      ),
    },
  ],
  isError: true,
});

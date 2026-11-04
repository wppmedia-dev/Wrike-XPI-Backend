import { ResolveAuthFromJWT } from "../../middlewares/authentication";

/**
 * Validate an MCP access token (from the MCP OAuth flow, see src/routes/oauth)
 * and return auth data, or null on failure. The Xtend API's long-lived token is
 * not accepted here. Called once per HTTP request in
 * src/plugins/mcp.js — not per tool call.
 */
export const resolveAuth = async (authToken) => {
  if (!authToken?.trim()) return null;
  try {
    return await ResolveAuthFromJWT(authToken.trim(), { surface: "mcp" });
  } catch {
    return null;
  }
};

/**
 * Defensive fallback MCP error response for a tool invoked without resolved
 * auth (should not normally happen — src/plugins/mcp.js rejects unauthenticated
 * requests with a 401 before any tool call reaches this point). Tells the
 * client/user to (re)complete the MCP OAuth flow rather than paste a token.
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
          action:
            "The MCP client must complete (or reconnect) OAuth for this server " +
            `(discovery metadata at ${serverUrl}/.well-known/oauth-authorization-server).`,
          details:
            "Most MCP clients handle this automatically — reconnecting the " +
            "WrikeXPI MCP connector will re-run the login flow.",
        },
        null,
        2,
      ),
    },
  ],
  isError: true,
});

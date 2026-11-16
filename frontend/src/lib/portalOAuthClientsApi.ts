import { getPortalToken, portalFetch } from "./portalAuthApi";
import type {
  OAuthClientList,
  OAuthClientsApi,
  RevokedOAuthClient,
} from "./oauthClientsApi";

/* ── OAuth clients, portal side ───────────────────────────────────────────
   Mirrors /api/v1/portal/oauth-clients (src/routes/portal/oauthClients).
   The server returns only the clients that signed in to this user's own
   environments, so this file does no filtering of its own. The token is read
   when a call is made, not captured, so a re-login is picked up. */

const BASE = "/api/v1/portal/oauth-clients";

/** The server's page-size cap (MAX_LIST_LIMIT in src/controllers/oauthClients.js). */
const FETCH_LIMIT = 500;

async function parseJson(res: Response): Promise<any> {
  return res.json().catch(() => null);
}

export const portalOAuthClientsApi: OAuthClientsApi = {
  list: async (includeRevoked: boolean): Promise<OAuthClientList> => {
    const params = new URLSearchParams({
      include_revoked: includeRevoked ? "true" : "false",
      limit: String(FETCH_LIMIT),
    });
    const res = await portalFetch(`${BASE}?${params}`, getPortalToken() || "");
    const json = await parseJson(res);
    if (!res.ok || !json?.success) {
      throw new Error(json?.message || "Failed to load OAuth clients");
    }
    return json.data;
  },

  revoke: async (id: string): Promise<RevokedOAuthClient> => {
    const res = await portalFetch(
      `${BASE}/${encodeURIComponent(id)}/revoke`,
      getPortalToken() || "",
      { method: "POST" },
    );
    const json = await parseJson(res);
    if (!res.ok || !json?.success) {
      // 409 carries a message worth reading: the client is also used by other
      // environments, so only an administrator can revoke it.
      throw new Error(json?.message || "Failed to revoke OAuth client");
    }
    return json.data;
  },

  disconnect: async (id: string): Promise<number> => {
    const res = await portalFetch(
      `${BASE}/${encodeURIComponent(id)}/disconnect`,
      getPortalToken() || "",
      { method: "POST" },
    );
    const json = await parseJson(res);
    if (!res.ok || !json?.success) {
      throw new Error(json?.message || "Failed to disconnect OAuth client");
    }
    return Number(json.data?.disconnected) || 0;
  },
};

import { adminFetch } from "./authApi";

/* ── OAuth clients ────────────────────────────────────────────────────────
   Mirrors /api/v1/admin/oauth-clients (src/routes/admin/oauthClients). One
   row per dynamic client registration (POST /oauth/register), i.e. every MCP
   connector that has signed up with this service. */

/** What the console shows for a client; computed by the server. */
export type OAuthClientStatus =
  | "revoked"
  | "expired"
  | "connected"
  | "idle"
  | "disconnected"
  | "registered";

export interface OAuthClientConnection {
  state: "connected" | "idle" | "disconnected" | "registered";
  /** Sign-ins that can still refresh. */
  live_sessions: number;
  /** Sign-ins this client has ever made. */
  total_sessions: number;
  last_active_at: string | null;
  last_disconnected_at: string | null;
}

export interface OAuthClient {
  id: string;
  /** Absent only if the server predates connection tracking. */
  status?: OAuthClientStatus;
  /** Null when connection data could not be read. */
  connection?: OAuthClientConnection | null;
  client_name: string | null;
  redirect_uris: string[];
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
  created_ip: string | null;
  user_agent: string | null;
  revoked_at: string | null;
  revoked_by: string | null;
}

export interface OAuthClientList {
  rows: OAuthClient[];
  /** Rows matching the filter; may exceed rows.length when capped. */
  total: number;
  limit: number;
  offset: number;
  /** Whole-table counts, independent of the filter. */
  counts: {
    active: number;
    revoked: number;
    /** Unrevoked, unexpired clients by connection; absent if unreadable. */
    connected?: number;
    idle?: number;
    disconnected?: number;
    registered?: number;
  };
}

/** The server's page-size cap (MAX_LIST_LIMIT in src/controllers/oauthClients.js). */
export const OAUTH_CLIENT_FETCH_LIMIT = 500;

async function parseJson(res: Response): Promise<any> {
  return res.json().catch(() => null);
}

export const listOAuthClients = async (includeRevoked: boolean): Promise<OAuthClientList> => {
  const params = new URLSearchParams({
    include_revoked: includeRevoked ? "true" : "false",
    limit: String(OAUTH_CLIENT_FETCH_LIMIT),
  });
  const res = await adminFetch(`/api/v1/admin/oauth-clients?${params}`);
  const json = await parseJson(res);
  if (!res.ok || !json?.success) {
    throw new Error(json?.message || "Failed to load OAuth clients");
  }
  return json.data;
};

/** What revoking returns: the client, plus how many live sign-ins it ended. */
export type RevokedOAuthClient = OAuthClient & { disconnected?: number };

export const revokeOAuthClient = async (id: string): Promise<RevokedOAuthClient> => {
  const res = await adminFetch(`/api/v1/admin/oauth-clients/${encodeURIComponent(id)}/revoke`, {
    method: "POST",
  });
  const json = await parseJson(res);
  if (!res.ok || !json?.success) {
    throw new Error(json?.message || "Failed to revoke OAuth client");
  }
  return json.data;
};

/**
 * End every live sign-in a client holds, keeping its registration. Resolves
 * with how many were ended.
 */
export const disconnectOAuthClient = async (id: string): Promise<number> => {
  const res = await adminFetch(`/api/v1/admin/oauth-clients/${encodeURIComponent(id)}/disconnect`, {
    method: "POST",
  });
  const json = await parseJson(res);
  if (!res.ok || !json?.success) {
    throw new Error(json?.message || "Failed to disconnect OAuth client");
  }
  return Number(json.data?.disconnected) || 0;
};

/**
 * The three calls the OAuth Clients page makes. The admin console and the
 * portal each supply their own (different endpoints, different sign-in), and
 * the page does not care which.
 */
export interface OAuthClientsApi {
  list: (includeRevoked: boolean) => Promise<OAuthClientList>;
  revoke: (id: string) => Promise<RevokedOAuthClient>;
  disconnect: (id: string) => Promise<number>;
}

export const adminOAuthClientsApi: OAuthClientsApi = {
  list: listOAuthClients,
  revoke: revokeOAuthClient,
  disconnect: disconnectOAuthClient,
};

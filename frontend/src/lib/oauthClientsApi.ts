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
  | "disconnected"
  | "registered";

export interface OAuthClientConnection {
  state: "connected" | "disconnected" | "registered";
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

export const revokeOAuthClient = async (id: string): Promise<OAuthClient> => {
  const res = await adminFetch(`/api/v1/admin/oauth-clients/${encodeURIComponent(id)}/revoke`, {
    method: "POST",
  });
  const json = await parseJson(res);
  if (!res.ok || !json?.success) {
    throw new Error(json?.message || "Failed to revoke OAuth client");
  }
  return json.data;
};

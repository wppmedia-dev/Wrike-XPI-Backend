import { adminFetch } from "./authApi";

/* ── Types ──────────────────────────────────────────────────────────────
   Mirrors /api/v1/admin/tokens and its permissions sub-routes
   (src/routes/admin/tokens/index.js). Module/action vocabulary is *fetched*,
   not declared here. src/utils/tokenPermissionCatalog.js is the single
   authority, so a module added there grows this UI with no frontend edit. */

export type ActionName = "read" | "create" | "update" | "delete";

export interface ModuleDef {
  key: string;
  label: string;
  description: string;
  /** Actions this module can actually express. Others render disabled. */
  actions: ActionName[];
}

export type PermissionMatrix = Record<string, Record<ActionName, boolean>>;

export interface PermissionCatalog {
  actions: ActionName[];
  modules: ModuleDef[];
}

/** One row of the API Tokens list. Carries no secret material by design:
 * the token's own credential (encrypted access/refresh token, salt, wrapped
 * DEK) is never selected by the server, so there is nothing here to leak. */
export interface AdminToken {
  id: string;
  account_id: string | null;
  /** The Basic-auth username the caller authenticates with. */
  username: string | null;
  env_id: string | null;
  environment_name: string | null;
  environment_visible: boolean | null;
  is_active: boolean;
  /**
   * What the token was issued to, as far as the mint could tell: the name an
   * MCP client registered under, the generic "MCP client", "Login page" for
   * the hosted login, or null for a row written before this was recorded. Two
   * tokens can share an environment, an account and a creator, so this is
   * often the only thing besides the id that tells them apart.
   */
  client_name: string | null;
  /**
   * When the token the caller holds stops being accepted. The JWE carries its
   * own expiry, and this is that value recorded server-side at mint time (see
   * src/utils/tokenTtl.js). Null only for rows whose mint was never recorded.
   */
  token_expires_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  creator_email: string | null;
  creator_name: string | null;
  permissions: {
    /** false = nobody has restricted this token, so it is unrestricted. */
    configured: boolean;
    granted: number;
    total: number;
  };
}

/**
 * A token's matrix plus the flag that says whether anyone has ever restricted
 * it. `configured: false` means the token can do everything, not "nothing",
 * so the popup has to show the difference rather than a grid of empty ticks.
 */
export interface TokenPermissionEntry {
  configured: boolean;
  matrix: PermissionMatrix;
}

const BASE = "/api/v1/admin/tokens";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await adminFetch(`${BASE}${path}`, init);
  const json = await res.json().catch(() => null);

  if (!res.ok || json?.success === false) {
    throw new Error(json?.message || "Request failed");
  }

  return json?.data as T;
}

export const listTokens = () => request<AdminToken[]>("/");

export const getTokenPermissionCatalog = () =>
  request<PermissionCatalog>("/permissions/catalog");

export const getTokenPermissions = (tokenId: string) =>
  request<TokenPermissionEntry>(`/${tokenId}/permissions`);

export const setTokenPermissions = (tokenId: string, permissions: PermissionMatrix) =>
  request<TokenPermissionEntry>(`/${tokenId}/permissions`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ permissions }),
  });

/** Flip a single token on or off. Separate from the matrix: switching a token
 * off is a different decision from what it may do while it is on. */
export const setTokenStatus = (tokenId: string, is_active: boolean) =>
  request<{ id: string; is_active: boolean }>(`/${tokenId}/status`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ is_active }),
  });

/**
 * Delete a token, which is a switch-off: DELETE /admin/tokens/:id deactivates
 * the row and keeps it, the same thing setTokenStatus(false) does. Kept as its
 * own call so the row menu's Deactivate and the Status switch are visibly two
 * different decisions, and so the portal and the console reach the same
 * outcome through the same verb.
 */
export const deactivateToken = (tokenId: string) =>
  request<{ id: string; is_active: boolean }>(`/${tokenId}`, { method: "DELETE" });

/**
 * Create a token: returns the Wrike consent URL to send the browser to for the
 * chosen environment, labelled "Admin console" in the list. Nothing is minted
 * until somebody signs in, which is why this cannot return a token.
 */
export const connectToken = (envId: string) =>
  request<{ url: string; environment_name: string | null }>("/connect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ env_id: envId }),
  });

/* ── Shaping helpers ───────────────────────────────────────────────── */

/** Granted cells out of the ones the catalogue actually declares. Drives the
 * "3 of 18 granted" summary and the Access column's badge. */
export const grantedCount = (
  permissions: PermissionMatrix | null,
  modules: ModuleDef[],
): { granted: number; total: number } => {
  let granted = 0;
  let total = 0;

  for (const mod of modules) {
    for (const action of mod.actions) {
      total += 1;
      if (permissions?.[mod.key]?.[action]) granted += 1;
    }
  }

  return { granted, total };
};

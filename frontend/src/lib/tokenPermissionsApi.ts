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

/**
 * The list's committed filters, as query parameters. Blank values are left out
 * of the URL rather than sent empty: an empty enum member is a bug, and the
 * server refuses it instead of guessing.
 *
 * Names match the schema (src/routes/admin/tokens/schema) one for one, so a
 * control added here without a server parameter is a visible 400 rather than a
 * filter that silently does nothing.
 */
export interface TokenListQuery {
  /** The toolbar search box, over the fields the row shows. */
  search?: string;
  env_id?: string;
  token_id?: string;
  client?: string;
  account_id?: string;
  creator?: string;
  access?: string;
  validity?: string;
  updated?: string;
  status?: string;
}

/**
 * What the list endpoints answer with: the matching rows, the environment
 * picker's options and the count before filtering.
 *
 * The options and the total come from the server because the client no longer
 * holds the unfiltered set. Deriving them from a filtered response would make
 * the picker lose every environment the current filter excludes — exactly the
 * moment somebody wants to switch to one of them — and would report the number
 * of rows that survived as the number that were searched.
 */
export interface TokenListResult {
  tokens: AdminToken[];
  environments: { id: string; name: string }[];
  /** True when the scope holds tokens with no environment at all. */
  has_unassigned: boolean;
  total: number;
}

/**
 * The value the Environment picker sends for "tokens with no environment".
 * The server reads the nil UUID as exactly that (NO_ENVIRONMENT in
 * src/utils/tokenFilters.js); a real environment id is never the nil UUID.
 */
export const NO_ENVIRONMENT = "00000000-0000-0000-0000-000000000000";

const queryString = (query: TokenListQuery = {}) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) params.set(key, value);
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
};


async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await adminFetch(`${BASE}${path}`, init);
  const json = await res.json().catch(() => null);

  if (!res.ok || json?.success === false) {
    throw new Error(json?.message || "Request failed");
  }

  return json?.data as T;
}

export const listTokens = (query: TokenListQuery = {}) =>
  request<TokenListResult>(`/${queryString(query)}`);

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
 * the row and keeps it, the same thing setTokenStatus(false) does. It is its own
 * call so the portal's delete grant and this console's delete verb reach the
 * same outcome through the same route, whether the caller arrives from the
 * Status switch or from a script that only has the endpoint.
 */
export const deactivateToken = (tokenId: string) =>
  request<{ id: string; is_active: boolean }>(`/${tokenId}`, { method: "DELETE" });

/* There is deliberately no createToken here. A token is minted by the token
   service's root login page or by an MCP client's OAuth flow, both of which
   exchange a Wrike authorization code, and neither of which a console can
   stand in for. */

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

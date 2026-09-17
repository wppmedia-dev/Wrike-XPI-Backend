import { portalFetch } from "./portalAuthApi";
import type {
  AdminToken,
  PermissionCatalog,
  PermissionMatrix,
  TokenPermissionEntry,
} from "./tokenPermissionsApi";

/**
 * The portal's view of API tokens (src/routes/portal/apiTokens).
 *
 * Deliberately free of secret material: the list carries a token's id, its
 * environment, its account, its labels and its access summary, never the
 * credential inside it. That is the server's doing (Tokens.ListForEnvironments
 * selects the same non-secret attribute set the admin console gets), and this
 * layer must not invent a way around it.
 *
 * Every call here is scoped server-side to the environments the logged-in user
 * can see, so there is no environment filter to pass and none to get wrong.
 */
/**
 * One row of the portal's token list.
 *
 * Deliberately the admin console's row type, not a second copy of it. Both
 * consoles are served by the same server shape (Tokens.toAdminShape, used by
 * ListAll and ListForEnvironments) and both render the same shared table
 * (frontend/src/components/TokensTable.tsx), so a separate interface here
 * would be a third place for that shape to drift, and the drift would show up
 * as a column that quietly reads EMPTY on one of the two screens.
 */
export type PortalApiToken = AdminToken;

/** The picker's option set: an environment this user may issue a token for. */
export interface PortalTokenEnvironment {
  id: string;
  environment_name: string;
  is_active: boolean;
}

/** GET /api/v1/portal/api-tokens — the tokens of the caller's environments. */
export const listPortalApiTokens = async (
  token: string,
): Promise<PortalApiToken[]> => {
  const res = await portalFetch("/api/v1/portal/api-tokens/", token);
  const body = await res.json().catch(() => null);
  if (!body?.success || !Array.isArray(body.data)) return [];
  return body.data as PortalApiToken[];
};

/** GET /api/v1/portal/api-tokens/environments — the create picker's options. */
export const listPortalTokenEnvironments = async (
  token: string,
): Promise<PortalTokenEnvironment[]> => {
  const res = await portalFetch("/api/v1/portal/api-tokens/environments", token);
  const body = await res.json().catch(() => null);
  if (!body?.success || !Array.isArray(body.data)) return [];
  return body.data as PortalTokenEnvironment[];
};

/** GET /api/v1/portal/api-tokens/catalog — the module vocabulary to draw. */
export const getPortalTokenCatalog = async (
  token: string,
): Promise<PermissionCatalog> => {
  const res = await portalFetch("/api/v1/portal/api-tokens/catalog", token);
  const body = await res.json().catch(() => null);
  if (!body?.success) throw new Error(body?.message || "Failed to load catalog");
  return body.data as PermissionCatalog;
};

/** GET /api/v1/portal/api-tokens/:id/permissions — one token's matrix. */
export const getPortalTokenPermissions = async (
  token: string,
  tokenId: string,
): Promise<TokenPermissionEntry> => {
  const res = await portalFetch(
    `/api/v1/portal/api-tokens/${tokenId}/permissions`,
    token,
  );
  const body = await res.json().catch(() => null);
  if (!body?.success) throw new Error(body?.message || "Request failed");
  return body.data as TokenPermissionEntry;
};

/**
 * POST /api/v1/portal/api-tokens/connect — create.
 *
 * Returns the Wrike consent URL to send the browser to. Issuing a token means
 * exchanging a Wrike authorization code, which only a person signing in can
 * produce, so this is as far as the API goes; the mint happens on the way back
 * through the token service's callback, which shows the credentials once.
 */
export const connectPortalApiToken = async (
  token: string,
  envId: string,
): Promise<{ url: string; environment_name: string | null }> => {
  const res = await portalFetch("/api/v1/portal/api-tokens/connect", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ env_id: envId }),
  });
  const body = await res.json().catch(() => null);
  if (!body?.success || !body.data?.url) {
    throw new Error(body?.message || "Could not start the Wrike sign-in");
  }
  return body.data;
};

/** PUT /api/v1/portal/api-tokens/:id/permissions — update. */
export const savePortalTokenPermissions = async (
  token: string,
  tokenId: string,
  permissions: PermissionMatrix,
): Promise<TokenPermissionEntry> => {
  const res = await portalFetch(
    `/api/v1/portal/api-tokens/${tokenId}/permissions`,
    token,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permissions }),
    },
  );
  const body = await res.json().catch(() => null);
  if (!body?.success) throw new Error(body?.message || "Could not save permissions");
  return body.data as TokenPermissionEntry;
};

/** PUT /api/v1/portal/api-tokens/:id/status — update. */
export const setPortalTokenStatus = async (
  token: string,
  tokenId: string,
  isActive: boolean,
): Promise<void> => {
  const res = await portalFetch(
    `/api/v1/portal/api-tokens/${tokenId}/status`,
    token,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: isActive }),
    },
  );
  const body = await res.json().catch(() => null);
  if (!body?.success) throw new Error(body?.message || "Could not change the status");
};

/**
 * DELETE /api/v1/portal/api-tokens/:id — delete.
 *
 * A switch-off, not a row removal: the row holds the only copy of the encrypted
 * Wrike credential, so removing it would break whoever is still calling with
 * that token with no record of why.
 */
export const deactivatePortalApiToken = async (
  token: string,
  tokenId: string,
): Promise<void> => {
  const res = await portalFetch(`/api/v1/portal/api-tokens/${tokenId}`, token, {
    method: "DELETE",
  });
  const body = await res.json().catch(() => null);
  if (!body?.success) throw new Error(body?.message || "Could not deactivate the token");
};

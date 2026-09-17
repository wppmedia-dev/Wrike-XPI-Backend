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
 *
 * There is no create call, and no route for one: a token is minted by the token
 * service's root login page or by an MCP client's OAuth flow, both of which
 * exchange a Wrike authorization code that only a person signing in can
 * produce. Neither console can stand in for that person.
 *
 * There is no delete call either: the portal's api_tokens module has no delete
 * grant, and the write a delete used to perform (switch the token off, keep the
 * record) is the status call below.
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

/**
 * GET /api/v1/portal/api-tokens — the tokens of the caller's environments.
 */
export const listPortalApiTokens = async (
  token: string,
): Promise<PortalApiToken[]> => {
  const res = await portalFetch("/api/v1/portal/api-tokens/", token);
  const body = await res.json().catch(() => null);
  if (!body?.success || !Array.isArray(body.data)) return [];
  return body.data as PortalApiToken[];
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

/**
 * PUT /api/v1/portal/api-tokens/:id/status — the token's availability.
 *
 * Guarded by the update grant on the server, in both directions: taking a token
 * out of service and putting it back are one lever with two positions, and both
 * are the same kind of act as editing the matrix above. There is no DELETE call
 * here: the portal's module has no delete grant, and the write behind a delete
 * was this one anyway.
 */
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

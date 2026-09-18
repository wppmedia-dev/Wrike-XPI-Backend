import { portalFetch } from "./portalAuthApi";
import type {
  PermissionCatalog,
  PermissionMatrix,
  TokenPermissionEntry,
} from "./tokenPermissionsApi";

/**
 * The portal's view of the module ceiling each environment holds its tokens to
 * (src/routes/portal/environmentModules) — the layer above a token's own grid,
 * which src/middlewares/modulePermissions.js applies first.
 *
 * Every call is scoped server-side to the environments the logged-in user can
 * see (src/utils/portalScope.js), and an environment outside that scope answers
 * 404 rather than 403. So there is no scope to pass here and none to get wrong.
 *
 * The catalogue this draws is the same module vocabulary the token grid draws
 * (src/utils/tokenPermissionCatalog.js), served by this module's own catalog
 * route so that reading it needs THIS module's grant rather than the token
 * module's.
 */

/** GET /api/v1/portal/environment-modules/catalog — the vocabulary to draw. */
export const getPortalEnvironmentModulesCatalog = async (
  token: string,
): Promise<PermissionCatalog> => {
  const res = await portalFetch(
    "/api/v1/portal/environment-modules/catalog",
    token,
  );
  const body = await res.json().catch(() => null);
  if (!body?.success) throw new Error(body?.message || "Failed to load catalog");
  return body.data as PermissionCatalog;
};

/** GET /api/v1/portal/environment-modules/:id/permissions — one ceiling. */
export const getPortalEnvironmentModulePermissions = async (
  token: string,
  envId: string,
): Promise<TokenPermissionEntry> => {
  const res = await portalFetch(
    `/api/v1/portal/environment-modules/${envId}/permissions`,
    token,
  );
  const body = await res.json().catch(() => null);
  if (!body?.success) throw new Error(body?.message || "Request failed");
  return body.data as TokenPermissionEntry;
};

/** PUT /api/v1/portal/environment-modules/:id/permissions — update. */
export const savePortalEnvironmentModulePermissions = async (
  token: string,
  envId: string,
  permissions: PermissionMatrix,
): Promise<TokenPermissionEntry> => {
  const res = await portalFetch(
    `/api/v1/portal/environment-modules/${envId}/permissions`,
    token,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permissions }),
    },
  );
  const body = await res.json().catch(() => null);
  if (!body?.success)
    throw new Error(body?.message || "Could not save permissions");
  return body.data as TokenPermissionEntry;
};

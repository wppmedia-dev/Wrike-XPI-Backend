import { adminFetch } from "./authApi";
import {
  getTokenPermissionCatalog,
  type PermissionMatrix,
  type TokenPermissionEntry,
} from "./tokenPermissionsApi";

/**
 * The admin API behind an environment's module matrix — the layer ABOVE a
 * token's own grid (src/middlewares/modulePermissions.js applies the
 * environment first, then the token). Kept beside the token one so the pair is
 * obvious, and so a reader looking for "where does the grid get its data" finds
 * both answers in the same place.
 *
 * The catalogue is deliberately NOT re-declared: it is the same module
 * vocabulary and the same supported actions, fetched from the token route
 * (GET /admin/tokens/permissions/catalog), which reads
 * src/utils/tokenPermissionCatalog.js. A second catalog endpoint would be a
 * second authority for "which modules exist".
 */

const BASE = "/api/v1/admin/credentials";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await adminFetch(`${BASE}${path}`, init);
  const json = await res.json().catch(() => null);

  if (!res.ok || json?.success === false) {
    throw new Error(json?.message || "Request failed");
  }

  return json?.data as T;
}

/** One environment's matrix, uncached on the server. */
export const getEnvironmentModulePermissions = (envId: string) =>
  request<TokenPermissionEntry>(`/${envId}/module-permissions`);

/** Replace it wholesale, which is what makes an environment governed. */
export const setEnvironmentModulePermissions = (
  envId: string,
  permissions: PermissionMatrix,
) =>
  request<TokenPermissionEntry>(`/${envId}/module-permissions`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ permissions }),
  });

export const getEnvironmentPermissionCatalog = getTokenPermissionCatalog;

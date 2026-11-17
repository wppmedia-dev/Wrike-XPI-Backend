import { PortalPermissions } from "../controllers";

/**
 * What a portal user may do with an environment's MCP token lifetime
 * overrides, from the `environment_token_lifetimes` module of their matrix
 * (src/utils/portalPermissionCatalog.js). Update implies read: someone who can
 * change a value has to be able to see it.
 *
 * Fails closed: a user with no row, or a matrix that cannot be read, gets
 * neither. The admin console is not a portal user and is not subject to this.
 */
export const mcpLifetimeAccessFor = async (portalUser) => {
  if (!portalUser?.id) return { read: false, update: false };
  try {
    const mod = (await PortalPermissions.GetMatrix(portalUser.id))
      ?.environment_token_lifetimes;
    const update = !!mod?.update;
    return { read: update || !!mod?.read, update };
  } catch {
    return { read: false, update: false };
  }
};

export const forbidMcpLifetimeChange = () => ({
  statusCode: 403,
  message:
    "Forbidden: you do not have access to change MCP token lifetimes",
});

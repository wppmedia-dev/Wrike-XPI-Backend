import { EnvironmentModulePermissions, TokenPermissions } from "../controllers";
import { denialFor, resolveRoute } from "../utils/tokenPermissionMap";
import { PUBLIC_DENIAL_MESSAGE } from "../utils/environmentAccess";

/**
 * The module-level gates for API tokens. There are two, and they run in this
 * order:
 *
 *   1. the ENVIRONMENT the token belongs to — what anything in that
 *      environment may reach at all (src/controllers/environmentModulePermissions.js)
 *   2. the TOKEN itself — what this one credential may do on top of that
 *      (src/controllers/tokenPermissions.js)
 *
 * Both must allow the request; either one refusing is a 403. The environment
 * layer is a ceiling rather than an alternative: an environment with Campaign
 * switched off refuses every token in it, whatever those tokens were granted,
 * so "may anybody in PROD touch master data?" is answered once instead of in
 * every token's grid.
 *
 * They are two layers of the same decision, so they share the vocabulary
 * (src/utils/tokenPermissionCatalog.js), the mapping from path and method
 * (src/utils/tokenPermissionMap.js) and the rule itself (`denialFor`). Only the
 * code reported differs, so an audit row or a support ticket says which layer
 * said no: ENVIRONMENT_MODULE_FORBIDDEN or MODULE_FORBIDDEN.
 *
 * Registered once for the whole private router (src/routes/index.js) instead of
 * per route, because the module is a property of the path and the action is a
 * property of the method, and both are known before any handler runs. A
 * per-route guard would be repeated on ~25 routes and would be the thing
 * somebody forgets when adding the 26th.
 *
 * Runs after ValidateToken, which is what put req.tokenId and req.envId there,
 * and after the environment access gate (allow list, IP, security switches):
 * those answer "may this caller use this environment at all", this answers
 * "may this caller do this thing here".
 */
export const requireModulePermissions = async (req, reply) => {
  // No token id means ValidateToken did not get this far, which means it has
  // already sent its own 401 or 403. Saying nothing here is the whole job: the
  // alternative is answering a request that already has a response.
  if (!req.tokenId) return;

  const route = resolveRoute(req.method, req.raw?.url || req.url || "");
  if (!route) return;

  /**
   * Refuse, in the same public wording both gates use: which module and action
   * were refused is useful to the caller, how the decision was made is not.
   *
   * `req.tokenPermission` is read by the activity-log hook in
   * src/routes/index.js so the denial is recorded as denied (and with this
   * code) rather than as a plain 403 on an otherwise allowed request.
   */
  const refuse = (code) => {
    req.tokenPermission = { ...route, code };

    return reply.code(403).send({
      success: false,
      message: PUBLIC_DENIAL_MESSAGE,
      error: { code, module: route.module, action: route.action },
    });
  };

  /**
   * Read one layer's matrix. Refuse rather than allow when it cannot be read:
   * a permission check that cannot be answered must not quietly become a grant,
   * and "no rows, so unrestricted" is a different case that GetMatrix answers
   * normally, without throwing.
   */
  const matrixOr = async (loader, target) => {
    try {
      req[target] = await loader();
      return null;
    } catch (err) {
      console.error(new Date().toISOString(), err);
      return "PERMISSION_CHECK_FAILED";
    }
  };

  /* ── 1. The environment ──────────────────────────────────────────────── */

  // Cached (src/utils/environmentModuleCache.js), so this is not a query per
  // request in the steady state. The console edits through the controller,
  // which invalidates, so the worst case is the L1 window on another instance,
  // not a matrix nobody saved.
  const environmentFailed = await matrixOr(
    () => EnvironmentModulePermissions.GetMatrixCached(req.envId),
    "environmentModuleMatrix",
  );
  if (environmentFailed) return refuse(environmentFailed);

  const environmentCode = denialFor(req.environmentModuleMatrix, route);
  if (environmentCode) {
    // The same decision, reported as the layer that made it. METHOD_NOT_
    // GOVERNABLE is about the request rather than the layer, so it is passed
    // through as it is.
    return refuse(
      environmentCode === "MODULE_FORBIDDEN"
        ? "ENVIRONMENT_MODULE_FORBIDDEN"
        : environmentCode,
    );
  }

  /* ── 2. The token ────────────────────────────────────────────────────── */

  const tokenFailed = await matrixOr(
    () => TokenPermissions.GetMatrixCached(req.tokenId),
    "tokenMatrix",
  );
  if (tokenFailed) return refuse(tokenFailed);

  const code = denialFor(req.tokenMatrix, route);
  if (!code) return;

  return refuse(code);
};

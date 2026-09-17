import { TokenPermissions } from "../controllers";
import { denialFor, resolveRoute } from "../utils/tokenPermissionMap";
import { PUBLIC_DENIAL_MESSAGE } from "../utils/environmentAccess";

/**
 * The module-level gate for API tokens: the server-side counterpart to the
 * admin console's per-token permission popup
 * (src/utils/tokenPermissionCatalog.js defines the vocabulary,
 * src/controllers/tokenPermissions.js stores it,
 * src/utils/tokenPermissionMap.js decides what a route needs).
 *
 * Registered once for the whole private router (src/routes/index.js) instead
 * of per route, because the module is a property of the path and the action
 * is a property of the method, and both are known before any handler runs. A
 * per-route guard would be repeated on ~25 routes and would be the thing
 * somebody forgets when adding the 26th.
 *
 * Runs after ValidateToken, which is what put req.tokenId there. The
 * environment gate (allow list, IP, security switches) has already passed by
 * this point: this answers a second, narrower question. May *this token* do
 * *this thing*? It does not replace the first one.
 */
export const requireTokenPermission = async (req, reply) => {
  // No token id means ValidateToken did not get this far, which means it has
  // already sent its own 401 or 403. Saying nothing here is the whole job:
  // the alternative is answering a request that already has a response.
  if (!req.tokenId) return;

  const route = resolveRoute(req.method, req.raw?.url || req.url || "");
  if (!route) return;

  try {
    // Cached (src/utils/tokenPermissionCache.js), so this is not a query per
    // request in the steady state. The admin console edits permission data
    // through the controller, which invalidates, so the worst case is the L1
    // window on another instance, not a matrix nobody saved.
    req.tokenMatrix = await TokenPermissions.GetMatrixCached(req.tokenId);
  } catch (err) {
    console.error(new Date().toISOString(), err);
    // Refuse rather than allow. A permission check that cannot be answered
    // must not quietly become a grant, and "the token has no rows" is a
    // different case that GetMatrix answers normally.
    req.tokenPermission = { ...route, code: "PERMISSION_CHECK_FAILED" };
    return reply.code(403).send({
      success: false,
      message: PUBLIC_DENIAL_MESSAGE,
      error: { code: "PERMISSION_CHECK_FAILED" },
    });
  }

  const code = denialFor(req.tokenMatrix, route);
  if (!code) return;

  // Read by the activity-log hook in src/routes/index.js so the denial is
  // recorded as denied (and with this code) rather than as a plain 403 on an
  // otherwise allowed request.
  req.tokenPermission = { ...route, code };

  // Same public wording as the environment gate: which module and action were
  // refused is useful to the caller, how the decision was made is not.
  return reply.code(403).send({
    success: false,
    message: PUBLIC_DENIAL_MESSAGE,
    error: { code, module: route.module, action: route.action },
  });
};

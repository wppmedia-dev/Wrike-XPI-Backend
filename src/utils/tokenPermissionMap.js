/**
 * Which module and which action a request is, and whether a token's matrix
 * allows it. These are the two pure decisions behind the per-token module gate
 * (src/middlewares/tokenPermissions.js).
 *
 * Pure on purpose: no models, no redis, no fastify, so the mapping and the
 * allow/deny rule can be read, reasoned about and tested on their own. Every
 * caller that needs a database keeps that to itself.
 *
 * The action comes from the HTTP method. That table used to live in
 * src/routes/index.js purely to label the activity log; it lives here now so
 * there is one authority, because a gate that disagreed with the audit trail
 * about what "update" means would be worse than either being wrong alone.
 *
 * The module comes from the path rather than from the matched route, so
 * anything under /wrikexpi/<module> is governed, including routes added
 * later, which is the whole point. The cost of that choice is that a path
 * under a governed module which no route actually serves answers 403 for a
 * restricted token where an unrestricted one gets 404. The alternative is an
 * allow-list of route patterns that somebody has to remember to extend, and a
 * forgotten pattern is a hole rather than a cosmetic difference.
 */

import { MODULES } from "./tokenPermissionCatalog";

export const ACTIONS_BY_METHOD = {
  GET: "read",
  HEAD: "read",
  OPTIONS: "read",
  POST: "create",
  PUT: "update",
  PATCH: "update",
  DELETE: "delete",
};

export const actionForMethod = (method) =>
  ACTIONS_BY_METHOD[String(method || "").toUpperCase()] || null;

/**
 * Path prefix → module key from src/utils/tokenPermissionCatalog.js. Only the
 * prefixes src/routes/index.js actually registers are listed: `v1.0` is the
 * path while `master` is the name the console shows, and no alias for it is
 * added because a path nobody serves should not resolve to a governed module.
 *
 * `calendar` is the same kind of difference and not a mistake: the path is
 * named after the surface a calendar integration calls, while the module is
 * named after what the token is for, because that is what an administrator
 * granting it is deciding about (src/utils/tokenPurpose.js). Without this
 * entry the prefix would be UNGOVERNED, and an ungoverned path is the one
 * thing the matrix cannot restrict — a token with everything switched off
 * would still reach it.
 */
const MODULE_BY_HEAD = {
  campaign: "campaign",
  channel: "channel",
  task: "task",
  "v1.0": "master",
  amoeba: "amoeba",
  calendar: "calendar_sync",
};

/**
 * Three routes in src/routes/index.js are nested listings that return a
 * different resource than their first segment suggests
 * (/wrikexpi/campaign/:id/channel, /wrikexpi/channel/:id/task,
 * /wrikexpi/campaign/:id/task). They are attributed to what they actually
 * return, so switching "channel read" off has to stop a caller reading
 * channels through the campaign path too, otherwise the switch is a lie.
 *
 * Keyed by head segment, then by the second segment of a two-segment tail.
 * That length check is what keeps /wrikexpi/campaign/upload a campaign route
 * rather than a lookup of "upload", and what keeps a campaign whose id
 * happens to read "task" classified as a campaign.
 */
const NESTED_MODULE_BY_TAIL = {
  campaign: { channel: "channel", task: "task" },
  channel: { task: "task" },
};

/**
 * The module a request path belongs to, or null when the path is not governed:
 * the app-config and docs routes, the public /wrikexpi/token/* OAuth surface,
 * and /wrikexpi/mcp, which is its own surface with its own gate
 * (src/plugins/mcp.js, same matrix, evaluated per tool call).
 */
export const moduleForPath = (url = "") => {
  const [pathname] = String(url).split("?");
  const segments = pathname
    .replace(/^\/api\/v1/, "")
    .split("/")
    .filter(Boolean);

  const root = segments.indexOf("wrikexpi");
  if (root === -1) return null;

  const head = segments[root + 1];
  const module = MODULE_BY_HEAD[head];
  if (!module) return null;

  const tail = segments.slice(root + 2);
  if (tail.length === 2) {
    const nested = NESTED_MODULE_BY_TAIL[head]?.[tail[1]];
    if (nested) return nested;
  }

  return module;
};

/**
 * { module, action } for a request, or null when nothing governs it.
 *
 * A governed path asked for with a method no action maps to comes back as
 * { module, action: null } and not as null. The difference matters: null means
 * "nothing here to check" (an ungoverned path), while a governed path with no
 * action is a request the matrix cannot allow, so denialFor refuses it. TRACE
 * is the case that exists: src/routes/amoeba registers both of its paths with
 * fastify.all, and Fastify's all() includes TRACE, so a proxy handler would
 * otherwise forward a TRACE to somebody else's service with no permission
 * check at all.
 */
export const resolveRoute = (method, url) => {
  const module = moduleForPath(url);
  if (!module) return null;

  return { module, action: actionForMethod(method) || null };
};

const DECLARED_ACTIONS = Object.fromEntries(
  MODULES.map((mod) => [mod.key, mod.actions]),
);

/**
 * The decision, as a pure function of an already-loaded matrix entry
 * (src/controllers/tokenPermissions.js) and a resolved route.
 *
 * Returns null when the request may proceed, otherwise the denial code to
 * report. Three cases allow, and each one is deliberate:
 *
 *   1. Nothing governs the path (route is null).
 *   2. The token has never been configured. Full access is the default, so
 *      restricting a token is something an admin has to do on purpose. That
 *      is what keeps every token issued before this gate existed working.
 *   3. The module cannot express this action (there is no create endpoint for
 *      channel or task), so there is no switch an admin could have set and
 *      nothing to deny against.
 *
 * And one denies outside the matrix: a governed path asked for with a method
 * no action maps to. There is no switch for it and no cell to read, so the
 * only safe reading of the matrix is "not granted", and refusing costs nothing
 * because nothing in this system sends such a request except a client doing it
 * deliberately (see resolveRoute).
 */
export const denialFor = (entry, route) => {
  if (!route) return null;
  if (!entry?.configured) return null;

  // Checked before the declared-actions case below, which would otherwise let
  // a null action through: null is not in any module's list.
  if (!route.action) return "METHOD_NOT_GOVERNABLE";

  if (!DECLARED_ACTIONS[route.module]?.includes(route.action)) return null;

  return entry.matrix?.[route.module]?.[route.action]
    ? null
    : "MODULE_FORBIDDEN";
};

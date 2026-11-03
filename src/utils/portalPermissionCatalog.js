/**
 * The module vocabulary for portal-user permissions — what "Overview",
 * "Environments" and "Environment Access" mean, and which of the four
 * actions each one actually supports.
 *
 * Single authority: the admin console fetches this from
 * GET /api/v1/admin/portal-users/permissions/catalog instead of hard-coding a
 * second copy, so a module added here shows up in the UI with no matching
 * frontend edit — and the two can never drift apart.
 *
 * `actions` narrows what a module can express: Overview is a read-only
 * dashboard, so offering Create/Update/Delete on it would be a lie — the
 * console greys those cells out rather than rendering ticks that mean
 * nothing, and the server discards them if sent anyway.
 */

export const ACTIONS = ["read", "create", "update", "delete"];

const ALL = ["read", "create", "update", "delete"];

export const MODULES = [
  {
    key: "overview",
    label: "Overview",
    description:
      "The dashboard summary: how many environments the user has, and how many are active.",
    actions: ["read"],
  },
  {
    key: "environments",
    label: "Environments",
    description: "Wrike environment records: credentials, IDs and visibility.",
    actions: ALL,
  },
  {
    key: "environment_access",
    label: "Environment Access",
    description:
      "The email/domain/IP allow list controlling who can call the API.",
    // All four, one per portal route: read lists the allow list, create adds
    // an entry, update edits/re-enables one or flips a security switch, delete
    // removes one (src/routes/portal/environmentAccess/index.js).
    actions: ALL,
  },
  {
    key: "api_tokens",
    label: "Token management",
    description:
      "The tokens issued for the environments this user can see: what each one is allowed to do, and whether it is switched on.",
    // Two actions, one per route in src/routes/portal/apiTokens: read lists the
    // tokens of the user's own environments, update edits a token's module
    // matrix.
    //
    // No create, deliberately. A token is minted in exactly two places, and
    // neither of them is a console: the token service's root login page, and an
    // MCP client's OAuth flow. Both exchange a Wrike authorization code for it,
    // which only a person signing in can produce, so there is no create route
    // to grant. An unticked Create box would have been a promise nothing could
    // keep, and a ticked one would have bought a button that could not do it.
    //
    // No delete. A token's availability is a narrowing decision, not a
    // destructive one: switching a token off is the same kind of act as editing
    // its module matrix, and it is reversible from the same page. So update
    // carries both, and delete has nothing of its own left to grant. A tick that
    // authorises nothing is the same dead control as the untickable Create box
    // above, so it is not offered either.
    actions: ["read", "update"],
  },
  {
    key: "environment_modules",
    label: "Environment Modules",
    description:
      "Which API modules each environment this user can see allows at all — the ceiling every token in that environment is held to. Reached from a row of the Environments page, so it is worth granting alongside it.",
    // Two actions, one per route in src/routes/portal/environmentModules: read
    // lists and fetches a grid, update replaces one.
    //
    // Its own module rather than a wider `environments` grant, so "may this
    // person see the company's module ceiling?" and "may they change it?" are
    // answered separately: reading it is what lets somebody explain why a call
    // was refused, and changing it changes what every token in that
    // environment may do.
    actions: ["read", "update"],
  },
  {
    key: "activity_logs",
    label: "Activity Logs",
    description:
      "The API/MCP call audit trail: who called what, and whether it was allowed.",
    actions: ["read"],
  },
  {
    key: "cache",
    label: "Cache Settings",
    description:
      "Cached Redis keys and their values — read to browse, delete to clear keys.",
    actions: ["read", "delete"],
  },
];

export const MODULE_KEYS = MODULES.map((m) => m.key);

const moduleByKey = Object.fromEntries(MODULES.map((m) => [m.key, m]));

/** An all-false matrix — the safe starting point for a user with no rows yet. */
export const emptyMatrix = () =>
  Object.fromEntries(
    MODULES.map((m) => [
      m.key,
      { read: false, create: false, update: false, delete: false },
    ]),
  );

/**
 * Normalise arbitrary input into a full, valid matrix: every module present,
 * every action a module doesn't support forced off. Anything the caller
 * invents beyond that is discarded rather than stored.
 */
export const normaliseMatrix = (input) => {
  const result = emptyMatrix();

  for (const mod of MODULES) {
    for (const action of mod.actions) {
      result[mod.key][action] = !!input?.[mod.key]?.[action];
    }
  }

  return result;
};

export const isKnownModule = (key) => !!moduleByKey[key];

export const catalog = () => ({ actions: ACTIONS, modules: MODULES });

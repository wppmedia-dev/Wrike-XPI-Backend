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
    key: "redirect_urls",
    label: "Redirect URLs",
    description:
      "The addresses a sign-in may send the browser back to, per environment. Anything not listed is refused, so this decides where an OAuth authorization code can be delivered.",
    // All four, one per route in src/routes/portal/redirectUrls: read lists the
    // entries and tests an address, create adds one, update edits or switches
    // one off, delete removes one.
    //
    // Its own module rather than part of environment_access: that list says who
    // may call the API, this one says where a login's code may be sent, and
    // granting somebody the first should not quietly grant the second.
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
    key: "environment_token_lifetimes",
    label: "MCP Token Lifetimes",
    description:
      "The per-environment override of how long MCP access and refresh tokens live (blank uses the global value). Shown in the environment form, so it is worth granting alongside Environments.",
    // Two actions, matching the two things the feature does: read shows an
    // environment's override values, update sets or clears them.
    //
    // Its own module rather than a wider `environments` grant: token lifetimes
    // are a security setting (a long refresh lifetime keeps a stolen token
    // useful for longer), so being allowed to edit an environment's credentials
    // must not silently include being allowed to change them. No create or
    // delete: the override is two optional fields on an environment, so there is
    // nothing to add or remove on its own.
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
  {
    key: "sync",
    label: "Sync",
    description:
      "The Sync page: reload the Azure Key Vault secrets the service keeps in memory, see each source's last run, and run it now.",
    // Two actions, one per route in src/routes/portal/sync: read shows the page and
    // each source's last run, update runs a sync.
    //
    // No create or delete: the sources are fixed in code (src/utils/syncSources.js),
    // so there is nothing to add or remove. Not scoped to the user's environments,
    // because a sync is service-wide, which is why it is a grant of its own.
    actions: ["read", "update"],
  },
  {
    key: "security",
    label: "Security",
    description:
      "The Security page: how long MCP access and refresh tokens live, and whether a token may be used on both the REST API and MCP. These apply to the whole service, not one environment.",
    // Two actions, one per kind of route in src/routes/portal/security: read
    // shows the current values, update changes them.
    //
    // No create or delete: these are two fixed settings, not records. Not scoped
    // to the user's environments because they are service-wide, which is why
    // this is its own grant (as sync is) and why it deserves care: a longer
    // refresh lifetime keeps a stolen token useful for longer, and cross-token
    // access widens what each token opens. The admin's own MFA card is not part
    // of it: that belongs to that admin's account.
    actions: ["read", "update"],
  },
  {
    key: "oauth_clients",
    label: "OAuth Clients",
    description:
      "The MCP connectors (Claude and others) that signed in to the user's environments: whether each is connected, its history in the Activity Log, and cutting one off.",
    // Three actions, one per route in src/routes/portal/oauthClients: read lists
    // the clients, update disconnects one, delete revokes one.
    //
    // No create, deliberately. A client registers itself (POST /oauth/register,
    // called by the MCP client, not by a person in a console), so there is no
    // create route to grant. A tick that authorises nothing is the same dead
    // control the api_tokens module explains, so it is not offered.
    //
    // Update and delete are split by how much they undo. Disconnect ends this
    // user's environments' sign-ins and the client can simply sign in again, so
    // it sits with update. Revoke stops the client signing in at all and cannot
    // be undone, so it is its own grant (and is refused for a client other
    // environments also use; see OAuthClients.RevokeScoped).
    actions: ["read", "update", "delete"],
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

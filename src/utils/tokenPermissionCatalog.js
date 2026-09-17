/**
 * The module vocabulary for API-token permissions: what "Campaign",
 * "Channel", "Task", "Master Data" and "Amoeba" mean for a caller holding an
 * XPI token, and which of the four actions each one actually supports.
 *
 * One entry per API group the private router exposes (src/routes/index.js
 * registers campaign, channel, task, master and amoeba under /wrikexpi/*),
 * plus one for the MCP surface's proxied Wrike tools, which are not reachable
 * by path at all. Which action a request is does not live here. That comes
 * from the HTTP method through the action map the activity log already labels
 * requests with (src/utils/tokenPermissionMap.js). This file decides only
 * whether a module can express that action at all.
 *
 * Single authority: the admin console fetches this from
 * GET /api/v1/admin/tokens/permissions/catalog instead of hard-coding a
 * second copy, so a module added here shows up in the UI with no matching
 * frontend edit, and the two can never drift apart.
 *
 * `actions` narrows what a module can express: Channel and Task have no
 * create endpoint (src/routes/channel, src/routes/task), so offering Create
 * on them would be a lie, so the console greys those cells out rather than
 * rendering ticks that mean nothing, and the server discards them if sent
 * anyway.
 *
 * A grant is not a gate by default. A token with no rows in
 * token_permissions is unrestricted, so restricting a token is an explicit
 * admin act; src/controllers/tokenPermissions.js carries that distinction as
 * its `configured` flag.
 */

export const ACTIONS = ["read", "create", "update", "delete"];

const ALL = ["read", "create", "update", "delete"];

export const MODULES = [
  {
    key: "campaign",
    label: "Campaign",
    description:
      "Campaign records under /wrikexpi/campaign: list, get, create, update and delete, plus the request-form URL and attachment upload helpers.",
    actions: ALL,
  },
  {
    key: "channel",
    label: "Channel",
    description:
      "Channel records under /wrikexpi/channel. There is no create endpoint, so Create has nothing to grant.",
    actions: ["read", "update", "delete"],
  },
  {
    key: "task",
    label: "Task",
    description:
      "Task records under /wrikexpi/task. There is no create endpoint, so Create has nothing to grant.",
    actions: ["read", "update", "delete"],
  },
  {
    key: "master",
    label: "Master Data",
    description:
      "Master data records under /wrikexpi/v1.0: the record and value endpoints, covering every master slug.",
    actions: ALL,
  },
  {
    key: "amoeba",
    label: "Amoeba",
    description:
      "The /wrikexpi/amoeba catch-all. Which module and service a path reaches is data-driven from Datahub, so every verb is expressible here.",
    actions: ALL,
  },
  {
    key: "mcp_proxy",
    label: "Wrike MCP Tools",
    description:
      "Wrike's own MCP tools, proxied as wrike_*. These are raw Wrike objects (items, spaces, approvals, comments, users, attachments) rather than XPI modules. Applies to MCP callers only; the REST API never resolves to this row.",
    actions: ALL,
  },
];

export const MODULE_KEYS = MODULES.map((m) => m.key);

const moduleByKey = Object.fromEntries(MODULES.map((m) => [m.key, m]));

/**
 * An all-false matrix. For a token this is the *restricted* state, meaning
 * nothing is granted, and it only means anything once a save has written it,
 * since a
 * token with no rows at all is unrestricted.
 */
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

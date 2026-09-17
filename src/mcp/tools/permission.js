/**
 * The permission denial an MCP tool call returns, and the mapping from a tool
 * name to the module and action it needs
 * (src/utils/tokenPermissionMap.js holds the decision itself).
 *
 * Same matrix as the REST gate, different surface: a token restricted to
 * reading campaigns must not be able to update them through the MCP endpoint
 * instead. Keeping the rule in one place and the *surface* in this file is
 * what makes that true by construction rather than by review.
 */

/**
 * Verb → action, first match wins. The verbs mirror MUTATING_TOOL_PATTERN in
 * confirmation.js so the two agree about what counts as a write; this lists
 * them by destination action rather than as one boolean.
 */
const ACTION_BY_VERB = [
  [/^(delete|remove|archive|purge)/i, "delete"],
  [/^(create|add|copy|duplicate|upload|prepare)/i, "create"],
  [
    /^(update|edit|set|move|replace|assign|unassign|attach|complete|approve|reject|submit|cancel|reorder|restore|share|unshare)/i,
    "update",
  ],
];

/**
 * The same vocabulary for a name whose verb is not the first segment:
 * "items_delete_many", "portfolio_remove".
 *
 * Checked as a whole segment, not as a prefix, because "address" starts with
 * "add" and a name read as create when it is a read is a worse mistake than the
 * other way round. The list is keyed by action in the same order as
 * ACTION_BY_VERB, so a name holding two verbs ("set_delete_flag") resolves to
 * the more dangerous of them: delete must never be classified as update, since
 * update is the action tokens hold more often.
 *
 * Only reached for names the leading-verb patterns did not match, and only
 * after a tool has not declared itself read-only. It tightens the fallback: an
 * unrecognised name with a verb in it is treated as a write, which is the same
 * choice the annotations fallback below makes.
 */
const ACTION_BY_SEGMENT = [
  ["delete", ["delete", "remove", "archive", "purge"]],
  ["create", ["create", "add", "copy", "duplicate", "upload", "prepare"]],
  [
    "update",
    [
      "update",
      "edit",
      "set",
      "move",
      "replace",
      "assign",
      "unassign",
      "attach",
      "complete",
      "approve",
      "reject",
      "submit",
      "cancel",
      "reorder",
      "restore",
      "share",
      "unshare",
    ],
  ],
];

/**
 * Native tool families that map onto an XPI module. Keyed by the tool name's
 * first underscore-separated segment: campaign_list → campaign,
 * task_list_campaign → task.
 */
const MODULE_BY_PREFIX = {
  campaign: "campaign",
  channel: "channel",
  task: "task",
};

/**
 * The only two tools with no module and no action, because there is nothing
 * for a module to own.
 *
 * datahub_list_fields reads Datahub field definitions for a list of slugs and
 * never touches a record; ids_convert turns a legacy API v2 id into a v4 one
 * and never touches a resource. Neither reads or writes anything a module
 * governs, and both are prerequisites for calls that *are* governed: a task
 * token needs ids_convert to call task_get. Attributing them to a module would
 * pick that module arbitrarily, and a token restricted to tasks would then be
 * unable to resolve a task id.
 *
 * Named here rather than inferred, and asserted by
 * test/mcpToolPermissions.test.js against the names the tool files actually
 * register: being exempt is a decision somebody made, not a default a new tool
 * inherits by having an unfamiliar name.
 */
export const UNGOVERNED_TOOLS = new Set(["datahub_list_fields", "ids_convert"]);

/**
 * Wrike's own MCP tools, proxied one-to-one as `wrike_*`.
 *
 * Their names come from Wrike at runtime, so they cannot be attributed to one
 * of the five XPI modules, because `wrike_search_items` is not a campaign call any
 * more than it is a task call. They get their own matrix row instead, which is
 * also the honest answer to "can this token touch raw Wrike objects?".
 *
 * The key must exist in src/utils/tokenPermissionCatalog.js, or the decision
 * function treats the action as inexpressible and allows it.
 */
export const WRIKE_PROXY_MODULE = "mcp_proxy";

const actionForTool = (subject, annotations) => {
  if (annotations?.readOnlyHint === true) return "read";

  for (const [pattern, action] of ACTION_BY_VERB) {
    if (pattern.test(subject)) return action;
  }

  // No verb at the front. Look for one anywhere, as a whole segment.
  const segments = String(subject || "")
    .toLowerCase()
    .split("_");
  for (const [action, verbs] of ACTION_BY_SEGMENT) {
    if (segments.some((segment) => verbs.includes(segment))) return action;
  }

  // No verb recognised. If the tool declared itself as writing, treat it as an
  // update rather than a read: an unrecognised write must not fall through to
  // the action that is granted most often.
  if (
    annotations?.readOnlyHint === false ||
    annotations?.destructiveHint === true
  ) {
    return "update";
  }

  return "read";
};

/**
 * The module and action a tool call needs, or null when nothing governs it.
 *
 * Null is returned only for the two helpers in UNGOVERNED_TOOLS above.
 * Everything else is governed, including a tool nobody has classified yet:
 * an unrecognised name falls to the mcp_proxy row rather than to no row at
 * all. That direction matters. This function's answer decides whether the gate
 * runs at all (src/mcp/index.js), so an unmapped name used to mean "allowed for
 * every token, including a token restricted to reading one module", which is
 * the wrong way for an unfamiliar name to behave. Failing closed costs a
 * restricted token one admin grant for a tool nobody has classified; failing
 * open costs the restriction itself.
 *
 * A new native family should still get a MODULE_BY_PREFIX entry, so the
 * console shows its own row instead of the MCP one. "some_future_tool" in
 * test/tokenPermissions.test.js is the case that pins this down.
 *
 * @param {string} name - registered tool name, e.g. "campaign_update"
 * @param {{readOnlyHint?: boolean, destructiveHint?: boolean}} [annotations]
 * @returns {{module: string, action: string} | null}
 */
export const resolveToolRoute = (name, annotations) => {
  const toolName = String(name || "");
  if (!toolName) return null;

  if (toolName.startsWith("wrike_")) {
    return {
      module: WRIKE_PROXY_MODULE,
      // "create_task_item" → create. The wrike_ prefix names the family; the
      // rest is the subject whose verb says which action this is.
      action: actionForTool(toolName.slice("wrike_".length), annotations),
    };
  }

  // Exempt by name, before the prefix lookup, so an entry here cannot be
  // overridden by a prefix rule added later.
  if (UNGOVERNED_TOOLS.has(toolName)) return null;

  const [prefix, ...rest] = toolName.split("_");
  const module = MODULE_BY_PREFIX[prefix];
  if (module) {
    // "campaign_create" → create. Stripping the module prefix matters: without
    // it the verb is never at the start of the name, so campaign_create would
    // fall through to the generic write fallback and be read as an update.
    return { module, action: actionForTool(rest.join("_"), annotations) };
  }

  // Unclassified: the MCP row, with the verb read off the whole name or, if
  // the name says nothing, off the tool's own annotations.
  return {
    module: WRIKE_PROXY_MODULE,
    action: actionForTool(toolName, annotations),
  };
};

/**
 * Refuse a tool call because this token's matrix does not allow it.
 *
 * Marked `isError: true`, unlike the confirmation gate's preview: that result
 * means "the call succeeded, its outcome is not applied yet", while this one
 * means the call failed. An agent that treated this as a preview would ask the
 * user for approval and then retry, which would fail identically.
 *
 * The closing instruction matters as much as the denial. Every write this
 * refuses is also reachable through another tool on the other surface: a
 * blocked campaign_update can be attempted as wrike_update_items, a blocked
 * REST call can be retried over MCP. So the result names the missing
 * permission and says plainly not to route around it.
 */
export const permissionDenied = ({ toolName, module, action, code }) => ({
  isError: true,
  content: [
    {
      type: "text",
      text: [
        "FORBIDDEN. Nothing was changed.",
        "",
        `"${toolName}" was not executed: this token is not permitted to ${action} ${module}.`,
        code ? `Reason code: ${code}.` : "",
        "",
        "A token's access is granted per module and per action by an administrator in the admin portal. This is not a transient failure or a rate limit, so repeating the call returns this same result.",
        "Next step: tell the user which permission is missing (module and action, as above) and stop. Do not attempt the same change through a different tool, and do not ask them to approve anything. There is nothing to approve.",
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ],
});

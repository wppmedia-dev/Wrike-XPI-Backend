import { z } from "zod";

/**
 * Two-step confirmation gate for MCP write tools.
 *
 * Every update/delete tool (and every mutating proxied `wrike_*` tool)
 * declares an optional `confirm` flag. A call that omits it never reaches the
 * handler's business logic: it returns a preview of exactly what would change
 * and tells the agent to ask the user for approval. The write only happens on
 * a second call that repeats the same arguments with `confirm: true`.
 *
 * The gate lives in the handler rather than in the client because:
 *   - MCP elicitation (`server.server.elicitInput`) needs the client to
 *     advertise the capability, and this server's transport runs with
 *     `enableJsonResponse: true`, which drops server→client requests;
 *   - instructions alone are advisory — the model can ignore them. Requiring
 *     the two-call sequence makes the confirmation unavoidable.
 */

/** Argument key that carries the user's approval. */
export const CONFIRM_KEY = "confirm";

/**
 * Shared description for the `confirm` field on every gated tool.
 *
 * @param {string} action - human phrase, e.g. "update this campaign"
 */
export const describeConfirm = (action) =>
  `Approval flag for a write operation. Leave unset (or false) on the first ` +
  `call: the server then performs NO write and returns a preview of what this ` +
  `call would change. Show that preview to the user, ask for approval, and only ` +
  `then call again with the same arguments plus confirm: true. Never set ` +
  `confirm: true without explicit user approval for this specific ${action}.`;

/**
 * Ready-made zod field so every gated tool declares `confirm` identically.
 *
 * @param {string} action - human phrase, e.g. "update this campaign"
 */
export const confirmField = (action) =>
  z.boolean().optional().describe(describeConfirm(action));

/** Appended to the description of gated tools so the model sees the rule. */
export const CONFIRMATION_TOOL_NOTE =
  "\n\nCONFIRMATION REQUIRED: call this tool once WITHOUT confirm to receive a " +
  "preview of the change (no write happens), ask the user to approve it, then " +
  "call again with confirm: true.";

/**
 * The caller has explicitly approved only when confirm is strictly true —
 * anything else (missing, false, "true", 1) leaves the gate closed.
 */
export const isConfirmed = (confirm) => confirm === true;

/**
 * Verbs that mark a tool as a write, matched against the tool name. Wrike's
 * proxied tool names are verb-first (`update_items`, `create_task_item`,
 * `add_attachments_to_item`), so a prefix match is a reliable signal even
 * when a remote tool ships no annotations at all.
 *
 * `prepare_*` is deliberately absent: it stages an upload without changing
 * anything, so gating it would only add friction.
 */
export const MUTATING_TOOL_PATTERN =
  /^(create|update|edit|delete|remove|add|set|move|copy|duplicate|archive|restore|share|unshare|assign|unassign|attach|complete|approve|reject|submit|cancel|reorder)/i;

/**
 * Writes that can destroy or overwrite existing data — the MCP spec's
 * meaning of a destructive update. Drives both the preview's warning text
 * and the local tool's `destructiveHint`.
 */
export const DESTRUCTIVE_TOOL_PATTERN =
  /^(delete|remove|archive|purge|update|edit|set|move|replace)/i;

/**
 * Decide whether a tool mutates state. Annotations are trusted first; the
 * name is the fallback, because a missing `readOnlyHint` must never be read
 * as "safe to run unattended".
 *
 * @param {{name?: string, annotations?: object}} [tool]
 */
export const isMutatingTool = (tool) => {
  if (tool?.annotations?.readOnlyHint === false) return true;
  if (tool?.annotations?.destructiveHint === true) return true;
  return MUTATING_TOOL_PATTERN.test(String(tool?.name || ""));
};

/**
 * Decide whether a tool can overwrite or remove data, so the confirmation
 * preview can say so in the strongest terms.
 *
 * @param {{name?: string, annotations?: object}} [tool]
 */
export const isDestructiveTool = (tool) => {
  if (tool?.annotations?.destructiveHint === true) return true;
  return DESTRUCTIVE_TOOL_PATTERN.test(String(tool?.name || ""));
};

const renderValue = (value) => {
  if (value === null) return "null";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

/** Render an argument map as an indented "key: value" list. */
const renderArguments = (args) => {
  const entries = Object.entries(args || {}).filter(
    ([key, value]) => key !== CONFIRM_KEY && value !== undefined,
  );
  if (!entries.length) return "  (none)";
  return entries
    .map(([key, value]) => `  - ${key}: ${renderValue(value)}`)
    .join("\n");
};

/**
 * Build the "ask the user first" result returned instead of performing a write.
 *
 * Returned as a normal tool result (not an error): the call itself succeeded,
 * its outcome is simply "not executed yet".
 *
 * @param {object} params
 * @param {string} params.toolName - name of the tool the agent called
 * @param {string} params.action - human phrase, e.g. "update this campaign"
 * @param {string} [params.target] - identifier of the affected resource
 * @param {object} [params.arguments] - the arguments the agent passed
 * @param {string} [params.warning] - extra note about irreversible effects
 * @returns {{content: {type: string, text: string}[]}}
 */
export const confirmationRequest = ({
  toolName,
  action,
  target,
  arguments: args,
  warning,
}) => {
  const lines = [
    "CONFIRMATION REQUIRED — nothing was changed.",
    "",
    `"${toolName}" was called without confirm: true, so the server did not ${action}.`,
    "",
    `Requested action: ${action}${target ? ` — ${target}` : ""}`,
    "Arguments that would be applied if approved:",
    renderArguments(args),
  ];

  if (warning) lines.push("", warning);

  lines.push(
    "",
    "Next step: show the user this requested action and these arguments, then ask them to approve it.",
    `Do not call "${toolName}" again to work around this check — repeating the call without confirm: true returns this same preview.`,
    `Once the user has explicitly approved, call "${toolName}" again with the exact same arguments plus confirm: true.`,
    "If the user declines, stop and report that nothing was changed.",
  );

  return { content: [{ type: "text", text: lines.join("\n") }] };
};

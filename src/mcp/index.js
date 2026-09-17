import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCampaignTools } from "./tools/campaign.js";
import { registerChannelTools } from "./tools/channel.js";
import { registerTaskTools } from "./tools/task.js";
import { registerDatahubTools } from "./tools/datahub.js";
import { registerIdsTools } from "./tools/ids.js";
import { registerWrikeProxyTools } from "./wrikeMcpProxy.js";
import wrikeIconDataUri from "./wrikeIcon.js";
import { TokenPermissions } from "../controllers";
import { denialFor } from "../utils/tokenPermissionMap";
import { permissionDenied, resolveToolRoute } from "./tools/permission.js";

/**
 * Top-level instructions surfaced to the connected agent during handshake.
 *
 * This server now merges TWO tool families — native XPI business tools and
 * Wrike's own hosted MCP tools (proxied with a `wrike_` prefix). The
 * guidance tells the agent which family to reach for, so the two never
 * conflict and it always has enough context to pick the right tool.
 */
const MCP_INSTRUCTIONS = `You are connected to the WrikeXPI MCP server. This server exposes TWO tool families that complement — not duplicate — each other.

1. NATIVE XPI TOOLS (no prefix)
   Business operations for WrikeXPI-managed resources: campaigns, channels, tasks, and Datahub records/fields. They are scoped to the environment of your authenticated token and apply XPI rules (enrichment, validation, request forms, datahub IDs) on top of Wrike.
   Prefer these whenever the user is talking about an XPI resource: a campaign, a channel, a Datahub field/record, or a task that belongs to an XPI campaign/channel flow.

2. WRIKE NATIVE TOOLS (prefix "wrike_", present only when reachable for this token)
   Wrike's own MCP tools, proxied one-to-one, operating on the raw Wrike account. Real tool families: items & hierarchy (search_items, get_item_details, get_items_children, create_task_item, create_project_folder_item, update_items), spaces (search_spaces), approvals (get_approvals, search_approvals), comments (get_item_comments, create_item_comment), inbox (get_my_inbox), users & groups (get_users, search_users), custom item types & custom fields (search_customitemtypes, search_item_customfields), workflows/statuses (search_workflows), and attachments (prepare_attachment_upload, add_attachments_to_item).
   Use these when the ask concerns raw Wrike objects that XPI tools do not model — comments, approvals, inbox, spaces, users/groups, attachments, generic item search/hierarchy, custom item types, workflows/statuses — or to read/update an item that lives outside an XPI flow.

HOW TO CHOOSE — avoid conflict
- Let the resource decide the family, not the tool list: XPI-managed resource -> XPI tool; a generic Wrike item/space/user/approval/comment/etc. -> wrike_* tool.
- Never call an XPI tool and a wrike_* tool for the same job, and never invent a combined flow when a single call does it.
- If an expected wrike_* tool is missing, fall back to the XPI toolset (always present) or tell the user it is unavailable — do not improvise a substitute.

CONFIRMING WRITE OPERATIONS — every update and delete is gated
- All mutating tools are gated: the native update/delete tools (campaign_update, campaign_delete, channel_update, channel_delete, task_update, task_delete) and every mutating wrike_* tool (update_items, create_task_item, add_attachments_to_item, and any other that writes).
- A gated tool called WITHOUT confirm: true performs NO write. It returns a preview naming the requested action and the exact arguments that would be applied. That return value is the confirmation step, not a failure and not a completed change.
- On receiving a preview: show the user the requested action and those arguments in plain language, then ask them to approve it. Never assume approval, never approve on the user's behalf, and never treat an earlier approval of a different change as consent for this one.
- Only after the user explicitly approves that specific change, call the same tool again with the identical arguments plus confirm: true. Do not add, drop, or re-scope arguments on the confirmed call — if the change differs, restart the sequence with a fresh preview.
- If the user declines, or does not answer, stop and report that nothing was changed. Do not retry the call, and do not reach for a different tool that would achieve the same write.
- Never state or imply that a change was made until a call carrying confirm: true has actually returned successfully.
- Creating a campaign (campaign_create) is not gated — it destroys nothing and has no prior state to preview.

MODULE PERMISSIONS — a token may be narrower than the tool list
- The tool list is what the *surface* can do. What your token is *allowed* to do is granted per module (campaign, channel, task, master data, amoeba, Wrike MCP tools) and per action (read, create, update, delete), and a token nobody has restricted can do everything.
- A tool call outside those grants returns FORBIDDEN with isError: true, naming the module and action that is missing. That is a final answer, not a transient one: retrying, or reaching for a different tool that would achieve the same change (for example wrike_update_items instead of campaign_update), is not permitted.
- When you get FORBIDDEN: report the missing module and action to the user and stop. An administrator can change it in the admin portal; you cannot, and nothing was changed.

MECHANICS
- Authentication is already resolved per request; never pass tokens or credentials.
- Read each tool's schema before calling; arguments are validated.
- IDs returned by tools feed into the matching tools unchanged (XPI IDs are Wrike-based; wrike_* tools accept Wrike item/folder/task IDs).
- All campaign, channel, campaign-task, and channel-task tools (campaign_get/update/delete, channel_get/update/delete, task_get/update/delete, task_list_campaign, task_list_channel) require an API v4 ID for their campaignId/channelId/taskId parameter. If the user gives you a legacy API v2 ID instead (a short numeric-looking id, or one sourced from an old API v2 integration/export/URL), do not guess or pad it into a v4 ID. Call ids_convert first (type ApiV2Folder for campaigns/channels, ApiV2Task for tasks) to resolve it to the matching v4 ID, then use that v4 ID for the call.
- If the user gives you a Wrike link instead of an ID (a permalink such as https://www.wrike.com/open.htm?id=... or https://app-eu.wrike.com/open.htm?id=...), do not parse or guess the ID from the URL yourself. Pass the permalink itself into get_item_details. The response's id field is the resolved v4 ID for that folder or task. Use that v4 ID for every following call, including native XPI tools.
- If the user identifies someone by email address for an action that needs a user ID (assigning a task, adding a follower, and similar), do not guess or invent a user ID from the email. Call wrike_get_users first to look up that email and read the matching user's id from the response. Use that id for the action.
- Respect limits and pagination: wrike_* tools cap results (e.g. 200 newest comments, pageSize on search_items) and return truncation/next-page signals — page through or narrow the query as each tool's description explains.`;

/**
 * Wrap server.registerTool so every tool checks the calling token's module
 * permissions before its handler runs.
 *
 * A wrapper rather than a guard inside each handler because this is the one
 * point every tool funnels through: all sixteen native tools *and* the whole
 * dynamically-named wrike_* family register via this single method, and the
 * server is rebuilt per HTTP request, so the per-request auth (which carries
 * the token id) is safe to close over. It also keeps the confirmation gate's
 * invariant intact — test/mcpConfirmation.test.js scans the tool files for
 * those guards, and no tool file gains a second concern from this change.
 *
 * Denies on a failed lookup as well as on a denied rule: a permission check
 * that cannot be answered must not quietly become a grant, and the REST gate
 * (src/middlewares/tokenPermissions.js) makes the same choice.
 */
const installPermissionGate = (server, auth) => {
  const registerTool = server.registerTool.bind(server);

  server.registerTool = (name, config, handler) =>
    registerTool(name, config, async (args, extra) => {
      const route = resolveToolRoute(name, config?.annotations);
      if (!route) return handler(args, extra);

      try {
        const entry = await TokenPermissions.GetMatrixCached(auth?.tokenId);
        const code = denialFor(entry, route);
        if (code) return permissionDenied({ toolName: name, ...route, code });
      } catch (err) {
        console.error(new Date().toISOString(), err);
        return permissionDenied({
          toolName: name,
          ...route,
          code: "PERMISSION_CHECK_FAILED",
        });
      }

      return handler(args, extra);
    });
};

/**
 * Create a fully-configured MCP server with all tools registered.
 * Authentication is resolved once per HTTP request (bearer token, see
 * src/plugins/mcp.js) and passed in as `auth` — tools no longer accept
 * an auth_token parameter of their own.
 *
 * @param {object} fastify - Fastify instance
 * @param {string} serverUrl - Base URL for auth error messages
 * @param {{wrikeToken: string, environmentName: string, envId: string, tokenId: string}} auth - Resolved auth for this request
 * @returns {Promise<McpServer>}
 */
export const createMcpServer = async (fastify, serverUrl, auth) => {
  const server = new McpServer(
    {
      name: "wrikexpi-mcp",
      title: "WrikeXPI",
      version: "1.0.0",
      description:
        "Hybrid WrikeXPI MCP: native XPI business tools (campaigns, channels, tasks, Datahub) + Wrike's own tools exposed as wrike_*.",
      websiteUrl: serverUrl,
      icons: [
        {
          src: wrikeIconDataUri,
          mimeType: "image/x-icon",
        },
      ],
    },
    {
      capabilities: {
        tools: {},
      },
      instructions: MCP_INSTRUCTIONS,
    },
  );
  // Wraps registerTool before anything registers, so the native tools below
  // and the proxied wrike_* tools further down are all covered by one gate.
  installPermissionGate(server, auth);
  registerCampaignTools(server, fastify, serverUrl, auth);
  registerChannelTools(server, serverUrl, auth);
  registerTaskTools(server, serverUrl, auth);
  registerDatahubTools(server, serverUrl, auth);
  registerIdsTools(server, serverUrl, auth);

  // Merges in Wrike's own hosted MCP tools (no-ops if WRIKE_MCP_URL is unset
  // or unreachable — native XPI tools above are unaffected either way).
  if (auth?.wrikeToken) {
    await registerWrikeProxyTools(server, fastify, auth.wrikeToken);
  }

  return server;
};

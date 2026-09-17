/* Exercises the per-token module permission gate: the catalogue, the REST
   path→module/method→action mapping, the MCP tool-name mapping, and the
   allow/deny decision itself.
   Run from the repo root:  node test/tokenPermissions.test.js

   No database, Redis or Wrike account required — everything under test is
   deliberately pure (src/utils/tokenPermissionCatalog.js,
   src/utils/tokenPermissionMap.js, src/mcp/tools/permission.js), which is the
   point of keeping the decisions out of the middleware and the MCP wrapper.
   The one thing it asserts about the non-pure code is that the MCP verb list
   still agrees with the confirmation gate about what a write is. */

require("@babel/register")({
  presets: [["@babel/preset-env", { targets: { node: "current" } }]],
});
process.on("unhandledRejection", () => {});

const catalog = require("../src/utils/tokenPermissionCatalog");
const map = require("../src/utils/tokenPermissionMap");
const mcp = require("../src/mcp/tools/permission");
const { isMutatingTool } = require("../src/mcp/tools/confirmation");

let pass = 0;
let fail = 0;

const check = (label, actual, expected) => {
  if (actual === expected) {
    pass++;
    console.log(`  ok    ${label}`);
  } else {
    fail++;
    console.log(
      `  FAIL  ${label}\n          got ${actual}, expected ${expected}`,
    );
  }
};

/** "module/action" for a request, or "not governed". */
const routeOf = (method, url) => {
  const route = map.resolveRoute(method, url);
  return route ? `${route.module}/${route.action}` : "not governed";
};

const entry = (matrix, configured = true) => ({ configured, matrix });

const fullMatrix = () =>
  catalog.normaliseMatrix(
    Object.fromEntries(
      catalog.MODULES.map((mod) => [
        mod.key,
        { read: true, create: true, update: true, delete: true },
      ]),
    ),
  );

console.log("\nCatalogue");
{
  check(
    "module keys",
    catalog.MODULE_KEYS.join(","),
    "campaign,channel,task,master,amoeba,mcp_proxy",
  );
  check(
    "channel has no create endpoint",
    JSON.stringify(catalog.MODULES.find((m) => m.key === "channel").actions),
    JSON.stringify(["read", "update", "delete"]),
  );
  check(
    "task has no create endpoint",
    JSON.stringify(catalog.MODULES.find((m) => m.key === "task").actions),
    JSON.stringify(["read", "update", "delete"]),
  );
  check(
    "campaign supports all four",
    catalog.MODULES.find((m) => m.key === "campaign").actions.length,
    4,
  );

  check(
    "empty matrix keeps every module",
    Object.keys(catalog.emptyMatrix()).length,
    6,
  );
  check(
    "empty matrix is all false",
    Object.values(catalog.emptyMatrix().master).join(","),
    "false,false,false,false",
  );

  // Unknown modules and undeclared actions are discarded, never stored — a
  // row that said otherwise must not survive a save.
  const normalised = catalog.normaliseMatrix({
    campaign: { read: true, create: true },
    channel: { read: true, create: true },
    "not-a-module": { read: true },
  });
  check("known module kept", normalised.campaign.read, true);
  check("declared action kept", normalised.campaign.create, true);
  check("undeclared action forced off", normalised.channel.create, false);
  check("unknown module dropped", normalised["not-a-module"], undefined);

  check(
    "catalog() exposes actions",
    catalog.catalog().actions.join(","),
    "read,create,update,delete",
  );
  check("isKnownModule", catalog.isKnownModule("amoeba"), true);
  check("isKnownModule rejects junk", catalog.isKnownModule("nope"), false);
}

console.log("\nREST routes → module/action");
{
  const cases = [
    ["POST", "/api/v1/wrikexpi/campaign", "campaign/create"],
    ["POST", "/api/v1/wrikexpi/campaign/url", "campaign/create"],
    ["POST", "/api/v1/wrikexpi/campaign/upload", "campaign/create"],
    ["GET", "/api/v1/wrikexpi/campaign?limit=5", "campaign/read"],
    ["GET", "/api/v1/wrikexpi/campaign/IEAC123", "campaign/read"],
    ["PUT", "/api/v1/wrikexpi/campaign/IEAC123", "campaign/update"],
    ["DELETE", "/api/v1/wrikexpi/campaign/IEAC123", "campaign/delete"],
    ["GET", "/api/v1/wrikexpi/channel/CH1", "channel/read"],
    ["PUT", "/api/v1/wrikexpi/channel/CH1", "channel/update"],
    ["DELETE", "/api/v1/wrikexpi/channel/CH1", "channel/delete"],
    ["GET", "/api/v1/wrikexpi/task/T1", "task/read"],
    ["PUT", "/api/v1/wrikexpi/task/T1", "task/update"],
    ["DELETE", "/api/v1/wrikexpi/task/T1", "task/delete"],
    ["POST", "/api/v1/wrikexpi/v1.0/record/project", "master/create"],
    ["GET", "/api/v1/wrikexpi/v1.0/record/project", "master/read"],
    ["PUT", "/api/v1/wrikexpi/v1.0/record/project/R1", "master/update"],
    ["DELETE", "/api/v1/wrikexpi/v1.0/record/project/R1", "master/delete"],
    ["GET", "/api/v1/wrikexpi/v1.0/value/project/R1", "master/read"],
    ["GET", "/api/v1/wrikexpi/amoeba/slug", "amoeba/read"],
    ["POST", "/api/v1/wrikexpi/amoeba/slug/svc", "amoeba/create"],

    // Nested listings are attributed to what they return, so switching
    // "channel read" off closes the campaign path too.
    ["GET", "/api/v1/wrikexpi/campaign/IEAC1/channel", "channel/read"],
    ["GET", "/api/v1/wrikexpi/channel/CH1/task", "task/read"],
    ["GET", "/api/v1/wrikexpi/campaign/IEAC1/task", "task/read"],

    // A campaign whose id reads "task" is still a campaign: the nested rule
    // needs a two-segment tail.
    ["GET", "/api/v1/wrikexpi/campaign/task", "campaign/read"],
    ["GET", "/api/v1/wrikexpi/campaign/channel", "campaign/read"],

    // No /api/v1 prefix (docs/older clients) resolves the same.
    ["GET", "/wrikexpi/campaign/IEAC1", "campaign/read"],
    ["OPTIONS", "/api/v1/wrikexpi/campaign/IEAC1", "campaign/read"],

    // Not governed: the app routes, the public token surface, and MCP, which
    // is gated per tool call instead.
    ["GET", "/api/v1/app-config", "not governed"],
    ["POST", "/api/v1/wrikexpi/token/view-tokens", "not governed"],
    ["POST", "/api/v1/wrikexpi/mcp", "not governed"],
    ["GET", "/api/v1/admin/tokens", "not governed"],
    ["POST", "/api/v1/portal/environments", "not governed"],
    ["TRACE", "/api/v1/wrikexpi/campaign/IEAC1", "not governed"],
  ];

  cases.forEach(([method, url, expected]) => {
    check(`${method} ${url}`, routeOf(method, url), expected);
  });
}

console.log("\nThe decision");
{
  const readOnlyCampaign = entry(
    catalog.normaliseMatrix({ campaign: { read: true } }),
  );
  const nothing = entry(catalog.emptyMatrix());
  const unconfigured = entry(catalog.emptyMatrix(), false);
  const route = (method, url) => map.resolveRoute(method, url);
  const decide = (matrixEntry, method, url) =>
    map.denialFor(matrixEntry, route(method, url));

  // Grandfathering: no rows at all means unrestricted, which is what keeps
  // every token issued before this feature working.
  check(
    "unconfigured token may read",
    decide(unconfigured, "GET", "/api/v1/wrikexpi/campaign/a"),
    null,
  );
  check(
    "unconfigured token may delete",
    decide(unconfigured, "DELETE", "/api/v1/wrikexpi/campaign/a"),
    null,
  );

  check(
    "granted read passes",
    decide(readOnlyCampaign, "GET", "/api/v1/wrikexpi/campaign/a"),
    null,
  );
  check(
    "ungranted update is denied",
    decide(readOnlyCampaign, "PUT", "/api/v1/wrikexpi/campaign/a"),
    "MODULE_FORBIDDEN",
  );
  check(
    "ungranted module is denied",
    decide(readOnlyCampaign, "GET", "/api/v1/wrikexpi/channel/c"),
    "MODULE_FORBIDDEN",
  );
  check(
    "nested read follows the child module",
    decide(readOnlyCampaign, "GET", "/api/v1/wrikexpi/campaign/a/channel"),
    "MODULE_FORBIDDEN",
  );

  check(
    "all-off denies a read",
    decide(nothing, "GET", "/api/v1/wrikexpi/campaign/a"),
    "MODULE_FORBIDDEN",
  );
  check(
    "full matrix allows a delete",
    decide(entry(fullMatrix()), "DELETE", "/api/v1/wrikexpi/campaign/a"),
    null,
  );

  // Nothing to deny against: channel has no create endpoint, so a POST that
  // could not exist is not turned into a permission error.
  check(
    "undeclared action is not denied here",
    decide(nothing, "POST", "/api/v1/wrikexpi/channel/c"),
    null,
  );
  check(
    "ungoverned path is never denied",
    decide(nothing, "GET", "/api/v1/app-config"),
    null,
  );
  check("null route is never denied", map.denialFor(nothing, null), null);
  check(
    "empty entry is treated as unconfigured",
    map.denialFor({}, route("GET", "/api/v1/wrikexpi/campaign/a")),
    null,
  );
  check(
    "unknown module is never denied",
    map.denialFor(entry(fullMatrix()), { module: "nope", action: "read" }),
    null,
  );

  // The MCP proxy row is a normal row: deny it and wrike_* writes stop.
  check(
    "mcp_proxy update is denied by its row",
    map.denialFor(readOnlyCampaign, { module: "mcp_proxy", action: "update" }),
    "MODULE_FORBIDDEN",
  );
  check(
    "mcp_proxy action must exist in the catalogue",
    catalog.MODULE_KEYS.includes(mcp.WRIKE_PROXY_MODULE),
    true,
  );
}

console.log("\nMCP tools → module/action");
{
  const readOnly = { readOnlyHint: true };
  const write = { readOnlyHint: false, destructiveHint: false };
  const destructive = { readOnlyHint: false, destructiveHint: true };

  const routeOfTool = (name, annotations) => {
    const route = mcp.resolveToolRoute(name, annotations);
    return route ? `${route.module}/${route.action}` : "not governed";
  };

  const cases = [
    ["campaign_list", readOnly, "campaign/read"],
    ["campaign_get", readOnly, "campaign/read"],
    ["campaign_create", write, "campaign/create"],
    ["campaign_update", write, "campaign/update"],
    ["campaign_delete", destructive, "campaign/delete"],
    ["channel_update", write, "channel/update"],
    ["task_list_campaign", readOnly, "task/read"],
    ["task_delete", destructive, "task/delete"],
    ["datahub_list_fields", readOnly, "not governed"],
    ["ids_convert", readOnly, "not governed"],
    ["wrike_search_items", readOnly, "mcp_proxy/read"],
    ["wrike_create_task_item", write, "mcp_proxy/create"],
    ["wrike_update_items", write, "mcp_proxy/update"],
    ["wrike_add_attachments_to_item", write, "mcp_proxy/create"],
    // A proxied tool that ships no annotations still gets the right action
    // from its verb, and defaults to read when the verb says nothing.
    ["wrike_update_items", undefined, "mcp_proxy/update"],
    ["wrike_search_items", undefined, "mcp_proxy/read"],
    ["some_future_tool", write, "not governed"],
  ];

  cases.forEach(([name, annotations, expected]) => {
    check(
      `${name}${annotations ? "" : " (no annotations)"}`,
      routeOfTool(name, annotations),
      expected,
    );
  });

  // The mapper's verb list must agree with the confirmation gate's about what
  // counts as a write. Both match the *subject* of a proxied tool — its
  // remote, verb-first name — which is the name the proxy hands to
  // isMutatingTool (src/mcp/wrikeMcpProxy.js) and the name left over after the
  // mapper strips the wrike_ prefix. Native tools are annotation-driven
  // instead, which test/mcpConfirmation.test.js covers by scanning their files
  // for the guards.
  const writeSubjects = [
    "create_task_item",
    "update_items",
    "delete_item",
    "add_attachments_to_item",
  ];
  const readSubjects = ["search_items", "get_users", "get_item_details"];

  writeSubjects.forEach((subject) => {
    check(`${subject} is a write`, isMutatingTool({ name: subject }), true);
    check(
      `${subject} maps to a write action`,
      mcp.resolveToolRoute(`wrike_${subject}`, undefined).action !== "read",
      true,
    );
  });
  readSubjects.forEach((subject) => {
    check(
      `${subject} is not a write`,
      isMutatingTool({ name: subject }),
      false,
    );
    check(
      `${subject} maps to read`,
      mcp.resolveToolRoute(`wrike_${subject}`, undefined).action,
      "read",
    );
  });
}

console.log("\nDenial payload");
{
  const denied = mcp.permissionDenied({
    toolName: "campaign_update",
    module: "campaign",
    action: "update",
    code: "MODULE_FORBIDDEN",
  });
  const text = denied.content[0].text;

  check("marked as an error", denied.isError, true);
  check("names the tool", text.includes('"campaign_update"'), true);
  check("names the module and action", text.includes("update campaign"), true);
  check("carries the reason code", text.includes("MODULE_FORBIDDEN"), true);
  check("says nothing changed", text.includes("nothing was changed"), true);
  check(
    "forbids routing around it",
    text.includes("Do not attempt the same change through a different tool"),
    true,
  );
  check(
    "tells the agent not to ask for approval",
    text.includes("nothing to approve"),
    true,
  );
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);

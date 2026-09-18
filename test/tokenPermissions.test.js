/* Exercises the per-token module permission gate: the catalogue, the REST
   path→module/method→action mapping, the MCP tool-name mapping, and the
   allow/deny decision itself.
   Run from the repo root:  node test/tokenPermissions.test.js

   No database, Redis or Wrike account required. The decisions under test are
   deliberately pure (src/utils/tokenPermissionCatalog.js,
   src/utils/tokenPermissionMap.js, src/mcp/tools/permission.js), which is the
   point of keeping them out of the middleware and the MCP wrapper. Two things
   it asserts about the rest of the code: that the MCP verb list still agrees
   with the confirmation gate about what a write is, and that amoeba really is
   registered for every method its catch-all claims, which is why the map has
   to have an answer for a method it does not know. */

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

/** "module/action" for a request, or "not governed". A governed path whose
    method maps to no action reads as "module/no action": it is checked, and
    refused, rather than waved through. */
const routeOf = (method, url) => {
  const route = map.resolveRoute(method, url);
  if (!route) return "not governed";
  return `${route.module}/${route.action || "no action"}`;
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
    "campaign,channel,task,master,amoeba,mcp_proxy,calendar_sync",
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
  // A calendar reads what it displays and writes nothing back, so the module
  // must not be able to express a write at all.
  check(
    "calendar sync is read only",
    JSON.stringify(
      catalog.MODULES.find((m) => m.key === "calendar_sync").actions,
    ),
    JSON.stringify(["read"]),
  );
  check(
    "campaign supports all four",
    catalog.MODULES.find((m) => m.key === "campaign").actions.length,
    4,
  );

  check(
    "empty matrix keeps every module",
    Object.keys(catalog.emptyMatrix()).length,
    7,
  );
  check(
    "empty matrix is all false",
    Object.values(catalog.emptyMatrix().master).join(","),
    "false,false,false,false",
  );

  // The definition of "everything granted". No mint uses it today: a Calendar
  // Sync token gets the calendar module only (test/calendarSync.test.js), and
  // an ordinary sign-in is left unrestricted rather than written a matrix. It
  // is pinned here because it is the catalogue's answer to the question, and a
  // future mint policy will read it.
  const full = catalog.fullMatrix();
  check("fullMatrix covers every module", Object.keys(full).length, 7);
  check("fullMatrix grants campaign delete", full.campaign.delete, true);
  check("fullMatrix leaves channel create off", full.channel.create, false);
  check("fullMatrix grants the calendar scope", full.calendar_sync.read, true);
  check(
    "fullMatrix declares no action a module lacks",
    Object.keys(full.channel).join(","),
    "read,create,update,delete",
  );

  // Unknown modules and undeclared actions are discarded, never stored. A
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

    // A governed path with a method no action maps to. Not "not governed":
    // it is governed, and the decision refuses it, because there is no switch
    // an admin could have set for TRACE and no cell to read.
    ["TRACE", "/api/v1/wrikexpi/campaign/IEAC1", "campaign/no action"],
    ["TRACE", "/api/v1/wrikexpi/amoeba/slug", "amoeba/no action"],
    ["TRACE", "/api/v1/wrikexpi/amoeba/slug/svc", "amoeba/no action"],
  ];

  cases.forEach(([method, url, expected]) => {
    check(`${method} ${url}`, routeOf(method, url), expected);
  });
}

/* ── The premise of that last rule, from the router ───────────────────────
   amoeba's two paths are registered with fastify.all, and Fastify's all()
   includes TRACE. Without the refusal above, such a request would reach the
   proxy handler and be forwarded upstream, because the gate returns early when
   the map resolves nothing. */

const runRouterChecks = async () => {
  console.log("\nWhat the amoeba route really accepts");

  const Fastify = require("fastify");
  const { amoebaRoute } = require("../src/routes/amoeba");

  const app = Fastify();
  const methods = new Set();

  // `method` arrives as an array for these two, because fastify.all registers
  // one route entry carrying the whole method list, TRACE included.
  app.addHook("onRoute", (registered) => {
    if (!registered.url.includes("amoeba")) return;
    for (const method of [].concat(registered.method)) methods.add(method);
  });

  app.register(amoebaRoute, { prefix: "/wrikexpi/amoeba" });
  await app.ready();

  ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "TRACE"].forEach(
    (method) => {
      check(`amoeba is registered for ${method}`, methods.has(method), true);
    },
  );

  // Everything it accepts has an action except TRACE, which is the whole
  // reason the map refuses rather than ignores a method it does not know.
  const amoebaActions = ["GET", "POST", "PUT", "PATCH", "DELETE"]
    .concat("HEAD", "OPTIONS")
    .map((method) => map.actionForMethod(method));
  check(
    "the seven routable methods it does have actions all map to one",
    amoebaActions.filter(Boolean).length,
    7,
  );
  check("TRACE has none", map.actionForMethod("TRACE"), null);
};

console.log("\nThe decision");
{
  const readOnlyCampaign = entry(
    catalog.normaliseMatrix({ campaign: { read: true } }),
  );
  const everyAmoebaAction = entry(
    catalog.normaliseMatrix({
      amoeba: { read: true, create: true, update: true, delete: true },
    }),
  );
  const nothing = entry(catalog.emptyMatrix());
  const unconfigured = entry(catalog.emptyMatrix(), false);
  const route = (method, url) => map.resolveRoute(method, url);
  const decide = (matrixEntry, method, url) =>
    map.denialFor(matrixEntry, route(method, url));

  // A restricted token, asked for something the matrix has no answer to. Even
  // a token holding every amoeba action is refused: METHOD_NOT_GOVERNABLE is
  // about the request, not about what the token was granted.
  check(
    "TRACE on amoeba is refused, with a token that holds every amoeba action",
    decide(everyAmoebaAction, "TRACE", "/api/v1/wrikexpi/amoeba/slug"),
    "METHOD_NOT_GOVERNABLE",
  );
  check(
    "TRACE on campaign is refused too",
    decide(readOnlyCampaign, "TRACE", "/api/v1/wrikexpi/campaign/IEAC1"),
    "METHOD_NOT_GOVERNABLE",
  );
  // The path still has to be governed: an ungoverned path stays ungoverned
  // whatever the method is.
  check(
    "TRACE on an ungoverned path is still allowed",
    decide(readOnlyCampaign, "TRACE", "/api/v1/admin/tokens"),
    null,
  );
  // And grandfathering wins, as it does everywhere else: a token nobody has
  // restricted is not narrowed by a rule about methods either.
  check(
    "an unrestricted token is not refused over the method",
    decide(unconfigured, "TRACE", "/api/v1/wrikexpi/amoeba/slug"),
    null,
  );

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
    // The two helpers are governed by the MCP row, not exempt from it. Their
    // names carry no verb, so their own read-only annotation decides.
    ["datahub_list_fields", readOnly, "mcp_proxy/read"],
    ["ids_convert", readOnly, "mcp_proxy/read"],
    ["wrike_search_items", readOnly, "mcp_proxy/read"],
    ["wrike_create_task_item", write, "mcp_proxy/create"],
    ["wrike_update_items", write, "mcp_proxy/update"],
    ["wrike_add_attachments_to_item", write, "mcp_proxy/create"],
    // A proxied tool that ships no annotations still gets the right action
    // from its verb, and defaults to read when the verb says nothing.
    ["wrike_update_items", undefined, "mcp_proxy/update"],
    ["wrike_search_items", undefined, "mcp_proxy/read"],
    // Unclassified names fail CLOSED: to the MCP row, not to no row, because
    // an unmapped name that skipped the gate would be allowed for a token
    // restricted to one module's reads. See test/mcpToolPermissions.test.js,
    // which drives the gate itself rather than this table.
    ["some_future_tool", write, "mcp_proxy/update"],
    ["some_future_tool", readOnly, "mcp_proxy/read"],
    ["some_future_delete_thing", destructive, "mcp_proxy/delete"],
  ];

  cases.forEach(([name, annotations, expected]) => {
    check(
      `${name}${annotations ? "" : " (no annotations)"}`,
      routeOfTool(name, annotations),
      expected,
    );
  });

  // The mapper's verb list must agree with the confirmation gate's about what
  // counts as a write. Both match the *subject* of a proxied tool (its
  // remote, verb-first name), which is the name the proxy hands to
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
  // Case-insensitive on purpose: the sentence opens the result, so it is
  // capitalised, and the wording may be re-flowed without the meaning changing.
  check(
    "says nothing changed",
    text.toLowerCase().includes("nothing was changed"),
    true,
  );
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

runRouterChecks().then(() => {
  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
});

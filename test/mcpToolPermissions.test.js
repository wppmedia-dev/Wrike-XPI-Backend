/* Proves the MCP surface really is gated, tool call by tool call, against the
   same per-token matrix the REST gate uses.

   Why this file exists. test/tokenPermissions.test.js checks the *mapping*:
   that campaign_delete wants campaign/delete and wrike_update_items wants
   mcp_proxy/update. A mapping test passes just as happily if nothing ever calls
   the mapper, if the wrapper is installed after the tools register, or if the
   token id handed to it is the wrong one. So this drives the enforcement itself
   (installPermissionGate, src/mcp/index.js) with a stubbed matrix and asserts
   the outcome a caller sees: the tool body runs, or it gets FORBIDDEN.

   The matrix is stubbed on purpose. This is a test of the gate, not of the
   database, and the live-database shape of the other suites would bury the
   question under rows: what matters is that the gate asks, per call, for the
   matrix of the token that authenticated this request, and refuses when the
   answer is no.

   Run from the repo root:  node test/mcpToolPermissions.test.js

   Nothing is written and no network is touched. */

require("@babel/register")({
  presets: [["@babel/preset-env", { targets: { node: "current" } }]],
});
process.on("unhandledRejection", () => {});

const fs = require("fs");
const path = require("path");

const catalogue = require("../src/utils/tokenPermissionCatalog");

/* ── The matrix the gate will read ──────────────────────────────────────────
   Patched before the MCP layer loads, on the very object the gate reads it
   through: src/controllers/index.js re-exports this module, and Babel's
   wildcard interop hands back the module object itself rather than a copy, so
   one assignment is enough.

   Keyed by token id, so a case can also prove *which* token was asked about,
   and by "boom", which throws: a check that cannot be answered must refuse. */

const RESTRICTED = "token-restricted-campaign-read";
const WIDER = "token-campaign-write-and-mcp-read";
const MCP_UPDATE_ONLY = "token-mcp-update-without-delete";
const MCP_FULL = "token-mcp-all-four";
const UNRESTRICTED = "token-never-restricted";
const UNREADABLE = "token-lookup-fails";

const MATRICES = {
  [RESTRICTED]: catalogue.normaliseMatrix({ campaign: { read: true } }),
  [WIDER]: catalogue.normaliseMatrix({
    campaign: { read: true, create: true, update: true, delete: true },
    mcp_proxy: { read: true },
  }),
  [MCP_UPDATE_ONLY]: catalogue.normaliseMatrix({
    mcp_proxy: { read: true, update: true },
  }),
  [MCP_FULL]: catalogue.normaliseMatrix({
    mcp_proxy: { read: true, create: true, update: true, delete: true },
  }),
  [UNRESTRICTED]: catalogue.emptyMatrix(),
};

const asked = [];

const TokenPermissions = require("../src/controllers/tokenPermissions");
TokenPermissions.GetMatrixCached = async (tokenId) => {
  asked.push(tokenId);
  if (!tokenId) {
    // What GetMatrix does with no id, and why the gate is safe with an auth
    // object that never carried one.
    throw { statusCode: 400, message: "Token id must not be empty!" };
  }
  if (tokenId === UNREADABLE) throw new Error("cache and database both down");
  return {
    configured: tokenId !== UNRESTRICTED,
    matrix: MATRICES[tokenId] || catalogue.emptyMatrix(),
  };
};

const { installPermissionGate } = require("../src/mcp/index.js");
const mcp = require("../src/mcp/tools/permission.js");

/* ── The environment layer, stubbed the same way ───────────────────────────
   The gate checks the environment before the token, so this stub is what
   every case below runs through first. ENV_OPEN is the default — the state
   every existing environment is in, because no rows means unrestricted — so
   the token-only cases keep testing the token.

   ENV_RESTRICTED grants campaign read and nothing else, which is what makes it
   useful: it is a ceiling over a token that was never restricted, so anything
   it refuses can only have been refused by this layer. */

const ENV_OPEN = "env-never-restricted";
const ENV_RESTRICTED = "env-campaign-read-only";
const ENV_UNREADABLE = "env-lookup-fails";

const ENVIRONMENT_MATRICES = {
  [ENV_OPEN]: {
    configured: false,
    matrix: catalogue.emptyMatrix(),
  },
  [ENV_RESTRICTED]: {
    configured: true,
    matrix: catalogue.normaliseMatrix({ campaign: { read: true } }),
  },
};

const askedEnvironments = [];

const EnvironmentModulePermissions = require("../src/controllers/environmentModulePermissions");
EnvironmentModulePermissions.GetMatrixCached = async (envId) => {
  askedEnvironments.push(envId);
  if (!envId) {
    // What GetMatrix does with no id, same as the token side.
    throw { statusCode: 400, message: "Environment id must not be empty!" };
  }
  if (envId === ENV_UNREADABLE) throw new Error("cache and database both down");
  return ENVIRONMENT_MATRICES[envId] || ENVIRONMENT_MATRICES[ENV_OPEN];
};

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

const checkTrue = (label, actual) => check(label, !!actual, true);

/* ── A server that only records what it is handed ─────────────────────────── */

const RAN = { content: [{ type: "text", text: "THE TOOL RAN" }] };

/* `envId` defaults to the unrestricted environment, so every case written
   before this layer existed still asks the question it was written to ask. */
const callTool = async (
  tokenId,
  name,
  config = { annotations: {} },
  envId = ENV_OPEN,
) => {
  const handlers = new Map();
  const server = {
    registerTool(toolName, toolConfig, handler) {
      handlers.set(toolName, handler);
      return toolName;
    },
  };

  /* `calls` is what the gate reported about this tool call — the same list the
     activity log annotates its request row from (src/plugins/mcp.js). */
  const calls = [];
  installPermissionGate(server, { tokenId, envId }, (call) => calls.push(call));

  // Through the gate's wrapper, exactly as the tool files do it (they hold the
  // server object createMcpServer passed them).
  server.registerTool(name, config, async () => RAN);

  const result = await handlers.get(name)({}, {});
  return {
    calls,
    ran: result === RAN,
    isError: result?.isError === true,
    text: result?.content?.[0]?.text || "",
  };
};

const checkDenied = async (label, tokenId, name, config, envId) => {
  const result = await callTool(tokenId, name, config, envId);
  check(`${label}: refused`, result.isError, true);
  check(`${label}: handler did not run`, result.ran, false);
};

const checkAllowed = async (label, tokenId, name, config, envId) => {
  const result = await callTool(tokenId, name, config, envId);
  check(`${label}: allowed`, result.ran, true);
};

/* ── The cases ───────────────────────────────────────────────────────────── */

const read = { annotations: { readOnlyHint: true } };
const write = { annotations: { readOnlyHint: false, destructiveHint: false } };
const destructive = {
  annotations: { readOnlyHint: false, destructiveHint: true },
};

const runGateChecks = async () => {
  console.log("\nA token restricted to reading campaigns");
  {
    const t = RESTRICTED;

    await checkAllowed("campaign_list", t, "campaign_list", read);
    await checkAllowed("campaign_get", t, "campaign_get", read);

    await checkDenied("campaign_create", t, "campaign_create", write);
    await checkDenied("campaign_update", t, "campaign_update", write);
    await checkDenied("campaign_delete", t, "campaign_delete", destructive);

    // A different module, no grant at all.
    await checkDenied("channel_get", t, "channel_get", read);
    await checkDenied("task_delete", t, "task_delete", destructive);

    // The proxied Wrike surface is its own row, and the same rule applies to
    // it: no mcp_proxy read means no proxied call, whatever Wrike would allow.
    await checkDenied("wrike_search_items", t, "wrike_search_items", read);
    await checkDenied("wrike_update_items", t, "wrike_update_items", write);
    await checkDenied(
      "wrike_add_attachments_to_item",
      t,
      "wrike_add_attachments_to_item",
      write,
    );

    // …with two named exceptions, both of which read no record.
    // The two helpers whose names carry no verb, datahub_list_fields and
    // ids_convert, are governed too: they used to be exempt, and the cost of
    // that was an admin switching every action off and still finding two
    // working tools. They are reads on the MCP row, so a token with no mcp_proxy
    // read is refused them as well.
    await checkDenied("datahub_list_fields", t, "datahub_list_fields", read);
    await checkDenied("ids_convert", t, "ids_convert", read);
  }

  console.log("\nThe refusal a caller gets");
  {
    const result = await callTool(RESTRICTED, "campaign_delete", destructive);

    checkTrue("it is an error result", result.isError);
    checkTrue("it names the tool", result.text.includes('"campaign_delete"'));
    checkTrue(
      "it names the module and action",
      result.text.includes("delete campaign"),
    );
    checkTrue(
      "it says nothing was changed",
      result.text.includes("Nothing was changed"),
    );
    checkTrue(
      "it forbids routing around it",
      result.text.includes(
        "Do not attempt the same change through a different tool",
      ),
    );
    checkTrue(
      "it is not a preview to approve",
      !result.text.includes("confirm: true"),
    );
  }

  console.log("\nA token granted a module and the proxy row");
  {
    const t = WIDER;

    await checkAllowed("campaign_delete", t, "campaign_delete", destructive);
    await checkAllowed("campaign_create", t, "campaign_create", write);

    // The helpers need the MCP row's read, which this token has: a tool an
    // agent needs is a grant an admin makes, and this is where they make it.
    await checkAllowed("datahub_list_fields", t, "datahub_list_fields", read);
    await checkAllowed("ids_convert", t, "ids_convert", read);

    // Read on the proxy row is not write: the four actions stay separate on
    // the MCP surface exactly as they do over REST.
    await checkAllowed("wrike_search_items", t, "wrike_search_items", read);
    await checkDenied("wrike_update_items", t, "wrike_update_items", write);
    await checkDenied("wrike_delete_item", t, "wrike_delete_item", destructive);
  }

  console.log("\nA tool nobody has classified");
  {
    // Fail closed. An unfamiliar name used to mean "no gate at all", which is
    // the one answer an authorisation check must never give.
    await checkDenied(
      "some_future_tool",
      RESTRICTED,
      "some_future_tool",
      write,
    );
    await checkDenied(
      "some_future_tool (read, on the same restricted token)",
      RESTRICTED,
      "some_future_tool",
      read,
    );
    await checkAllowed(
      "some_future_tool, once the mcp_proxy row is granted",
      WIDER,
      "some_future_tool",
      read,
    );
  }

  console.log("\nAn unclassified name whose verb is not first");
  {
    // The dangerous direction: classifying a delete as an update would let a
    // token holding update delete, which is the one action it was not given.
    await checkAllowed(
      "some_future_update_thing, on a token with update",
      MCP_UPDATE_ONLY,
      "some_future_update_thing",
      write,
    );
    await checkDenied(
      "some_future_delete_thing, on the same token",
      MCP_UPDATE_ONLY,
      "some_future_delete_thing",
      destructive,
    );
    await checkDenied(
      "some_future_remove_thing, on the same token",
      MCP_UPDATE_ONLY,
      "some_future_remove_thing",
      destructive,
    );
    await checkAllowed(
      "some_future_delete_thing, once delete is granted",
      MCP_FULL,
      "some_future_delete_thing",
      destructive,
    );
  }

  console.log("\nA token nobody has restricted");
  {
    const t = UNRESTRICTED;

    await checkAllowed("campaign_delete", t, "campaign_delete", destructive);
    await checkAllowed("wrike_update_items", t, "wrike_update_items", write);
    await checkAllowed("ids_convert", t, "ids_convert", read);
  }

  console.log("\nWhen the matrix cannot be read");
  {
    // Fail closed: a permission check with no answer must not become a grant.
    const result = await callTool(UNREADABLE, "campaign_get", read);
    check("it is refused", result.isError, true);
    checkTrue(
      "with a reason code that says the check failed, not that the rule denied",
      result.text.includes("PERMISSION_CHECK_FAILED"),
    );

    // And with no token id at all, which is what a half-resolved auth object
    // would look like: the controller throws, so the gate refuses.
    const anonymous = await callTool(undefined, "campaign_get", read);
    check(
      "an auth object with no token id is refused",
      anonymous.isError,
      true,
    );
    checkTrue("and the tool did not run", !anonymous.ran);
  }

  console.log("\nThe environment layer, applied before the token's");
  {
    // A ceiling, not an alternative: this environment grants campaign read and
    // nothing else, and the token below was never restricted at all. Anything
    // refused here can only have been refused by the environment.
    const unrestricted = UNRESTRICTED;

    await checkAllowed(
      "campaign_get (the one module the environment grants)",
      unrestricted,
      "campaign_get",
      read,
      ENV_RESTRICTED,
    );
    await checkDenied(
      "campaign_delete in an environment that does not grant it",
      unrestricted,
      "campaign_delete",
      destructive,
      ENV_RESTRICTED,
    );
    await checkDenied(
      "channel_get, a module the environment never granted",
      unrestricted,
      "channel_get",
      read,
      ENV_RESTRICTED,
    );
    await checkDenied(
      "wrike_search_items, so the proxied tools are ceilinged too",
      unrestricted,
      "wrike_search_items",
      read,
      ENV_RESTRICTED,
    );

    const refused = await callTool(
      unrestricted,
      "campaign_delete",
      destructive,
      ENV_RESTRICTED,
    );
    checkTrue(
      "the refusal says the environment layer was the one that denied",
      refused.text.includes("ENVIRONMENT_MODULE_FORBIDDEN"),
    );

    // Short-circuit: the token is not even asked once the environment has said
    // no, which is what "before token level" means at runtime.
    asked.length = 0;
    await callTool(unrestricted, "channel_get", read, ENV_RESTRICTED);
    check("the token matrix is never read", asked.length, 0);

    // Fail closed on this layer too, and before the token is consulted.
    asked.length = 0;
    const unreadable = await callTool(
      unrestricted,
      "campaign_get",
      read,
      ENV_UNREADABLE,
    );
    check("an unreadable environment is refused", unreadable.isError, true);
    checkTrue(
      "as a failed check, not a rule denial",
      unreadable.text.includes("PERMISSION_CHECK_FAILED"),
    );
    check("and the token is never reached", asked.length, 0);
  }

  console.log("\nWhat the gate reports about a call");
  {
    // This is what the activity log writes onto the request's row: which tool,
    // and what was decided about it. It has to be reported for refused calls
    // as well, or a log would only ever show what ran.
    const allowed = await callTool(WIDER, "campaign_get", read);
    check("an allowed call is reported once", allowed.calls.length, 1);
    check("with the tool name", allowed.calls[0].tool, "campaign_get");
    check("its module", allowed.calls[0].module, "campaign");
    check("its action", allowed.calls[0].action, "read");
    check("and the decision", allowed.calls[0].allowed, true);
    check("with no reason code", allowed.calls[0].code, null);

    const refused = await callTool(RESTRICTED, "campaign_delete", destructive);
    check("a refused call is reported too", refused.calls.length, 1);
    check(
      "with the code that refused it",
      refused.calls[0].code,
      "MODULE_FORBIDDEN",
    );
    check("and allowed false", refused.calls[0].allowed, false);
    check("though its handler did not run", refused.ran, false);

    const byEnvironment = await callTool(
      UNRESTRICTED,
      "channel_get",
      read,
      ENV_RESTRICTED,
    );
    check(
      "the environment's refusal is reported as the environment's",
      byEnvironment.calls[0].code,
      "ENVIRONMENT_MODULE_FORBIDDEN",
    );

    const broken = await callTool(UNREADABLE, "campaign_get", read);
    check(
      "a check that could not be answered is reported as such",
      broken.calls[0].code,
      "PERMISSION_CHECK_FAILED",
    );
  }

  console.log("\nIt asks about the token that authenticated the request");
  {
    asked.length = 0;
    askedEnvironments.length = 0;
    await callTool(WIDER, "campaign_get", read);
    check("one lookup per tool call", asked.length, 1);
    check("for that token", asked[0], WIDER);
    check("and one for its environment", askedEnvironments.length, 1);
    check("for that environment", askedEnvironments[0], ENV_OPEN);
  }
};

/* ── Coverage of the tool files themselves ────────────────────────────────
   The scan is what keeps this honest: every native tool a tool file registers
   has to resolve to a module and an action, and nothing is allowed to be
   exempt. A new tool is governed by default, so an exemption would have to be
   argued for here rather than inherited by having an unfamiliar name. */

const runCoverageChecks = () => {
  console.log("\nEvery registered tool resolves to something");

  const dir = path.join(__dirname, "..", "src", "mcp", "tools");
  const files = fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".js") && file !== "permission.js");

  const names = [];
  for (const file of files) {
    const source = fs.readFileSync(path.join(dir, file), "utf8");
    for (const match of source.matchAll(
      /server\.registerTool\(\s*"([^"]+)"/g,
    )) {
      names.push(match[1]);
    }
  }

  checkTrue("the scan found the native tools", names.length >= 16);

  const ungoverned = [];
  for (const name of names) {
    if (mcp.resolveToolRoute(name, undefined)) continue;
    ungoverned.push(name);
  }

  check("nothing is exempt from the matrix", ungoverned.join(","), "");
  check(
    "the two verbless helpers read the MCP row like everything else",
    ["datahub_list_fields", "ids_convert"]
      .map((name) => {
        const route = mcp.resolveToolRoute(name, { readOnlyHint: true });
        return `${route.module}/${route.action}`;
      })
      .join(","),
    "mcp_proxy/read,mcp_proxy/read",
  );

  // Each of the four actions is reachable through the gate for at least one
  // native tool, so no action can be quietly ungated on this surface.
  const actions = new Set(
    names
      .map((name) => mcp.resolveToolRoute(name, undefined)?.action)
      .filter(Boolean),
  );
  check(
    "every action is carried by some native tool",
    ["create", "delete", "read", "update"].every((action) =>
      actions.has(action),
    ),
    true,
  );

  // The proxy row exists in the catalogue: without it every resolution above
  // would be an action the decision function treats as inexpressible.
  checkTrue(
    "the MCP row exists in the catalogue",
    catalogue.MODULE_KEYS.includes(mcp.WRIKE_PROXY_MODULE),
  );
  const proxyModule = catalogue.MODULES.find(
    (mod) => mod.key === mcp.WRIKE_PROXY_MODULE,
  );
  check(
    "and declares all four actions",
    proxyModule?.actions.join(","),
    "read,create,update,delete",
  );
};

const run = async () => {
  await runGateChecks();
  runCoverageChecks();

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
};

run();

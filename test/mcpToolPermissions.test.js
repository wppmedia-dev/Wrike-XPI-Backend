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

const callTool = async (tokenId, name, config = { annotations: {} }) => {
  const handlers = new Map();
  const server = {
    registerTool(toolName, toolConfig, handler) {
      handlers.set(toolName, handler);
      return toolName;
    },
  };

  installPermissionGate(server, { tokenId });

  // Through the gate's wrapper, exactly as the tool files do it (they hold the
  // server object createMcpServer passed them).
  server.registerTool(name, config, async () => RAN);

  const result = await handlers.get(name)({}, {});
  return {
    ran: result === RAN,
    isError: result?.isError === true,
    text: result?.content?.[0]?.text || "",
  };
};

const checkDenied = async (label, tokenId, name, config) => {
  const result = await callTool(tokenId, name, config);
  check(`${label}: refused`, result.isError, true);
  check(`${label}: handler did not run`, result.ran, false);
};

const checkAllowed = async (label, tokenId, name, config) => {
  const result = await callTool(tokenId, name, config);
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
    await checkAllowed("datahub_list_fields", t, "datahub_list_fields", read);
    await checkAllowed("ids_convert", t, "ids_convert", read);
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

  console.log("\nIt asks about the token that authenticated the request");
  {
    asked.length = 0;
    await callTool(WIDER, "campaign_get", read);
    check("one lookup per tool call", asked.length, 1);
    check("for that token", asked[0], WIDER);
  }
};

/* ── Coverage of the tool files themselves ────────────────────────────────
   The scan is the part that keeps the two exceptions honest: every native tool
   a tool file registers has to resolve to a module/action, or be named in
   UNGOVERNED_TOOLS. A new tool is therefore governed by default, and being
   ungoverned has to be written down. */

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

  check(
    "the only ungoverned tools are the two named helpers",
    ungoverned.sort().join(","),
    "datahub_list_fields,ids_convert",
  );
  check(
    "and they are the ones the exemption list holds",
    [...mcp.UNGOVERNED_TOOLS].sort().join(","),
    "datahub_list_fields,ids_convert",
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

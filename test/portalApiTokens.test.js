/* Covers the API Tokens module of the portal permission matrix and the scope
   that decides which tokens a portal user may see.

   Two things are being protected here.

   First, the vocabulary. `api_tokens` is a module whose four actions each map
   to a real portal route (src/routes/portal/apiTokens/index.js), so a missing
   action would be a route nobody can be granted, and an extra one would be a
   tick in the console that means nothing.

   Second, the scope. A portal user's token list is filtered by the same rule as
   their environment list (src/utils/portalScope.js). The dangerous failure is a
   scope that widens when it should be empty: an empty environment list must
   return no tokens, not every token in the table.

   Third, the guards. Every portal token route carries the session check, the
   password-changed check and exactly one permission gate, and every admin
   token route carries the admin check. A route added later without its gate is
   the one mistake nobody notices, because it works for whoever tests it.

   Run from the repo root:  node test/portalApiTokens.test.js

   The first sections need nothing but Node. The live section needs the
   database and skips itself, loudly, without one. Nothing is written. */

require("@babel/register")({
  presets: [["@babel/preset-env", { targets: { node: "current" } }]],
});
process.on("unhandledRejection", () => {});

const Fastify = require("fastify");
const models = require("../models");
const catalogue = require("../src/utils/portalPermissionCatalog");
const scope = require("../src/utils/portalScope");
const Tokens = require("../src/controllers/tokens");
const ActivityLog = require("../src/controllers/activityLog");
const WrikeCredentials = require("../src/controllers/wrikeCredentials");
const portalTokens = require("../src/routes/portal/apiTokens");
const portalActivity = require("../src/routes/portal/activity");
const adminTokens = require("../src/routes/admin/tokens");

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
const section = (title) => console.log(`\n${title}`);

const apiTokens = catalogue.MODULES.find((mod) => mod.key === "api_tokens");

/* ----------------------------------------------------------- vocabulary -- */

section("api_tokens in the portal catalogue");

checkTrue("the module exists", !!apiTokens);
check("it is labelled for the console", apiTokens?.label, "API Tokens");
check(
  "it offers all four actions, one per portal route",
  catalogue.ACTIONS.every((action) => apiTokens?.actions.includes(action)),
  true,
);
check(
  "it declares no action the catalogue does not know",
  apiTokens?.actions.length,
  4,
);
checkTrue(
  "it describes itself, so the matrix does not show an empty row",
  (apiTokens?.description || "").length > 20,
);
checkTrue(
  "it is in the module key list",
  catalogue.MODULE_KEYS.includes("api_tokens"),
);

const empty = catalogue.emptyMatrix();
checkTrue("an empty matrix includes it", "api_tokens" in empty);
check("it starts switched off", empty.api_tokens.read, false);

const normalised = catalogue.normaliseMatrix({
  api_tokens: { read: true, create: true, update: true, delete: true },
  not_a_module: { read: true },
});
check(
  "all four grants survive normalisation",
  normalised.api_tokens.read,
  true,
);
check("create survives", normalised.api_tokens.create, true);
check("update survives", normalised.api_tokens.update, true);
check("delete survives", normalised.api_tokens.delete, true);
checkTrue("an invented module is dropped", !("not_a_module" in normalised));

const partial = catalogue.normaliseMatrix({ api_tokens: { read: true } });
check("an omitted grant is off, not missing", partial.api_tokens.delete, false);

/* ---------------------------------------------------------------- scope -- */

section("environment scope (pure)");

checkTrue(
  "an environment in scope passes",
  scope.isEnvironmentInScope(["a", "b"], "a"),
);
check(
  "an environment outside it fails",
  scope.isEnvironmentInScope(["a"], "b"),
  false,
);
check(
  "no environment at all fails",
  scope.isEnvironmentInScope(["a"], null),
  false,
);
check(
  "undefined environment fails",
  scope.isEnvironmentInScope(["a"], undefined),
  false,
);
check(
  "an empty scope matches nothing",
  scope.isEnvironmentInScope([], "a"),
  false,
);

/* ----------------------------------------------------------------- live -- */

/* ---------------------------------------------------------------- guards -- */

/** Registers a route plugin on a throwaway instance and lists what it added:
    method, url, and how many preHandler guards each route carries. */
const routesOf = async (plugin, prefix) => {
  const app = Fastify();
  const routes = [];

  app.addHook("onRoute", (route) => {
    // HEAD is Fastify's own companion to GET, not a route anyone writes.
    if (route.method === "HEAD") return;
    routes.push({
      key: `${route.method} ${route.url}`,
      guards: (route.preHandler || []).length,
    });
  });

  app.register(plugin, { prefix });
  await app.ready();
  return routes;
};

/** The guarded routes as "METHOD path" strings, for membership checks. */
const keysOf = (routes) => routes.map((route) => route.key).sort();

const runRouteChecks = async () => {
  section("route guards");

  const portal = await routesOf(
    portalTokens.portalApiTokensRoute,
    "/api/v1/portal/api-tokens",
  );
  const portalKeys = keysOf(portal);

  // Every portal token route: session, password-changed, one permission gate.
  check(
    "every portal token route carries three guards",
    portal.filter((route) => route.guards !== 3).length,
    0,
  );
  check(
    "the portal token routes are the ones the module promises",
    portalKeys.join(" | "),
    [
      "DELETE /api/v1/portal/api-tokens/:id",
      // No trailing slash: Fastify strips it, which is exactly why this list is
      // compared against what the router actually registered rather than
      // against the paths as written in the source.
      "GET /api/v1/portal/api-tokens",
      "GET /api/v1/portal/api-tokens/:id/permissions",
      "GET /api/v1/portal/api-tokens/catalog",
      "GET /api/v1/portal/api-tokens/environments",
      "POST /api/v1/portal/api-tokens/connect",
      "PUT /api/v1/portal/api-tokens/:id/permissions",
      "PUT /api/v1/portal/api-tokens/:id/status",
    ]
      .sort()
      .join(" | "),
  );

  const activity = await routesOf(
    portalActivity.portalActivityRoute,
    "/api/v1/portal/activity-logs",
  );
  check(
    "every portal activity route carries three guards",
    activity.filter((route) => route.guards !== 3).length,
    0,
  );

  const admin = await routesOf(
    adminTokens.adminTokensRoute,
    "/api/v1/admin/tokens",
  );
  const adminKeys = keysOf(admin);

  // Admin routes have one guard (verifyAdminJWT): the console has no module
  // matrix of its own, so a second gate would be the wrong shape.
  check(
    "every admin token route carries its admin check",
    admin.filter((route) => route.guards !== 1).length,
    0,
  );
  checkTrue(
    "the admin console can create a token",
    adminKeys.includes("POST /api/v1/admin/tokens/connect"),
  );
  checkTrue(
    "and delete one, which is the deactivate switch-off",
    adminKeys.includes("DELETE /api/v1/admin/tokens/:id"),
  );
};

const runLiveChecks = async () => {
  section("live database");

  await models.sequelize.authenticate();
  // The widening bug: no environments must mean no tokens, not all of them.
  const none = await Tokens.ListForEnvironments([]);
  check("an empty scope returns no tokens", none.length, 0);

  const adminEnvIds = await scope.scopedEnvironmentIdsFor({ role: "admin" });
  const allEnvs = await WrikeCredentials.GetAllForPortal();
  check(
    "an admin-role user is scoped to every environment",
    adminEnvIds.length,
    (allEnvs || []).length,
  );

  const scoped = await Tokens.ListForEnvironments(adminEnvIds);
  const all = await Tokens.ListAll();
  check(
    "the scoped list is the whole list for an admin-role user",
    scoped.length,
    all.length,
  );

  // Every row returned has to belong to an environment that was asked for.
  const outside = scoped.filter((token) => !adminEnvIds.includes(token.env_id));
  check("no row falls outside the requested environments", outside.length, 0);

  // And a narrow scope really is narrow, when there is more than one env.
  if (adminEnvIds.length > 1) {
    const one = await Tokens.ListForEnvironments([adminEnvIds[0]]);
    const leaked = one.filter((token) => token.env_id !== adminEnvIds[0]);
    check("a one-environment scope leaks nothing", leaked.length, 0);
  } else {
    console.log("  skipped: only one environment exists, nothing to narrow to");
  }

  // A real portal user, if there is one, is scoped to their own mappings.
  const portalUser = await models.PortalUsers.findOne({
    where: { is_active: true, role: { [models.Sequelize.Op.ne]: "admin" } },
  });

  if (!portalUser) {
    console.log(
      "  skipped: no non-admin portal user to check the mapping rule against",
    );
    return;
  }

  const owned = await WrikeCredentials.GetByOwnerId(portalUser.id);
  const ownedIds = (owned || []).map((env) => env.id);
  const userEnvIds = await scope.scopedEnvironmentIdsFor({
    id: portalUser.id,
    role: portalUser.role,
  });

  check(
    "a portal user is scoped to their mapped environments",
    userEnvIds.length,
    ownedIds.length,
  );
  checkTrue(
    "and to nothing else",
    userEnvIds.every((id) => ownedIds.includes(id)),
  );

  const visible = await Tokens.ListForEnvironments(userEnvIds);
  check(
    "their token list contains only their environments",
    visible.filter((token) => !userEnvIds.includes(token.env_id)).length,
    0,
  );

  // ── The activity log's token filter ────────────────────────────────────
  // The portal activity route resolves a token outside the caller's
  // environments to the nil UUID (src/routes/portal/activity/index.js), which
  // is only a safe answer if the log treats it as an id that matches nothing.
  // If it were ignored instead, the filter would silently widen to every
  // token; if the sentinel were a readable string rather than a UUID, Postgres
  // would reject the query (22P02) rather than return no rows, which is the bug
  // this pair of assertions is here to keep out.
  const NO_MATCH_UUID = "00000000-0000-0000-0000-000000000000";

  const sentinel = await ActivityLog.List({
    envId: adminEnvIds[0],
    tokenId: NO_MATCH_UUID,
    limit: 5,
  });
  check(
    "the activity log's no-match token sentinel matches nothing",
    sentinel.rows.length,
    0,
  );

  const noEnv = await ActivityLog.List({ envId: NO_MATCH_UUID, limit: 5 });
  check("and so does the environment one", noEnv.rows.length, 0);

  if (all.length) {
    const focused = await ActivityLog.List({
      tokenId: all[0].id,
      limit: 20,
    });
    check(
      "a real token filter returns that token's rows and no others",
      focused.rows.filter((row) => row.token_id !== all[0].id).length,
      0,
    );
  } else {
    console.log("  skipped: no tokens exist, nothing to filter the log by");
  }
};

(async () => {
  try {
    await runRouteChecks();
    await runLiveChecks();
  } catch (err) {
    if (
      err?.name === "SequelizeConnectionError" ||
      err?.original?.code === "ECONNREFUSED"
    ) {
      console.log(`  skipped: database unreachable (${err.message})`);
    } else {
      fail++;
      console.log(`  FAIL  live checks threw: ${err?.message || err}`);
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  console.log("scratch rows left behind: 0 (this test only reads)");
  process.exit(fail ? 1 : 0);
})();

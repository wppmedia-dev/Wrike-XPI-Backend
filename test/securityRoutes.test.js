/* HTTP behaviour of the security hardening, through a real Fastify instance:

     · CORS: console APIs are restricted to known origins; the public API, MCP
       and OAuth keep answering any origin, as before
     · Content-Security-Policy is sent, and allows what the pages load
     · the sync endpoints demand an admin token or the sync key
     · OAuth dynamic registration: stored, expiring, bounded; and revoked /
       expired registrations are refused while every other client still works
     · the admin OAuth-clients API: guarded, validated, wired to the controller

   Run from the repo root:  node test/securityRoutes.test.js
   No database, Redis or Wrike account required: the controller functions the
   routes call are replaced on the very object the routes read them from (the
   same approach as test/calendarSync.test.js). */

require("@babel/register")({
  presets: [["@babel/preset-env", { targets: { node: "current" } }]],
});
process.on("unhandledRejection", () => {});

process.env.JWT_SECRET = "route-test-secret";
process.env.APP_URL = "https://xpi.example.com/console";
process.env.CORS_ALLOWED_ORIGINS = "https://ops.example.com";
delete process.env.OAUTH_ACCEPT_LEGACY_CLIENTS;

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Fastify = require("fastify");
const jsonwebtoken = require("jsonwebtoken");

let pass = 0;
let fail = 0;

const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass++;
    console.log(`  ok    ${label}`);
  } else {
    fail++;
    console.log(
      `  FAIL  ${label}\n          got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`,
    );
  }
};

const section = (title) => console.log(`\n${title}`);
const uuid = () => crypto.randomUUID();

/* The controllers the routes under test call, stubbed where they would reach
   Postgres. Replacing a property on the module object works because the routes
   read it through the same object at call time. */
const oauthClients = require("../src/controllers/oauthClients");
const adminAuth = require("../src/controllers/adminAuth");
adminAuth.GetById = async (id) => ({ id });

const stored = [];
let registerShouldFail = false;
let statusOf = async () => "active";
let revokeCalls = [];
let lastListArgs = null;

const realOAuthClients = { Revoke: oauthClients.Revoke, Disconnect: oauthClients.Disconnect };
// The portal's scoped functions, kept for the tests of the scope itself; the
// route tests below use the recording stubs.
const realScoped = {
  ListScoped: oauthClients.ListScoped,
  DisconnectScoped: oauthClients.DisconnectScoped,
  RevokeScoped: oauthClients.RevokeScoped,
};
let scopedCalls = [];
let scopedError = null;

// Portal sign-in, permission and environment lookups.
const portalAuthCtl = require("../src/controllers/portalAuth");
const portalPermissionsCtl = require("../src/controllers/portalPermissions");
const wrikeCredentialsCtl = require("../src/controllers/wrikeCredentials");
let portalMatrix = {};
let ownedEnvs = [];
portalAuthCtl.GetById = async (id) => ({
  id,
  is_active: true,
  username: "pat",
  role: "user",
  must_change_password: false,
});
portalPermissionsCtl.GetMatrix = async () => portalMatrix;
wrikeCredentialsCtl.GetByOwnerId = async () => ownedEnvs;
wrikeCredentialsCtl.GetAllForPortal = async () => [{ id: "every-env" }];
let disconnectCalls = [];

const mcpTokens = require("../src/controllers/mcpTokens");
let revokedFamilies = [];
let revokedRefresh = [];
mcpTokens.RevokeFamily = async (familyId) => (revokedFamilies.push(familyId), 1);
mcpTokens.RevokeByRefreshToken = async (token) => (revokedRefresh.push(token), 1);

oauthClients.Register = async (row) => {
  if (registerShouldFail) throw new Error("database is down");
  stored.push(row);
  return row;
};
oauthClients.GetStatus = (id) => statusOf(id);
oauthClients.TouchLastUsed = async () => {};
oauthClients.Revoke = async (id, adminId) => {
  revokeCalls.push([id, adminId]);
  if (id === "00000000-0000-4000-8000-000000000404") {
    throw { statusCode: 404, message: "OAuth client not found" };
  }
  return { id, revoked_at: new Date().toISOString() };
};
oauthClients.Disconnect = async (id) => (disconnectCalls.push(id), { id, disconnected: 2 });
oauthClients.ListScoped = async (args) => (
  scopedCalls.push(["list", args]),
  { rows: [], total: 0, limit: 50, offset: 0, counts: { active: 0, revoked: 0, connected: 0, idle: 0, disconnected: 0, registered: 0 } }
);
oauthClients.DisconnectScoped = async (id, envIds) => {
  scopedCalls.push(["disconnect", id, envIds]);
  if (scopedError) throw scopedError;
  return { id, disconnected: 1 };
};
oauthClients.RevokeScoped = async (id, envIds) => {
  scopedCalls.push(["revoke", id, envIds]);
  if (scopedError) throw scopedError;
  return { id, revoked_at: new Date().toISOString(), disconnected: 1 };
};
oauthClients.List = async (args) => {
  lastListArgs = args;
  return { rows: [], total: 0, limit: 50, offset: 0, counts: { active: 0, revoked: 0 } };
};

const adminToken = jsonwebtoken.sign({ sub: uuid(), username: "tester" }, process.env.JWT_SECRET);
const bearer = { authorization: `Bearer ${adminToken}` };

(async () => {
  /* ── CORS ──────────────────────────────────────────────────────────── */

  section("CORS");
  {
    const app = Fastify();
    app.register(require("../src/plugins/cors"));
    for (const url of [
      "/api/v1/admin/tokens",
      "/api/v1/portal/environments",
      "/admin/dashboard",
      "/api/v1/wrikexpi/task",
      "/api/v1/wrikexpi/mcp",
      "/oauth/token",
      "/administrator",
    ]) {
      app.get(url, async () => ({ ok: true }));
    }
    await app.ready();

    const allowOrigin = async (url, origin) => {
      const res = await app.inject({ method: "GET", url, headers: origin ? { origin } : {} });
      return res.headers["access-control-allow-origin"];
    };

    check("public API still answers any origin", await allowOrigin("/api/v1/wrikexpi/task", "https://anywhere.example"), "*");
    check("MCP still answers any origin", await allowOrigin("/api/v1/wrikexpi/mcp", "https://claude.ai"), "*");
    check("OAuth still answers any origin", await allowOrigin("/oauth/token", "https://claude.ai"), "*");
    check("a route that only starts with 'admin' is not a console route", await allowOrigin("/administrator", "https://x.example"), "*");

    check("admin API: a foreign site gets no CORS headers", await allowOrigin("/api/v1/admin/tokens", "https://evil.example"), undefined);
    check("portal API: a foreign site gets no CORS headers", await allowOrigin("/api/v1/portal/environments", "https://evil.example"), undefined);
    check("console pages: a foreign site gets no CORS headers", await allowOrigin("/admin/dashboard", "https://evil.example"), undefined);
    check("admin API: the APP_URL origin is allowed", await allowOrigin("/api/v1/admin/tokens", "https://xpi.example.com"), "https://xpi.example.com");
    check("admin API: a CORS_ALLOWED_ORIGINS entry is allowed", await allowOrigin("/api/v1/admin/tokens", "https://ops.example.com"), "https://ops.example.com");
    check("admin API: no Origin header (same-origin) is unaffected", (await app.inject({ method: "GET", url: "/api/v1/admin/tokens" })).statusCode, 200);

    const preflight = await app.inject({
      method: "OPTIONS",
      url: "/api/v1/admin/tokens",
      headers: { origin: "https://evil.example", "access-control-request-method": "POST" },
    });
    check("a foreign site's preflight to the admin API is not approved", preflight.headers["access-control-allow-origin"], undefined);
    await app.close();
  }

  /* ── CSP ───────────────────────────────────────────────────────────── */

  section("Content-Security-Policy");
  {
    const probe = async (reportOnly) => {
      if (reportOnly) process.env.CSP_REPORT_ONLY = "true";
      else delete process.env.CSP_REPORT_ONLY;
      const app = Fastify();
      app.register(require("../src/plugins/helmet"));
      app.get("/", async () => "ok");
      await app.ready();
      const res = await app.inject({ method: "GET", url: "/" });
      await app.close();
      return res.headers;
    };

    const headers = await probe(false);
    const policy = headers["content-security-policy"] || "";
    check("a policy is sent (it was disabled before)", policy.length > 0, true);
    check("scripts are limited to self + the CDNs the pages use", /script-src 'self' 'unsafe-inline' https:\/\/cdn\.jsdelivr\.net https:\/\/unpkg\.com/.test(policy), true);
    check("inline handlers the server-rendered pages use still work", /script-src-attr 'unsafe-inline'/.test(policy), true);
    check("plugins are blocked", /object-src 'none'/.test(policy), true);
    check("<base> hijacking is blocked", /base-uri 'self'/.test(policy), true);
    check("framing by other sites is blocked", /frame-ancestors 'self'/.test(policy), true);
    check("form-action is left alone (OAuth redirects leave the site)", /form-action/.test(policy), false);
    check("the report-only header is absent when enforcing", headers["content-security-policy-report-only"], undefined);

    const observed = await probe(true);
    check("CSP_REPORT_ONLY=true reports instead of blocking", [
      !!observed["content-security-policy-report-only"],
      observed["content-security-policy"],
    ], [true, undefined]);
    delete process.env.CSP_REPORT_ONLY;
  }

  /* ── Sync endpoints ────────────────────────────────────────────────── */

  section("sync endpoints");
  {
    const { verifyAdminJWT } = require("../src/middlewares/adminAuth");
    const app = Fastify();
    app.get("/sync", { preHandler: [verifyAdminJWT] }, async () => ({ synced: true }));
    await app.ready();

    const call = async (headers) => (await app.inject({ method: "GET", url: "/sync", headers })).statusCode;

    check("anonymous: refused", await call({}), 401);
    check("an admin token is accepted", await call(bearer), 200);
    check("a garbage token is refused", await call({ authorization: "Bearer not-a-token" }), 401);
    check("a token signed with another secret is refused", await call({ authorization: `Bearer ${jsonwebtoken.sign({ sub: uuid() }, "other-secret")}` }), 401);
    check("a non-Bearer scheme is refused", await call({ authorization: `Basic ${adminToken}` }), 401);
    await app.close();

    const source = fs.readFileSync(path.join(__dirname, "..", "src", "index.js"), "utf8");
    check(
      "both sync routes in src/index.js use the guard",
      (source.match(/"\/api\/v1\/sync-(secrets|db-credentials)", syncGuard,/g) || []).length,
      2,
    );
    check("and that guard is the admin token check", /syncGuard = \{ preHandler: \[verifyAdminJWT\] \}/.test(source), true);
  }

  /* ── OAuth registration ────────────────────────────────────────────── */

  section("OAuth registration");
  const app = Fastify();
  app.register(require("@fastify/jwt"), { secret: process.env.JWT_SECRET });
  app.register(require("../src/routes/oauth").oauthRoute, { prefix: "/oauth" });
  app.register(require("../src/routes/admin/oauthClients").adminOAuthClientsRoute, { prefix: "/api/v1/admin/oauth-clients" });
  await app.ready();

  const post = (url, payload, headers = {}) => app.inject({ method: "POST", url, payload, headers });
  const register = (payload) => post("/oauth/register", payload);
  const redirect = "https://claude.ai/api/mcp/auth_callback";

  {
    const res = await register({ redirect_uris: [redirect], client_name: "  Claude  " });
    const body = res.json();
    const claims = app.jwt.decode(body.client_id);
    const days = Math.round((claims.exp - claims.iat) / 86400);

    check("registering still returns 201 and a client_id", [res.statusCode, typeof body.client_id], [201, "string"]);
    check("the response keeps the fields clients already read", [
      body.redirect_uris,
      body.token_endpoint_auth_method,
      body.grant_types,
      body.response_types,
    ], [[redirect], "none", ["authorization_code", "refresh_token"], ["code"]]);
    check("the name is trimmed", body.client_name, "Claude");
    check("the client_id expires in 365 days (it was 10 years)", days, 365);
    check("the registration is stored under the client_id's jti", [stored.length, stored[0].id === claims.jti], [1, true]);
    check("what was stored", [stored[0].client_name, stored[0].redirect_uris], ["Claude", [redirect]]);
    check("the expiry stored matches the client_id", Math.abs(new Date(stored[0].expires_at).getTime() / 1000 - claims.exp) <= 1, true);

    registerShouldFail = true;
    const degraded = await register({ redirect_uris: [redirect] });
    registerShouldFail = false;
    check("a database failure does not block registration", degraded.statusCode, 201);

    check("redirect_uris is still required", (await register({})).statusCode, 400);
    check("an empty list is still refused", (await register({ redirect_uris: [] })).statusCode, 400);
    check("an http (non-loopback) redirect is still refused", (await register({ redirect_uris: ["http://evil.example/cb"] })).statusCode, 400);
    check("a loopback redirect is still accepted", (await register({ redirect_uris: ["http://127.0.0.1:8123/cb"] })).statusCode, 201);
    check("more than 20 redirects are refused", (await register({ redirect_uris: Array.from({ length: 21 }, (_, i) => `https://a.example/${i}`) })).statusCode, 400);
    check("a non-string redirect is refused", (await register({ redirect_uris: [{ not: "a string" }] })).statusCode, 400);
    check("an over-long redirect is refused", (await register({ redirect_uris: [`https://a.example/${"x".repeat(3000)}`] })).statusCode, 400);

    const longName = (await register({ redirect_uris: [redirect], client_name: "n".repeat(500) })).json();
    check("an over-long name is cut to 200", app.jwt.decode(longName.client_id).client_name.length, 200);
  }

  section("OAuth authorize: which client_ids are accepted");
  {
    const authorize = (clientId, redirectUri = redirect) =>
      app.inject({
        method: "GET",
        url: "/oauth/authorize",
        query: {
          response_type: "code",
          client_id: clientId,
          redirect_uri: redirectUri,
          code_challenge: "abc",
          code_challenge_method: "S256",
        },
      });

    const jti = uuid();
    const active = app.jwt.sign({ jti, redirect_uris: [redirect], client_name: "Claude" }, { expiresIn: "1d" });

    statusOf = async () => "active";
    let res = await authorize(active);
    check("an active registration reaches the environment picker", [res.statusCode, /text\/html/.test(res.headers["content-type"])], [200, true]);

    res = await authorize(active, "https://other.example/cb");
    check("a redirect the client did not register is still refused", res.statusCode, 400);

    statusOf = async () => "revoked";
    res = await authorize(active);
    check("a revoked registration is refused", [res.statusCode, res.json().error], [401, "invalid_client"]);

    statusOf = async () => { throw new Error("registry unavailable"); };
    res = await authorize(active);
    check("registry outage: the signed client is still accepted (fails open)", res.statusCode, 200);

    statusOf = async () => "unknown";
    check("a registration whose row is missing still works", (await authorize(active)).statusCode, 200);

    const now = Math.floor(Date.now() / 1000);
    const expired = app.jwt.sign({ jti: uuid(), redirect_uris: [redirect], iat: now - 100, exp: now - 50 });
    statusOf = async () => "active";
    res = await authorize(expired);
    check("an expired registration is refused", [res.statusCode, res.json().error], [401, "invalid_client"]);

    const legacy = app.jwt.sign({ redirect_uris: [redirect], client_name: "Old connector" }, { expiresIn: "3650d" });
    check("a client_id issued before registrations were stored still works", (await authorize(legacy)).statusCode, 200);
    process.env.OAUTH_ACCEPT_LEGACY_CLIENTS = "false";
    res = await authorize(legacy);
    check("...unless OAUTH_ACCEPT_LEGACY_CLIENTS=false", [res.statusCode, res.json().error], [401, "invalid_client"]);
    delete process.env.OAUTH_ACCEPT_LEGACY_CLIENTS;

    res = await authorize("not-a-jwt", "http://localhost:9999/cb");
    check("an unrecognised client_id still falls back to loopback-only", res.statusCode, 200);
    res = await authorize("not-a-jwt", "https://other.example/cb");
    check("...and refuses a non-loopback redirect, as before", res.statusCode, 400);
    res = await app.inject({ method: "GET", url: "/oauth/authorize", query: { redirect_uri: "http://localhost:9/cb" } });
    check("PKCE is still required", res.statusCode, 400);
  }

  /* ── Admin OAuth clients API ───────────────────────────────────────── */

  section("signing out: POST /oauth/revoke");
  {
    const reset = () => ((revokedFamilies = []), (revokedRefresh = []));
    const revoke = (token) =>
      app.inject({
        method: "POST",
        url: "/oauth/revoke",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        payload: `token=${encodeURIComponent(token)}`,
      });
    const quiet = async (fn) => {
      const { log } = console;
      console.log = () => {};
      try { return await fn(); } finally { console.log = log; }
    };
    const familyId = uuid();
    const access = app.jwt.sign({ t: uuid(), d: "ZGVr", f: familyId, s: "mcp" }, { expiresIn: "1h" });

    reset();
    let res = await quiet(() => revoke("a-refresh-token-value"));
    check("a refresh token ends its sign-in", [res.statusCode, revokedRefresh, revokedFamilies], [200, ["a-refresh-token-value"], []]);

    reset();
    res = await quiet(() => revoke(access));
    check("an ACCESS token ends the sign-in too (a client may send either)", [res.statusCode, revokedFamilies, revokedRefresh], [200, [familyId], []]);

    reset();
    const now = Math.floor(Date.now() / 1000);
    const expired = app.jwt.sign({ t: uuid(), d: "ZGVr", f: familyId, s: "mcp", iat: now - 7200, exp: now - 3600 });
    res = await quiet(() => revoke(expired));
    check("an expired access token can still sign out", [res.statusCode, revokedFamilies], [200, [familyId]]);

    reset();
    const rest = app.jwt.sign({ t: uuid(), d: "ZGVr" }, { expiresIn: "1h" });
    res = await quiet(() => revoke(rest));
    check("a REST (non-MCP) token is not an MCP sign-in", [res.statusCode, revokedFamilies], [200, []]);

    reset();
    res = await quiet(() => revoke(jsonwebtoken.sign({ f: familyId, s: "mcp" }, "someone-elses-secret")));
    check("a token signed with another secret revokes nothing", [res.statusCode, revokedFamilies], [200, []]);

    reset();
    res = await quiet(() => app.inject({ method: "POST", url: "/oauth/revoke", payload: {} }));
    check("no token: still 200, nothing revoked", [res.statusCode, revokedFamilies, revokedRefresh], [200, [], []]);

    reset();
    res = await quiet(() => app.inject({ method: "POST", url: "/oauth/revoke", payload: { token: access } }));
    check("a JSON body works as well as a form", [res.statusCode, revokedFamilies], [200, [familyId]]);
  }

  section("admin OAuth clients API");
  {
    const base = "/api/v1/admin/oauth-clients";
    const id = uuid();

    check("listing needs an admin token", (await app.inject({ method: "GET", url: base })).statusCode, 401);
    check("revoking needs an admin token", (await post(`${base}/${id}/revoke`)).statusCode, 401);

    let res = await app.inject({ method: "GET", url: base, headers: bearer });
    check("an admin can list", [res.statusCode, res.json().success], [200, true]);
    check("by default revoked rows are left out", lastListArgs.includeRevoked, false);

    await app.inject({ method: "GET", url: `${base}?include_revoked=true&limit=25&offset=50`, headers: bearer });
    check("filters reach the controller", [lastListArgs.includeRevoked, String(lastListArgs.limit), String(lastListArgs.offset)], [true, "25", "50"]);
    check("an out-of-range limit is a 400", (await app.inject({ method: "GET", url: `${base}?limit=100000`, headers: bearer })).statusCode, 400);

    res = await post(`${base}/not-a-uuid/revoke`, undefined, bearer);
    check("a malformed id is a 400, not a database error", res.statusCode, 400);

    revokeCalls = [];
    res = await post(`${base}/${id}/revoke`, undefined, bearer);
    check("an admin can revoke", [res.statusCode, res.json().success], [200, true]);
    check("the controller is told who revoked", revokeCalls.length === 1 && revokeCalls[0][0] === id && typeof revokeCalls[0][1] === "string", true);

    check("disconnecting needs an admin token", (await post(`${base}/${id}/disconnect`)).statusCode, 401);
    check("a malformed id is a 400 on disconnect too", (await post(`${base}/not-a-uuid/disconnect`, undefined, bearer)).statusCode, 400);
    disconnectCalls = [];
    res = await post(`${base}/${id}/disconnect`, undefined, bearer);
    check("an admin can disconnect a client", [res.statusCode, res.json().success, res.json().data.disconnected, disconnectCalls], [200, true, 2, [id]]);

    res = await post(`${base}/00000000-0000-4000-8000-000000000404/revoke`, undefined, bearer);
    check("revoking an unknown client is a 404", res.statusCode, 404);
  }

  /* ── Activity log: filter by OAuth client ──────────────────────────── */

  section("activity log filtered by OAuth client");
  {
    const { Op } = require("sequelize");
    const models = require("../models");
    const ActivityLog = require("../src/controllers/activityLog");

    let seen = null;
    models.ApiActivityLogs.findAndCountAll = async (args) => ((seen = args), { rows: [], count: 0 });
    models.ApiActivityLogs.findAll = async (args) => ((seen = args), []);
    models.ApiActivityLogs.count = async (args) => ((seen = args), 0);

    const clientId = uuid();
    const tokenId = uuid();
    // The sub-select the client filter adds, as SQL text.
    const sqlOf = (where) =>
      (where[Op.and] || [])
        .map((clause) => clause.token_id && clause.token_id[Op.in] && clause.token_id[Op.in].val)
        .find(Boolean);

    await ActivityLog.List({});
    check("no client filter: the query is unchanged", [seen.where[Op.and], seen.where.token_id], [undefined, undefined]);

    await ActivityLog.List({ oauthClientId: clientId });
    const sql = sqlOf(seen.where);
    check("a client filter goes through that client's sign-ins", /SELECT token_id FROM mcp_token_families WHERE client_id = /.test(sql || ""), true);
    check("and names exactly that client", (sql || "").includes(clientId), true);

    await ActivityLog.List({ oauthClientId: clientId, tokenId, envId: "env-1", agent: "claude" });
    check("it combines with the token and environment filters", [seen.where.token_id, seen.where.env_id], [tokenId, "env-1"]);
    check("and with the agent filter (both kept in the same AND list)", seen.where[Op.and].length >= 2, true);

    await ActivityLog.Summary({ oauthClientId: clientId });
    check("the summary strip counts the same slice", /mcp_token_families/.test(sqlOf(seen.where) || ""), true);
    await ActivityLog.ExportRows({ oauthClientId: clientId });
    check("so does the export", /mcp_token_families/.test(sqlOf(seen.where) || ""), true);

    await ActivityLog.List({ oauthClientId: "x'; DROP TABLE api_activity_logs; --" });
    check(
      "a hostile value is escaped, not spliced in raw",
      (sqlOf(seen.where) || "").includes("DROP TABLE api_activity_logs; --'") && !/= 'x';/.test(sqlOf(seen.where) || ""),
      true,
    );

    // The route lets only a UUID through.
    const activityApp = Fastify();
    activityApp.register(require("../src/routes/admin/activity").adminActivityRoute, { prefix: "/a" });
    await activityApp.ready();
    const bad = await activityApp.inject({ method: "GET", url: "/a?oauth_client_id=not-a-uuid", headers: bearer });
    check("a non-UUID client id is a 400", bad.statusCode, 400);
    await activityApp.close();
  }

  section("revoking or disconnecting a client ends its sign-ins");
  {
    const models = require("../models");
    const clientId = uuid();
    const adminId = uuid();
    const calls = [];
    let failEnding = false;
    mcpTokens.RevokeByClient = async (id, reason) => {
      if (failEnding) throw new Error("column client_id does not exist");
      calls.push([id, reason]);
      return 2;
    };
    const fakeRow = (revokedAt = null) => ({
      revoked_at: revokedAt,
      update: async function (values) { Object.assign(this, values); },
      get: function () { return { id: clientId, revoked_at: this.revoked_at }; },
    });
    const quietly = async (fn) => {
      const { warn } = console;
      console.warn = () => {};
      try { return await fn(); } finally { console.warn = warn; }
    };

    let row = fakeRow();
    models.OAuthClients.findByPk = async () => row;
    let result = await realOAuthClients.Revoke(clientId, adminId);
    check("revoking a client also ends its sign-ins", [result.disconnected, calls], [2, [[clientId, "client_registration_revoked"]]]);
    check("and records who revoked it", [!!row.revoked_at, row.revoked_by], [true, adminId]);

    calls.length = 0;
    row = fakeRow(new Date().toISOString());
    result = await realOAuthClients.Revoke(clientId, adminId);
    check("revoking an already-revoked client does nothing more", [result.disconnected, calls.length], [0, 0]);

    failEnding = true;
    row = fakeRow();
    result = await quietly(() => realOAuthClients.Revoke(clientId, adminId));
    check("if ending the sign-ins fails, the revoke still succeeds", [!!row.revoked_at, result.disconnected], [true, 0]);
    failEnding = false;

    calls.length = 0;
    row = fakeRow();
    result = await realOAuthClients.Disconnect(clientId);
    check("disconnecting ends the sign-ins and keeps the registration", [result, calls, row.revoked_at], [{ id: clientId, disconnected: 2 }, [[clientId, "admin_disconnected"]], null]);

    models.OAuthClients.findByPk = async () => null;
    let thrown = null;
    try { await realOAuthClients.Disconnect(clientId); } catch (err) { thrown = err.statusCode; }
    check("disconnecting an unknown client is a 404", thrown, 404);
    thrown = null;
    try { await realOAuthClients.Disconnect("not-a-uuid"); } catch (err) { thrown = err.statusCode; }
    check("a malformed id is a 400", thrown, 400);
  }

  section("usage stamp on /mcp requests");
  {
    const models = require("../models");
    const realQuery = models.sequelize.query;
    const statements = [];
    let failWith = null;
    models.sequelize.query = async (sql, opts) => {
      statements.push(opts && opts.replacements && opts.replacements.familyId);
      if (failWith) throw failWith;
      return [[], { rowCount: 1 }];
    };
    const quietly = async (fn) => {
      const { warn } = console;
      console.warn = () => {};
      try { return await fn(); } finally { console.warn = warn; }
    };
    const tick = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));

    const a = uuid();
    const b = uuid();
    mcpTokens.TouchFamily(a);
    mcpTokens.TouchFamily(a);
    mcpTokens.TouchFamily(a);
    await tick();
    check("a busy sign-in is written once, not once per request", statements.filter((x) => x === a).length, 1);
    mcpTokens.TouchFamily(b);
    await tick();
    check("a different sign-in is written separately", statements.filter((x) => x === b).length, 1);
    check("no sign-in id: nothing is written", (() => { const n = statements.length; mcpTokens.TouchFamily(null); return statements.length - n; })(), 0);

    failWith = new Error("deadlock detected");
    const c = uuid();
    check("a failing write never throws into the request", await quietly(async () => { mcpTokens.TouchFamily(c); await tick(); return "ok"; }), "ok");
    failWith = null;
    const d = uuid();
    mcpTokens.TouchFamily(d);
    await tick();
    check("an ordinary failure does not switch tracking off", statements.filter((x) => x === d).length, 1);

    failWith = Object.assign(new Error("column does not exist"), { original: { code: "42703" } });
    await quietly(async () => { mcpTokens.TouchFamily(uuid()); await tick(); });
    failWith = null;
    const e = uuid();
    mcpTokens.TouchFamily(e);
    await tick();
    check("a missing column switches tracking off for the process", statements.filter((x) => x === e).length, 0);
    models.sequelize.query = realQuery;
  }

  /* ── Portal: OAuth Clients permissions ─────────────────────────────── */

  section("portal OAuth Clients: who gets through");
  const portalOAuthApp = Fastify();
  portalOAuthApp.register(require("../src/routes/portal/oauthClients").portalOAuthClientsRoute, { prefix: "/p" });
  await portalOAuthApp.ready();
  {
    const portalUserId = uuid();
    const portalToken = (role) => jsonwebtoken.sign({ sub: portalUserId, username: "pat", role }, process.env.JWT_SECRET);
    const asUser = { authorization: `Bearer ${portalToken("user")}` };
    const asPortalAdmin = { authorization: `Bearer ${portalToken("admin")}` };
    const grant = (actions) => {
      portalMatrix = { oauth_clients: { read: false, create: false, update: false, delete: false, ...actions } };
    };
    const get = (headers, url = "/p") => portalOAuthApp.inject({ method: "GET", url, headers });
    const post = (path, headers) => portalOAuthApp.inject({ method: "POST", url: `/p/${path}`, headers });
    const clientId = uuid();
    const env1 = uuid();
    const env2 = uuid();
    ownedEnvs = [{ id: env1 }, { id: env2 }];
    const writes = () => scopedCalls.filter(([kind]) => kind !== "list").length;

    check("no sign-in: 401", (await get({})).statusCode, 401);

    grant({});
    check("signed in but nothing granted: 403", (await get(asUser)).statusCode, 403);

    grant({ read: true });
    scopedCalls = [];
    let res = await get(asUser);
    check("read grant: the list is served", [res.statusCode, res.json().success], [200, true]);
    check("and it is limited to this user's environments", [scopedCalls[0][0], scopedCalls[0][1].envIds], ["list", [env1, env2]]);
    check("revoked rows are left out by default", scopedCalls[0][1].includeRevoked, false);
    check("and the idle threshold is the shared one", scopedCalls[0][1].idleAfterSeconds, 15 * 60);
    await get(asUser, "/p?include_revoked=true");
    check("include_revoked is passed through", scopedCalls[1][1].includeRevoked, true);
    check("a bad limit is a 400", (await get(asUser, "/p?limit=100000")).statusCode, 400);

    check("read-only cannot disconnect (403)", (await post(`${clientId}/disconnect`, asUser)).statusCode, 403);
    check("read-only cannot revoke (403)", (await post(`${clientId}/revoke`, asUser)).statusCode, 403);
    check("and nothing was attempted", writes(), 0);

    grant({ read: true, update: true });
    scopedCalls = [];
    res = await post(`${clientId}/disconnect`, asUser);
    check("update grant: disconnect works", [res.statusCode, res.json().data.disconnected], [200, 1]);
    check("scoped to this user's environments", scopedCalls[0], ["disconnect", clientId, [env1, env2]]);
    check("update does not include revoke (403)", (await post(`${clientId}/revoke`, asUser)).statusCode, 403);

    grant({ read: true, delete: true });
    scopedCalls = [];
    res = await post(`${clientId}/revoke`, asUser);
    check("delete grant: revoke works", [res.statusCode, res.json().success], [200, true]);
    check("scoped to this user's environments", scopedCalls[0], ["revoke", clientId, [env1, env2]]);
    check("delete does not include disconnect (403)", (await post(`${clientId}/disconnect`, asUser)).statusCode, 403);

    grant({ read: true, update: true, delete: true });
    check("a malformed id is a 400 on disconnect", (await post("not-a-uuid/disconnect", asUser)).statusCode, 400);
    check("a malformed id is a 400 on revoke", (await post("not-a-uuid/revoke", asUser)).statusCode, 400);

    scopedError = { statusCode: 404, message: "OAuth client not found" };
    res = await post(`${clientId}/disconnect`, asUser);
    check("a client outside the user's scope is a 404, never a 403", [res.statusCode, res.json().message], [404, "OAuth client not found"]);
    scopedError = { statusCode: 409, message: "This client is also used by other environments, so only an administrator can revoke it." };
    res = await post(`${clientId}/revoke`, asUser);
    check("revoking a shared client is a 409 with a readable reason", [res.statusCode, /administrator/.test(res.json().message)], [409, true]);
    scopedError = null;

    ownedEnvs = [];
    scopedCalls = [];
    await get(asUser);
    check("a user with no environments is passed an empty scope", scopedCalls[0][1].envIds, []);
    ownedEnvs = [{ id: env1 }, { id: env2 }];

    lastListArgs = null;
    scopedCalls = [];
    res = await get(asPortalAdmin);
    check("an admin-role portal user gets the unscoped list", [res.statusCode, !!lastListArgs, scopedCalls.length], [200, true, 0]);
    await portalOAuthApp.close();
  }

  /* ── Portal scope: what the controller restricts ───────────────────── */

  section("portal OAuth Clients: the scope itself");
  {
    const models = require("../models");
    const realQuery = models.sequelize.query;
    const realFindAll = models.OAuthClients.findAll;
    const realFindByPk = models.OAuthClients.findByPk;

    const queries = [];
    let statsRows = [];
    let inScopeRows = [{ ok: 1 }];
    let elsewhereRows = [];
    let statsError = null;
    models.sequelize.query = async (sql, opts) => {
      queries.push({ sql, opts });
      if (sql.includes("GROUP BY f.client_id")) {
        if (statsError) throw statsError;
        return statsRows;
      }
      if (sql.includes("SELECT 1 AS ok")) return inScopeRows;
      if (sql.includes("SELECT 1 AS used")) return elsewhereRows;
      if (sql.includes("UPDATE mcp_token_families f")) return [[], { rowCount: 3 }];
      return [];
    };

    const envA = uuid();
    const envB = uuid();
    const now = Date.now();
    const iso = (msAgo) => new Date(now - msAgo).toISOString();
    const [live, quit, gone, quiet] = [uuid(), uuid(), uuid(), uuid()];
    const client = (id, extra = {}) => ({
      id,
      client_name: `client ${id.slice(0, 4)}`,
      redirect_uris: ["https://claude.ai/cb"],
      created_at: iso(86400000),
      expires_at: null,
      last_used_at: null,
      revoked_at: null,
      ...extra,
    });
    let findAllArgs = null;
    models.OAuthClients.findAll = async (args) => {
      findAllArgs = args;
      return [client(live), client(quit), client(quiet), client(gone, { revoked_at: iso(1000) })];
    };
    statsRows = [
      { client_id: live, total_sessions: 2, live_sessions: 1, last_active_at: iso(60000), live_last_active_at: iso(60000), last_disconnected_at: null },
      { client_id: quit, total_sessions: 1, live_sessions: 0, last_active_at: iso(7200000), live_last_active_at: null, last_disconnected_at: iso(3600000) },
      { client_id: quiet, total_sessions: 1, live_sessions: 1, last_active_at: iso(10800000), live_last_active_at: iso(10800000), last_disconnected_at: null },
      { client_id: gone, total_sessions: 1, live_sessions: 0, last_active_at: iso(9000000), live_last_active_at: null, last_disconnected_at: iso(9000000) },
    ];

    // — listing —
    queries.length = 0;
    let out = await realScoped.ListScoped({ envIds: [], idleAfterSeconds: 900 });
    check("no environments: an empty list and no query at all", [out.rows, out.total, queries.length], [[], 0, 0]);

    out = await realScoped.ListScoped({ envIds: [envA, envB], idleAfterSeconds: 900 });
    const statsQuery = queries.find((q) => q.sql.includes("GROUP BY f.client_id"));
    check("the sign-in counts only cover the user's environments", [/t\.env_id IN \(:envIds\)/.test(statsQuery.sql), statsQuery.opts.replacements.envIds], [true, [envA, envB]]);
    check("the clients asked for are exactly the ones that signed in there", findAllArgs.where.id[models.Sequelize.Op.in].sort(), [live, quit, quiet, gone].sort());
    check("registrant IP, user agent and admin id are not requested", ["created_ip", "user_agent", "revoked_by"].some((f) => findAllArgs.attributes.includes(f)), false);
    check("statuses are worked out from those sign-ins", out.rows.map((r) => r.status), ["connected", "disconnected", "idle"]);
    check("a revoked client is hidden by default", out.rows.some((r) => r.id === gone), false);
    check("the counts cover every visible client", out.counts, { active: 3, revoked: 1, connected: 1, idle: 1, disconnected: 1, registered: 0 });
    check("total and paging", [out.total, out.limit, out.offset], [3, 50, 0]);

    out = await realScoped.ListScoped({ envIds: [envA], includeRevoked: true, limit: 2, offset: 1, idleAfterSeconds: 900 });
    check("include_revoked brings it back, and paging slices the result", [out.total, out.rows.length, out.rows[0].id], [4, 2, quit]);

    statsRows = [];
    findAllArgs = null;
    out = await realScoped.ListScoped({ envIds: [envA] });
    check("no sign-ins in those environments: empty, and clients are not even queried", [out.rows, findAllArgs], [[], null]);

    statsError = new Error('column "client_id" does not exist');
    let failure = null;
    try { await realScoped.ListScoped({ envIds: [envA] }); } catch (err) { failure = err.message; }
    check("if attribution cannot be read it fails, it does NOT show everything", failure, 'column "client_id" does not exist');
    statsError = null;

    // — disconnect —
    let thrown = null;
    const attempt = async (fn) => { thrown = null; try { return await fn(); } catch (err) { thrown = err; return null; } };

    await attempt(() => realScoped.DisconnectScoped("not-a-uuid", [envA]));
    check("disconnect: a malformed id is a 400", thrown && thrown.statusCode, 400);

    queries.length = 0;
    inScopeRows = [];
    await attempt(() => realScoped.DisconnectScoped(live, [envA]));
    check("disconnect: a client with no sign-in here is a 404", thrown && thrown.statusCode, 404);
    check("and nothing was ended", queries.some((q) => q.sql.includes("UPDATE")), false);

    await attempt(() => realScoped.DisconnectScoped(live, []));
    check("disconnect: no environments at all is also a 404", thrown && thrown.statusCode, 404);

    inScopeRows = [{ ok: 1 }];
    queries.length = 0;
    out = await realScoped.DisconnectScoped(live, [envA, envB]);
    const update = queries.find((q) => q.sql.includes("UPDATE mcp_token_families f"));
    check("disconnect: only sign-ins in the user's environments are ended", [/t\.env_id IN \(:envIds\)/.test(update.sql), update.opts.replacements.envIds], [true, [envA, envB]]);
    check("it is recorded as a portal action", update.opts.replacements.reason, "portal_disconnected");
    check("and reports how many ended", out, { id: live, disconnected: 3 });

    // — revoke —
    await attempt(() => realScoped.RevokeScoped("not-a-uuid", [envA]));
    check("revoke: a malformed id is a 400", thrown && thrown.statusCode, 400);

    inScopeRows = [];
    await attempt(() => realScoped.RevokeScoped(live, [envA]));
    check("revoke: a client outside the scope is a 404", thrown && thrown.statusCode, 404);

    inScopeRows = [{ ok: 1 }];
    elsewhereRows = [{ used: 1 }];
    let touched = false;
    models.OAuthClients.findByPk = async () => ((touched = true), null);
    await attempt(() => realScoped.RevokeScoped(live, [envA]));
    check("revoke: a client other environments also use is a 409", thrown && thrown.statusCode, 409);
    check("and it was not revoked", touched, false);
    const probe = queries.filter((q) => q.sql.includes("SELECT 1 AS used")).pop();
    check("the 'used elsewhere' test looks outside the user's environments", /NOT IN \(:envIds\)/.test(probe.sql), true);

    elsewhereRows = [];
    const revokedRow = {
      revoked_at: null,
      update: async function (values) { Object.assign(this, values); },
      get: function () { return { id: live, revoked_at: this.revoked_at }; },
    };
    models.OAuthClients.findByPk = async () => revokedRow;
    out = await realScoped.RevokeScoped(live, [envA]);
    check("revoke: a client only this user's environments used is revoked", [!!revokedRow.revoked_at, out.id], [true, live]);
    check("and no admin id is recorded for a portal user", revokedRow.revoked_by, null);

    models.sequelize.query = realQuery;
    models.OAuthClients.findAll = realFindAll;
    models.OAuthClients.findByPk = realFindByPk;
  }

  /* ── The "Activity log" link needs activity_logs:read ──────────────── */

  section("portal OAuth Clients: the Activity log link needs activity_logs:read");
  {
    const read = (rel) => fs.readFileSync(path.join(__dirname, "..", rel), "utf8").replace(/\r\n/g, "\n");
    const shell = read("frontend/src/pages/PortalHome.tsx");
    const page = read("frontend/src/pages/OAuthClients.tsx");

    // The page: the menu item exists only when a handler is passed.
    check(
      "the page adds the link only when it is given a handler",
      /\.\.\.\(onViewActivity\s*\?\s*\[[\s\S]*?label: "Activity log"/.test(page),
      true,
    );
    // The shell: the handler is passed only with the grant.
    check(
      "the shell passes the handler only with activity_logs:read",
      /onViewActivity=\{canSeeActivity \? openOAuthClientActivityLogs : undefined\}/.test(shell),
      true,
    );
    check(
      "and canSeeActivity is exactly activity_logs:read",
      /const canSeeActivity = can\("activity_logs", "read"\);/.test(shell),
      true,
    );
    check(
      "the Activity Log page bounces a user without the grant",
      /activity: canSeeActivity,/.test(shell),
      true,
    );

    // The server: the activity API refuses without the grant, whatever the filter.
    const activityCtl = require("../src/controllers/activityLog");
    const listCalls = [];
    activityCtl.List = async (args) => (listCalls.push(args), { rows: [], total: 0, limit: 50, offset: 0 });
    activityCtl.Summary = async (args) => (listCalls.push(args), { total: 0, denied: 0, allowed: 0 });

    const activityApp = Fastify();
    activityApp.register(require("../src/routes/portal/activity").portalActivityRoute, { prefix: "/a" });
    await activityApp.ready();

    const userId = uuid();
    const headers = { authorization: `Bearer ${jsonwebtoken.sign({ sub: userId, username: "pat", role: "user" }, process.env.JWT_SECRET)}` };
    const clientId = uuid();
    const env1 = uuid();
    ownedEnvs = [{ id: env1 }];
    const call = (url) => activityApp.inject({ method: "GET", url, headers });

    portalMatrix = { oauth_clients: { read: true, create: false, update: true, delete: true } };
    listCalls.length = 0;
    check("OAuth Clients grants alone do not open the activity list", (await call(`/a?oauth_client_id=${clientId}`)).statusCode, 403);
    check("nor its summary", (await call(`/a/summary?oauth_client_id=${clientId}`)).statusCode, 403);
    check("nor its export", (await call(`/a/export?oauth_client_id=${clientId}`)).statusCode, 403);
    check("and nothing was queried", listCalls.length, 0);

    portalMatrix = { activity_logs: { read: false, create: false, update: false, delete: false } };
    check("an explicit activity_logs:read = false is refused too", (await call(`/a?oauth_client_id=${clientId}`)).statusCode, 403);

    portalMatrix = { activity_logs: { read: true, create: false, update: false, delete: false } };
    const ok = await call(`/a?oauth_client_id=${clientId}`);
    check("with activity_logs:read the filtered list is served", ok.statusCode, 200);
    check(
      "narrowed to the OAuth client, inside the user's own environments",
      [listCalls[0].oauthClientId, listCalls[0].envId],
      [clientId, [env1]],
    );
    check("a malformed client id is a 400", (await call("/a?oauth_client_id=not-a-uuid")).statusCode, 400);
    await activityApp.close();
  }

  /* ── Portal Sync: who gets through ─────────────────────────────────── */

  section("portal Sync: who gets through");
  {
    // syncSources builds an Azure client when it loads; nothing is contacted.
    process.env.AZURE_VAULT_URL = process.env.AZURE_VAULT_URL || "https://example.vault.invalid/";

    const syncRunsCtl = require("../src/controllers/syncRuns");
    const syncSources = require("../src/utils/syncSources");
    const lastRun = { source: "azure_secrets", status: "success", triggered_by: "root-admin", items_requested: 3, items_synced: 3 };
    syncRunsCtl.LatestPerSource = async () => ({ azure_secrets: lastRun });
    const runCalls = [];
    syncSources.runSyncSource = async (key, ctx) => (runCalls.push([key, ctx]), { ...lastRun, status: "success" });

    const syncApp = Fastify();
    syncApp.register(require("../src/routes/portal/sync").portalSyncRoute, { prefix: "/s" });
    await syncApp.ready();

    const headers = { authorization: `Bearer ${jsonwebtoken.sign({ sub: uuid(), username: "pat", role: "user" }, process.env.JWT_SECRET)}` };
    const grant = (actions) => {
      portalMatrix = { sync: { read: false, create: false, update: false, delete: false, ...actions } };
    };
    const get = (h = headers) => syncApp.inject({ method: "GET", url: "/s", headers: h });
    const run = (source = "azure_secrets") => syncApp.inject({ method: "POST", url: `/s/${source}/run`, headers });

    check("no sign-in: 401", (await get({})).statusCode, 401);
    grant({});
    check("signed in, nothing granted: 403", (await get()).statusCode, 403);

    grant({ read: true });
    let res = await get();
    const listed = res.json().data.sources.find((x) => x.key === "azure_secrets");
    check("read grant: the sources are listed with their last run", [res.statusCode, listed.last_run.status], [200, "success"]);
    runCalls.length = 0;
    check("read-only cannot run it (403)", (await run()).statusCode, 403);
    check("and nothing ran", runCalls.length, 0);

    grant({ read: true, update: true });
    res = await run();
    check("update grant: it runs", [res.statusCode, res.json().success, res.json().message], [200, true, "Synced successfully"]);
    check("the right source", runCalls[0][0], "azure_secrets");
    check("stored as a portal run, so the admin console can tell", runCalls[0][1].admin.username, "portal:pat");
    check("an unknown source is a 400", (await run("not-a-source")).statusCode, 400);
    await syncApp.close();
  }

  await app.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

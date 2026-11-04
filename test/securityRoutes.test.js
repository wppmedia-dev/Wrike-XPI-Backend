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

    res = await post(`${base}/00000000-0000-4000-8000-000000000404/revoke`, undefined, bearer);
    check("revoking an unknown client is a 404", res.statusCode, 404);
  }

  await app.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

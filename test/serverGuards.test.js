/* Checks the two things that are supposed to be impossible to forget on a
   server, and proves them mechanically over every admin and portal route
   rather than by reading the files and hoping:

     1. Every route is guarded. A route that reaches a handler without a
        preHandler is one nobody has to be logged in to call, and the ones that
        are supposed to be public are listed here by name, with the reason.

     2. Every payload is validated. A POST, PUT or PATCH that declares no body
        schema accepts whatever it is sent: the handler's own checks are the
        only thing left, and that only holds for the handler somebody remembered
        to write them in. Same for a route addressed by `:id`, which reaches
        Postgres as a UUID cast and turns a typo into a 500 instead of a 400.

   The plugins are discovered by walking src/routes/admin and src/routes/portal,
   so a new route file is covered the day it is added. The allowlists below are
   the complete set of deliberate exceptions; anything else fails this suite.

   Run from the repo root:  node test/serverGuards.test.js
   Needs no database: registering a plugin does not open a connection. */

require("@babel/register")({
  presets: [["@babel/preset-env", { targets: { node: "current" } }]],
});
process.on("unhandledRejection", () => {});

const fs = require("fs");
const path = require("path");
const Fastify = require("fastify");

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

const section = (title) => console.log(`\n${title}`);

/* ── Deliberate exceptions ───────────────────────────────────────────── */

/**
 * Public routes: the whole of the surface an unauthenticated caller may reach,
 * named by the file that declares them so a path like `/login`, which both
 * consoles have, cannot be read as the wrong one.
 *
 * Signing in cannot require being signed in, and TOTP verification is the
 * second half of the same act. Register is the bootstrap route: it only works
 * while no admin exists, and after that it demands ADMIN_SETUP_KEY.
 */
const PUBLIC_ROUTES = [
  { file: "admin/auth/index.js", method: "POST", path: "/register" },
  { file: "admin/auth/index.js", method: "POST", path: "/login" },
  { file: "admin/auth/index.js", method: "POST", path: "/totp/verify" },
  { file: "portal/auth/index.js", method: "POST", path: "/login" },
];

/**
 * Write routes with no payload to validate, so no body schema is honest.
 * Anything not here has to declare one.
 */
const BODYLESS_WRITES = [
  // A session ends by presenting the token being ended, nothing more.
  { file: "admin/auth/index.js", method: "POST", path: "/logout" },
  // Both generate a username and password server-side; the body is empty.
  {
    file: "admin/users/index.js",
    method: "POST",
    path: "/generate-credentials",
  },
  {
    file: "portal/users/index.js",
    method: "POST",
    path: "/generate-credentials",
  },
];

const isListed = (route, list) =>
  list.some(
    (entry) =>
      entry.file === route.file &&
      entry.method === route.method &&
      entry.path === route.path,
  );

/* ── Discovery ───────────────────────────────────────────────────────── */

/** Every index.js under a route tree, skipping the schema folders. */
const routeFilesIn = (dir) => {
  const out = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "schema") continue;
        walk(full);
      } else if (entry.name === "index.js") {
        out.push(full);
      }
    }
  };
  walk(dir);
  return out;
};

/**
 * Every route a plugin registers, as `{ method, path, guards, body, params }`
 * where `path` is relative to the plugin.
 *
 * Each plugin gets its own synthetic prefix, so two modules that both declare
 * a `/login` stay two routes rather than one, and the prefix is stripped again
 * straight away: what is being checked is what each route attached to itself,
 * not where the app happens to mount it.
 */
const routesOf = async (plugin, prefix) => {
  const app = Fastify();
  const routes = [];

  app.addHook("onRoute", (route) => {
    // HEAD is Fastify's own companion to GET, never written by hand.
    if (route.method === "HEAD") return;
    routes.push({
      method: route.method,
      path: route.url.startsWith(prefix)
        ? route.url.slice(prefix.length) || "/"
        : route.url,
      guards: (route.preHandler || []).length,
      body: !!route.schema?.body,
      params: !!route.schema?.params,
    });
  });

  app.register(plugin, { prefix });
  await app.ready();
  return routes;
};

/**
 * Files that register children rather than routes of their own. Their children
 * are walked directly a moment later, and the only routes they declare
 * themselves are the portal's HTML page shells (served to a browser, which
 * then authenticates against the API), so including them would double every
 * child route and add public page routes to a list of API routes.
 */
const AGGREGATORS = ["admin/index.js", "portal/index.js"];

/** The routes of every plugin in both trees, qualified by the file they live in. */
const collectRoutes = async () => {
  const root = path.join(__dirname, "..", "src", "routes");
  const files = [
    ...routeFilesIn(path.join(root, "admin")),
    ...routeFilesIn(path.join(root, "portal")),
  ].filter((file) => {
    const rel = path.relative(root, file).replace(/\\/g, "/");
    return !AGGREGATORS.includes(rel);
  });

  const routes = [];

  for (const file of files) {
    const mod = require(file);
    const rel = path.relative(root, file).replace(/\\/g, "/");

    for (const [name, value] of Object.entries(mod)) {
      if (typeof value !== "function" || !name.endsWith("Route")) continue;

      const prefix = `/probe/${rel.replace(/[^a-z0-9]+/gi, "-")}`;
      for (const route of await routesOf(value, prefix)) {
        routes.push({ ...route, file: rel });
      }
    }
  }

  return routes;
};

const labelOf = (route) => `${route.method} ${route.path} (${route.file})`;

/* ── The checks ──────────────────────────────────────────────────────── */

(async () => {
  const routes = await collectRoutes();

  section("discovery");

  // Printed as well as asserted: the counts are the evidence that the walk
  // found the surface, and the floor is what turns "nothing is wrong" into
  // "nothing is wrong, across 84 routes". It sits below the real number, so
  // adding or removing a route does not make this suite noisy, while a walk
  // that silently finds nothing does.
  const byIdCount = routes.filter((route) => route.path.includes(":id")).length;
  console.log(`        ${routes.length} routes discovered`);
  console.log(`        ${byIdCount} of them addressed by :id`);

  check("every admin and portal route is covered", routes.length > 60, true);
  check(
    "no route appears twice",
    routes.length,
    new Set(
      routes.map((route) => `${route.method} ${route.file} ${route.path}`),
    ).size,
  );

  section("every route is guarded");

  const unguarded = routes.filter((route) => route.guards === 0);
  const unexpectedPublic = unguarded.filter(
    (route) => !isListed(route, PUBLIC_ROUTES),
  );

  for (const route of unexpectedPublic) {
    console.log(`        ${labelOf(route)} has no preHandler`);
  }

  check(
    "nothing is public except the sign-in routes",
    unexpectedPublic.length,
    0,
  );
  check(
    "and every public route is one of them",
    unguarded.length,
    PUBLIC_ROUTES.length,
  );

  const guarded = routes.filter((route) => route.guards > 0);
  check(
    "every guarded route carries at least one guard",
    guarded.every((route) => route.guards >= 1),
    true,
  );

  section("every write payload is validated");

  const writes = routes.filter((route) =>
    ["POST", "PUT", "PATCH"].includes(route.method),
  );
  const unvalidated = writes.filter(
    (route) => !route.body && !isListed(route, BODYLESS_WRITES),
  );

  for (const route of unvalidated) {
    console.log(`        ${labelOf(route)} declares no body schema`);
  }

  check("every POST/PUT/PATCH declares a body schema", unvalidated.length, 0);
  check("and there are writes to check", writes.length > 30, true);
  section("every :id parameter is validated");

  // A route addressed by an id hands that string to Postgres as a UUID cast.
  // Unvalidated, a typo becomes a 500 and the error text is whatever the driver
  // said; validated, it is a 400 before any query runs.
  const unvalidatedParams = routes.filter(
    (route) => route.path.includes(":id") && !route.params,
  );

  for (const route of unvalidatedParams) {
    console.log(`        ${labelOf(route)} declares no params schema`);
  }

  check(
    "every :id route declares a params schema",
    unvalidatedParams.length,
    0,
  );
  check("and there are such routes to check", byIdCount > 20, true);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

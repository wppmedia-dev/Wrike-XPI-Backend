/* Exercises the MCP rate limit through a real Fastify instance and the real
   @fastify/rate-limit plugin, with a stub handler in place of the MCP server.
   Run from the repo root:  node test/mcpRateLimit.test.js
   No database, Redis or Wrike account required. */

require("@babel/register")({
  presets: [["@babel/preset-env", { targets: { node: "current" } }]],
});
process.on("unhandledRejection", () => {});

process.env.MCP_RATE_LIMIT = "3";
process.env.MCP_RATE_LIMIT_TIME = "1 minute";

const Fastify = require("fastify");
const { MCP_RATE_LIMIT, mcpKeyGenerator } = require("../src/utils/mcpRateLimit");

let pass = 0;
let fail = 0;

const check = (label, actual, expected) => {
  if (actual === expected) {
    pass++;
    console.log(`  ok    ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}\n          got ${actual}, expected ${expected}`);
  }
};

(async () => {
  console.log("\nkey generator");
  const keyA = mcpKeyGenerator({ headers: { authorization: "Bearer aaa" }, ip: "1.1.1.1" });
  const keyA2 = mcpKeyGenerator({ headers: { authorization: "Bearer aaa" }, ip: "9.9.9.9" });
  const keyB = mcpKeyGenerator({ headers: { authorization: "Bearer bbb" }, ip: "1.1.1.1" });
  check("same token, same key whatever the IP", keyA, keyA2);
  check("different token, different key", keyA === keyB, false);
  check("the token itself is not in the key", keyA.includes("aaa"), false);
  check(
    "no token falls back to the IP",
    mcpKeyGenerator({ headers: {}, ip: "1.1.1.1" }),
    "mcp:ip:1.1.1.1",
  );
  check(
    "a non-bearer scheme falls back to the IP",
    mcpKeyGenerator({ headers: { authorization: "Basic abc" }, ip: "2.2.2.2" }),
    "mcp:ip:2.2.2.2",
  );

  console.log("\nthe route");
  const app = Fastify();
  // The global limiter is deliberately tighter than the MCP one, so a pass
  // proves the route's own config replaced it rather than stacking on it.
  await app.register(require("@fastify/rate-limit"), {
    max: 1,
    timeWindow: "1 minute",
  });
  app.post("/mcp", { config: { rateLimit: MCP_RATE_LIMIT } }, async () => ({
    ok: true,
  }));
  app.get("/health", async () => ({ ok: true }));
  await app.ready();

  const post = (token, remoteAddress = "10.0.0.1") =>
    app.inject({
      method: "POST",
      url: "/mcp",
      remoteAddress,
      headers: token ? { authorization: `Bearer ${token}` } : {},
      payload: {},
    });

  const codes = [];
  for (let i = 0; i < 4; i++) codes.push((await post("tok-1")).statusCode);
  check("three allowed, then refused", codes.join(","), "200,200,200,429");

  const refused = await post("tok-1");
  const body = refused.json();
  check("refusal is a 429", refused.statusCode, 429);
  check("refusal names the limit", /limited to 3 per 1 minute/.test(body.error_description), true);
  check("refusal carries Retry-After", !!refused.headers["retry-after"], true);

  check(
    "another token on the same IP is unaffected",
    (await post("tok-2")).statusCode,
    200,
  );
  check(
    "the same token from another IP is still refused",
    (await post("tok-1", "10.0.0.2")).statusCode,
    429,
  );

  const anon = [];
  for (let i = 0; i < 4; i++) anon.push((await post(null, "10.0.0.9")).statusCode);
  check("no token is limited by IP", anon.join(","), "200,200,200,429");

  check("other routes keep the global limit", (await app.inject({ method: "GET", url: "/health" })).statusCode, 200);
  check(
    "and it is the tighter global one",
    (await app.inject({ method: "GET", url: "/health" })).statusCode,
    429,
  );

  await app.close();

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

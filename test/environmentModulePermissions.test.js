/* Exercises the two module-level gates in the order they run: the environment a
   token belongs to first, then the token itself.
   Run from the repo root:  node test/environmentModulePermissions.test.js

   No database, Redis or Wrike account required. Both matrices are stubbed on
   the very objects the middleware reads them through (src/controllers/index.js
   re-exports them, and Babel's wildcard interop hands back the module object
   itself), which is the same pattern test/mcpToolPermissions.test.js uses for
   the MCP gate. What is NOT stubbed is the middleware or the decision it makes:
   src/middlewares/modulePermissions.js and `denialFor` are the real ones.

   The questions this file asks, in order:
     1. an environment that refuses is a refusal, with its own code, even for a
        token nobody has restricted;
     2. a token that refuses is a refusal, when the environment allows;
     3. both layers allow -> the request passes;
     4. neither layer can be read -> refuse, and never read as a grant;
     5. nothing is read at all for a path no module governs, or for a request
        that never got through ValidateToken. */

require("@babel/register")({
  presets: [["@babel/preset-env", { targets: { node: "current" } }]],
});
process.on("unhandledRejection", () => {});

const catalogue = require("../src/utils/tokenPermissionCatalog");

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

/* ── The two matrices, stubbed ──────────────────────────────────────────── */

const ENV_RESTRICTED = "env-that-refuses-campaign";
const ENV_OPEN = "env-never-restricted";
const ENV_UNREADABLE = "env-lookup-fails";

const TOKEN_RESTRICTED = "token-campaign-read-only";
const TOKEN_OPEN = "token-never-restricted";
const TOKEN_UNREADABLE = "token-lookup-fails";

const ENVIRONMENTS = {
  [ENV_OPEN]: { configured: false, matrix: catalogue.emptyMatrix() },
  [ENV_RESTRICTED]: {
    configured: true,
    matrix: catalogue.normaliseMatrix({ channel: { read: true } }),
  },
};

const TOKENS = {
  [TOKEN_OPEN]: { configured: false, matrix: catalogue.emptyMatrix() },
  [TOKEN_RESTRICTED]: {
    configured: true,
    matrix: catalogue.normaliseMatrix({ campaign: { read: true } }),
  },
};

const envLookups = [];
const tokenLookups = [];

const EnvironmentModulePermissions = require("../src/controllers/environmentModulePermissions");
EnvironmentModulePermissions.GetMatrixCached = async (envId) => {
  envLookups.push(envId);
  if (envId === ENV_UNREADABLE) throw new Error("cache and database both down");
  return ENVIRONMENTS[envId] || ENVIRONMENTS[ENV_OPEN];
};

const TokenPermissions = require("../src/controllers/tokenPermissions");
TokenPermissions.GetMatrixCached = async (tokenId) => {
  tokenLookups.push(tokenId);
  if (tokenId === TOKEN_UNREADABLE)
    throw new Error("cache and database both down");
  return TOKENS[tokenId] || TOKENS[TOKEN_OPEN];
};

const {
  requireModulePermissions,
} = require("../src/middlewares/modulePermissions");

/* ── A reply that records what it was told ──────────────────────────────── */

const run = async ({
  url = "/api/v1/wrikexpi/campaign/IEAC1",
  method = "GET",
  tokenId = TOKEN_OPEN,
  envId = ENV_OPEN,
} = {}) => {
  const res = { status: null, body: null };
  const reply = {
    code(status) {
      res.status = status;
      return {
        send(body) {
          res.body = body;
          return res.body;
        },
      };
    },
  };

  const req = { tokenId, envId, method, raw: { url } };
  envLookups.length = 0;
  tokenLookups.length = 0;

  await requireModulePermissions(req, reply);

  return { req, res };
};

(async () => {
  section("The environment layer, before the token's");
  {
    // A ceiling, not an alternative: this token was never restricted at all,
    // and the environment does not grant campaign.
    const { req, res } = await run({
      tokenId: TOKEN_OPEN,
      envId: ENV_RESTRICTED,
    });

    check("the request is refused", res.status, 403);
    check(
      "with the environment's own code",
      res.body?.error?.code,
      "ENVIRONMENT_MODULE_FORBIDDEN",
    );
    check("naming the module", res.body?.error?.module, "campaign");
    check("and the action", res.body?.error?.action, "read");
    check(
      "recorded for the activity log",
      req.tokenPermission?.code,
      "ENVIRONMENT_MODULE_FORBIDDEN",
    );
    check("the token matrix is never read", tokenLookups.length, 0);
    check("the environment is read once", envLookups.length, 1);
  }

  {
    // The module the environment does grant: both layers allow.
    const { res } = await run({
      url: "/api/v1/wrikexpi/channel/CH1",
      tokenId: TOKEN_OPEN,
      envId: ENV_RESTRICTED,
    });

    check("granted by the environment passes", res.status, null);
  }

  section("Then the token's");
  {
    const { res } = await run({
      tokenId: TOKEN_RESTRICTED,
      envId: ENV_OPEN,
      method: "GET",
    });

    check("a granted read passes", res.status, null);

    const write = await run({
      tokenId: TOKEN_RESTRICTED,
      envId: ENV_OPEN,
      method: "PUT",
    });

    check("an ungranted write is refused", write.res.status, 403);
    check(
      "with the token's own code",
      write.res.body?.error?.code,
      "MODULE_FORBIDDEN",
    );
    check(
      "and the token layer was the one asked second",
      tokenLookups.length,
      1,
    );
  }

  section("When a layer cannot be read");
  {
    const environment = await run({
      tokenId: TOKEN_OPEN,
      envId: ENV_UNREADABLE,
    });

    check("an unreadable environment is refused", environment.res.status, 403);
    check(
      "as a failed check, not a rule denial",
      environment.res.body?.error?.code,
      "PERMISSION_CHECK_FAILED",
    );
    check("and the token is never reached", tokenLookups.length, 0);

    const token = await run({
      tokenId: TOKEN_UNREADABLE,
      envId: ENV_OPEN,
    });

    check("an unreadable token is refused too", token.res.status, 403);
    check(
      "with the same code",
      token.res.body?.error?.code,
      "PERMISSION_CHECK_FAILED",
    );
  }

  section("What is not asked at all");
  {
    // A path no module governs: the app's own routes, the token surface, MCP
    // (which has its own gate). Nothing to decide against, so nothing is read.
    const ungoverned = await run({ url: "/api/v1/app-config" });

    check("an ungoverned path passes", ungoverned.res.status, null);
    check("without reading an environment", envLookups.length, 0);
    check("or a token", tokenLookups.length, 0);

    // ValidateToken never proved a token, which means it already answered.
    // `null` rather than `undefined`: a default parameter would turn an absent
    // argument back into a token id, which is a trap this case fell into once.
    const unauthenticated = await run({ tokenId: null });

    check(
      "a request with no token passes through",
      unauthenticated.res.status,
      null,
    );
    check(
      "without reading anything",
      envLookups.length + tokenLookups.length,
      0,
    );
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

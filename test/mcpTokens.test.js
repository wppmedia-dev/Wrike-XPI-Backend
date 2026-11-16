/* Exercises the MCP OAuth token rules without a database or a network.
   Run from the repo root:  node test/mcpTokens.test.js

   Four things are asserted:

     1. the lifetime policy: defaults, bounds, and what the admin form may save
     2. the refresh token crypto: only a hash is stored, the DEK comes back out
     3. rotation and reuse detection, against an in-memory stand-in for the
        three tables (the controller's real code, a fake `models`)
     4. which door an access token opens (REST vs MCP) */

require("@babel/register")({
  presets: [["@babel/preset-env", { targets: { node: "current" } }]],
});
process.on("unhandledRejection", () => {});
process.env.JWT_SECRET = "test-secret";

const jwt = require("jsonwebtoken");

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
const section = (name) => console.log(`\n${name}`);

const policy = require("../src/utils/mcpTokenPolicy");
const crypto = require("../src/utils/crypto");

/* ── 1. Policy ──────────────────────────────────────────────────────────── */

section("Lifetime policy");

check("default access is 1 hour", policy.MCP_TOKEN_DEFAULTS.accessTtlSeconds, 3600);
check(
  "default refresh is 7 days",
  policy.MCP_TOKEN_DEFAULTS.refreshTtlSeconds,
  7 * 86400,
);
check(
  "nothing stored resolves to the defaults",
  JSON.stringify(policy.resolveMcpTokenLifetimes({})),
  JSON.stringify(policy.MCP_TOKEN_DEFAULTS),
);
check(
  "a stored value inside bounds is used",
  policy.resolveMcpTokenLifetimes({ accessTtlSeconds: 1800 }).accessTtlSeconds,
  1800,
);
check(
  "a stored value past the maximum falls back",
  policy.resolveMcpTokenLifetimes({ accessTtlSeconds: 10 * 86400 })
    .accessTtlSeconds,
  3600,
);
check(
  "zero falls back rather than minting dead tokens",
  policy.resolveMcpTokenLifetimes({ refreshTtlSeconds: 0 }).refreshTtlSeconds,
  7 * 86400,
);
check(
  "junk falls back",
  policy.resolveMcpTokenLifetimes({ accessTtlSeconds: "soon" })
    .accessTtlSeconds,
  3600,
);

const accepted = policy.validateMcpTokenLifetimes({
  accessTtlSeconds: 900,
  refreshTtlSeconds: 86400,
});
check("a sane submission is accepted", accepted.value?.accessTtlSeconds, 900);
check(
  "an access token under 5 minutes is refused",
  !!policy.validateMcpTokenLifetimes({
    accessTtlSeconds: 60,
    refreshTtlSeconds: 86400,
  }).error,
  true,
);
check(
  "an access token over 24 hours is refused",
  !!policy.validateMcpTokenLifetimes({
    accessTtlSeconds: 90000,
    refreshTtlSeconds: 86400 * 30,
  }).error,
  true,
);
check(
  "a refresh token over 180 days is refused",
  !!policy.validateMcpTokenLifetimes({
    accessTtlSeconds: 3600,
    refreshTtlSeconds: 181 * 86400,
  }).error,
  true,
);
check(
  "a refresh token not longer than the access token is refused",
  !!policy.validateMcpTokenLifetimes({
    accessTtlSeconds: 7200,
    refreshTtlSeconds: 7200,
  }).error,
  true,
);
check(
  "a fraction is refused",
  !!policy.validateMcpTokenLifetimes({
    accessTtlSeconds: 900.5,
    refreshTtlSeconds: 86400,
  }).error,
  true,
);

/* ── 2. Crypto ──────────────────────────────────────────────────────────── */

section("Refresh token crypto");

const rt = crypto.generateRefreshToken();
check("tokens are recognisable", rt.startsWith("xpi_rt_"), true);
check("and unique", rt === crypto.generateRefreshToken(), false);
check("the hash is 64 hex characters", /^[0-9a-f]{64}$/.test(crypto.hashRefreshToken(rt)), true);
check("the hash does not contain the token", crypto.hashRefreshToken(rt).includes(rt), false);

const dek = crypto.generateDEK();
const wrapped = crypto.wrapDekForRefreshToken(dek, rt);
check(
  "the DEK comes back out with the same token",
  crypto.unwrapDekForRefreshToken(wrapped, rt).equals(dek),
  true,
);

let wrongTokenFailed = false;
try {
  crypto.unwrapDekForRefreshToken(wrapped, crypto.generateRefreshToken());
} catch {
  wrongTokenFailed = true;
}
check("a different token cannot unwrap it", wrongTokenFailed, true);
check(
  "the wrapped value does not contain the DEK",
  Buffer.from(wrapped, "base64").includes(dek),
  false,
);

/* ── 3. Rotation against a fake store ───────────────────────────────────── */

section("Rotation and reuse detection");

const models = require("../models");

const store = { families: [], refresh: [], tokenExpiry: {} };
let seq = 0;
const withUpdate = (row) => {
  row.update = async (patch) => Object.assign(row, patch);
  return row;
};

models.sequelize = {
  transaction: async (fn) => fn({ LOCK: { UPDATE: "UPDATE" } }),
};
models.McpTokenFamilies = {
  create: async (data) => {
    const row = withUpdate({ id: `fam-${++seq}`, revoked_at: null, ...data });
    store.families.push(row);
    return row;
  },
  findByPk: async (id) => store.families.find((f) => f.id === id) || null,
  update: async (patch, { where }) => {
    const hit = store.families.filter(
      (f) =>
        (where.id === undefined || f.id === where.id) &&
        (where.token_id === undefined || f.token_id === where.token_id) &&
        f.revoked_at === where.revoked_at,
    );
    hit.forEach((f) => Object.assign(f, patch));
    return [hit.length];
  },
};
models.McpRefreshTokens = {
  create: async (data) => {
    const row = withUpdate({ id: `rt-${++seq}`, used_at: null, ...data });
    store.refresh.push(row);
    return row;
  },
  findOne: async ({ where }) =>
    store.refresh.find((r) => r.token_hash === where.token_hash) || null,
};
models.UserTokens = {
  update: async (patch, { where }) => {
    store.tokenExpiry[where.id] = patch.token_expires_at;
    return [1];
  },
};

const { McpTokens } = require("../src/controllers");

(async () => {
  const lifetime = 7 * 86400;
  const issued = await McpTokens.Issue({
    tokenId: "tok-1",
    dek,
    refreshTtlSeconds: lifetime,
  });

  check("issuing stores one hashed refresh token", store.refresh.length, 1);
  check(
    "the token itself is not what is stored",
    store.refresh[0].token_hash === issued.refreshToken,
    false,
  );
  check(
    "the hash is what is stored",
    store.refresh[0].token_hash,
    crypto.hashRefreshToken(issued.refreshToken),
  );
  check(
    "the token row's expiry is the refresh token's",
    store.tokenExpiry["tok-1"] instanceof Date,
    true,
  );
  check("the family starts active", await McpTokens.IsFamilyActive(issued.familyId), true);

  const second = await McpTokens.Rotate({
    refreshToken: issued.refreshToken,
    refreshTtlSeconds: lifetime,
  });
  check("rotation hands back a different token", second.refreshToken === issued.refreshToken, false);
  check("in the same family", second.familyId, issued.familyId);
  check("with the same DEK", second.dek.equals(dek), true);
  check("the old token is marked used", store.refresh[0].used_at instanceof Date, true);

  /* Presented again straight away: a retry or a parallel request, not theft. */
  const retry = await McpTokens.Rotate({
    refreshToken: issued.refreshToken,
    refreshTtlSeconds: lifetime,
  });
  check("a retry inside the grace window succeeds", !!retry.refreshToken, true);
  check("and does not revoke the family", await McpTokens.IsFamilyActive(issued.familyId), true);

  /* Presented again long after: a stale copy, so someone else may hold it. */
  store.refresh[0].used_at = new Date(Date.now() - 5 * 60 * 1000);
  let replayError = null;
  try {
    await McpTokens.Rotate({
      refreshToken: issued.refreshToken,
      refreshTtlSeconds: lifetime,
    });
  } catch (err) {
    replayError = err;
  }
  check("a replay is refused", replayError?.code, "invalid_grant");
  check(
    "and it revokes the whole family",
    await McpTokens.IsFamilyActive(issued.familyId),
    false,
  );

  let childError = null;
  try {
    await McpTokens.Rotate({
      refreshToken: second.refreshToken,
      refreshTtlSeconds: lifetime,
    });
  } catch (err) {
    childError = err;
  }
  check(
    "so even the newest token no longer works",
    childError?.code,
    "invalid_grant",
  );

  let unknownError = null;
  try {
    await McpTokens.Rotate({
      refreshToken: "xpi_rt_nonsense",
      refreshTtlSeconds: lifetime,
    });
  } catch (err) {
    unknownError = err;
  }
  check("an unknown token is invalid_grant", unknownError?.code, "invalid_grant");
  check(
    "with the same message as a replay",
    unknownError?.message,
    replayError?.message,
  );

  const fresh = await McpTokens.Issue({
    tokenId: "tok-2",
    dek,
    refreshTtlSeconds: lifetime,
  });
  store.refresh.find(
    (r) => r.token_hash === crypto.hashRefreshToken(fresh.refreshToken),
  ).expires_at = new Date(Date.now() - 1000);
  let expiredError = null;
  try {
    await McpTokens.Rotate({
      refreshToken: fresh.refreshToken,
      refreshTtlSeconds: lifetime,
    });
  } catch (err) {
    expiredError = err;
  }
  check("an expired refresh token is refused", expiredError?.code, "invalid_grant");

  const third = await McpTokens.Issue({
    tokenId: "tok-3",
    dek,
    refreshTtlSeconds: lifetime,
  });
  check("admin revoke reports what it switched off", await McpTokens.RevokeByTokenId("tok-3"), 1);
  check("and the family is dead", await McpTokens.IsFamilyActive(third.familyId), false);
  check("revoking twice finds nothing left", await McpTokens.RevokeByTokenId("tok-3"), 0);

  const fourth = await McpTokens.Issue({
    tokenId: "tok-4",
    dek,
    refreshTtlSeconds: lifetime,
  });
  await McpTokens.RevokeByRefreshToken(fourth.refreshToken);
  check(
    "a client sign-out (RFC 7009) revokes the family",
    await McpTokens.IsFamilyActive(fourth.familyId),
    false,
  );
  check(
    "an unknown token at /revoke is not an error",
    await McpTokens.RevokeByRefreshToken("xpi_rt_nonsense"),
    0,
  );
  check("an unknown family is not active", await McpTokens.IsFamilyActive("nope"), false);

  /* ── 4. Which door an access token opens ────────────────────────────── */

  section("Access tokens are scoped to /mcp");

  const authentication = require("../src/middlewares/authentication");
  const { Tokens } = require("../src/controllers");
  Tokens.GetById = async (id) => ({
    id,
    encrypted_access_token: Buffer.from("x").toString("base64"),
    encrypted_refresh_token: Buffer.from("y").toString("base64"),
    env_id: "env-1",
    environment_name: "PROD",
  });
  /* Everything past verifyJWE needs a real Wrike token; what is asked here is
     whether verification lets the token through, so a failure LATER than the
     "Invalid token" gate is the pass signal. */
  const gate = async (token, surface) => {
    try {
      await authentication.ResolveAuthFromJWT(token, { surface });
      return "through";
    } catch (err) {
      return /Invalid token|jwt expired/.test(err?.message || "")
        ? "refused"
        : "through";
    }
  };

  const liveFamily = await McpTokens.Issue({
    tokenId: "tok-5",
    dek,
    refreshTtlSeconds: lifetime,
  });
  const mcpAccess = jwt.sign(
    {
      t: "tok-5",
      d: dek.toString("base64"),
      f: liveFamily.familyId,
      s: "mcp",
    },
    process.env.JWT_SECRET,
    { expiresIn: 3600 },
  );
  const xtendToken = jwt.sign(
    { t: "tok-5", d: dek.toString("base64") },
    process.env.JWT_SECRET,
    { expiresIn: "180d" },
  );

  check("an MCP access token passes at /mcp", await gate(mcpAccess, "mcp"), "through");
  check("an MCP access token is refused on the REST API", await gate(mcpAccess, "rest"), "refused");
  check("the 180-day token is refused at /mcp", await gate(xtendToken, "mcp"), "refused");
  check("the 180-day token still works on the REST API", await gate(xtendToken, "rest"), "through");

  await McpTokens.RevokeByTokenId("tok-5");
  check("a revoked family's access token is refused at once", await gate(mcpAccess, "mcp"), "refused");

  const expired = jwt.sign(
    { t: "tok-5", d: dek.toString("base64"), f: "x", s: "mcp" },
    process.env.JWT_SECRET,
    { expiresIn: -10 },
  );
  check("an expired access token is refused", await gate(expired, "mcp"), "refused");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

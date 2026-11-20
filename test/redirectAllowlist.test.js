/* Exercises the redirect-URI allow list: the matching rules
   (src/utils/redirectMatch.js) and how the sign-in builder uses them
   (src/utils/wrikeRedirect.js).
   Run from the repo root:  node test/redirectAllowlist.test.js
   No database, Redis or Wrike account required. */

require("@babel/register")({
  presets: [["@babel/preset-env", { targets: { node: "current" } }]],
});
const assert = require("assert");
const path = require("path");

let passed = 0;
const ok = (name, fn) => {
  fn();
  passed += 1;
  console.log(`  ok    ${name}`);
};
const okAsync = async (name, fn) => {
  await fn();
  passed += 1;
  console.log(`  ok    ${name}`);
};

/* ── matching ──────────────────────────────────────────────────────────── */

const {
  normaliseRedirectRule,
  redirectMatchesRule,
  redirectAllowed,
} = require("../src/utils/redirectMatch");

console.log("matching");

ok("an origin entry is normalised to its origin", () => {
  assert.strictEqual(
    normaliseRedirectRule("HTTPS://App.Example.com/"),
    "https://app.example.com",
  );
  assert.strictEqual(
    normaliseRedirectRule("https://app.example.com/auth/"),
    "https://app.example.com/auth",
  );
});

ok("bad entries are refused with a 400", () => {
  for (const bad of [
    "",
    "app.example.com",
    "http://app.example.com",
    "javascript:alert(1)",
    "ftp://app.example.com",
    "https://user:pw@app.example.com",
    "https://app.example.com/?a=1",
    "https://app.example.com/#frag",
    "https://app.example.com\\@evil.com",
  ]) {
    assert.throws(
      () => normaliseRedirectRule(bad),
      (e) => e.statusCode === 400,
      bad,
    );
  }
});

ok("plain http is allowed for loopback only", () => {
  assert.strictEqual(
    normaliseRedirectRule("http://localhost:3000"),
    "http://localhost:3000",
  );
  assert.strictEqual(
    normaliseRedirectRule("http://127.0.0.1:8080"),
    "http://127.0.0.1:8080",
  );
});

const RULES = ["https://app.example.com", "https://docs.example.com/auth"];

ok("the exact origin matches, on any path", () => {
  assert.ok(redirectAllowed(RULES, "https://app.example.com/anything?x=1"));
  assert.ok(redirectAllowed(RULES, "https://app.example.com"));
});

ok("a path entry matches its path and below, not a sibling", () => {
  assert.ok(redirectAllowed(RULES, "https://docs.example.com/auth"));
  assert.ok(redirectAllowed(RULES, "https://docs.example.com/auth/done"));
  assert.ok(!redirectAllowed(RULES, "https://docs.example.com/authx"));
  assert.ok(!redirectAllowed(RULES, "https://docs.example.com/"));
});

ok("look-alike and attacker hosts do not match", () => {
  for (const bad of [
    "https://evil.com",
    "https://app.example.com.evil.com",
    "https://evilapp.example.com",
    "https://sub.app.example.com",
    "https://app.example.com@evil.com",
    "https://evil.com\\@app.example.com",
    "https://evil.com/https://app.example.com",
    "//evil.com",
    "javascript:alert(1)",
    "data:text/html,x",
  ]) {
    assert.ok(!redirectAllowed(RULES, bad), bad);
  }
});

ok("scheme and port must match exactly", () => {
  assert.ok(!redirectAllowed(RULES, "http://app.example.com"));
  assert.ok(!redirectAllowed(RULES, "https://app.example.com:8443"));
});

ok("credentials and a fragment in the candidate are refused", () => {
  assert.ok(!redirectAllowed(RULES, "https://u:p@app.example.com/"));
  assert.ok(!redirectAllowed(RULES, "https://app.example.com/#x"));
});

ok("no entries means nothing matches", () => {
  assert.ok(!redirectAllowed([], "https://app.example.com"));
  assert.ok(!redirectAllowed(undefined, "https://app.example.com"));
});

ok("a stored value that is not canonical is never trusted", () => {
  assert.ok(!redirectMatchesRule("not a url", "https://app.example.com"));
});

/* ── the sign-in builder ───────────────────────────────────────────────── */

const ENV_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_ENV = "22222222-2222-2222-2222-222222222222";

process.env.WRIKE_LOGIN_ENDPOINT = "https://www.wrike.com/oauth2";
process.env.WRIKE_REDIRECT_URL = "http://localhost:3000/callback";

const credsPath = require.resolve("../src/utils/wrikeCredentials");
require.cache[credsPath] = {
  id: credsPath,
  filename: credsPath,
  loaded: true,
  exports: {
    getCachedWrikeCredentials: () => ({
      PROD: { id: ENV_ID, clientId: "cid", accountId: null },
      OTHER: { id: OTHER_ENV, clientId: "cid2", accountId: null },
    }),
  },
};

/* The list itself is the database's; stand in for the one thing the gate
   reads, keyed by environment, so a rule on one environment can be shown not
   to help another. */
const listsByEnv = { [ENV_ID]: ["https://app.example.com"], [OTHER_ENV]: [] };
const allowlistPath = require.resolve("../src/utils/redirectAllowlist");
const { redirectAllowed: realMatch } = require("../src/utils/redirectMatch");
require.cache[allowlistPath] = {
  id: allowlistPath,
  filename: allowlistPath,
  loaded: true,
  exports: {
    assertRedirectUriAllowed: async (envId, uri) => {
      if (!realMatch(listsByEnv[envId], uri)) {
        throw Object.assign(new Error("The redirectUri is not allowed."), {
          statusCode: 400,
        });
      }
    },
  },
};

const { findRedirectionURL } = require("../src/utils/wrikeRedirect");
const fakeFastify = { jwt: { sign: (payload) => JSON.stringify(payload) } };
const stateOf = (res) =>
  JSON.parse(new URL(res.redirectUrl).searchParams.get("state"));

(async () => {
  console.log("sign-in builder");

  await okAsync("a listed redirectUri is signed into the state", async () => {
    const res = await findRedirectionURL(
      { environmentId: ENV_ID, redirectUri: "https://app.example.com/back" },
      fakeFastify,
    );
    assert.strictEqual(stateOf(res).redirectUri, "https://app.example.com/back");
  });

  await okAsync("an unlisted redirectUri is a 400 and signs nothing", async () => {
    await assert.rejects(
      findRedirectionURL(
        { environmentId: ENV_ID, redirectUri: "https://evil.com/steal" },
        fakeFastify,
      ),
      (e) => e.statusCode === 400,
    );
  });

  await okAsync("an entry on one environment does not serve another", async () => {
    await assert.rejects(
      findRedirectionURL(
        { environmentId: OTHER_ENV, redirectUri: "https://app.example.com/back" },
        fakeFastify,
      ),
      (e) => e.statusCode === 400,
    );
  });

  await okAsync("a sign-in with no redirectUri is untouched", async () => {
    const res = await findRedirectionURL({ environmentId: OTHER_ENV }, fakeFastify);
    assert.ok(!("redirectUri" in stateOf(res)));
  });

  await okAsync("`extra` from a request cannot override the checked redirectUri", async () => {
    const res = await findRedirectionURL(
      {
        environmentId: ENV_ID,
        redirectUri: "https://app.example.com/back",
        extra: { redirectUri: "https://evil.com", code_challenge: "x" },
      },
      fakeFastify,
    );
    const state = stateOf(res);
    assert.strictEqual(state.redirectUri, "https://app.example.com/back");
    assert.ok(!("code_challenge" in state));
  });

  await okAsync("a trusted caller (MCP OAuth) keeps its own extra and skips the list", async () => {
    const res = await findRedirectionURL(
      {
        environmentId: OTHER_ENV,
        redirectUri: "http://127.0.0.1:5555/cb",
        extra: { code_challenge: "abc", client_state: "s" },
      },
      fakeFastify,
      { trusted: true },
    );
    const state = stateOf(res);
    assert.strictEqual(state.redirectUri, "http://127.0.0.1:5555/cb");
    assert.strictEqual(state.code_challenge, "abc");
  });

  console.log(`\n${passed} passed, 0 failed`);
})().catch((err) => {
  console.error("FAIL", err);
  process.exit(1);
});

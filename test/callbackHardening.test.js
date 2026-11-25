/* Sign-in state expiry and HTML escaping on the token callback.
   Run from the repo root:  node test/callbackHardening.test.js */
require("@babel/register")({
  presets: [["@babel/preset-env", { targets: { node: "current" } }]],
});
const assert = require("assert");
const path = require("path");

process.env.WRIKE_LOGIN_ENDPOINT = "https://www.wrike.com/oauth2";
process.env.WRIKE_REDIRECT_URL = "http://localhost:3000/callback";

const credsPath = require.resolve("../src/utils/wrikeCredentials");
require.cache[credsPath] = {
  id: credsPath, filename: credsPath, loaded: true,
  exports: { getCachedWrikeCredentials: () => ({ PROD: { id: "e1", clientId: "c", accountId: null } }) },
};

const { escapeHtml } = require("../src/utils/escapeHtml");
const { findRedirectionURL, STATE_TTL } = require("../src/utils/wrikeRedirect");

let passed = 0;
const ok = async (name, fn) => { await fn(); passed += 1; console.log(`  ok    ${name}`); };

(async () => {
  await ok("the state is signed with an expiry", async () => {
    let options;
    await findRedirectionURL(
      { environment: "PROD" },
      { jwt: { sign: (p, o) => ((options = o), "x") } },
    );
    assert.deepStrictEqual(options, { expiresIn: STATE_TTL });
    assert.strictEqual(STATE_TTL, "10m");
  });

  await ok("the expiry is on the redirectUri variant too", async () => {
    let options, payload;
    await findRedirectionURL(
      { environment: "PROD", redirectUri: "x" },
      { jwt: { sign: (p, o) => ((payload = p), (options = o), "x") } },
      { trusted: true },
    );
    assert.strictEqual(payload.redirectUri, "x");
    assert.ok(options.expiresIn);
  });

  await ok("markup in a value is shown as text", async () => {
    assert.strictEqual(
      escapeHtml(`<img src=x onerror="alert(1)">'&\``),
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&#39;&amp;&#96;",
    );
    assert.strictEqual(escapeHtml(null), "");
    assert.strictEqual(escapeHtml(undefined), "");
  });

  console.log(`\n${passed} passed, 0 failed`);
})().catch((e) => { console.error("FAIL", e); process.exit(1); });

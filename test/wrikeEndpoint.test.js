/* Exercises the per-environment Wrike host resolver (src/utils/wrikeEndpoint.js).
   Run from the repo root:  node test/wrikeEndpoint.test.js
   No database, Redis or Wrike account required. */

require("@babel/register")({
  presets: [["@babel/preset-env", { targets: { node: "current" } }]],
});
const assert = require("assert");
const path = require("path");

// Stand in for the credentials cache so no database is needed.
const credentialsPath = require.resolve(
  path.join(__dirname, "../src/utils/wrikeCredentials"),
);
require.cache[credentialsPath] = {
  id: credentialsPath,
  filename: credentialsPath,
  loaded: true,
  exports: {
    getCachedWrikeCredentials: (name) =>
      name === "us" ? { wrikeApiHost: "https://app-us.wrike.com" } : null,
  },
};

process.env.WRIKE_ENDPOINT = "https://app-eu.wrike.com/api/v4";
process.env.WRIKE_DATAHUB_ENDPOINT =
  "https://app-eu.wrike.com/app/wrike_v2_web/public/api/v1";

const {
  normalizeWrikeApiHost,
  getWrikeEndpoints,
  runWithWrikeEnvironment,
} = require("../src/utils/wrikeEndpoint");

(async () => {
  // normalizeWrikeApiHost
  assert.strictEqual(normalizeWrikeApiHost(""), null);
  assert.strictEqual(normalizeWrikeApiHost("   "), null);
  assert.strictEqual(normalizeWrikeApiHost(undefined), null);
  assert.strictEqual(
    normalizeWrikeApiHost(" https://app-us.wrike.com/api/v4 "),
    "https://app-us.wrike.com",
  );
  for (const bad of [
    "http://app-us.wrike.com",
    "https://evil.example.com",
    "https://wrike.com.evil.com",
    "https://app-us.wrike.com:8443",
    "not a url",
  ]) {
    assert.throws(() => normalizeWrikeApiHost(bad), `should reject ${bad}`);
  }

  // getWrikeEndpoints
  assert.deepStrictEqual(getWrikeEndpoints("us"), {
    api: "https://app-us.wrike.com/api/v4",
    datahub: "https://app-us.wrike.com/app/wrike_v2_web/public/api/v1",
  });
  assert.strictEqual(getWrikeEndpoints("other").api, process.env.WRIKE_ENDPOINT);
  assert.strictEqual(
    getWrikeEndpoints().datahub,
    process.env.WRIKE_DATAHUB_ENDPOINT,
  );

  // Request context survives awaits and does not leak outside the run.
  const inside = await runWithWrikeEnvironment("us", async () => {
    await Promise.resolve();
    return getWrikeEndpoints().api;
  });
  assert.strictEqual(inside, "https://app-us.wrike.com/api/v4");
  assert.strictEqual(getWrikeEndpoints().api, process.env.WRIKE_ENDPOINT);

  console.log("wrikeEndpoint: all assertions passed");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

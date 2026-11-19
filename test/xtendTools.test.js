/* Exercises the xtend_* MCP tool switch (src/utils/xtendTools.js).
   Run from the repo root:  node test/xtendTools.test.js
   No database, Redis or Wrike account required. */

require("@babel/register")({
  presets: [["@babel/preset-env", { targets: { node: "current" } }]],
});
const assert = require("assert");
const {
  xtendToolsActive,
  missingXtendDatahubIds,
  XTEND_REQUIRED_DATAHUB_IDS,
} = require("../src/utils/xtendTools");

const filled = {
  xtendToolsEnabled: true,
  xpiEntityDatahubId: "e",
  xpiFieldMappingDatahubId: "f",
  xpiRequestFormFieldMappingDatahubId: "rff",
  xpiRequestFormMappingDatahubId: "rfm",
  xpiSpaceNameDatahubId: "s",
  campaignSpaceId: "c",
  // Amoeba IDs are deliberately blank: no xtend_* tool reads them.
  xpiApiModulesDatahubId: null,
  xpiApiServicesDatahubId: null,
};

// On + all six IDs filled = active, whatever the Amoeba IDs hold.
assert.strictEqual(xtendToolsActive(filled), true);

// Switch off wins even with every ID filled.
assert.strictEqual(
  xtendToolsActive({ ...filled, xtendToolsEnabled: false }),
  false,
);

// Switch on but any one required ID (incl. campaignSpaceId) blank = off. Whitespace counts as blank.
for (const key of XTEND_REQUIRED_DATAHUB_IDS) {
  for (const blank of [null, undefined, "", "   "]) {
    const cred = { ...filled, [key]: blank };
    assert.strictEqual(xtendToolsActive(cred), false, `${key}=${blank}`);
    assert.deepStrictEqual(missingXtendDatahubIds(cred), [key]);
  }
}

// Unknown environment (nothing in the cache) fails closed.
assert.strictEqual(xtendToolsActive(null), false);
assert.strictEqual(xtendToolsActive(undefined), false);

console.log("xtendTools: all assertions passed");

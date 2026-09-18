/* Covers the Environments table's search: the rule that decides which
   environments match, the route's declaration of the parameter, and the
   handler that has to apply it.

   Why this file exists. The search used to run in the browser over the rows it
   had already downloaded, and the environment id was not in any column's
   accessor, so pasting an id into the box found nothing at all — the one thing
   an admin arrives with. The matching is now a query parameter and a decision
   on the server, which means two mistakes are possible and both are worth a
   test: a search that matches nothing quietly returning the whole list (the
   filter that "does not filter"), and an id matched by substring, so a request
   for one environment comes back with the ones that merely share a fragment.

   The handler is driven with a stubbed credentials controller rather than a
   database: the question is whether the route's search reaches the response,
   not what Postgres does with it.

   Run from the repo root:  node test/environmentSearch.test.js

   Nothing is written and no database is touched. */

require("@babel/register")({
  presets: [["@babel/preset-env", { targets: { node: "current" } }]],
});
process.on("unhandledRejection", () => {});

const envFilters = require("../src/utils/environmentFilters");
const {
  GetAllSchema,
} = require("../src/routes/admin/credentials/schema/getAll");

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

const checkTrue = (label, actual) => check(label, !!actual, true);

const section = (title) => console.log(`\n${title}`);

/* ── Rows ────────────────────────────────────────────────────────────────
   Shaped like the handler's output: the credential row plus the decrypted
   Wrike values. `client_id` is plaintext here because that is what the handler
   hands to the filter — the column itself is ciphertext at rest. */

const rows = [
  {
    id: "8f14e45f-ceea-467f-b4c0-2f7a1d9e5b31",
    environment_name: "PROD",
    client_id: "abc123clientid",
    account_id: "IEAC123",
  },
  {
    id: "11111111-2222-4333-8444-555555555555",
    environment_name: "STAGING",
    client_id: "zzz999clientid",
    account_id: "IEAC999",
  },
  {
    // No Wrike values yet: an environment that exists but has never been
    // connected, which is the row most likely to be found by name only.
    id: "9a115815-4dfa-4959-b8a5-2c1f0e7d3344",
    environment_name: "SANDBOX",
    client_id: null,
    account_id: null,
  },
];

const matchedIds = (search) =>
  envFilters.applyEnvironmentFilters(rows, { search }).map((row) => row.id);

const PROD_ID = rows[0].id;
const staging = (label, actual) => check(label, actual, rows[1].id);

/* ── The identifier rule ───────────────────────────────────────────────── */

section("An environment id is named whole");

check(
  "exactly, it is that one environment",
  matchedIds(PROD_ID).join(","),
  PROD_ID,
);
check(
  "however it was capitalised",
  matchedIds(PROD_ID.toUpperCase()).join(","),
  PROD_ID,
);
check(
  "and with the space a pasted id usually brings",
  matchedIds(`  ${PROD_ID}  `).join(","),
  PROD_ID,
);

// The regression this file exists for: a fragment is not a search for the
// environment, because a substring match on a uuid means a search for "1"
// returns most of the table.
check("a fragment is not that id", matchedIds("8f14e45f").length, 0);
check("nor a fragment from the middle", matchedIds("467f").length, 0);
check(
  "nor an id that is close",
  matchedIds("8f14e45f-ceea-467f-b4c0-2f7a1d9e5b32").length,
  0,
);
check(
  "and no environment at all matches nothing",
  matchedIds("no-such-id").length,
  0,
);

/* ── The text rule ─────────────────────────────────────────────────────── */

section("Names and Wrike values are substring matches");

check("a name, in full", matchedIds("STAGING").join(","), rows[1].id);
check("a name, partially", matchedIds("stagi").join(","), rows[1].id);
check("a name, in any case", matchedIds("prod").join(","), PROD_ID);
check(
  "the decrypted client id, which is why this is not a SQL filter",
  matchedIds("zzz999").join(","),
  rows[1].id,
);
check("the account number, partially", matchedIds("IEAC").length, 2);
// Deliberately the same term the client-id case above matches: one term can
// reach a row through any of the text fields, which is the point of a search
// box, and "zzz" is not a name that matches nothing.
check("a term that matches nothing at all", matchedIds("zzz-nope").length, 0);

/* ── The empty search ──────────────────────────────────────────────────── */

section("An empty search keeps everything");

check("absent", envFilters.applyEnvironmentFilters(rows).length, 3);
check(
  "undefined",
  envFilters.applyEnvironmentFilters(rows, { search: undefined }).length,
  3,
);
check(
  "an empty string",
  envFilters.applyEnvironmentFilters(rows, { search: "" }).length,
  3,
);
check(
  "whitespace, which is a box somebody cleared rather than a query",
  envFilters.applyEnvironmentFilters(rows, { search: "   " }).length,
  3,
);

/* ── The route ─────────────────────────────────────────────────────────── */

section("The route declares the parameter");

const searchParam = GetAllSchema?.schema?.querystring?.properties?.search;
checkTrue("the list route reads `search`", searchParam);
check("as a string", searchParam?.type, "string");
check(
  "with a ceiling, so a pasted document is refused rather than searched",
  searchParam?.maxLength,
  200,
);

/* ── The handler ───────────────────────────────────────────────────────── */

section("The handler applies it");

/* Stubbed on the module the handler imports through the controllers index: the
   same object, patched before the handler loads. No database is touched.

   The decryptor is stubbed too: the fixture's client ids are readable strings,
   and the real one would try to decrypt them (and throw). Whether a Wrike
   client id can be decrypted is not the question this file asks. */
const crypto = require("../src/utils/crypto");
crypto.decryptField = (value) => value;

const WrikeCredentials = require("../src/controllers/wrikeCredentials");
WrikeCredentials.GetAllWithDeleted = async () =>
  rows.map((row) => ({ ...row, is_active: true, is_visible: true }));
WrikeCredentials.GetOwnersByEnvIds = async () => ({});

/* The list also carries each environment's module-permission summary now
   (src/controllers/environmentModulePermissions.js). Stubbed as "no rows for
   any of them", which is the unrestricted state the fixtures are in. */
const EnvironmentModulePermissions = require("../src/controllers/environmentModulePermissions");
EnvironmentModulePermissions.GetMatrixForEnvironments = async () => ({});

const { GetAll } = require("../src/routes/admin/credentials/handlers/getAll");

(async () => {
  const searched = await GetAll({ search: PROD_ID });
  check("an id search returns one environment", searched.data.length, 1);
  check("and it is the right one", searched.data[0].id, PROD_ID);

  const all = await GetAll({});
  check("no search returns them all", all.data.length, 3);

  const nothing = await GetAll({ search: "nobody-called-this-environment" });
  // The failure mode worth naming: a search that matched nothing must not fall
  // back to the whole list, because that reads as "your filter was applied and
  // these are the results".
  check(
    "a search that matches nothing returns nothing",
    nothing.data.length,
    0,
  );

  const byName = await GetAll({ search: "stagi" });
  staging("a name search still reaches the handler", byName.data[0]?.id);

  const message = await GetAll({ search: PROD_ID });
  check("and the response still says what it is", message.statusCode, 200);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

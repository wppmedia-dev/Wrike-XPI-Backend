/* Covers the server-side token list filters: the vocabulary the console sends
   and the predicates the server applies.

   Why this file exists. The console used to filter rows it had downloaded, so
   "Unrestricted" or "Expiring within 14 days" was decided in the browser and no
   server test could see it. The filter is now a query parameter, which means a
   mistake here is a filter that silently returns the wrong rows — and the two
   easiest mistakes are the interesting ones: a filter that matches nothing
   because of a field name, and a filter that matches everything because an
   empty control was treated as a value.

   Run from the repo root:  node test/tokenFilters.test.js

   Nothing is written and no database is touched: these are pure decisions. */

require("@babel/register")({
  presets: [["@babel/preset-env", { targets: { node: "current" } }]],
});
process.on("unhandledRejection", () => {});

const filters = require("../src/utils/tokenFilters");

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
   Shaped like Tokens.ListForConsole's output: the admin shape plus the
   permission summary the Access badge and the Access filter both read. */

const DAY = 24 * 60 * 60 * 1000;
const iso = (offsetDays) =>
  new Date(Date.now() + offsetDays * DAY).toISOString();

const row = (overrides = {}) => ({
  id: "11111111-1111-4111-8111-111111111111",
  username: "xpi_user",
  account_id: "IEAC123",
  env_id: "22222222-2222-4222-8222-222222222222",
  environment_name: "PROD",
  is_active: true,
  client_name: "Login page",
  token_expires_at: iso(60),
  created_at: iso(-40),
  updated_at: iso(-2),
  creator_email: "ana@example.com",
  creator_name: "Ana Silva",
  // Unrestricted: nobody has restricted this token.
  permissions: { configured: false, granted: 22, total: 22 },
  ...overrides,
});

const restricted = (granted) => ({
  configured: true,
  granted,
  total: 22,
});

const rows = [
  row(),
  row({
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    username: "mcp_claude",
    account_id: "IEAC999",
    env_id: "33333333-3333-4333-8333-333333333333",
    environment_name: "STAGING",
    client_name: "Claude Desktop",
    is_active: false,
    token_expires_at: iso(3),
    updated_at: null,
    creator_email: "sam@example.com",
    creator_name: "Sam Doe",
    permissions: restricted(4),
  }),
  row({
    id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    account_id: null,
    env_id: null,
    environment_name: null,
    client_name: null,
    // Expired, never used, and switched off: the row every "none of these"
    // filter should find.
    token_expires_at: iso(-1),
    is_active: false,
    updated_at: "2026-01-01T00:00:00.000Z",
    creator_email: null,
    creator_name: null,
    permissions: restricted(0),
  }),
];

const withFilters = (query) =>
  filters.applyTokenFilters(rows, filters.parseTokenFilters(query));

const ids = (query) => withFilters(query).map((r) => r.id);
const short = (id, index) => id.slice(0, 4) || `#${index}`;

const shortIds = (query) => ids(query).map((id) => id.slice(0, 4));

/* ── No filters ────────────────────────────────────────────────────────── */

section("An empty query");

check("matches everything", ids({}).length, 3);
check(
  "and reports the scope's size, not the match count",
  withFilters({}).length,
  3,
);

section("Blank values are absent, not empty");

// The console leaves untouched controls out of the URL. A client that sends
// them anyway must not have them read as a search for the empty string, which
// is how a filter that "matches everything" hides every row instead.
const blanks = filters.parseTokenFilters({
  env_id: "",
  token_id: "   ",
  access: "",
  status: "",
  search: "",
});
check("a blank parameter becomes no filter", blanks.envId, "");
check("including a whitespace-only one", blanks.tokenId, "");
checkTrue(
  "so nothing is narrowed",
  filters.matchesTokenFilters(rows[0], blanks),
);
check(
  "and the row set is unchanged",
  filters.applyTokenFilters(rows, blanks).length,
  3,
);

/* ── Text filters ──────────────────────────────────────────────────────── */

section("Substring filters");

check("token id, partially", shortIds({ token_id: "aaaa" }).join(","), "aaaa");
check("case-insensitively", shortIds({ client: "claude" }).join(","), "aaaa");
check("account id", shortIds({ account_id: "IEAC999" }).join(","), "aaaa");
check("a creator by email", shortIds({ creator: "sam@" }).join(","), "aaaa");
check(
  "or by name, which is not a column",
  shortIds({ creator: "Ana Silva" }).join(","),
  "1111",
);
check("no match is an empty list", shortIds({ client: "nope" }).length, 0);

/* ── The environment picker ────────────────────────────────────────────── */

section("Environment");

check(
  "an exact environment id",
  shortIds({ env_id: "33333333-3333-4333-8333-333333333333" }).join(","),
  "aaaa",
);
check(
  "the nil UUID means 'no environment'",
  shortIds({ env_id: filters.NO_ENVIRONMENT }).join(","),
  "bbbb",
);
check(
  "and not 'every environment'",
  shortIds({ env_id: filters.NO_ENVIRONMENT }).length,
  1,
);

/* ── The three derived states ──────────────────────────────────────────── */

section("Access, from the same summary the badge reads");

check("unrestricted", shortIds({ access: "unrestricted" }).join(","), "1111");
check("restricted", shortIds({ access: "restricted" }).join(","), "aaaa");
check("no access", shortIds({ access: "none" }).join(","), "bbbb");

// The boundary the badge uses: granted === total is full access even when the
// token was explicitly granted everything, and 0 of 22 is none.
const allGranted = row({ permissions: restricted(22) });
const noneGranted = row({ permissions: restricted(0) });
checkTrue(
  "granted everything counts as unrestricted, not restricted",
  filters.matchesTokenFilters(allGranted, { access: "unrestricted" }),
);
checkTrue(
  "nothing granted counts as none, not restricted",
  filters.matchesTokenFilters(noneGranted, { access: "none" }),
);

section("Validity, against the badge's warning window");

check("expired", shortIds({ validity: "expired" }).join(","), "bbbb");
check("expiring soon", shortIds({ validity: "soon" }).join(","), "aaaa");
check("valid", shortIds({ validity: "valid" }).join(","), "1111");
check("no expiry recorded", shortIds({ validity: "unknown" }).length, 0);
check(
  "a row with no expiry is unknown, not valid",
  filters.matchesTokenFilters(row({ token_expires_at: null }), {
    validity: "unknown",
  }),
  true,
);
check(
  "and it is not counted as already expired",
  filters.matchesTokenFilters(row({ token_expires_at: null }), {
    validity: "expired",
  }),
  false,
);
check("the warning window is the badge's", filters.EXPIRY_WARNING_DAYS, 14);

section("Last updated");

check("in the last 7 days", shortIds({ updated: "7d" }).join(","), "1111");
check(
  "never updated, which falls back to creation time for the ranges",
  shortIds({ updated: "never" }).join(","),
  "aaaa",
);
check(
  "a token created yesterday but never used is not 'never updated'",
  filters.matchesTokenFilters(row({ updated_at: null, created_at: iso(-1) }), {
    updated: "never",
  }),
  true,
);
check(
  "and it is inside the 30 day window",
  filters.matchesTokenFilters(row({ updated_at: null, created_at: iso(-1) }), {
    updated: "30d",
  }),
  true,
);

section("Status");

check("active", shortIds({ status: "active" }).join(","), "1111");
check("inactive", shortIds({ status: "inactive" }).join(","), "aaaa,bbbb");

/* ── Search ────────────────────────────────────────────────────────────── */

section("The search box");

check(
  "over the environment name",
  shortIds({ search: "staging" }).join(","),
  "aaaa",
);
check("over the account id", shortIds({ search: "ieac999" }).join(","), "aaaa");
check(
  "over the username, which is no longer a column",
  shortIds({ search: "mcp_claude" }).join(","),
  "aaaa",
);
check("over the creator", shortIds({ search: "sam@" }).join(","), "aaaa");
check("with no match, nothing", shortIds({ search: "zzz" }).length, 0);

/* ── Combinations, and the picker's options ───────────────────────────── */

section("Combined filters");

check(
  "access and status together narrow further, not wider",
  shortIds({ access: "restricted", status: "active" }).length,
  0,
);
check(
  "client and validity together",
  shortIds({ client: "claude", validity: "soon" }).join(","),
  "aaaa",
);

section("What the response carries besides the rows");

const choices = filters.environmentChoices(rows);
check(
  "the picker lists each environment once, by name",
  choices.map((c) => c.name).join(","),
  "PROD,STAGING",
);
check("and omits the tokens with no environment", choices.length, 2);
check("which are reported separately", filters.hasUnassignedTokens(rows), true);
check(
  "and the count before filtering is the scope size",
  filters.applyTokenFilters(rows, { search: "zzz" }).length === 0 &&
    rows.length === 3,
  true,
);

// The options must come from the unfiltered rows, or the picker would lose
// every environment the current filter excludes.
check(
  "the options do not shrink with the filters",
  filters.environmentChoices(rows).length,
  filters.environmentChoices(
    filters.applyTokenFilters(rows, { status: "active" }),
  ).length + 1,
);

section("The query names the server reads");

const parsed = filters.parseTokenFilters({
  env_id: "33333333-3333-4333-8333-333333333333",
  token_id: "abcd",
  client: "Claude",
  account_id: "IEAC1",
  creator: "ana@",
  access: "restricted",
  validity: "soon",
  updated: "7d",
  status: "active",
  search: "prod",
});
check(
  "one key per control, in the shape the predicates expect",
  Object.keys(parsed).join(","),
  "envId,tokenId,client,accountId,creator,access,validity,updated,status,search",
);
checkTrue(
  "and it filters",
  filters.matchesTokenFilters(row({ permissions: restricted(4) }), parsed) ===
    false,
);
checkTrue(
  "unrecognised values are ignored rather than fatal",
  filters.matchesTokenFilters(row(), {
    validity: "nonsense",
    updated: "nonsense",
  }),
);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);

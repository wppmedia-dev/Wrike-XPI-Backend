/* Exercises the Calendar Sync sign-in end to end, minus the network.
   Run from the repo root:  node test/calendarSync.test.js

   Four things are asserted, in the order they happen in a real sign-in:

     1. the purpose vocabulary decides 180 days vs no expiry, and treats
        anything it does not recognise as an ordinary sign-in;
     2. the purpose survives the trip through Wrike, in the SIGNED state the
        redirect URL carries — the one place a caller cannot edit it, and the
        one place Fastify's query stripping would silently drop it from if the
        schema did not declare it;
     3. the mint acts on it: the claim, the row, the client name and the
        permission matrix all come out of the same decision;
     4. the matrix it seeds is the catalogue's "everything", including the
        read-only calendar_sync scope.

   No database, Redis or Wrike account required. Every side effect the mint
   reaches for is stubbed on the very object the handler reads it from, which
   is the pattern the other suites in this directory use (see
   test/environmentSearch.test.js). What this file does NOT stub is the
   decision itself: normalisePurpose, calendarSyncMatrix and the handler body
   are the real ones. */

require("@babel/register")({
  presets: [["@babel/preset-env", { targets: { node: "current" } }]],
});
process.on("unhandledRejection", () => {});

const ENV_ID = "11111111-1111-4111-8111-111111111111";
const ACCOUNT_ID = "IEAC7PRT";

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

const {
  CALENDAR_SYNC_CLIENT_NAME,
  CALENDAR_SYNC_MODULE,
  TOKEN_PURPOSE,
  calendarSyncMatrix,
  isCalendarSyncPurpose,
  normalisePurpose,
} = require("../src/utils/tokenPurpose");
const catalog = require("../src/utils/tokenPermissionCatalog");
const {
  WrikeTokenExchangeSchema,
} = require("../src/routes/tokens/schema/wrikeTokenExchange");

/* ── 1. The vocabulary ──────────────────────────────────────────────────── */

section("Purpose vocabulary");

check("absent is a normal sign-in", normalisePurpose(undefined), "login");
check("blank is a normal sign-in", normalisePurpose(""), "login");
check("null is a normal sign-in", normalisePurpose(null), "login");
check(
  "an unknown value is a normal sign-in",
  normalisePurpose("forever"),
  "login",
);
check(
  "the calendar value is recognised",
  normalisePurpose("calendar_sync"),
  TOKEN_PURPOSE.CALENDAR_SYNC,
);
check(
  "and it is recognised however it is spelled",
  normalisePurpose("  Calendar_Sync "),
  TOKEN_PURPOSE.CALENDAR_SYNC,
);
check("a near miss is not", normalisePurpose("calendar-sync"), "login");
check(
  "isCalendarSyncPurpose agrees",
  isCalendarSyncPurpose("calendar_sync"),
  true,
);
check("isCalendarSyncPurpose on junk", isCalendarSyncPurpose("1"), false);

/* ── 2. The signed state ────────────────────────────────────────────────── */

section("The purpose rides in the signed state");

/* Stubbed on the module wrikeRedirect imports from: the same object, patched
   before it loads. No database is touched — a credentials cache is exactly
   what this function reads, and filling it by hand is the whole fixture. */
const wrikeCredentials = require("../src/utils/wrikeCredentials");
wrikeCredentials.getCachedWrikeCredentials = () => ({
  PROD: { id: ENV_ID, clientId: "client-id", accountId: ACCOUNT_ID },
});

// The endpoint pair the URL is built from. Read from process.env at call time,
// so setting them here is enough.
process.env.WRIKE_LOGIN_ENDPOINT = "https://www.wrike.com/oauth2";
process.env.WRIKE_REDIRECT_URL = "http://localhost:3000/callback";

const { findRedirectionURL } = require("../src/utils/wrikeRedirect");

/* sign() answers a JSON string rather than a JWE so the state can be read back
   out of the URL. The callback is the only thing that ever verifies it, and it
   is not what this file is asking about. */
const signState = (payload) => JSON.stringify(payload);
const fakeFastify = { jwt: { sign: signState } };

const stateOf = (query) => {
  const { redirectUrl } = findRedirectionURL(query, fakeFastify);
  return JSON.parse(new URL(redirectUrl).searchParams.get("state"));
};

const calendarState = stateOf({
  environment: "PROD",
  purpose: "calendar_sync",
});
check("calendar_sync is carried", calendarState.purpose, "calendar_sync");
check("with the environment", calendarState.environmentId, ENV_ID);

const loginState = stateOf({ environment: "PROD", purpose: "login" });
check("a normal sign-in claims no purpose", "purpose" in loginState, false);
check("but still carries the environment", loginState.environmentId, ENV_ID);

const junkState = stateOf({ environment: "PROD", purpose: "forever" });
check("junk claims no purpose", "purpose" in junkState, false);

const absentState = stateOf({ environment: "PROD" });
check("and neither does an absent one", "purpose" in absentState, false);

/* Fastify's default query validation strips what the schema does not declare,
   so an undeclared purpose would never reach the mint from /exchange or
   /callback. This is the assertion that keeps it declared. */
check(
  "the purpose query param is declared",
  Object.prototype.hasOwnProperty.call(
    WrikeTokenExchangeSchema.schema.query.properties,
    "purpose",
  ),
  true,
);

/* ── 3. The mint ────────────────────────────────────────────────────────── */

section("What the mint does with it");

/* The handlers/controllers the mint reaches for, patched on the objects it
   reads them from. Captured rather than asserted on the way in, so both
   branches can be compared at the end. */
const models = require("../models");
models.sequelize = {
  transaction: async () => ({
    commit: async () => {},
    rollback: async () => {},
  }),
};

const crypto = require("../src/utils/crypto");
crypto.hashPassword = async () => "stub-hash";
crypto.deriveKEK = async () => Buffer.alloc(32);

const WrikeCredentials = require("../src/controllers/wrikeCredentials");
WrikeCredentials.GetById = async () => ({ environment_name: "PROD" });

const wrike = require("../src/utils/wrike");
wrike.getWrikeTokens = async () => ({
  access_token: "wrike-access",
  refresh_token: "wrike-refresh",
});
wrike.getUserData = async () => ({
  data: [
    {
      id: "wrike-user-1",
      firstName: "Ana",
      lastName: "Silva",
      primaryEmail: "ana@example.com",
      profiles: [{ accountId: ACCOUNT_ID }],
    },
  ],
});

const environmentAccess = require("../src/utils/environmentAccess");
environmentAccess.evaluateAccess = async () => ({ allowed: true });

const controllers = require("../src/controllers");
controllers.Users.GetByWrikeId = async () => ({ id: "user-1" });

let lastInsert = null;
controllers.Tokens.Insert = async (userId, data) => {
  lastInsert = data;
  return { id: data.id };
};

let seeded = null;
controllers.TokenPermissions.SeedMatrix = async (tokenId, matrix) => {
  seeded = { tokenId, matrix };
  return { configured: true, matrix };
};

const {
  WrikeTokenExchange,
} = require("../src/routes/tokens/handlers/wrikeTokenExchange");

(async () => {
  const runMint = async (data) => {
    lastInsert = null;
    seeded = null;
    let signOptions = "not-called";

    const fastify = {
      jwt: {
        sign: (payload, options) => {
          signOptions = options;
          return "jwe-token";
        },
      },
    };

    const result = await WrikeTokenExchange(data, fastify);
    return { result, signOptions, insert: lastInsert, seeded };
  };

  const calendar = await runMint({
    code: "code",
    environmentId: ENV_ID,
    purpose: "calendar_sync",
    clientName: "Login page",
  });

  check("it mints a token", calendar.result.token, "jwe-token");
  check("the signature carries no expiry", calendar.signOptions, undefined);
  check("the row records no expiry", calendar.insert.token_expires_at, null);
  check(
    "and is labelled in the console",
    calendar.insert.client_name,
    CALENDAR_SYNC_CLIENT_NAME,
  );
  check("a matrix was seeded", calendar.seeded !== null, true);
  check(
    "for the token that was inserted",
    calendar.seeded.tokenId,
    calendar.insert.id,
  );
  check(
    "covering every catalogue module",
    Object.keys(calendar.seeded.matrix).length,
    catalog.MODULES.length,
  );
  check(
    "with the calendar scope granted",
    calendar.seeded.matrix.calendar_sync.read,
    true,
  );
  check(
    "and the calendar scope unable to write",
    calendar.seeded.matrix.calendar_sync.update,
    false,
  );
  /* Only what it is for. A calendar token minted with campaigns, tasks and
     master data available would be a credential far wider than the job that
     asked for it, and widening it has to be somebody's decision. */
  check(
    "with every other module off",
    Object.entries(calendar.seeded.matrix)
      .filter(([key]) => key !== CALENDAR_SYNC_MODULE)
      .every(
        ([, row]) => !row.read && !row.create && !row.update && !row.delete,
      ),
    true,
  );
  check(
    "exactly the matrix the policy defines",
    JSON.stringify(calendar.seeded.matrix),
    JSON.stringify(calendarSyncMatrix()),
  );

  const login = await runMint({
    code: "code",
    environmentId: ENV_ID,
    clientName: "Login page",
  });

  check("a normal sign-in still signs", login.result.token, "jwe-token");
  check("with the 180-day lifetime", login.signOptions.expiresIn, "180d");
  check(
    "and a row that says when it dies",
    login.insert.token_expires_at instanceof Date,
    true,
  );
  check("named after the login page", login.insert.client_name, "Login page");
  check("and no matrix at all", login.seeded, null);

  /* An unrecognised purpose must not be read as "calendar sync": that would
     hand out a token with no expiry on the strength of a query parameter
     nobody validated. */
  const junk = await runMint({
    code: "code",
    environmentId: ENV_ID,
    purpose: "forever",
    clientName: "Login page",
  });

  check("junk mints a 180-day token", junk.signOptions.expiresIn, "180d");
  check("with no seeded matrix", junk.seeded, null);

  /* ── The validator ─────────────────────────────────────────────────── */

  section("The validator answers from the calendar grant");

  const Fastify = require("fastify");

  /* The route registered on its own, with the two things the gates leave
     behind (a token id and the loaded matrix) planted by a hook, so each case
     below can ask the same question with a different permission and read the
     status straight off. The handler and the decision under it are the real
     ones either way. */
  const validateWith = async (matrixEntry) => {
    const app = Fastify();
    app.addHook("onRequest", async (req) => {
      req.tokenId = "11111111-1111-4111-8111-111111111111";
      req.environmentName = "PROD";
      req.envId = ENV_ID;
      req.tokenMatrix = matrixEntry;
    });
    await app.register(require("../src/routes/calendar").calendarRoute);

    const res = await app.inject({ method: "GET", url: "/validate" });
    await app.close();
    return { status: res.statusCode, body: res.json() };
  };

  const entryOf = (matrix, configured = true) => ({ configured, matrix });

  const granted = await validateWith(entryOf(calendarSyncMatrix()));
  check("a calendar token validates", granted.status, 200);
  check("and the answer says so", granted.body.data.calendar_access, true);
  check(
    "with the environment it belongs to",
    granted.body.data.environment,
    "PROD",
  );
  check(
    "and the token the console would show",
    granted.body.data.token_id,
    "11111111-1111-4111-8111-111111111111",
  );

  // Grandfathering, exactly as the gate applies it: no rows means unrestricted,
  // which is what keeps tokens issued before the matrix existed working.
  const unrestricted = await validateWith(
    entryOf(catalog.emptyMatrix(), false),
  );
  check("an unrestricted token validates too", unrestricted.status, 200);

  const campaignOnly = await validateWith(
    entryOf(catalog.normaliseMatrix({ campaign: { read: true } })),
  );
  check("a campaign-only token does not", campaignOnly.status, 403);
  check(
    "and is told which module refused it",
    campaignOnly.body.error.module,
    CALENDAR_SYNC_MODULE,
  );
  check("and which action", campaignOnly.body.error.action, "read");
  check("and why", campaignOnly.body.error.code, "MODULE_FORBIDDEN");

  // A matrix that was never loaded is a check that could not be answered, not
  // a grant. This is the branch that only fires if the route is ever mounted
  // outside the guarded scope.
  const unloaded = await validateWith(undefined);
  check("an unanswerable check is refused", unloaded.status, 403);
  check(
    "as a failed check, not a denial",
    unloaded.body.error.code,
    "PERMISSION_CHECK_FAILED",
  );

  /* ── The amoeba forwarder ──────────────────────────────────────────── */

  section("The amoeba forwarder hands the call to amoeba");

  /* The handler the amoeba route uses, stubbed on the very object the calendar
     route imports it from — so what is asserted is the wiring (the params, the
     method, the envelope) rather than Wrike, Datahub or a network. */
  const amoebaHandlerModule = require("../src/routes/amoeba/handlers/amoebaHandler");
  const realAmoebaHandler = amoebaHandlerModule.AmoebaHandler;
  const forwarded = [];
  amoebaHandlerModule.AmoebaHandler = async (
    wrikeToken,
    req,
    environmentName,
  ) => {
    forwarded.push({
      wrikeToken,
      moduleSlug: req.params.moduleSlug,
      serviceSlug: req.params.serviceSlug,
      masterSlug: req.params.master_slug,
      serviceSlugParam: req.params.service_slug,
      method: req.method,
      environmentName,
      body: req.body ?? null,
    });
    return { statusCode: 201, data: { id: "item-1" } };
  };

  const forward = async (method, body) => {
    const app = Fastify();
    app.addHook("onRequest", async (req) => {
      req.wrikeToken = "wrike-token";
      req.environmentName = "PROD";
      req.envId = ENV_ID;
    });
    await app.register(require("../src/routes/calendar").calendarRoute);

    const res = await app.inject({
      method,
      url: "/amoeba/leads/service",
      ...(body ? { payload: body } : {}),
    });
    await app.close();
    return res;
  };

  forwarded.length = 0;
  const read = await forward("GET");
  check(
    "the handler's status code is what the caller gets",
    read.statusCode,
    201,
  );
  check("with the handler's own payload", read.json().data.id, "item-1");
  check("and its success flag", read.json().success, true);
  check("the handler ran once", forwarded.length, 1);
  check(
    "with the master slug as the module slug",
    forwarded[0].moduleSlug,
    "leads",
  );
  check(
    "and the service slug as the service slug",
    forwarded[0].serviceSlug,
    "service",
  );
  check("the URL's own names are left alone", forwarded[0].masterSlug, "leads");
  check(
    "so a handler that reads them still can",
    forwarded[0].serviceSlugParam,
    "service",
  );
  check("the method arrives as it was sent", forwarded[0].method, "GET");
  check(
    "with the token the gate resolved",
    forwarded[0].wrikeToken,
    "wrike-token",
  );
  check(
    "and the environment it belongs to",
    forwarded[0].environmentName,
    "PROD",
  );

  // A write has to survive the trip too: the body is the forwarder's payload,
  // and nothing about it is rewritten on the way.
  const write = await forward("POST", { name: "New lead", stage: "new" });
  check("a write is answered too", write.statusCode, 201);
  check("and passes the body through", forwarded[1].body.name, "New lead");
  check("as a POST", forwarded[1].method, "POST");

  // A refusal is the amoeba handler's own: its status code and message are the
  // ones the caller sees, in the same envelope the amoeba route sends.
  amoebaHandlerModule.AmoebaHandler = async () => {
    throw {
      statusCode: 409,
      message: "Multiple amoeba module mappings found for moduleSlug: leads",
    };
  };
  const refused = await forward("GET");
  check("a refused call keeps the handler's status", refused.statusCode, 409);
  check("and reports failure", refused.json().success, false);
  check(
    "with the handler's message",
    refused.json().message.includes("Multiple amoeba module mappings"),
    true,
  );

  amoebaHandlerModule.AmoebaHandler = async () => {
    throw new Error("boom");
  };
  const broken = await forward("GET");
  check(
    "an unexpected throw is a 400, as on the amoeba route",
    broken.statusCode,
    400,
  );
  check(
    "with a message rather than a stack",
    typeof broken.json().message,
    "string",
  );

  amoebaHandlerModule.AmoebaHandler = realAmoebaHandler;

  // Every verb the amoeba route accepts, this one accepts: it is the same
  // forwarder, so a calendar that needs to update or delete can be granted
  // exactly that.
  const registered = new Set();
  const routeApp = Fastify();
  routeApp.addHook("onRoute", (route) => {
    if (!String(route.url).includes("amoeba")) return;
    for (const method of [].concat(route.method)) registered.add(method);
  });
  routeApp.register(require("../src/routes/calendar").calendarRoute, {
    prefix: "/wrikexpi/calendar",
  });
  await routeApp.ready();
  await routeApp.close();

  ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "TRACE"].forEach(
    (method) => {
      check(
        `the forwarder is registered for ${method}, exactly as amoeba is`,
        registered.has(method),
        true,
      );
    },
  );

  const {
    CalendarAmoebaSchema,
  } = require("../src/routes/calendar/schema/amoeba");
  check(
    "both slugs are required by the URL",
    JSON.stringify(CalendarAmoebaSchema.schema.params.required),
    JSON.stringify(["master_slug", "service_slug"]),
  );

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

/* Proves the error reference is unique, readable aloud, and only ever attached
   where it belongs.

   Why this file exists. The reference is the one thing in an error response
   that a person types back into the console, so two things have to hold that a
   screenshot cannot show: it must not be ambiguous when read aloud (no I/O/0/1
   — "was that an O or a zero?"), and it must not collide, or support would be
   looking at somebody else's failure. Around that, the attachment rule is
   deliberately narrow: JSON object bodies on error responses, and nothing else.
   A rule that is too eager would append a field to an HTML page or a stream and
   break the very response it was meant to explain.

   Run from the repo root:  node test/activityReference.test.js

   Nothing is written and no network is touched. */

require("@babel/register")({
  presets: [["@babel/preset-env", { targets: { node: "current" } }]],
});

const Fastify = require("fastify");
const fp = require("fastify-plugin");

const {
  ALPHABET,
  newReference,
  referenceFor,
  withReference,
} = require("../src/utils/activityReference");

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

const SHAPE = /^XPI-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/;

/* ── The alphabet ────────────────────────────────────────────────────────── */

console.log("\nThe alphabet it draws from");
{
  // 32 exactly: a power of two means a random byte maps onto the alphabet with
  // no modulo bias, which is why the alphabet was chosen at this size rather
  // than by dropping characters from a larger one.
  check("is 32 characters", ALPHABET.length, 32);
  check(
    "with no letter or digit that sounds like another",
    /[IO01]/.test(ALPHABET),
    false,
  );
  check("no duplicates", new Set(ALPHABET).size, ALPHABET.length);
  check(
    "and only upper case, digits 2-9 and A-Z",
    ALPHABET.replace(/[2-9A-HJ-NP-Z]/g, ""),
    "",
  );
}

/* ── One reference ───────────────────────────────────────────────────────── */

console.log("\nA new reference");
{
  const reference = newReference();
  checkTrue(`looks like XPI-XXXXXXXX (${reference})`, SHAPE.test(reference));
  check(
    "is prefixed so it is recognisable in a message",
    reference.slice(0, 4),
    "XPI-",
  );
  check("and is a string", typeof reference, "string");
}

console.log("\nTwo thousand of them");
{
  const seen = new Set();
  for (let i = 0; i < 2000; i++) seen.add(newReference());

  // 40 bits. A collision here would be a bug in the drawing, not bad luck, and
  // the failure mode is worth catching: two rows answering to one reference.
  check("no two are the same", seen.size, 2000);
  check(
    "and every one has the shape",
    [...seen].every((reference) => SHAPE.test(reference)),
    true,
  );
  checkTrue(
    "and none is a single repeated character",
    [...seen].every((reference) => new Set(reference.slice(4)).size > 1),
  );
}

/* ── One per request ─────────────────────────────────────────────────────── */

console.log("\nThe reference for a request");
{
  const req = {};
  const first = referenceFor(req);

  check("is created on first ask", SHAPE.test(first), true);
  check("and remembered on the request", req.activityReference, first);
  check("so asking again gives the same one", referenceFor(req), first);

  // No request to hang it on (a hook driven directly): still a usable value
  // rather than a crash, and a fresh one each time rather than a shared one.
  const detached = referenceFor(null);
  checkTrue("with no request it still returns one", SHAPE.test(detached));
  checkTrue(
    "and does not reuse it for the next caller",
    referenceFor(null) !== detached,
  );
}

/* ── Attaching it to a body ──────────────────────────────────────────────── */

console.log("\nAttaching it to a response body");
{
  const reference = "XPI-23456789";

  const body = JSON.stringify({ success: false, message: "Nope" });
  const withRef = withReference(body, reference);

  check(
    "an error body comes back with the reference",
    JSON.parse(withRef).reference,
    reference,
  );
  check(
    "and the rest of the body is untouched",
    JSON.parse(withRef).message,
    "Nope",
  );
  check(
    "in the same order it arrived",
    withRef,
    body.replace("}", `,"reference":"${reference}"}`),
  );

  // The service sends two shapes: a plain object, and the same object from a
  // serializer as a Buffer.
  check(
    "a Buffer body works the same way",
    JSON.parse(withReference(Buffer.from(body), reference)).reference,
    reference,
  );

  check(
    "a body that already carries one is left alone",
    withReference(JSON.stringify({ reference: "XPI-AAAA2222" }), reference),
    null,
  );
}

console.log("\nWhat it refuses to touch");
{
  const reference = "XPI-23456789";
  const untouched = {
    "an HTML error page": "<!doctype html><h1>Not found</h1>",
    "an empty body": "",
    "a streamed payload": undefined,
    "a null payload": null,
    "a handler function": () => {},
    "an array": JSON.stringify([{ error: "nope" }]),
    "a bare string": JSON.stringify("nope"),
    "a number": JSON.stringify(404),
    "a null literal": "null",
    "truncated JSON": '{"message":"nope"',
  };

  for (const [label, payload] of Object.entries(untouched)) {
    check(`${label} is left as it is`, withReference(payload, reference), null);
  }
}

/* ── Every status the API answers with ───────────────────────────────────── */

/**
 * The rule is "400 and above", not a list of codes somebody remembered to
 * extend, so this drives one status from each family the service actually
 * returns — client mistakes, auth, refusal, missing records, rate limiting,
 * server faults, and the gateway codes a handler can forward from upstream.
 * A new code needs no change to make it carry a reference; this is the proof
 * of that, not the mechanism.
 */
const CODE_ROUTES = [
  400, 401, 403, 404, 409, 410, 422, 429, 500, 502, 503, 504,
];

// Drives a real Fastify instance, so it is async like the hook runner below —
// both are awaited from main() and print one summary at the end.
const runStatusChecks = async () => {
  console.log("\nEvery error status the API can answer with");

  const app = Fastify();

  // The same hook, registered the same way (src/plugins/errorReference.js).
  app.register(
    fp(async (fastify) => {
      fastify.addHook("onSend", (req, reply, payload, done) => {
        if (reply.statusCode < 400) return done(null, payload);
        done(null, withReference(payload, referenceFor(req)) || payload);
      });
    }),
  );

  // The shape a handler's `fail(reply, err)` sends.
  app.setErrorHandler((err, req, reply) =>
    reply
      .code(err.statusCode || 500)
      .send({ success: false, message: err.message }),
  );

  for (const code of CODE_ROUTES) {
    app.get(`/status-${code}`, async (req, reply) =>
      reply.code(code).send({ success: false, message: `status ${code}` }),
    );
  }

  // Rate limiting answers with the body its errorResponseBuilder returns
  // (src/plugins/rate-limit.js): `{ statusCode: 429, message }` sent through
  // reply.send, which is the same path as /status-429 above.
  app.get("/limited", async (req, reply) =>
    reply.code(429).send({
      statusCode: 429,
      message: "Rate limit exceeded for WrikeXPI, please try again later.",
    }),
  );

  app.get("/thrown", async () => {
    throw Object.assign(new Error("Wrike rejected the request"), {
      statusCode: 503,
    });
  });

  for (const code of CODE_ROUTES) {
    const res = await app.inject({ method: "GET", url: `/status-${code}` });
    const body = res.json();
    check(`${code} carries a reference`, SHAPE.test(body.reference), true);
    check(`${code} keeps its own message`, body.message, `status ${code}`);
    check(`${code} keeps its status`, res.statusCode, code);
  }

  // Thrown errors arrive through the error handler, which is a different code
  // path to `reply.code(...).send(...)` — same hook, so also a reference.
  const thrown = await app.inject({ method: "GET", url: "/thrown" });
  check("a thrown error keeps the status it carried", thrown.statusCode, 503);
  check(
    "and carries a reference too",
    SHAPE.test(thrown.json().reference),
    true,
  );

  const limited = await app.inject({ method: "GET", url: "/limited" });
  check("a rate-limit body is still a 429", limited.statusCode, 429);
  check("and carries a reference", SHAPE.test(limited.json().reference), true);
  check(
    "and keeps the builder's own message",
    limited.json().message,
    "Rate limit exceeded for WrikeXPI, please try again later.",
  );

  await app.close();
};

/* ── The hook, end to end ────────────────────────────────────────────────── */

// Async because it drives a real Fastify instance: the suites in this repo are
// plain scripts, so the summary is printed from inside this runner rather than
// at the file's end.
const runHookChecks = async () => {
  console.log("\nOn a real response");

  const app = Fastify();

  // Registered the way the app registers it (src/index.js autoloads
  // src/plugins/errorReference.js), and with a child scope that snapshots the
  // payload the way the activity log does — so this also proves the snapshot
  // is taken AFTER the reference is added, not before.
  app.register(
    fp(async (fastify) => {
      fastify.addHook("onSend", (req, reply, payload, done) => {
        if (reply.statusCode < 400) return done(null, payload);
        done(null, withReference(payload, referenceFor(req)) || payload);
      });
    }),
  );

  let snapshot = null;
  app.register(async (fastify) => {
    fastify.addHook("onSend", (req, reply, payload, done) => {
      if (reply.statusCode >= 400) snapshot = String(payload);
      done();
    });

    fastify.get("/bad", async (req, reply) =>
      reply.code(403).send({ success: false, message: "Not allowed" }),
    );
    fastify.get("/fine", async () => ({ success: true }));
    fastify.get("/html", async (req, reply) =>
      reply.code(500).type("text/html").send("<!doctype html><h1>Broke</h1>"),
    );
  });

  const bad = await app.inject({ method: "GET", url: "/bad" });
  const error = bad.json();

  checkTrue(
    "an error response carries a reference",
    SHAPE.test(error.reference),
  );
  check("the message is still there", error.message, "Not allowed");
  check(
    "and the activity log's snapshot has the same one",
    JSON.parse(snapshot).reference,
    error.reference,
  );

  const fine = await app.inject({ method: "GET", url: "/fine" });
  check("a success carries none", fine.json().reference, undefined);

  const html = await app.inject({ method: "GET", url: "/html" });
  check(
    "an HTML error page is not rewritten",
    html.body,
    "<!doctype html><h1>Broke</h1>",
  );
  check("and is still an error", html.statusCode, 500);

  await app.close();
};

/* ── Both runners, one summary ───────────────────────────────────────────── */

const main = async () => {
  await runStatusChecks();
  await runHookChecks();

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
};

main();

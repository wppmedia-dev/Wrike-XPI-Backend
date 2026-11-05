/* Behaviour of the security-hardening building blocks that need no web server:

     · master-key field encryption with key ids, and that values written
       BEFORE key ids existed still decrypt (no business flow changes)
     · JWT secret fallback, and that with nothing configured it behaves exactly
       like a plain jwt.verify
     · the Redis client: fail fast while down, recover without a restart,
       log an outage once
     · the cache bus: cross-instance delivery, no echo to the sender, never
       throws into a caller

   Run from the repo root:  node test/securityCore.test.js
   No database, Redis or Wrike account required: the redis package is replaced
   by an in-memory fake before anything imports it. */

require("@babel/register")({
  presets: [["@babel/preset-env", { targets: { node: "current" } }]],
});
process.on("unhandledRejection", () => {});

const crypto = require("crypto");
const { EventEmitter } = require("events");
const Module = require("module");

/* ── Fake redis package ────────────────────────────────────────────────── */

const createdClients = [];
const fakeCreateClient = (options) => {
  const client = new EventEmitter();
  client.options = options;
  client.isReady = false;
  client.isOpen = false;
  client.published = [];
  client.connect = () => new Promise(() => {}); // pending, like a client in its reconnect loop
  client.duplicate = (overrides) => fakeCreateClient({ ...options, ...overrides });
  client.publish = async (channel, message) => {
    client.published.push([channel, message]);
  };
  client.subscribe = async () => {};
  client.json = { get: async (key) => `VALUE:${key}`, set: async () => "OK" };
  client.expire = async () => 1;
  client.del = async () => 1;
  client.close = async () => {};
  client.destroy = () => {};
  createdClients.push(client);
  return client;
};

const realLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === "redis") return { createClient: fakeCreateClient };
  return realLoad.call(this, request, ...rest);
};

// Quiet the module-load chatter from redis.js / the bus; keep our own output.
const out = console.log.bind(console);
const silence = (fn) => {
  const { log, warn } = console;
  console.log = () => {};
  console.warn = () => {};
  try {
    return fn();
  } finally {
    console.log = log;
    console.warn = warn;
  }
};

let pass = 0;
let fail = 0;

const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass++;
    out(`  ok    ${label}`);
  } else {
    fail++;
    out(
      `  FAIL  ${label}\n          got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`,
    );
  }
};

const section = (title) => out(`\n${title}`);
const errorOf = (fn) => {
  try {
    fn();
    return null;
  } catch (err) {
    return err.message;
  }
};
const tick = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));
const hex = () => crypto.randomBytes(32).toString("hex");

// The encryption exactly as it was written before key ids existed: bare
// base64(IV || AuthTag || Ciphertext). Stored rows look like this today.
const legacyEncrypt = (plaintext, keyHex) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString("base64");
};

(async () => {
  /* ── Field encryption ──────────────────────────────────────────────── */

  section("master-key field encryption");
  {
    const c = require("../src/utils/crypto");
    const k1 = hex();
    const k2 = hex();

    delete process.env.ENCRYPTION_MASTER_KEY;
    delete process.env.ENCRYPTION_MASTER_KEY_ID;
    delete process.env.ENCRYPTION_MASTER_KEYS_PREVIOUS;
    check(
      "no key configured: same error as before",
      errorOf(() => c.encryptField("x")),
      "ENCRYPTION_MASTER_KEY not set in environment",
    );

    process.env.ENCRYPTION_MASTER_KEY = k1;
    const stored = legacyEncrypt("client-secret-123", k1);
    check("a value stored before this change still decrypts", c.decryptField(stored), "client-secret-123");

    const fresh = c.encryptField("abc");
    check("new values carry a version and key id", fresh.startsWith("v1:k1:"), true);
    check("new values round-trip", c.decryptField(fresh), "abc");
    check("same text encrypts differently each time", c.encryptField("abc") !== fresh, true);
    check("a key of the wrong length is rejected", /64 hex/.test(errorOf(() => {
      process.env.ENCRYPTION_MASTER_KEY = "abcd";
      c.encryptField("x");
    }) || ""), true);
    process.env.ENCRYPTION_MASTER_KEY = k1;

    // The key is changed: k2 current, k1 kept for reading.
    process.env.ENCRYPTION_MASTER_KEY = k2;
    process.env.ENCRYPTION_MASTER_KEY_ID = "k2";
    process.env.ENCRYPTION_MASTER_KEYS_PREVIOUS = `k1:${k1}`;
    check("after a key change: old unversioned value decrypts", c.decryptField(stored), "client-secret-123");
    check("after a key change: value written under k1 decrypts", c.decryptField(fresh), "abc");
    check("after a key change: new writes use k2", c.encryptField("abc").startsWith("v1:k2:"), true);
    check("an old-key value is flagged", c.needsReencryption(fresh), true);
    check("a current-key value is not", c.needsReencryption(c.encryptField("x")), false);

    delete process.env.ENCRYPTION_MASTER_KEYS_PREVIOUS;
    check(
      "key no longer configured: error names it",
      /Encryption key "k1" is not configured/.test(errorOf(() => c.decryptField(fresh)) || ""),
      true,
    );

    const current = c.encryptField("tamper-me");
    check(
      "a tampered value is still rejected",
      errorOf(() => c.decryptField(current.slice(0, -4) + "AAAA")) !== null,
      true,
    );
    process.env.ENCRYPTION_MASTER_KEYS_PREVIOUS = "no-colon-here";
    check(
      "a malformed previous-keys setting is rejected",
      /keyId:64hex/.test(errorOf(() => c.decryptField(current)) || ""),
      true,
    );
    delete process.env.ENCRYPTION_MASTER_KEYS_PREVIOUS;
    delete process.env.ENCRYPTION_MASTER_KEY_ID;
    process.env.ENCRYPTION_MASTER_KEY = k1;
  }

  /* ── JWT secrets ───────────────────────────────────────────────────── */

  section("JWT secret fallback");
  {
    const jwt = require("jsonwebtoken");
    const { verifyJwt, verifyWithRotation } = require("../src/utils/jwtSecrets");

    process.env.JWT_SECRET = "current-secret";
    delete process.env.JWT_SECRET_PREVIOUS;

    const current = jwt.sign({ sub: "a" }, "current-secret");
    const retired = jwt.sign({ sub: "b" }, "retired-secret");

    check("a token signed with the current secret verifies", verifyJwt(current).sub, "a");
    check(
      "nothing configured: an unknown signature fails like a plain verify",
      errorOf(() => verifyJwt(retired)),
      errorOf(() => jwt.verify(retired, "current-secret")),
    );

    process.env.JWT_SECRET_PREVIOUS = "older, retired-secret";
    check("a retired secret is accepted once listed", verifyJwt(retired).sub, "b");
    check(
      "a forged token is still rejected",
      errorOf(() => verifyJwt(jwt.sign({ sub: "x" }, "attacker"))),
      "invalid signature",
    );
    check(
      "an expired token under the current secret fails on expiry",
      errorOf(() => verifyJwt(jwt.sign({ sub: "e" }, "current-secret", { expiresIn: -10 }))),
      "jwt expired",
    );
    check(
      "an expired token under a retired secret is not revived",
      errorOf(() => verifyJwt(jwt.sign({ sub: "e" }, "retired-secret", { expiresIn: -10 }))),
      "invalid signature",
    );

    // @fastify/jwt reports problems by code, not by message.
    const badSignature = Object.assign(new Error("signature mismatch"), { code: "FAST_JWT_INVALID_SIGNATURE" });
    const expired = Object.assign(new Error("expired"), { code: "FAST_JWT_EXPIRED" });
    check(
      "a @fastify/jwt signature error falls back",
      verifyWithRotation(() => { throw badSignature; }, retired).sub,
      "b",
    );
    check(
      "a @fastify/jwt expiry error is not retried",
      errorOf(() => verifyWithRotation(() => { throw expired; }, retired)),
      "expired",
    );
    delete process.env.JWT_SECRET_PREVIOUS;
  }

  /* ── Redis client ──────────────────────────────────────────────────── */

  section("redis client");
  const redis = silence(() => require("../src/utils/redis").default);
  const { reconnectDelay } = require("../src/utils/redis");
  const main = createdClients[0];
  {
    check("reconnects forever (a strategy is configured)", typeof main.options.socket.reconnectStrategy, "function");
    check("commands are not queued while down", main.options.disableOfflineQueue, true);
    check(
      "retry delay stays within [0, 30s] and grows",
      [0, 1, 5, 10, 60].map(reconnectDelay).every((d) => d >= 0 && d <= 30000) && reconnectDelay(60) >= 15000,
      true,
    );

    const started = Date.now();
    check("down: get() is a miss", await redis.get("k"), null);
    check("down: set() reports false", await redis.set("k", 1), false);
    check("down: del() reports null", await redis.del("k"), null);
    check("down: delMany() reports 0", await redis.delMany(["k"]), 0);
    check("down: keys() is empty", await redis.keys("*"), []);
    check("down: nothing waits on the socket", Date.now() - started < 50, true);
    check("down: status says not ready", redis.status().ready, false);

    const warnings = [];
    const { warn } = console;
    console.warn = (...args) => warnings.push(args.join(" "));
    main.emit("error", new Error("ECONNREFUSED"));
    main.emit("error", new Error("ECONNREFUSED"));
    main.emit("error", new Error("ECONNREFUSED"));
    console.warn = warn;
    check("an outage is logged once, not per retry", warnings.length, 1);
    check("the error is kept for the readiness report", redis.status().lastError, "ECONNREFUSED");

    const logs = [];
    const { log } = console;
    console.log = (...args) => logs.push(args.join(" "));
    main.isReady = true;
    main.emit("ready");
    console.log = log;
    check("up again without a restart: get() is served", await redis.get("k"), "VALUE:k");
    check("up again: the recovery is logged", logs.some((l) => l.includes("reconnected")), true);
    check("up again: status says ready", redis.status().ready, true);
    check("existing flags agree", [redis.isConnected, redis.connectionFailed], [true, false]);
    check("keeps the original return shapes", [await redis.set("k", 1), await redis.del("k")], [true, true]);

    check("a subscriber may queue commands before it connects", redis.createSubscriber().options.disableOfflineQueue, false);
  }

  /* ── Cache bus ─────────────────────────────────────────────────────── */

  section("cache bus");
  {
    const bus = silence(() => require("../src/utils/cacheBus"));
    const received = [];
    bus.subscribe("test:topic", (data) => received.push(data));

    bus.broadcast("test:topic", { keys: ["a"] });
    await tick();
    const [channel, raw] = main.published[main.published.length - 1];
    check("a broadcast goes out on the bus channel", channel, bus.CHANNEL);
    check("and is stamped with this instance", JSON.parse(raw).from, bus.INSTANCE_ID);

    bus.__dispatchForTest(raw);
    await tick();
    check("an instance ignores its own message (no loops)", received.length, 0);

    bus.__dispatchForTest(JSON.stringify({ from: "someone-else", topic: "test:topic", data: { keys: ["a"] } }));
    await tick();
    check("another instance's message is delivered", received, [{ keys: ["a"] }]);

    check("an unrelated topic is ignored", errorOf(() => bus.__dispatchForTest(JSON.stringify({ from: "x", topic: "other" }))), null);
    check("a malformed message is ignored", errorOf(() => bus.__dispatchForTest("{not json")), null);

    bus.subscribe("test:boom", () => { throw new Error("handler failed"); });
    check(
      "a failing handler never throws into the bus",
      silence(() => errorOf(() => bus.__dispatchForTest(JSON.stringify({ from: "x", topic: "test:boom" })))),
      null,
    );

    main.isReady = false;
    check("broadcasting while redis is down does not throw", errorOf(() => bus.broadcast("test:topic", {})), null);
    main.isReady = true;
  }

  section("in-memory caches drop entries when another instance invalidates");
  {
    const bus = require("../src/utils/cacheBus");
    const access = require("../src/utils/environmentAccessCache");

    const key = access.rulesKey("env-1");
    access.memorySet(key, ["rule"]);
    check("entry is cached", access.memoryGet(key), ["rule"]);
    bus.__dispatchForTest(JSON.stringify({ from: "other", topic: "l1:envaccess", data: { keys: [key] } }));
    await tick();
    check("another instance's invalidation clears it", access.memoryGet(key), undefined);

    access.memorySet(key, ["rule"]);
    const before = main.published.length;
    await access.invalidateEnvironment("env-1");
    const sent = JSON.parse(main.published[main.published.length - 1][1]);
    check("invalidating here still clears it locally", access.memoryGet(key), undefined);
    check("and tells the other instances (rules + switches)", [main.published.length - before, sent.topic, sent.data.keys.length], [1, "l1:envaccess", 2]);

    const { createMatrixCache } = require("../src/utils/matrixCache");
    const matrix = createMatrixCache({ name: "sec-test", keyPrefix: "xpi:sec:", ttlVar: "SEC_T", memoryTtlVar: "SEC_M" });
    let loads = 0;
    const load = async () => { loads++; return { ok: true }; };
    main.isReady = false; // no L2, so only the in-memory tier is in play
    await matrix.cachedMatrix("id-1", load);
    await matrix.cachedMatrix("id-1", load);
    check("repeat reads are served from memory", loads, 1);
    bus.__dispatchForTest(JSON.stringify({ from: "other", topic: "l1:sec-test", data: { keys: ["xpi:sec:id-1"] } }));
    await tick();
    await matrix.cachedMatrix("id-1", load);
    check("another instance's invalidation forces a reload", loads, 2);
    main.isReady = true;
  }

  /* ── OAuth client status ───────────────────────────────────────────── */

  section("OAuth client status");
  {
    const { connectionState, clientStatus, CLIENT_STATUS } = require("../src/utils/oauthClientStatus");
    const future = new Date(Date.now() + 86400000).toISOString();
    const past = new Date(Date.now() - 86400000).toISOString();
    const live = { revoked_at: null, expires_at: future };

    check("a live sign-in means connected", connectionState({ totalSessions: 3, liveSessions: 1 }), CLIENT_STATUS.CONNECTED);

    const now = Date.now();
    const ago = (seconds) => new Date(now - seconds * 1000).toISOString();
    const idleAfter = 4200; // an access token's lifetime plus a margin
    check("live and recently refreshed: connected", connectionState({ totalSessions: 1, liveSessions: 1, liveLastActiveAt: ago(600), idleAfterSeconds: idleAfter, now }), "connected");
    check("live but quiet for longer than the threshold: idle", connectionState({ totalSessions: 1, liveSessions: 1, liveLastActiveAt: ago(9000), idleAfterSeconds: idleAfter, now }), "idle");
    check("just inside the threshold: still connected", connectionState({ totalSessions: 1, liveSessions: 1, liveLastActiveAt: ago(4100), idleAfterSeconds: idleAfter, now }), "connected");
    check("no threshold given: never idle", connectionState({ totalSessions: 1, liveSessions: 1, liveLastActiveAt: ago(99999), now }), "connected");
    check("no activity time known: connected, not idle", connectionState({ totalSessions: 1, liveSessions: 1, idleAfterSeconds: idleAfter, now }), "connected");
    check("quiet but nothing live: disconnected beats idle", connectionState({ totalSessions: 2, liveSessions: 0, liveLastActiveAt: ago(99999), idleAfterSeconds: idleAfter, now }), "disconnected");
    check("an idle client keeps that status", clientStatus({ revoked_at: null, expires_at: null }, "idle"), "idle");
    check("a revoked registration still wins over idle", clientStatus({ revoked_at: ago(5), expires_at: null }, "idle"), "revoked");
    check("sign-ins that are all over mean disconnected", connectionState({ totalSessions: 2, liveSessions: 0 }), CLIENT_STATUS.DISCONNECTED);
    check("no sign-ins at all means registered", connectionState({ totalSessions: 0, liveSessions: 0 }), CLIENT_STATUS.REGISTERED);
    check("no data defaults to registered", connectionState(), CLIENT_STATUS.REGISTERED);

    check("a connected client shows connected, not 'active'", clientStatus(live, "connected"), "connected");
    check("a disconnected client no longer reads as active", clientStatus(live, "disconnected"), "disconnected");
    check("connection unknown: falls back to registered (the old behaviour)", clientStatus(live, null), "registered");
    check("a revoked registration wins over a live connection", clientStatus({ ...live, revoked_at: past }, "connected"), "revoked");
    check("an expired registration wins over a live connection", clientStatus({ revoked_at: null, expires_at: past }, "connected"), "expired");
    check("no expiry date never expires", clientStatus({ revoked_at: null, expires_at: null }, "connected"), "connected");
    check("revoked beats expired", clientStatus({ revoked_at: past, expires_at: past }, null), "revoked");
  }

  /* ── Portal permission module: oauth_clients ───────────────────────── */

  section("portal permission module: OAuth Clients");
  {
    const catalogue = require("../src/utils/portalPermissionCatalog");
    const mod = catalogue.MODULES.find((m) => m.key === "oauth_clients");

    check("the module is in the catalogue", !!mod, true);
    check("it is listed under the label shown in the popup", mod && mod.label, "OAuth Clients");
    check("it offers read, update and delete", mod && mod.actions, ["read", "update", "delete"]);
    check("and no create (clients register themselves)", mod && mod.actions.includes("create"), false);
    check("its key is a known module", catalogue.isKnownModule("oauth_clients"), true);

    const empty = catalogue.emptyMatrix();
    check("a new or existing user starts with nothing granted", empty.oauth_clients, { read: false, create: false, update: false, delete: false });

    const granted = catalogue.normaliseMatrix({
      oauth_clients: { read: true, create: true, update: true, delete: true },
    });
    check("a stray create tick is discarded on save", granted.oauth_clients, { read: true, create: false, update: true, delete: true });

    check("a grant to another module does not leak into this one", catalogue.normaliseMatrix({ cache: { read: true, delete: true } }).oauth_clients, { read: false, create: false, update: false, delete: false });
    check("the other modules are untouched", catalogue.MODULES.map((m) => m.key).filter((k) => k !== "oauth_clients"), ["overview", "environments", "environment_access", "api_tokens", "environment_modules", "activity_logs", "cache"]);
  }

  Module._load = realLoad;
  out(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();

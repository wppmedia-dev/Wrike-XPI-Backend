"use strict";

const fp = require("fastify-plugin");

/**
 * CORS, split by who the route is for.
 *
 *   Console routes (/admin, /portal, /api/v1/admin, /api/v1/portal) serve the
 *   admin and portal UIs, which are same-origin with this service. Only
 *   origins on the allow-list get CORS headers there:
 *     - the origin of APP_URL
 *     - every origin in CORS_ALLOWED_ORIGINS (comma-separated, exact match,
 *       e.g. "https://admin.example.com,https://portal.example.com")
 *   Same-origin use needs no CORS headers at all, so the UIs are unaffected;
 *   what this stops is another website driving the console APIs from a
 *   victim's browser.
 *
 *   Everything else (the public XPI API, /wrikexpi MCP, /oauth, discovery
 *   metadata) keeps `origin: "*"`. Those routes authenticate with a bearer
 *   token the caller must already hold, never with ambient browser
 *   credentials, and browser-based MCP/OAuth clients legitimately call them
 *   cross-origin. `*` never sends credentials, so it grants nothing a token
 *   does not.
 */
const METHODS = ["GET", "PUT", "PATCH", "POST", "DELETE", "OPTIONS", "HEAD"];

const CONSOLE_ROUTE = /^\/(api\/v1\/)?(admin|portal)(\/|\?|$)/;

const originOf = (url) => {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
};

const consoleOrigins = () => {
  const origins = new Set();
  const app = originOf(process.env.APP_URL || "");
  if (app) origins.add(app);
  (process.env.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((o) => originOf(o.trim()))
    .filter(Boolean)
    .forEach((o) => origins.add(o));
  return origins;
};

module.exports = fp(async function (fastify, opts) {
  const allowed = consoleOrigins();

  fastify.register(require("@fastify/cors"), {
    delegator: (req, callback) => {
      if (!CONSOLE_ROUTE.test(req.url || "")) {
        return callback(null, { methods: METHODS, origin: "*" });
      }
      const origin = req.headers.origin;
      callback(null, {
        methods: METHODS,
        // Reflect an allowed origin; otherwise send no CORS headers, so the
        // browser blocks the cross-origin read.
        origin: origin && allowed.has(origin) ? origin : false,
      });
    },
  });
});

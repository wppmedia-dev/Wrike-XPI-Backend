"use strict";

const fp = require("fastify-plugin");
const { referenceFor, withReference } = require("../utils/activityReference");

/**
 * Every error response leaves with a reference id in its body.
 *
 * One hook at the root rather than a line in each handler: this service answers
 * on several surfaces (the XPI API, the token sign-in routes, the admin and
 * portal consoles, OAuth discovery), and a reference that only some of them
 * carry is worse than none — support would ask for one and be told the caller
 * never got it. Wrapped in fastify-plugin so the hook lands on the root
 * instance and reaches every route registered afterwards; a plain plugin's
 * hooks would be encapsulated to itself and cover nothing.
 *
 * Narrow on purpose. It touches a response only when the status is an error
 * AND the body is a JSON object, and it never throws: the one thing a
 * diagnostic must not do is break the response it was meant to explain. An
 * HTML error page (the token surface renders those) is left alone — the row
 * still records a reference for it, so a report can be looked up either way.
 *
 * The same reference goes onto the activity row, because the surface's own
 * onResponse hook reads it off the request (req.activityReference).
 */
module.exports = fp(async function errorReference(fastify) {
  fastify.addHook("onSend", (req, reply, payload, done) => {
    try {
      if (reply.statusCode < 400) return done(null, payload);

      const body = withReference(payload, referenceFor(req));
      return done(null, body || payload);
    } catch (err) {
      console.error(
        new Date().toISOString(),
        "[error-reference] could not attach a reference:",
        err?.message || err,
      );
      return done(null, payload);
    }
  });
});

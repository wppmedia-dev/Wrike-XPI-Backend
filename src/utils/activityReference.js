"use strict";

const crypto = require("crypto");

/**
 * The reference id that leaves with an error response and lands on the
 * activity row for it.
 *
 * Why it exists: when a caller reports "it said I'm not authorized", there is
 * usually nothing to search — the message is the same for everyone, and the
 * row that explains it is one of thousands. A reference turns the report into a
 * lookup: the caller reads out one string, and support has the exact request,
 * the decision behind it and the payload that was sent back.
 *
 * Shape: `XPI-API-XXXXXXXX` or `XPI-MCP-XXXXXXXX` — the surface the call came
 * in on, then eight characters drawn from an alphabet with no I, O, 0 or 1,
 * because this gets read aloud and typed from a screenshot. The alphabet is
 * exactly 32 characters, so a byte maps to it with no modulo bias. 40 bits of
 * randomness is not a security boundary — an unguessable reference only stops
 * someone finding *a* row, not reading one (the activity log is behind the
 * consoles) — it is there so two errors do not collide.
 *
 * The surface is in the id rather than only on the row because the id is what
 * gets read out: "XPI-MCP-4K7P2QWD" tells the person on the other end that an
 * agent was refused, not that an integration's REST call failed, before anyone
 * opens the console. Both lookups land in the same log; they are rarely the
 * same conversation.
 *
 * Created lazily, on the first error response a request produces, and kept on
 * the request from then on: one request, one reference, even when several
 * hooks look at it.
 */

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const BODY_LENGTH = 8;

/** The label each surface carries, and the one used when none is given. */
const SURFACES = { rest: "API", mcp: "MCP" };
const DEFAULT_SURFACE = "rest";

/**
 * Which surface a request came in on, from its URL.
 *
 * Used where the code minting the reference cannot simply say — the generic
 * error hook answers for every route in the service — so the path decides. The
 * MCP endpoint is `/api/v1/wrikexpi/mcp`; `/docs/mcp` is the MCP documentation
 * page and is deliberately not one of them.
 */
const surfaceForUrl = (url) => {
  const path = String(url || "").split("?")[0];
  if (path.startsWith("/docs/")) return DEFAULT_SURFACE;
  return /(?:^|\/)mcp(?:\/|$)/.test(path) ? "mcp" : DEFAULT_SURFACE;
};

const newReference = (surface) => {
  const label = SURFACES[surface] || SURFACES[DEFAULT_SURFACE];
  const bytes = crypto.randomBytes(BODY_LENGTH);
  let body = "";
  for (let i = 0; i < BODY_LENGTH; i++) {
    body += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return `XPI-${label}-${body}`;
};

/**
 * The reference for this request, creating one the first time it is asked for.
 * Requests that never fail therefore never get one. The surface is only read
 * when the id is minted: whoever gets there first names it, and every later
 * caller reuses the same string.
 */
const referenceFor = (req, surface) => {
  if (!req) return newReference(surface);
  if (!req.activityReference) req.activityReference = newReference(surface);
  return req.activityReference;
};

/**
 * The same body with `reference` added, or null when the payload should be
 * left exactly as it is.
 *
 * Null means "not this shape": an HTML error page (the token surface renders
 * those), a stream, an array, a scalar, or a body that already carries a
 * reference. Returning null rather than the original payload makes the caller
 * decide, so a missed case leaves the response untouched instead of mangled.
 *
 * Re-serialising costs the original formatting, which is not a loss here: every
 * JSON error in this service is sent as an object by a handler, never as
 * pretty-printed text.
 */
const withReference = (payload, reference) => {
  if (
    payload === undefined ||
    payload === null ||
    typeof payload === "function"
  ) {
    return null;
  }

  const text = Buffer.isBuffer(payload) ? payload.toString("utf8") : payload;
  if (typeof text !== "string" || !text.trimStart().startsWith("{"))
    return null;

  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return null;
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  if (body.reference) return null;

  return JSON.stringify({ ...body, reference });
};

module.exports = {
  ALPHABET,
  SURFACES,
  newReference,
  referenceFor,
  surfaceForUrl,
  withReference,
};

import jwt from "jsonwebtoken";

/**
 * JWT_SECRET rotation without logging everyone out.
 *
 * Everything is still SIGNED with JWT_SECRET. Verification first uses
 * JWT_SECRET exactly as before; only when that fails with a signature
 * mismatch does it try the retired secrets in JWT_SECRET_PREVIOUS
 * (comma-separated). With JWT_SECRET_PREVIOUS unset, behaviour is identical
 * to a plain jwt.verify(token, JWT_SECRET).
 *
 * Expiry and every other claim check still apply to tokens verified with a
 * previous secret — a retired secret only extends which signatures are
 * accepted, never how long a token lives.
 *
 * Rotation:
 *   1. JWT_SECRET_PREVIOUS=<old secret>, JWT_SECRET=<new secret>, deploy.
 *   2. Wait out the longest-lived token you still want honoured (XPI tokens:
 *      TOKEN_TTL_DAYS in src/utils/tokenTtl.js; OAuth client ids:
 *      OAUTH_CLIENT_TTL_DAYS), or revoke/reissue them.
 *   3. Remove the old secret from JWT_SECRET_PREVIOUS.
 */

export const previousJwtSecrets = () =>
  (process.env.JWT_SECRET_PREVIOUS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

// jsonwebtoken: JsonWebTokenError("invalid signature");
// fast-jwt (@fastify/jwt): code FAST_JWT_INVALID_SIGNATURE.
const isSignatureMismatch = (err) =>
  err?.code === "FAST_JWT_INVALID_SIGNATURE" ||
  (err?.name === "JsonWebTokenError" && /invalid signature/i.test(err?.message || ""));

/**
 * Run `verifyCurrent(token)`; on a signature mismatch retry with each
 * previous secret. Rethrows the ORIGINAL error if nothing matches, so callers
 * see the same failure they always did.
 */
export const verifyWithRotation = (verifyCurrent, token, options) => {
  try {
    return verifyCurrent(token);
  } catch (err) {
    const previous = previousJwtSecrets();
    if (!previous.length || !isSignatureMismatch(err)) throw err;

    for (const secret of previous) {
      try {
        return jwt.verify(token, secret, options);
      } catch {
        // try the next one
      }
    }
    throw err;
  }
};

/** Drop-in for jwt.verify(token, process.env.JWT_SECRET, options). */
export const verifyJwt = (token, options) =>
  verifyWithRotation(
    (t) => jwt.verify(t, process.env.JWT_SECRET, options),
    token,
    options,
  );

/** Drop-in for fastify.jwt.verify(token). */
export const verifyFastifyJwt = (fastify, token) =>
  verifyWithRotation((t) => fastify.jwt.verify(t), token);

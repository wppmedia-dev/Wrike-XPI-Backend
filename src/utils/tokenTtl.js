/**
 * How long an XPI token lives.
 *
 * The token a caller holds is a signed JWE (see
 * src/routes/tokens/handlers/wrikeTokenExchange.js). Its lifetime is the only
 * thing about it that expires on a clock: the Wrike access token inside it is
 * refreshed server-side on demand and the row's permissions are managed by an
 * admin, so this is what "is this token still valid?" means.
 *
 * One constant, three readers, all of which used to hold their own copy of the
 * number: the mint (expiresIn), the migration that backfills existing rows, and
 * the OAuth token endpoint's `expires_in` response field.
 */

export const TOKEN_TTL_DAYS = 180;

export const TOKEN_TTL_SECONDS = TOKEN_TTL_DAYS * 24 * 60 * 60;

/** The instant a token minted now stops being accepted. */
export const tokenExpiryFrom = (issuedAt = new Date()) =>
  new Date(issuedAt.getTime() + TOKEN_TTL_SECONDS * 1000);

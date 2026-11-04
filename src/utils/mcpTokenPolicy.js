/**
 * Lifetimes of the tokens the MCP OAuth flow issues, and the bounds an admin
 * may set them within. Pure: no I/O, so the rules are testable on their own.
 * src/utils/mcpTokenSettings.js is the part that reads and caches the stored
 * values.
 *
 * The Xtend REST API keeps its own 180-day token (src/utils/tokenTtl.js).
 * MCP does not: a short access token plus a rotating refresh token.
 */

export const MCP_SETTING_KEYS = {
  ACCESS_TTL: "mcp_access_token_ttl_seconds",
  REFRESH_TTL: "mcp_refresh_token_ttl_seconds",
};

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const MCP_TOKEN_DEFAULTS = {
  accessTtlSeconds: HOUR,
  refreshTtlSeconds: 7 * DAY,
};

export const MCP_TOKEN_BOUNDS = {
  accessTtlSeconds: { min: 5 * MINUTE, max: 24 * HOUR },
  refreshTtlSeconds: { min: HOUR, max: 180 * DAY },
};

/**
 * How long a just-rotated refresh token can still be presented without being
 * read as theft. Covers a client that retried after a lost response, or two
 * requests that refreshed at once.
 */
export const REFRESH_REUSE_GRACE_SECONDS = 20;

const toBoundedInt = (value, { min, max }) => {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  if (n < min || n > max) return null;
  return n;
};

/**
 * Stored values in, usable lifetimes out. Anything missing or outside its
 * bounds falls back to the default, so a bad row can never produce a token
 * that lives for a year or for zero seconds.
 */
export const resolveMcpTokenLifetimes = (stored = {}) => ({
  accessTtlSeconds:
    toBoundedInt(stored.accessTtlSeconds, MCP_TOKEN_BOUNDS.accessTtlSeconds) ??
    MCP_TOKEN_DEFAULTS.accessTtlSeconds,
  refreshTtlSeconds:
    toBoundedInt(
      stored.refreshTtlSeconds,
      MCP_TOKEN_BOUNDS.refreshTtlSeconds,
    ) ?? MCP_TOKEN_DEFAULTS.refreshTtlSeconds,
});

/**
 * Validate an admin's submission. Unlike resolve, this refuses: a value out of
 * range is an error the admin should see, not something to quietly replace.
 * Returns { value } or { error }.
 */
export const validateMcpTokenLifetimes = (input = {}) => {
  const accessTtlSeconds = toBoundedInt(
    input.accessTtlSeconds,
    MCP_TOKEN_BOUNDS.accessTtlSeconds,
  );
  if (accessTtlSeconds === null) {
    return {
      error: `Access token lifetime must be a whole number of seconds between ${MCP_TOKEN_BOUNDS.accessTtlSeconds.min} and ${MCP_TOKEN_BOUNDS.accessTtlSeconds.max}`,
    };
  }

  const refreshTtlSeconds = toBoundedInt(
    input.refreshTtlSeconds,
    MCP_TOKEN_BOUNDS.refreshTtlSeconds,
  );
  if (refreshTtlSeconds === null) {
    return {
      error: `Refresh token lifetime must be a whole number of seconds between ${MCP_TOKEN_BOUNDS.refreshTtlSeconds.min} and ${MCP_TOKEN_BOUNDS.refreshTtlSeconds.max}`,
    };
  }

  if (refreshTtlSeconds <= accessTtlSeconds) {
    return {
      error: "Refresh token lifetime must be longer than the access token's",
    };
  }

  return { value: { accessTtlSeconds, refreshTtlSeconds } };
};

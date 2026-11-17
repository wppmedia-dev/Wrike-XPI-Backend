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
  // Boolean. When true, an MCP access token is accepted on the REST API and the
  // Xtend API token on /mcp. Off by default.
  CROSS_TOKEN_ACCESS: "cross_token_access",
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
 * Layer an environment's overrides on top of the global lifetimes. Each field
 * is independent: an unset (null/undefined) or out-of-bounds override falls
 * through to the global value. If the merge would leave the refresh token no
 * longer than the access token (possible when the global value changed after
 * the override was saved), the overrides are ignored as a whole and the
 * global pair is used, so a token is never minted with an inverted pair.
 */
export const applyEnvironmentOverrides = (global, override = {}) => {
  const merged = {
    accessTtlSeconds:
      toBoundedInt(override?.accessTtlSeconds, MCP_TOKEN_BOUNDS.accessTtlSeconds) ??
      global.accessTtlSeconds,
    refreshTtlSeconds:
      toBoundedInt(override?.refreshTtlSeconds, MCP_TOKEN_BOUNDS.refreshTtlSeconds) ??
      global.refreshTtlSeconds,
  };
  return merged.refreshTtlSeconds > merged.accessTtlSeconds ? merged : global;
};

/**
 * Validate an environment's optional overrides. Blank (null, undefined, "")
 * means "inherit the global value". The pair is checked as it will actually
 * apply, i.e. against the global value for whichever side is left blank.
 * Returns { value: { accessTtlSeconds|null, refreshTtlSeconds|null } } or { error }.
 */
export const validateEnvironmentLifetimeOverrides = (input = {}, global) => {
  const blank = (v) => v === null || v === undefined || v === "";
  const parse = (v, bounds, label) => {
    if (blank(v)) return { value: null };
    const n = toBoundedInt(v, bounds);
    if (n === null) {
      return {
        error: `${label} must be a whole number of seconds between ${bounds.min} and ${bounds.max}, or left blank to use the global value`,
      };
    }
    return { value: n };
  };

  const access = parse(
    input.accessTtlSeconds,
    MCP_TOKEN_BOUNDS.accessTtlSeconds,
    "Access token lifetime",
  );
  if (access.error) return { error: access.error };
  const refresh = parse(
    input.refreshTtlSeconds,
    MCP_TOKEN_BOUNDS.refreshTtlSeconds,
    "Refresh token lifetime",
  );
  if (refresh.error) return { error: refresh.error };

  const effectiveAccess = access.value ?? global.accessTtlSeconds;
  const effectiveRefresh = refresh.value ?? global.refreshTtlSeconds;
  if (effectiveRefresh <= effectiveAccess) {
    return {
      error:
        "Refresh token lifetime must be longer than the access token's (blank fields use the global value)",
    };
  }
  return {
    value: {
      accessTtlSeconds: access.value,
      refreshTtlSeconds: refresh.value,
    },
  };
};

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

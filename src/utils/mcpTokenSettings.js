import { AppSettings } from "../controllers";
import {
  MCP_SETTING_KEYS,
  resolveMcpTokenLifetimes,
  validateMcpTokenLifetimes,
} from "./mcpTokenPolicy";

/**
 * The MCP token lifetimes in force right now: what the admin portal saved, held
 * in memory for a short while so the token endpoint does not read the database
 * on every call. A saved change is picked up at once on the instance that
 * saved it and within CACHE_MS on the others.
 */

const CACHE_MS = 30 * 1000;

let cached = null;
let cachedAt = 0;

export const invalidateMcpTokenLifetimes = () => {
  cached = null;
  cachedAt = 0;
};

export const getMcpTokenLifetimes = async () => {
  if (cached && Date.now() - cachedAt < CACHE_MS) return cached;

  try {
    const stored = await AppSettings.GetMany([
      MCP_SETTING_KEYS.ACCESS_TTL,
      MCP_SETTING_KEYS.REFRESH_TTL,
    ]);
    cached = resolveMcpTokenLifetimes({
      accessTtlSeconds: stored[MCP_SETTING_KEYS.ACCESS_TTL],
      refreshTtlSeconds: stored[MCP_SETTING_KEYS.REFRESH_TTL],
    });
    cachedAt = Date.now();
    return cached;
  } catch (err) {
    // The settings table being unreachable must not stop sign-ins. Serve the
    // last good values, or the defaults on a cold start.
    console.log("Could not read MCP token settings:", err?.message || err);
    return cached || resolveMcpTokenLifetimes();
  }
};

/** Validate and save new lifetimes. Throws a 400 for a value out of range. */
export const saveMcpTokenLifetimes = async (input, adminId) => {
  const { value, error } = validateMcpTokenLifetimes(input);
  if (error) throw { statusCode: 400, message: error };

  await AppSettings.Set(
    MCP_SETTING_KEYS.ACCESS_TTL,
    value.accessTtlSeconds,
    adminId,
  );
  await AppSettings.Set(
    MCP_SETTING_KEYS.REFRESH_TTL,
    value.refreshTtlSeconds,
    adminId,
  );
  invalidateMcpTokenLifetimes();
  return value;
};

/**
 * Cross-token access: whether an MCP access token may be used on the REST API
 * and the Xtend API token on /mcp. Off by default. Cached briefly like the
 * lifetimes; on a read failure it serves the last good value, else "off".
 */
let crossCached = null;
let crossCachedAt = 0;

export const getCrossTokenAccess = async () => {
  if (crossCached !== null && Date.now() - crossCachedAt < CACHE_MS) {
    return crossCached;
  }
  try {
    const stored = await AppSettings.Get(MCP_SETTING_KEYS.CROSS_TOKEN_ACCESS);
    crossCached = stored === true;
    crossCachedAt = Date.now();
    return crossCached;
  } catch (err) {
    console.log("Could not read cross-token access setting:", err?.message || err);
    return crossCached === true;
  }
};

export const saveCrossTokenAccess = async (enabled, adminId) => {
  if (typeof enabled !== "boolean") {
    throw { statusCode: 400, message: "enabled must be true or false" };
  }
  await AppSettings.Set(MCP_SETTING_KEYS.CROSS_TOKEN_ACCESS, enabled, adminId);
  crossCached = enabled;
  crossCachedAt = Date.now();
  return enabled;
};

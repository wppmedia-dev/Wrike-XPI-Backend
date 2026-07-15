import crypto from "crypto";
import redisClient from "../utils/redis";

const redis = redisClient;

/** Default TTL for auth entries: 24 hours */
const AUTH_TTL_SECONDS = 86400;

/* ── In-memory fallback (when Redis is unavailable) ─────────────── */
const memoryStore = new Map();
const memGet = (key) => {
  const e = memoryStore.get(key);
  if (!e) return null;
  if (Date.now() > e.expiresAt) {
    memoryStore.delete(key);
    return null;
  }
  return e.auth;
};
const memSet = (key, auth, ttl) => {
  memoryStore.set(key, { auth, expiresAt: Date.now() + ttl * 1000 });
};
const memDel = (key) => memoryStore.delete(key);

/**
 * Derive a stable auth key from the Wrike access token.
 */
const tokenHash = (wrikeToken) =>
  crypto.createHash("sha256").update(wrikeToken).digest("hex");

/**
 * Redis-backed auth store with dual-keying and in-memory fallback.
 *
 * Auth is stored under multiple keys so it survives a client dropping
 * the mcp-session-id header:
 *   1. mcp:auth:sid:{sessionId}  — primary (client preserves sessionId)
 *   2. mcp:auth:ip:{clientIp}    — IP fallback (sessionId changes)
 *   3. mcp:auth:token:{sha256}   — token-based (user identity)
 *
 * All Redis ops silently fall back to an in-memory store when
 * Redis is not available (local dev, temporary outages).
 */
export const sessionAuthStore = {
  async get(sessionId, clientIp) {
    if (sessionId) {
      const key = `mcp:auth:sid:${sessionId}`;
      const raw = await redis.getString(key).catch(() => null);
      if (raw) try { return JSON.parse(raw); } catch {}
      const fromMem = memGet(key);
      if (fromMem) return fromMem;
    }
    if (clientIp && clientIp !== "unknown") {
      const key = `mcp:auth:ip:${clientIp}`;
      const raw = await redis.getString(key).catch(() => null);
      if (raw) try { return JSON.parse(raw); } catch {}
      const fromMem = memGet(key);
      if (fromMem) return fromMem;
    }
    return null;
  },
  async set(sessionId, auth, clientIp) {
    if (!auth?.wrikeToken) return;
    const ttl = AUTH_TTL_SECONDS;
    const val = JSON.stringify(auth);
    if (sessionId) {
      const key = `mcp:auth:sid:${sessionId}`;
      await redis.setString(key, val, ttl).catch(() => {});
      memSet(key, auth, ttl);
    }
    const hashKey = `mcp:auth:token:${tokenHash(auth.wrikeToken)}`;
    await redis.setString(hashKey, val, ttl).catch(() => {});
    memSet(hashKey, auth, ttl);
    if (clientIp && clientIp !== "unknown") {
      const key = `mcp:auth:ip:${clientIp}`;
      await redis.setString(key, val, ttl).catch(() => {});
      memSet(key, auth, ttl);
    }
  },
  async delete(sessionId, clientIp) {
    const keys = [];
    if (sessionId) keys.push(`mcp:auth:sid:${sessionId}`);
    if (clientIp && clientIp !== "unknown")
      keys.push(`mcp:auth:ip:${clientIp}`);
    if (keys.length > 0) {
      await redis.delMany(keys).catch(() => {});
      keys.forEach((k) => memDel(k));
    }
  },
};

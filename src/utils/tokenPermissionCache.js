import redisClient from "./redis";

/**
 * The cache behind the per-token module permission gate, and the single place
 * that invalidates it.
 *
 * Split out of src/controllers/tokenPermissions.js so the keeper of the
 * permission rows can drop its own cache without the gate (which reads it on
 * every authenticated request) having to export anything, and so neither has
 * to import the other. This module deliberately imports nothing but redis.
 *
 * Two tiers sit in front of Postgres:
 *   L1  this process's Map, short TTL. Sub-millisecond, per-instance.
 *   L2  Redis, shared. Survives restarts and warms new instances.
 *
 * Invalidation clears L1 for THIS process and L2 for everyone. On a
 * multi-instance deploy, other instances keep their own L1 copy until it
 * expires, so TOKEN_PERM_MEMORY_TTL is the real upper bound on how long a
 * module an admin just switched off can still answer cluster-wide. Keep it
 * short; it is not the knob to raise for performance. TOKEN_PERM_TTL (L2) is,
 * because this module clears it for every instance at once.
 *
 * The entries cached here are permission decisions, so staleness is the whole
 * cost model: an unconfigured token's "unrestricted" answer is cached too, and
 * only src/controllers/tokenPermissions.js's save path makes it wrong.
 */

const seconds = (name, fallback) => {
  const parsed = parseInt(process.env[name], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const MATRIX_TTL = seconds("TOKEN_PERM_TTL", 300);
export const L1_TTL_MS = seconds("TOKEN_PERM_MEMORY_TTL", 30) * 1000;

/* ── Keys ──────────────────────────────────────────────────────────────── */

export const matrixKey = (tokenId) => `xpi:tokenperm:matrix:${tokenId}`;

/* ── L1: in-process cache ──────────────────────────────────────────────── */

const memory = new Map();

const memoryGet = (key) => {
  const hit = memory.get(key);
  if (!hit) return undefined;
  if (hit.expiresAt <= Date.now()) {
    memory.delete(key);
    return undefined;
  }
  return hit.value;
};

const memorySet = (key, value, ttlMs = L1_TTL_MS) => {
  memory.set(key, { value, expiresAt: Date.now() + ttlMs });
};

/**
 * Read through L1 → L2 → loader, writing back to both on the way out. Redis
 * being down is not an error: redisClient degrades to null, so the request
 * falls through to the loader and still succeeds.
 *
 * A falsy tokenId skips the cache entirely and just runs the loader. There
 * is nothing to key on, and callers that got this far should not be denied a
 * decision because of it.
 */
export const cachedMatrix = async (tokenId, loader) => {
  if (!tokenId) return await loader();

  const key = matrixKey(tokenId);

  const local = memoryGet(key);
  if (local !== undefined) return local;

  const remote = await redisClient.get(key);
  if (remote !== null && remote !== undefined) {
    memorySet(key, remote);
    return remote;
  }

  const fresh = await loader();
  memorySet(key, fresh);
  redisClient.set(key, fresh, MATRIX_TTL).catch(() => {});

  return fresh;
};

/* ── Invalidation ──────────────────────────────────────────────────────── */

/**
 * Drop one token's cached matrix, L1 and L2. Called by the controller after a
 * save, including the very first one, when the cached answer being replaced
 * is "this token has no rows, so it is unrestricted".
 *
 * Never throws: a Redis outage must not fail an admin's save. The write has
 * already committed, and the entry expires on its own within MATRIX_TTL.
 */
export const invalidateToken = async (tokenId) => {
  if (!tokenId) return;

  const key = matrixKey(tokenId);
  memory.delete(key);

  await redisClient.delMany([key]).catch((err) => {
    console.warn(
      new Date().toISOString(),
      `[token-perm] Redis invalidation failed for ${tokenId}, entry will expire in <=${MATRIX_TTL}s: ${
        err?.message || err
      }`,
    );
  });
};

/** Test/ops hook: forget every cached token matrix, across all tokens. */
export const invalidateAll = async () => {
  memory.clear();
  const keys = await redisClient.keys("xpi:tokenperm:*").catch(() => []);
  if (keys && keys.length) await redisClient.delMany(keys).catch(() => {});
};

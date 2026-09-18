import redisClient from "./redis";

/**
 * The two-tier cache behind a per-record permission matrix, as a factory.
 *
 * Two layers of module permissions are read on every authenticated request —
 * a token's matrix (src/utils/tokenPermissionCache.js) and the matrix of the
 * environment that token belongs to (src/utils/environmentModuleCache.js) —
 * and they want identical behaviour with different keys, TTL knobs and log
 * prefixes. This is that behaviour, once:
 *
 *   L1  this process's Map, short TTL. Sub-millisecond, per-instance.
 *   L2  Redis, shared. Survives restarts and warms new instances.
 *
 * Each caller gets its own key space, so a bug in how one caches cannot answer
 * a question about the other: the environment matrix and the token matrix are
 * separate decisions that happen to be cached the same way.
 *
 * Staleness is the whole cost model, because the entries are permission
 * decisions. Invalidation clears L1 for THIS process and L2 for everyone, and
 * is called by the controller that performed the write. On a multi-instance
 * deploy, other instances keep their own L1 copy until it expires, so the
 * memory TTL is the real upper bound on how long a grant an admin just
 * switched off can still answer cluster-wide. Keep it short; the L2 TTL is the
 * knob to raise, because invalidation clears that for every instance at once.
 */
export const createMatrixCache = ({
  /** Shows up in log lines, e.g. "token-perm". */
  name,
  /** L2 key prefix, also what invalidateAll sweeps. */
  keyPrefix,
  /** Env var naming the L2 TTL in seconds, and its default. */
  ttlVar,
  defaultTtl = 300,
  /** Env var naming the L1 TTL in seconds, and its default. */
  memoryTtlVar,
  defaultMemoryTtl = 30,
}) => {
  const seconds = (envName, fallback) => {
    const parsed = parseInt(process.env[envName], 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };

  const MATRIX_TTL = seconds(ttlVar, defaultTtl);
  const L1_TTL_MS = seconds(memoryTtlVar, defaultMemoryTtl) * 1000;

  const memory = new Map();

  const key = (id) => `${keyPrefix}${id}`;

  const memoryGet = (cacheKey) => {
    const hit = memory.get(cacheKey);
    if (!hit) return undefined;
    if (hit.expiresAt <= Date.now()) {
      memory.delete(cacheKey);
      return undefined;
    }
    return hit.value;
  };

  const memorySet = (cacheKey, value, ttlMs = L1_TTL_MS) => {
    memory.set(cacheKey, { value, expiresAt: Date.now() + ttlMs });
  };

  /**
   * Read through L1 → L2 → loader, writing back to both on the way out. Redis
   * being down is not an error: redisClient degrades to null, so the request
   * falls through to the loader and still succeeds.
   *
   * A falsy id skips the cache entirely and just runs the loader. There is
   * nothing to key on, and callers that got this far should not be denied a
   * decision because of it.
   */
  const cachedMatrix = async (id, loader) => {
    if (!id) return await loader();

    const cacheKey = key(id);

    const local = memoryGet(cacheKey);
    if (local !== undefined) return local;

    const remote = await redisClient.get(cacheKey);
    if (remote !== null && remote !== undefined) {
      memorySet(cacheKey, remote);
      return remote;
    }

    const fresh = await loader();
    memorySet(cacheKey, fresh);
    redisClient.set(cacheKey, fresh, MATRIX_TTL).catch(() => {});

    return fresh;
  };

  /**
   * Drop one record's cached matrix, L1 and L2. Called by the controller after
   * a save, including the very first one, when the cached answer being
   * replaced is "this record has no rows, so it is unrestricted".
   *
   * Never throws: a Redis outage must not fail an admin's save. The write has
   * already committed, and the entry expires on its own within MATRIX_TTL.
   */
  const invalidate = async (id) => {
    if (!id) return;

    const cacheKey = key(id);
    memory.delete(cacheKey);

    await redisClient.delMany([cacheKey]).catch((err) => {
      console.warn(
        new Date().toISOString(),
        `[${name}] Redis invalidation failed for ${id}, entry will expire in <=${MATRIX_TTL}s: ${
          err?.message || err
        }`,
      );
    });
  };

  /** Test/ops hook: forget every cached matrix of this kind. */
  const invalidateAll = async () => {
    memory.clear();
    const keys = await redisClient.keys(`${keyPrefix}*`).catch(() => []);
    if (keys && keys.length) await redisClient.delMany(keys).catch(() => {});
  };

  return {
    MATRIX_TTL,
    L1_TTL_MS,
    key,
    cachedMatrix,
    invalidate,
    invalidateAll,
  };
};

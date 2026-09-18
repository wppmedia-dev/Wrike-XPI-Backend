import { createMatrixCache } from "./matrixCache";

/**
 * The cache behind the per-token module permission gate, and the single place
 * that invalidates it.
 *
 * Split out of src/controllers/tokenPermissions.js so the keeper of the
 * permission rows can drop its own cache without the gate (which reads it on
 * every authenticated request) having to export anything, and so neither has
 * to import the other.
 *
 * The mechanics — L1 in-process, L2 Redis, read-through, invalidation — live in
 * src/utils/matrixCache.js and are shared with the environment layer's matrix
 * (src/utils/environmentModuleCache.js), which is cached identically but under
 * its own keys: those two matrices answer different questions about the same
 * request ("does this environment allow the module at all?" before "does this
 * token?"), and one being stale must never stand in for the other.
 *
 * Keys: `xpi:tokenperm:matrix:<tokenId>`.
 *
 * Staleness is the whole cost model, because the entries are permission
 * decisions: an unconfigured token's "unrestricted" answer is cached too, and
 * only src/controllers/tokenPermissions.js's save path makes it wrong.
 */
const cache = createMatrixCache({
  name: "token-perm",
  keyPrefix: "xpi:tokenperm:matrix:",
  ttlVar: "TOKEN_PERM_TTL",
  memoryTtlVar: "TOKEN_PERM_MEMORY_TTL",
});

export const MATRIX_TTL = cache.MATRIX_TTL;
export const L1_TTL_MS = cache.L1_TTL_MS;

export const matrixKey = cache.key;

/** A token's matrix, through L1 → L2 → the loader. */
export const cachedMatrix = cache.cachedMatrix;

/** Drop one token's cached matrix after an admin saves it. */
export const invalidateToken = cache.invalidate;

/** Test/ops hook: forget every cached token matrix, across all tokens. */
export const invalidateAll = cache.invalidateAll;

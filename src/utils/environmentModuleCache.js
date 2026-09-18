import { createMatrixCache } from "./matrixCache";

/**
 * The cache behind the per-environment module permission gate — the layer that
 * runs before a token's own matrix
 * (src/controllers/environmentModulePermissions.js), and the single place that
 * invalidates it.
 *
 * Its own key space, not the token matrix's: they answer different questions
 * about the same request ("does this environment allow the module at all?"
 * before "does this token?"), and one being stale must never stand in for the
 * other. Same mechanics, from src/utils/matrixCache.js.
 *
 * Keys: `xpi:envmod:matrix:<envId>`.
 */
const cache = createMatrixCache({
  name: "env-module",
  keyPrefix: "xpi:envmod:matrix:",
  ttlVar: "ENV_MODULE_PERM_TTL",
  memoryTtlVar: "ENV_MODULE_PERM_MEMORY_TTL",
});

export const MATRIX_TTL = cache.MATRIX_TTL;
export const L1_TTL_MS = cache.L1_TTL_MS;

export const matrixKey = cache.key;

/** An environment's module matrix, through L1 → L2 → the loader. */
export const cachedMatrix = cache.cachedMatrix;

/** Drop one environment's cached matrix after an admin saves it. */
export const invalidateEnvironmentModule = cache.invalidate;

/** Test/ops hook: forget every cached environment matrix. */
export const invalidateAll = cache.invalidateAll;

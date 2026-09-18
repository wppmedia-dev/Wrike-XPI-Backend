import models from "../../models";
import {
  MODULES,
  emptyMatrix,
  normaliseMatrix,
} from "../utils/tokenPermissionCatalog";
import {
  cachedMatrix,
  invalidateEnvironmentModule,
} from "../utils/environmentModuleCache";

/**
 * Module-level permissions for ENVIRONMENTS: the storage side of the layer
 * above a token's own matrix. Vocabulary (which modules, which actions) is
 * src/utils/tokenPermissionCatalog.js — the same list the token matrix uses,
 * on purpose, so "Campaign" means one thing in this console.
 *
 * A request has to pass both layers (src/middlewares/modulePermissions.js
 * applies environment first, then token), so these rows are a ceiling: an
 * environment that has Campaign switched off refuses every token in it,
 * whatever those tokens were granted. That is what makes this the place to
 * answer "may anybody in PROD touch master data?" once, instead of editing
 * every token.
 *
 * Every read answers with a `configured` flag next to the matrix, for the same
 * reason the token side does: for an environment "all false" and "never
 * configured" are different answers. An environment with no rows is
 * unrestricted, which is what keeps every environment working the moment this
 * deploys; collapsing the two would make a saved deny-all indistinguishable
 * from a fresh environment.
 */

const rowsToMatrix = (rows) => {
  const result = emptyMatrix();
  const rowByModule = Object.fromEntries(
    (rows || []).map((row) => [row.module, row]),
  );

  for (const mod of MODULES) {
    const row = rowByModule[mod.key];
    // No row for this module, so the all-false default stands.
    if (!row) continue;

    // Only the actions this module declares. A row written while the
    // catalogue said otherwise must not resurrect a grant that no longer
    // exists, so the catalogue decides on read as well as on write.
    for (const action of mod.actions) {
      result[mod.key][action] = !!row[`can_${action}`];
    }
  }

  return result;
};

/**
 * An environment's matrix, straight from Postgres, with the flag that says
 * whether anyone has ever restricted this environment. Always returns every
 * module, so the caller never has to merge a partial object.
 */
export const GetMatrix = async (envId) => {
  if (!envId)
    throw { statusCode: 400, message: "Environment id must not be empty!" };

  const rows = await models.EnvironmentModulePermissions.findAll({
    where: { env_id: envId },
    raw: true,
  });

  return { configured: rows.length > 0, matrix: rowsToMatrix(rows) };
};

/**
 * The same answer, through the two-tier cache. This is what the request gate
 * calls, so it runs on every authenticated REST call and every MCP tool call;
 * the uncached GetMatrix stays available for the console, which must never
 * show a stale matrix while an admin is editing it.
 */
export const GetMatrixCached = async (envId) =>
  cachedMatrix(envId, () => GetMatrix(envId));

/**
 * Write every module row for one environment, on the caller's transaction.
 *
 * One row per catalogue module, always all of them, whether or not the
 * environment was granted anything in that module: the presence of the rows is
 * what makes an environment governed. The catalogue decides which actions may
 * be recorded, so a row written while the catalogue said otherwise cannot
 * resurrect a grant.
 */
const writeMatrix = async (profileId, envId, matrix, transaction) => {
  for (const mod of MODULES) {
    const grant = matrix[mod.key];
    const payload = {
      can_read: !!grant.read,
      can_create: !!grant.create,
      can_update: !!grant.update,
      can_delete: !!grant.delete,
    };

    const existing = await models.EnvironmentModulePermissions.findOne({
      where: { env_id: envId, module: mod.key },
      transaction,
    });

    if (existing) {
      await existing.update(payload, { transaction, profile_id: profileId });
    } else {
      await models.EnvironmentModulePermissions.create(
        { env_id: envId, module: mod.key, ...payload },
        { transaction, profile_id: profileId },
      );
    }
  }
};

/**
 * Replace an environment's whole matrix in one transaction.
 *
 * Whole-matrix rather than per-cell: this is edited as one decision ("PROD may
 * read campaigns and nothing else"), and a partial write would leave the
 * environment in a combination nobody chose if one row failed.
 *
 * Writing a row for every module is also what flips the environment from
 * unrestricted to governed. See the `configured` note above.
 */
export const SetMatrix = async (profileId, envId, input) => {
  if (!envId)
    throw { statusCode: 400, message: "Environment id must not be empty!" };

  // The row has a foreign key, so an unknown id would fail on insert with a
  // database error rather than a message anybody can act on. Checked here, and
  // only the id is selected: this endpoint never needs the environment's
  // credentials.
  const environment = await models.WrikeCredentials.findOne({
    where: { id: envId },
    attributes: ["id"],
  });
  if (!environment)
    throw { statusCode: 404, message: "Environment not found." };

  const matrix = normaliseMatrix(input);

  await models.sequelize.transaction(async (transaction) => {
    await writeMatrix(profileId, envId, matrix, transaction);
  });

  // Including the very first save, when the cached answer being replaced is
  // "this environment has no rows, so it is unrestricted".
  await invalidateEnvironmentModule(envId);

  return { configured: true, matrix };
};

/**
 * Matrices for many environments at once: one query, for the environments
 * list's permission summary column.
 */
export const GetMatrixForEnvironments = async (envIds = []) => {
  if (!envIds.length) return {};

  const rows = await models.EnvironmentModulePermissions.findAll({
    where: { env_id: envIds },
    raw: true,
  });

  const byEnv = {};
  for (const row of rows) {
    (byEnv[row.env_id] ||= []).push(row);
  }

  const result = {};
  for (const envId of envIds) {
    const envRows = byEnv[envId] || [];
    result[envId] = {
      configured: envRows.length > 0,
      matrix: rowsToMatrix(envRows),
    };
  }

  return result;
};

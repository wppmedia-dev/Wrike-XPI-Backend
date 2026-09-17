import models from "../../models";
import {
  MODULES,
  emptyMatrix,
  normaliseMatrix,
} from "../utils/tokenPermissionCatalog";
import { cachedMatrix, invalidateToken } from "../utils/tokenPermissionCache";

/**
 * Module-level permissions for API tokens — the storage side. Vocabulary
 * (which modules, which actions) lives in src/utils/tokenPermissionCatalog.js.
 *
 * Every read here answers with a `configured` flag next to the matrix,
 * because for a token "all false" and "never configured" are different
 * answers: a token with no rows is unrestricted, while a token whose rows are
 * all false is denied everything. Collapsing the two into one shape would
 * make a saved "deny all" indistinguishable from a freshly issued token,
 * which is precisely the confusion this table exists to prevent.
 */

const rowsToMatrix = (rows) => {
  const result = emptyMatrix();
  const rowByModule = Object.fromEntries(
    (rows || []).map((row) => [row.module, row]),
  );

  for (const mod of MODULES) {
    const row = rowByModule[mod.key];
    // No row for this module — the all-false default stands.
    if (!row) continue;

    // Only the actions this module declares. A row written while the
    // catalogue said otherwise must not resurrect a grant that no longer
    // exists, so the catalogue decides on read as well as on write — the same
    // rule normaliseMatrix applies to what gets stored.
    for (const action of mod.actions) {
      result[mod.key][action] = !!row[`can_${action}`];
    }
  }

  return result;
};

/**
 * A token's matrix, straight from Postgres, with the flag that says whether
 * anyone has ever restricted this token. Always returns every module, so the
 * caller never has to merge a partial object.
 */
export const GetMatrix = async (tokenId) => {
  if (!tokenId)
    throw { statusCode: 400, message: "Token id must not be empty!" };

  const rows = await models.TokenPermissions.findAll({
    where: { token_id: tokenId },
    raw: true,
  });

  return { configured: rows.length > 0, matrix: rowsToMatrix(rows) };
};

/**
 * The same answer, through the two-tier cache. This is what the request gate
 * calls, so it runs on every authenticated REST call and every MCP tool call;
 * the uncached GetMatrix stays available for the admin console, which must
 * never show a stale matrix while an admin is editing it.
 */
export const GetMatrixCached = async (tokenId) =>
  cachedMatrix(tokenId, () => GetMatrix(tokenId));

/**
 * Replace a token's whole matrix in one transaction.
 *
 * Whole-matrix rather than per-cell: this is edited as one decision ("this
 * token may read and update campaigns, nothing else"), and a partial write
 * would leave the token with a combination nobody actually chose if one row
 * failed.
 *
 * Writing all five module rows is also what flips the token from
 * unrestricted to governed — see the `configured` note above.
 */
export const SetMatrix = async (profileId, tokenId, input) => {
  if (!tokenId)
    throw { statusCode: 400, message: "Token id must not be empty!" };

  const token = await models.UserTokens.findOne({ where: { id: tokenId } });
  if (!token) throw { statusCode: 404, message: "Token not found." };

  const matrix = normaliseMatrix(input);

  await models.sequelize.transaction(async (transaction) => {
    for (const mod of MODULES) {
      const grant = matrix[mod.key];
      const payload = {
        can_read: !!grant.read,
        can_create: !!grant.create,
        can_update: !!grant.update,
        can_delete: !!grant.delete,
      };

      const existing = await models.TokenPermissions.findOne({
        where: { token_id: tokenId, module: mod.key },
        transaction,
      });

      if (existing) {
        await existing.update(payload, { transaction, profile_id: profileId });
      } else {
        await models.TokenPermissions.create(
          { token_id: tokenId, module: mod.key, ...payload },
          { transaction, profile_id: profileId },
        );
      }
    }
  });

  await invalidateToken(tokenId);

  return { configured: true, matrix };
};

/**
 * Matrices for many tokens at once — one query, for the token list's
 * permission summary column.
 */
export const GetMatrixForTokens = async (tokenIds = []) => {
  if (!tokenIds.length) return {};

  const rows = await models.TokenPermissions.findAll({
    where: { token_id: tokenIds },
    raw: true,
  });

  const byToken = {};
  for (const row of rows) {
    (byToken[row.token_id] ||= []).push(row);
  }

  const result = {};
  for (const tokenId of tokenIds) {
    const tokenRows = byToken[tokenId] || [];
    result[tokenId] = {
      configured: tokenRows.length > 0,
      matrix: rowsToMatrix(tokenRows),
    };
  }

  return result;
};

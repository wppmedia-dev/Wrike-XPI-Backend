import models from "../../models";
import * as crypto from "../utils/crypto";
import { REFRESH_REUSE_GRACE_SECONDS } from "../utils/mcpTokenPolicy";

/**
 * Storage for the MCP OAuth flow's rotating refresh tokens. A "family" is one
 * sign-in: the user_tokens row that holds the encrypted Wrike credential, plus
 * the chain of refresh tokens issued from it. See
 * migrations/20261027000001-create-mcp-token-families.js and
 * 20261027000002-create-mcp-refresh-tokens.js for the layout.
 *
 * Every rejection is the same `invalid_grant` error with the same message, so
 * a caller cannot tell an unknown token from an expired, spent or revoked one.
 */

const invalidGrant = () => ({
  statusCode: 400,
  code: "invalid_grant",
  message: "Refresh token is invalid or expired",
});

const expiryFrom = (now, ttlSeconds) =>
  new Date(now.getTime() + ttlSeconds * 1000);

/**
 * The expiry shown in the admin console for an MCP token row is the refresh
 * token's, since that is when the integration stops working without a new
 * sign-in.
 */
const stampTokenExpiry = (tokenId, expiresAt, transaction) =>
  models.UserTokens.update(
    { token_expires_at: expiresAt, updated_at: new Date() },
    { where: { id: tokenId }, transaction },
  );

/**
 * Start a family for a freshly minted token row and hand back its first
 * refresh token.
 */
export const Issue = async ({ tokenId, dek, refreshTtlSeconds }) => {
  const now = new Date();
  const refreshToken = crypto.generateRefreshToken();
  const expiresAt = expiryFrom(now, refreshTtlSeconds);

  const familyId = await models.sequelize.transaction(async (transaction) => {
    const family = await models.McpTokenFamilies.create(
      { token_id: tokenId, created_at: now },
      { transaction },
    );
    await models.McpRefreshTokens.create(
      {
        family_id: family.id,
        token_hash: crypto.hashRefreshToken(refreshToken),
        wrapped_dek: crypto.wrapDekForRefreshToken(dek, refreshToken),
        expires_at: expiresAt,
        created_at: now,
      },
      { transaction },
    );
    await stampTokenExpiry(tokenId, expiresAt, transaction);
    return family.id;
  });

  return { familyId, refreshToken, refreshExpiresAt: expiresAt };
};

/**
 * Exchange a refresh token for the next one.
 *
 * Runs under a row lock on the presented token, so two requests (or two server
 * instances) presenting the same token are serialised by the database. The
 * second sees the first's `used_at` and is judged against the grace window.
 *
 * A token that was already used outside the grace window is a replay: either
 * the legitimate client or a thief holds a stale copy, and there is no telling
 * which, so the whole family is revoked and the user signs in again. That
 * revoke has to commit, which is why it is returned as a result rather than
 * thrown from inside the transaction.
 *
 * Resolves { familyId, tokenId, dek, refreshToken, refreshExpiresAt }.
 */
export const Rotate = async ({ refreshToken, refreshTtlSeconds }) => {
  if (typeof refreshToken !== "string" || !refreshToken) throw invalidGrant();

  const tokenHash = crypto.hashRefreshToken(refreshToken);
  const now = new Date();

  const outcome = await models.sequelize.transaction(async (transaction) => {
    const row = await models.McpRefreshTokens.findOne({
      where: { token_hash: tokenHash },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!row) return { invalid: true };

    const family = await models.McpTokenFamilies.findByPk(row.family_id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!family || family.revoked_at) return { invalid: true };
    if (row.expires_at <= now) return { invalid: true };

    if (row.used_at) {
      const sinceUse = (now.getTime() - row.used_at.getTime()) / 1000;
      if (sinceUse > REFRESH_REUSE_GRACE_SECONDS) {
        await family.update(
          { revoked_at: now, revoked_reason: "refresh_token_reuse" },
          { transaction },
        );
        return { invalid: true };
      }
    } else {
      await row.update({ used_at: now }, { transaction });
    }

    const dek = crypto.unwrapDekForRefreshToken(row.wrapped_dek, refreshToken);
    const nextToken = crypto.generateRefreshToken();
    const expiresAt = expiryFrom(now, refreshTtlSeconds);

    await models.McpRefreshTokens.create(
      {
        family_id: family.id,
        token_hash: crypto.hashRefreshToken(nextToken),
        wrapped_dek: crypto.wrapDekForRefreshToken(dek, nextToken),
        expires_at: expiresAt,
        created_at: now,
      },
      { transaction },
    );
    await family.update({ last_rotated_at: now }, { transaction });
    await stampTokenExpiry(family.token_id, expiresAt, transaction);

    return {
      familyId: family.id,
      tokenId: family.token_id,
      dek,
      refreshToken: nextToken,
      refreshExpiresAt: expiresAt,
    };
  });

  if (outcome.invalid) throw invalidGrant();
  return outcome;
};

/** Whether a family may still be used. False for unknown and revoked ones. */
export const IsFamilyActive = async (familyId) => {
  if (!familyId) return false;
  const family = await models.McpTokenFamilies.findByPk(familyId, {
    attributes: ["id", "revoked_at"],
  });
  return !!family && !family.revoked_at;
};

const revokeWhere = async (where, reason) => {
  const [affected] = await models.McpTokenFamilies.update(
    { revoked_at: new Date(), revoked_reason: reason },
    { where: { ...where, revoked_at: null } },
  );
  return affected;
};

/** RFC 7009: revoke the family a refresh token belongs to. Unknown is a no-op. */
export const RevokeByRefreshToken = async (refreshToken) => {
  if (typeof refreshToken !== "string" || !refreshToken) return 0;
  const row = await models.McpRefreshTokens.findOne({
    attributes: ["family_id"],
    where: { token_hash: crypto.hashRefreshToken(refreshToken) },
  });
  return row ? revokeWhere({ id: row.family_id }, "client_revoked") : 0;
};

/** Revoke every MCP sign-in behind a token row (admin action). */
export const RevokeByTokenId = (tokenId, reason = "admin_revoked") =>
  revokeWhere({ token_id: tokenId }, reason);

/** Housekeeping: drop refresh tokens that expired more than a day ago. */
export const PurgeExpired = async () => {
  const { Op } = models.Sequelize;
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return models.McpRefreshTokens.destroy({
    where: { expires_at: { [Op.lt]: cutoff } },
  });
};

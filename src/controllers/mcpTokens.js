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
export const Issue = async ({ tokenId, dek, refreshTtlSeconds, clientId = null }) => {
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

  // clientId is the registered OAuth client this sign-in came from (null for an
  // unregistered or pre-registry client). It only feeds the admin console's
  // connection status, so it is recorded AFTER the sign-in committed and its
  // failure is swallowed: a sign-in must never depend on it (for example when
  // the column's migration has not run yet).
  if (clientId) {
    try {
      await models.sequelize.query(
        "UPDATE mcp_token_families SET client_id = :clientId WHERE id = :familyId",
        { replacements: { clientId, familyId } },
      );
    } catch (err) {
      console.warn(
        new Date().toISOString(),
        `[mcp-tokens] could not record the client for sign-in ${familyId}: ${err?.message || err}`,
      );
    }
  }

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

/**
 * RFC 7009: revoke by family id, for a client that presents its (possibly
 * expired) ACCESS token instead of its refresh token. The caller has already
 * verified the token's signature, which is what vouches for the family id.
 */
export const RevokeFamily = async (familyId, reason = "client_revoked") =>
  familyId ? revokeWhere({ id: familyId }, reason) : 0;

/** Revoke every live MCP sign-in a registered OAuth client holds (admin action). */
export const RevokeByClient = async (clientId, reason = "admin_disconnected") => {
  if (!clientId) return 0;
  const [, meta] = await models.sequelize.query(
    `UPDATE mcp_token_families
        SET revoked_at = NOW(), revoked_reason = :reason
      WHERE client_id = :clientId AND revoked_at IS NULL`,
    { replacements: { clientId, reason } },
  );
  return meta?.rowCount ?? 0;
};

/**
 * Note that an access token of this sign-in was just used at /mcp. This is
 * what lets the admin console tell a client that is being used from one that
 * has gone quiet (or was disconnected on its own side without telling us).
 *
 * Built never to hurt the request that triggers it: fire-and-forget, written
 * at most once per TOUCH_EVERY_MS per sign-in (so a busy client costs one
 * small UPDATE a minute), and any failure is swallowed. If the column's
 * migration has not run, the first failure switches tracking off for this
 * process instead of failing on every request.
 */
const TOUCH_EVERY_MS = 60 * 1000;
const lastTouched = new Map();
let touchDisabled = false;

export const TouchFamily = (familyId) => {
  if (touchDisabled || !familyId) return;

  const now = Date.now();
  const last = lastTouched.get(familyId);
  if (last && now - last < TOUCH_EVERY_MS) return;
  lastTouched.set(familyId, now);

  // Bounded: forget the oldest entries rather than grow with every sign-in.
  if (lastTouched.size > 5000) {
    let drop = 1000;
    for (const key of lastTouched.keys()) {
      lastTouched.delete(key);
      if (--drop <= 0) break;
    }
  }

  Promise.resolve(
    models.sequelize.query(
      "UPDATE mcp_token_families SET last_used_at = NOW() WHERE id = :familyId",
      { replacements: { familyId } },
    ),
  ).catch((err) => {
    if ((err?.original?.code || err?.parent?.code) === "42703") {
      touchDisabled = true; // column missing: the migration has not run yet
      console.warn(
        new Date().toISOString(),
        "[mcp-tokens] last_used_at column missing; usage tracking is off until the migration runs and the process restarts",
      );
    } else {
      console.warn(
        new Date().toISOString(),
        `[mcp-tokens] could not record use of sign-in ${familyId}: ${err?.message || err}`,
      );
    }
  });
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

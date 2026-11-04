import models from "../../models";
import { connectionState, clientStatus } from "../utils/oauthClientStatus";

/**
 * Storage for dynamically registered OAuth clients (migration
 * 20261104000000-create-oauth-clients). The signed client_id stays the source
 * of truth for redirect_uris; this table exists so a registration can be
 * listed and revoked.
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isClientId = (id) => typeof id === "string" && UUID_PATTERN.test(id);

const PUBLIC_FIELDS = [
  "id",
  "client_name",
  "redirect_uris",
  "created_at",
  "expires_at",
  "last_used_at",
  "created_ip",
  "user_agent",
  "revoked_at",
  "revoked_by",
];

export const Register = async ({
  id,
  client_name,
  redirect_uris,
  expires_at,
  created_ip,
  user_agent,
}) =>
  models.OAuthClients.create({
    id,
    client_name: client_name || null,
    redirect_uris,
    expires_at: expires_at || null,
    created_ip: created_ip ? String(created_ip).slice(0, 64) : null,
    user_agent: user_agent ? String(user_agent).slice(0, 512) : null,
  });

/**
 * Registration state for a jti: "active", "revoked", or "unknown" (no row).
 * Throws on database errors so the caller decides how to degrade.
 */
export const GetStatus = async (id) => {
  if (!isClientId(id)) return "unknown";
  const row = await models.OAuthClients.findByPk(id, {
    attributes: ["id", "revoked_at"],
    raw: true,
  });
  if (!row) return "unknown";
  return row.revoked_at ? "revoked" : "active";
};

/** Best-effort "last seen" stamp; never throws. */
export const TouchLastUsed = async (id) => {
  if (!isClientId(id)) return;
  try {
    await models.OAuthClients.update(
      { last_used_at: new Date() },
      { where: { id } },
    );
  } catch {
    // Telemetry only.
  }
};

export const MAX_LIST_LIMIT = 500;

/* A sign-in is "live" while it is not revoked and still has a refresh token
   that has not expired. Same test McpTokens.Rotate applies before it will
   accept a refresh. */
const LIVE_SESSION_SQL = `f.revoked_at IS NULL AND EXISTS (
  SELECT 1 FROM mcp_refresh_tokens r WHERE r.family_id = f.id AND r.expires_at > NOW()
)`;

/**
 * Connection data for the clients on this page: how many sign-ins each has
 * ever made, how many are live, when it was last active and when a sign-in
 * was last ended. Keyed by client id.
 *
 * Resolves null (never throws) if it cannot be read, e.g. the migration that
 * adds mcp_token_families.client_id has not run yet. The list then falls back
 * to showing registrations only, as it did before.
 */
const sessionStatsFor = async (ids) => {
  if (!ids.length) return {};
  try {
    const found = await models.sequelize.query(
      `SELECT f.client_id AS client_id,
              COUNT(*)::int AS total_sessions,
              COUNT(*) FILTER (WHERE ${LIVE_SESSION_SQL})::int AS live_sessions,
              MAX(COALESCE(f.last_rotated_at, f.created_at)) AS last_active_at,
              MAX(f.revoked_at) AS last_disconnected_at
         FROM mcp_token_families f
        WHERE f.client_id IN (:ids)
        GROUP BY f.client_id`,
      { replacements: { ids }, type: models.Sequelize.QueryTypes.SELECT },
    );
    return Object.fromEntries(found.map((row) => [row.client_id, row]));
  } catch (err) {
    console.warn(
      new Date().toISOString(),
      `[oauth-clients] could not read connection data: ${err?.message || err}`,
    );
    return null;
  }
};

/** Whole-table counts of unrevoked, unexpired clients by connection state. */
const connectionCounts = async () => {
  try {
    const [row] = await models.sequelize.query(
      `WITH s AS (
         SELECT f.client_id,
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE ${LIVE_SESSION_SQL}) AS live
           FROM mcp_token_families f
          WHERE f.client_id IS NOT NULL
          GROUP BY f.client_id
       )
       SELECT
         COUNT(*) FILTER (WHERE COALESCE(s.live, 0) > 0)::int AS connected,
         COUNT(*) FILTER (WHERE COALESCE(s.total, 0) > 0 AND COALESCE(s.live, 0) = 0)::int AS disconnected,
         COUNT(*) FILTER (WHERE COALESCE(s.total, 0) = 0)::int AS registered
         FROM oauth_clients c
         LEFT JOIN s ON s.client_id = c.id
        WHERE c.revoked_at IS NULL AND (c.expires_at IS NULL OR c.expires_at > NOW())`,
      { type: models.Sequelize.QueryTypes.SELECT },
    );
    return row || null;
  } catch {
    return null;
  }
};

/**
 * Newest first. `counts` covers the whole table regardless of the filter, so
 * the console's stat cards stay correct when revoked rows are hidden. Each row
 * carries `connection` (null if it could not be read) and `status`, the single
 * value the console displays (src/utils/oauthClientStatus.js).
 */
export const List = async ({ includeRevoked = false, limit = 50, offset = 0 } = {}) => {
  const { Op } = models.Sequelize;
  const where = includeRevoked ? {} : { revoked_at: null };
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), MAX_LIST_LIMIT);
  const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);

  const [{ rows, count }, active, revoked, byConnection] = await Promise.all([
    models.OAuthClients.findAndCountAll({
      where,
      attributes: PUBLIC_FIELDS,
      order: [["created_at", "DESC"]],
      limit: safeLimit,
      offset: safeOffset,
      raw: true,
    }),
    models.OAuthClients.count({ where: { revoked_at: null } }),
    models.OAuthClients.count({ where: { revoked_at: { [Op.ne]: null } } }),
    connectionCounts(),
  ]);

  const stats = await sessionStatsFor(rows.map((row) => row.id));

  const withStatus = rows.map((row) => {
    const s = stats?.[row.id];
    const connection = stats
      ? {
          state: connectionState({
            totalSessions: s?.total_sessions || 0,
            liveSessions: s?.live_sessions || 0,
          }),
          live_sessions: s?.live_sessions || 0,
          total_sessions: s?.total_sessions || 0,
          last_active_at: s?.last_active_at || null,
          last_disconnected_at: s?.last_disconnected_at || null,
        }
      : null;
    return { ...row, connection, status: clientStatus(row, connection?.state) };
  });

  return {
    rows: withStatus,
    total: count,
    limit: safeLimit,
    offset: safeOffset,
    counts: { active, revoked, ...(byConnection || {}) },
  };
};

export const Revoke = async (id, adminId) => {
  if (!isClientId(id)) {
    throw { statusCode: 400, message: "Invalid client id" };
  }
  const row = await models.OAuthClients.findByPk(id);
  if (!row) throw { statusCode: 404, message: "OAuth client not found" };
  if (row.revoked_at) return row.get({ plain: true });

  await row.update({ revoked_at: new Date(), revoked_by: adminId || null });
  return row.get({ plain: true });
};

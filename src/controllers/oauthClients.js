import models from "../../models";

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

/**
 * Newest first. `counts` covers the whole table regardless of the filter, so
 * the console's stat cards stay correct when revoked rows are hidden.
 */
export const List = async ({ includeRevoked = false, limit = 50, offset = 0 } = {}) => {
  const { Op } = models.Sequelize;
  const where = includeRevoked ? {} : { revoked_at: null };
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), MAX_LIST_LIMIT);
  const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);

  const [{ rows, count }, active, revoked] = await Promise.all([
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
  ]);

  return {
    rows,
    total: count,
    limit: safeLimit,
    offset: safeOffset,
    counts: { active, revoked },
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

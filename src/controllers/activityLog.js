import models from "../../models";

const { Op } = models.Sequelize;

/**
 * API/MCP call activity log — storage only. Written on essentially every
 * authenticated request, so every query here stays index-backed and cheap;
 * policy (what gets logged, retention) lives in src/utils/activityLog.js.
 */

const ROW_ATTRS = [
  "id",
  "env_id",
  "environment_name",
  "token_id",
  "surface",
  "actor_email",
  "action",
  "resource",
  "method",
  "allowed",
  "code",
  "status_code",
  "ip",
  "category",
  "mcp_tool",
  "request_payload",
  "response_payload",
  "created_at",
];

export const Record = async (entry) => {
  return models.ApiActivityLogs.create({
    env_id: entry.envId || null,
    environment_name: entry.environmentName || null,
    token_id: entry.tokenId || null,
    surface: entry.surface,
    actor_email: entry.actorEmail || null,
    action: entry.action || null,
    resource: entry.resource,
    method: entry.method || null,
    allowed: !!entry.allowed,
    code: entry.code || null,
    status_code: entry.statusCode ?? null,
    ip: entry.ip || null,
    category: entry.category || null,
    request_payload: entry.requestPayload || null,
    response_payload: entry.responsePayload || null,
  });
};

/**
 * Fill in the MCP tool(s) a request called, on the row that request already
 * wrote — plus the outcome, when a tool call was refused.
 *
 * An update rather than a second row, because the request row is the unit
 * everything else here counts (the retention sweep, the console's totals, the
 * filters): adding a row per tool call would double the log for one visible
 * call. The exception is the outcome. The request row is written before the
 * tool call happens, so it records "the connection was authorised" — and a
 * refused tool call would otherwise sit behind a green row. When one was
 * refused, that is what the row now says.
 *
 * Never throws: the row exists and is correct without this, and an agent's
 * call must not fail because the log could not be annotated.
 */
export const SetMcpTools = async (id, { tool, code } = {}) => {
  if (!id || !tool) return null;

  const patch = { mcp_tool: String(tool).slice(0, 255) };
  if (code) {
    patch.allowed = false;
    patch.code = code;
  }

  try {
    return await models.ApiActivityLogs.update(patch, { where: { id } });
  } catch (err) {
    console.error(
      new Date().toISOString(),
      "[activity-log] could not record the MCP tool on row",
      id,
      err?.message || err,
    );
    return null;
  }
};

/**
 * Paginated, filtered listing for the admin console. `limit` is capped hard
 * (this table can get large fast) rather than trusting the caller.
 */
export const List = async ({
  envId,
  tokenId,
  actorEmail,
  surface,
  allowed,
  from,
  to,
  limit = 50,
  offset = 0,
} = {}) => {
  const where = {};
  if (envId) where.env_id = envId;
  // Exact match, not a like: a token id is a UUID, and "show me everything
  // this token did" means that token, not anything whose id contains it.
  if (tokenId) where.token_id = tokenId;
  if (actorEmail)
    where.actor_email = { [Op.iLike]: `%${actorEmail.trim().toLowerCase()}%` };
  if (surface) where.surface = surface;
  if (allowed !== undefined && allowed !== null) where.allowed = allowed;
  if (from || to) {
    where.created_at = {};
    if (from) where.created_at[Op.gte] = new Date(from);
    if (to) where.created_at[Op.lte] = new Date(to);
  }

  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  const safeOffset = Math.max(parseInt(offset, 10) || 0, 0);

  const { rows, count } = await models.ApiActivityLogs.findAndCountAll({
    attributes: ROW_ATTRS,
    where,
    order: [["created_at", "DESC"]],
    limit: safeLimit,
    offset: safeOffset,
  });

  return {
    rows: rows.map((r) => r.get({ plain: true })),
    total: count,
    limit: safeLimit,
    offset: safeOffset,
  };
};

/** Quick counts for the console's summary strip. */
export const Summary = async ({ envId, tokenId, since } = {}) => {
  const where = {};
  if (envId) where.env_id = envId;
  if (tokenId) where.token_id = tokenId;
  if (since) where.created_at = { [Op.gte]: new Date(since) };

  const [total, denied] = await Promise.all([
    models.ApiActivityLogs.count({ where }),
    models.ApiActivityLogs.count({ where: { ...where, allowed: false } }),
  ]);

  return { total, denied, allowed: total - denied };
};

/** Hard-deletes rows older than `cutoff`. Used by the retention sweep. */
export const DeleteOlderThan = async (cutoff) => {
  return models.ApiActivityLogs.destroy({
    where: { created_at: { [Op.lt]: cutoff } },
  });
};

import models from "../../models";
import { agentIdentityOf, agentFilterClause } from "../utils/agentIdentity";

const { Op } = models.Sequelize;

/**
 * Adds the derived client label to a row already shaped by `.get({ plain:
 * true })`. Computed here rather than stored on write, because the
 * detection rules (src/utils/agentIdentity.js) are meant to improve over
 * time as new clients show up — a stored value would go stale the moment a
 * pattern changes, while a derived one is always read with today's rules.
 */
const withAgent = (row) => ({ ...row, client: agentIdentityOf(row).label });

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
  "reference_id",
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
    reference_id: entry.referenceId || null,
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
 *
 * `referenceId` is set only when a tool call was refused: the refusal is the
 * error response on this surface, and the row is where the reference the agent
 * was given has to end up (see src/mcp/tools/permission.js).
 */
export const SetMcpTools = async (id, { tool, code, referenceId } = {}) => {
  if (!id || !tool) return null;

  const patch = { mcp_tool: String(tool).slice(0, 255) };
  if (code) {
    patch.allowed = false;
    patch.code = code;
  }
  if (referenceId) patch.reference_id = String(referenceId).slice(0, 32);

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
 * The created_at bounds for a from/to filter. A bare "YYYY-MM-DD" `to` means
 * the whole of that day, so it runs to the end of it instead of stopping at
 * midnight and dropping every row from that day.
 */
const createdAtRange = (from, to) => {
  const range = {};
  if (from) range[Op.gte] = new Date(from);
  if (to) {
    const end = new Date(to);
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(to).trim()))
      end.setUTCHours(23, 59, 59, 999);
    range[Op.lte] = end;
  }
  return range;
};

/**
 * Paginated, filtered listing for the admin console. `limit` is capped hard
 * (this table can get large fast) rather than trusting the caller.
 */
export const List = async ({
  envId,
  tokenId,
  search,
  surface,
  allowed,
  agent,
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
  // One box, several columns. The consoles have a single search field, and
  // what gets typed into it is whatever the person already has in hand: the
  // caller's email, or the reference id out of an error message. Both are
  // matched as substrings, case-insensitively, so "XPI-8ZTJ" is enough —
  // the point of a reference that gets read out loud is that half of it
  // should still find the row.
  if (search) {
    const term = `%${String(search).trim().toLowerCase()}%`;
    where[Op.or] = [
      { actor_email: { [Op.iLike]: term } },
      { reference_id: { [Op.iLike]: term } },
    ];
  }
  if (surface) where.surface = surface;
  if (allowed !== undefined && allowed !== null) where.allowed = allowed;
  if (from || to) where.created_at = createdAtRange(from, to);
  // Derived from the stored User-Agent header, not its own column — see
  // src/utils/agentIdentity.js for why (no MCP client-info handshake is
  // captured anywhere in this codebase, so the HTTP header is what there is).
  // Kept in its own Op.and entry rather than merged into `where` directly:
  // the search clause above already owns the top-level Op.or key, and a
  // second assignment to the same Symbol key would silently replace it
  // instead of combining with it.
  if (agent) {
    const clause = agentFilterClause(agent, { Op });
    if (clause) where[Op.and] = [...(where[Op.and] || []), clause];
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
    rows: rows.map((r) => withAgent(r.get({ plain: true }))),
    total: count,
    limit: safeLimit,
    offset: safeOffset,
  };
};

/**
 * The full filtered set, for CSV export — same filters as `List` but with no
 * page: pagination is a table-reading concern, and an export is "everything
 * that matches", not "whatever page I'm looking at". Capped at EXPORT_MAX
 * rows so one export can't try to pull the whole table into memory; a filter
 * narrow enough to export usefully (a day, an environment, a token) will
 * never get near that cap.
 */
const EXPORT_MAX = 20000;

export const ExportRows = async ({
  envId,
  tokenId,
  search,
  surface,
  allowed,
  agent,
  from,
  to,
} = {}) => {
  const where = {};
  if (envId) where.env_id = envId;
  if (tokenId) where.token_id = tokenId;
  if (search) {
    const term = `%${String(search).trim().toLowerCase()}%`;
    where[Op.or] = [
      { actor_email: { [Op.iLike]: term } },
      { reference_id: { [Op.iLike]: term } },
    ];
  }
  if (surface) where.surface = surface;
  if (allowed !== undefined && allowed !== null) where.allowed = allowed;
  if (from || to) where.created_at = createdAtRange(from, to);
  if (agent) {
    const clause = agentFilterClause(agent, { Op });
    if (clause) where[Op.and] = [...(where[Op.and] || []), clause];
  }

  const rows = await models.ApiActivityLogs.findAll({
    attributes: ROW_ATTRS,
    where,
    order: [["created_at", "DESC"]],
    limit: EXPORT_MAX,
  });

  return rows.map((r) => withAgent(r.get({ plain: true })));
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

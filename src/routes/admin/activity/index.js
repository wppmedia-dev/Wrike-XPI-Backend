import { verifyAdminJWT } from "../../../middlewares/adminAuth";
import { ActivityLog } from "../../../controllers";
import { retentionDays } from "../../../utils/activityLog";
import { toCsv } from "../../../utils/csv";
import { ACTIVITY_CSV_COLUMNS, toCsvRow } from "../../../utils/activityCsv";
import { ListSchema, SummarySchema, ExportSchema } from "./schema";

/**
 * Read-only admin API over the API/MCP call activity log
 * (src/utils/activityLog.js writes it; src/controllers/activityLog.js
 * stores it). Nothing here writes a row: the log only ever grows through
 * real traffic, and only ever shrinks through the retention sweep.
 */
export const adminActivityRoute = (fastify, opts, done) => {
  const guard = { preHandler: [verifyAdminJWT] };

  const fail = (reply, err) =>
    reply.code(err?.statusCode || 400).send({
      success: false,
      message: err?.message || err || "Request failed",
    });

  // So the console can show "kept for 30 days" instead of a magic number.
  fastify.get("/config", guard, async (req, reply) =>
    reply
      .code(200)
      .send({ success: true, data: { retention_days: retentionDays() } }),
  );

  fastify.get(
    "/summary",
    { ...SummarySchema, ...guard },
    async (req, reply) => {
      try {
        const data = await ActivityLog.Summary({
          envId: req.query.env_id,
          // Kept alongside the list filter so the summary strip above a
          // token-filtered list counts that token's calls, not every call in
          // the environment.
          tokenId: req.query.token_id,
          since: req.query.since,
        });
        return reply.code(200).send({ success: true, data });
      } catch (err) {
        return fail(reply, err);
      }
    },
  );

  fastify.get("/", { ...ListSchema, ...guard }, async (req, reply) => {
    try {
      const {
        env_id,
        token_id,
        search,
        surface,
        allowed,
        from,
        to,
        limit,
        offset,
      } = req.query;

      const data = await ActivityLog.List({
        envId: env_id,
        tokenId: token_id,
        search,
        surface,
        allowed: allowed === undefined ? undefined : allowed === "true",
        from,
        to,
        limit,
        offset,
      });

      return reply.code(200).send({ success: true, data });
    } catch (err) {
      return fail(reply, err);
    }
  });

  // Same filters as the list, no pagination: a CSV export means "everything
  // that matches", not "whatever page is on screen" (ActivityLog.ExportRows
  // caps the row count so this stays bounded).
  fastify.get(
    "/export",
    { ...ExportSchema, ...guard },
    async (req, reply) => {
      try {
        const {
          env_id,
          token_id,
          search,
          surface,
          allowed,
          from,
          to,
        } = req.query;

        const rows = await ActivityLog.ExportRows({
          envId: env_id,
          tokenId: token_id,
          search,
          surface,
          allowed: allowed === undefined ? undefined : allowed === "true",
          from,
          to,
        });

        const csv = toCsv(rows.map(toCsvRow), ACTIVITY_CSV_COLUMNS);
        const stamp = new Date().toISOString().slice(0, 10);

        return reply
          .code(200)
          .header("Content-Type", "text/csv; charset=utf-8")
          .header(
            "Content-Disposition",
            `attachment; filename="activity-log-${stamp}.csv"`,
          )
          .send(csv);
      } catch (err) {
        return fail(reply, err);
      }
    },
  );

  done();
};

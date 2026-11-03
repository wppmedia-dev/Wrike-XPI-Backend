import { verifyAdminJWT } from "../../../middlewares/adminAuth";
import { SyncRuns } from "../../../controllers";
import {
  SYNC_SOURCES,
  describeSource,
  runSyncSource,
} from "../../../utils/syncSources";
import { RunSchema } from "./schema";

const fail = (reply, err, fallback) =>
  reply.code(err?.statusCode || 400).send({
    success: false,
    message: err?.message || fallback,
  });

export const adminSyncRoute = (fastify, opts, done) => {
  const guard = { preHandler: [verifyAdminJWT] };

  // GET /admin/sync: every source, with its last run.
  fastify.get("/", guard, async (req, reply) => {
    try {
      const latest = await SyncRuns.LatestPerSource();
      const sources = SYNC_SOURCES.map((source) => ({
        ...describeSource(source),
        last_run: latest[source.key] || null,
      }));

      return reply.code(200).send({
        success: true,
        message: "Sync sources fetched",
        data: { sources },
      });
    } catch (err) {
      return fail(reply, err, "Failed to fetch sync sources");
    }
  });

  // POST /admin/sync/:source/run
  fastify.post(
    "/:source/run",
    { ...RunSchema, ...guard },
    async (req, reply) => {
      try {
        const run = await runSyncSource(req.params.source, {
          admin: req.adminUser,
          ip: req.ip,
          userAgent: req.headers["user-agent"],
        });
        const ok = run.status !== "failed";
        return reply.code(ok ? 200 : 502).send({
          success: ok,
          message: ok
            ? run.status === "partial"
              ? "Synced with some items missing"
              : "Synced successfully"
            : run.error || "Sync failed",
          data: { run },
        });
      } catch (err) {
        return fail(reply, err, "Failed to run sync");
      }
    },
  );

  done();
};

import { SyncRuns } from "../../../controllers";
import {
  SYNC_SOURCES,
  describeSource,
  runSyncSource,
} from "../../../utils/syncSources";
import { RunSchema } from "../../admin/sync/schema";
import {
  verifyPortalJWT,
  requirePasswordChanged,
  requirePortalPermission,
} from "../../../middlewares/portalAuth";

/**
 * Portal API over the manual syncs, behind the "sync" portal-permission module
 * (src/utils/portalPermissionCatalog.js):
 *
 *   read    GET  /                  every source, with its last run
 *   update  POST /:source/run       run one now
 *
 * The same page as the admin console's (src/routes/admin/sync/index.js), on the
 * same sources, the same runner and the same stored last-run record, gated by
 * the portal grant instead of an admin login. A sync is service-wide, so there
 * is no per-environment scoping; that is why it is its own grant.
 */
export const portalSyncRoute = (fastify, opts, done) => {
  const guardFor = (action) => ({
    preHandler: [
      verifyPortalJWT,
      requirePasswordChanged,
      requirePortalPermission("sync", action),
    ],
  });
  const canRead = guardFor("read");
  const canUpdate = guardFor("update");

  const fail = (reply, err, fallback) =>
    reply.code(err?.statusCode || 400).send({
      success: false,
      message: err?.message || fallback,
    });

  // GET /portal/sync
  fastify.get("/", canRead, async (req, reply) => {
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

  // POST /portal/sync/:source/run
  fastify.post(
    "/:source/run",
    { ...RunSchema, ...canUpdate },
    async (req, reply) => {
      try {
        const run = await runSyncSource(req.params.source, {
          // Stored with the run, so the admin console shows it was a portal user.
          admin: { username: `portal:${req.portalUser?.username}` },
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

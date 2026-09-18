import { ActivityLog, Tokens, WrikeCredentials } from "../../../controllers";
import { retentionDays } from "../../../utils/activityLog";
import {
  isEnvironmentInScope,
  scopedEnvironmentIdsFor,
} from "../../../utils/portalScope";
import { ListSchema, SummarySchema } from "../../admin/activity/schema";
import {
  verifyPortalJWT,
  requirePasswordChanged,
  requirePortalPermission,
} from "../../../middlewares/portalAuth";

/**
 * Read-only portal API over the API/MCP call activity log — the same data
 * src/routes/admin/activity/index.js exposes to the super-admin console,
 * gated here behind the "activity_logs" portal-permission module instead of
 * verifyAdminJWT (src/utils/portalPermissionCatalog.js declares it
 * read-only, so there is no write route to mirror).
 *
 * Row-level scoping: unlike the admin console (which can see every
 * environment), a portal user may only query env_id values they actually
 * own — the same ownership check src/routes/portal/environments/handlers/
 * getEnvironments.js applies (admin-role portal users see everything,
 * matching GetMyEnvironments there). Without this, activity_logs:read would
 * let a portal user read another tenant's log rows just by passing a
 * different env_id.
 */
/**
 * The value that matches no row, for "you asked for something outside your
 * scope".
 *
 * It has to be a well-formed UUID: env_id and token_id are UUID columns, so a
 * readable string like "__none__" is not castable by Postgres and fails the
 * query outright (22P02) instead of quietly matching nothing. The nil UUID is
 * the one value no row can legitimately carry.
 */
const NO_MATCH_UUID = "00000000-0000-0000-0000-000000000000";

export const portalActivityRoute = (fastify, opts, done) => {
  const guard = {
    preHandler: [
      verifyPortalJWT,
      requirePasswordChanged,
      requirePortalPermission("activity_logs", "read"),
    ],
  };

  const fail = (reply, err) =>
    reply.code(err?.statusCode || 400).send({
      success: false,
      message: err?.message || err || "Request failed",
    });

  /**
   * Resolves the env_id list this portalUser may query. Admin-role portal
   * users are unrestricted (null = "no filter", same meaning ActivityLog.List
   * /Summary already give an absent envId). Everyone else is restricted to
   * their own environments — a requested env_id outside that set is dropped
   * rather than honoured, so the caller silently gets "no rows" instead of
   * someone else's data.
   */
  const resolveAllowedEnvId = async (portalUser, requestedEnvId) => {
    if (portalUser.role === "admin") return requestedEnvId;

    const owned = await WrikeCredentials.GetByOwnerId(portalUser.id);
    const ownedIds = new Set((owned || []).map((env) => env.id));

    if (requestedEnvId) {
      return ownedIds.has(requestedEnvId) ? requestedEnvId : NO_MATCH_UUID;
    }
    // No env_id requested: summary/list would otherwise span every
    // environment. A portal user has no "all environments" view, so fall
    // back to their first owned environment, or a sentinel that matches
    // nothing if they own none.
    return owned?.[0]?.id || NO_MATCH_UUID;
  };

  /**
   * The same rule for a token filter, which the API Tokens page's "Activity
   * logs" action sends. A token outside the caller's environments matches
   * nothing rather than being reported as forbidden, using the same sentinel
   * the environment filter above uses, so the screen shows an empty log
   * instead of confirming that another tenant's token exists.
   *
   * The token's own environment comes back with it, because a non-admin's
   * default environment is their first one: without this, filtering to a token
   * that lives in their second environment would return nothing and look like
   * the token had never been used.
   */
  const resolveAllowedTokenFilter = async (
    portalUser,
    requestedTokenId,
    requestedEnvId,
  ) => {
    if (!requestedTokenId) return { tokenId: undefined, envId: requestedEnvId };

    const record = await Tokens.GetRecord(requestedTokenId);
    if (!record) return { tokenId: NO_MATCH_UUID, envId: requestedEnvId };
    if (portalUser.role === "admin") {
      return { tokenId: requestedTokenId, envId: requestedEnvId };
    }

    const envIds = await scopedEnvironmentIdsFor(portalUser);
    if (!isEnvironmentInScope(envIds, record.env_id)) {
      return { tokenId: NO_MATCH_UUID, envId: requestedEnvId };
    }

    return {
      tokenId: requestedTokenId,
      envId: requestedEnvId || record.env_id,
    };
  };

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
        const envId = await resolveAllowedEnvId(
          req.portalUser,
          req.query.env_id,
        );
        const tokenFilter = await resolveAllowedTokenFilter(
          req.portalUser,
          req.query.token_id,
          envId,
        );
        const data = await ActivityLog.Summary({
          envId: tokenFilter.envId,
          tokenId: tokenFilter.tokenId,
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
      const { search, surface, allowed, from, to, limit, offset } = req.query;
      const envId = await resolveAllowedEnvId(req.portalUser, req.query.env_id);
      const tokenFilter = await resolveAllowedTokenFilter(
        req.portalUser,
        req.query.token_id,
        envId,
      );

      const data = await ActivityLog.List({
        envId: tokenFilter.envId,
        tokenId: tokenFilter.tokenId,
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

  done();
};

export default portalActivityRoute;

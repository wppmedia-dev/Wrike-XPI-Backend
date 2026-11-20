import {
  getMcpTokenLifetimes,
  saveMcpTokenLifetimes,
  getCrossTokenAccess,
  saveCrossTokenAccess,
} from "../../../utils/mcpTokenSettings";
import {
  MCP_TOKEN_BOUNDS,
  MCP_TOKEN_DEFAULTS,
} from "../../../utils/mcpTokenPolicy";
import {
  SetMcpTokenLifetimesSchema,
  SetCrossTokenAccessSchema,
} from "../../admin/settings/schema";
import {
  verifyPortalJWT,
  requirePasswordChanged,
  requirePortalPermission,
} from "../../../middlewares/portalAuth";

/**
 * Portal API over the Security page's two service-wide settings, behind the
 * "security" portal-permission module (src/utils/portalPermissionCatalog.js):
 *
 *   read    GET /mcp-tokens · GET /cross-token-access
 *   update  PUT /mcp-tokens · PUT /cross-token-access
 *
 * The same settings, validation and caches as the admin console's
 * (src/routes/admin/settings/index.js), gated by the portal grant instead of an
 * admin login. They are global, not per environment, so there is no ownership
 * scoping to do, which is why this is a grant of its own rather than part of
 * Environments. The admin's MFA card is not here: it is that admin's own account.
 *
 * Writes pass a null updater: app_settings.updated_by references admin_users,
 * not portal_users, as in the portal's other write routes.
 */
export const portalSecurityRoute = (fastify, opts, done) => {
  const guardFor = (action) => ({
    preHandler: [
      verifyPortalJWT,
      requirePasswordChanged,
      requirePortalPermission("security", action),
    ],
  });
  const canRead = guardFor("read");
  const canUpdate = guardFor("update");

  const ok = (reply, data, message) =>
    reply.code(200).send({ success: true, message, data });

  const fail = (reply, err) =>
    reply.code(err?.statusCode || 400).send({
      success: false,
      message: err?.message || err || "Request failed",
    });

  // The values with the bounds and defaults, so the form checks against what
  // the server enforces rather than its own copy.
  const mcpTokenSettings = async () => ({
    ...(await getMcpTokenLifetimes()),
    bounds: MCP_TOKEN_BOUNDS,
    defaults: MCP_TOKEN_DEFAULTS,
  });

  fastify.get("/mcp-tokens", canRead, async (req, reply) => {
    try {
      return ok(reply, await mcpTokenSettings(), "MCP token settings");
    } catch (err) {
      return fail(reply, err);
    }
  });

  fastify.put(
    "/mcp-tokens",
    { ...SetMcpTokenLifetimesSchema, ...canUpdate },
    async (req, reply) => {
      try {
        await saveMcpTokenLifetimes(req.body, null);
        return ok(
          reply,
          await mcpTokenSettings(),
          "Saved. New lifetimes apply to tokens issued from now on.",
        );
      } catch (err) {
        return fail(reply, err);
      }
    },
  );

  fastify.get("/cross-token-access", canRead, async (req, reply) => {
    try {
      return ok(
        reply,
        { enabled: await getCrossTokenAccess() },
        "Cross-token access setting",
      );
    } catch (err) {
      return fail(reply, err);
    }
  });

  fastify.put(
    "/cross-token-access",
    { ...SetCrossTokenAccessSchema, ...canUpdate },
    async (req, reply) => {
      try {
        const enabled = await saveCrossTokenAccess(req.body.enabled, null);
        return ok(reply, { enabled }, "Saved.");
      } catch (err) {
        return fail(reply, err);
      }
    },
  );

  done();
};

export default portalSecurityRoute;

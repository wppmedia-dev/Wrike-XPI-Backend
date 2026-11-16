import { OAuthClients } from "../../../controllers";
import { defaultIdleAfterSeconds } from "../../../utils/oauthClientStatus";
import { scopedEnvironmentIdsFor } from "../../../utils/portalScope";
import {
  IdParamSchema,
  ListSchema,
} from "../../admin/oauthClients/schema";
import {
  verifyPortalJWT,
  requirePasswordChanged,
  requirePortalPermission,
} from "../../../middlewares/portalAuth";

/**
 * Portal API over the registered OAuth clients (MCP connectors), behind the
 * "oauth_clients" portal-permission module (src/utils/portalPermissionCatalog.js):
 *
 *   read    GET  /                  the clients visible to this user
 *   update  POST /:id/disconnect    end this user's environments' sign-ins
 *   delete  POST /:id/revoke        revoke the registration
 *
 * There is no create: a client registers itself (POST /oauth/register), so
 * there is nothing for a console to create.
 *
 * Row-level scoping, applied on every route: a client belongs to nobody, but
 * each of its sign-ins belongs to an environment, so a portal user sees a
 * client when one of its sign-ins is in an environment mapped to them, and sees
 * only those sign-ins' state (OAuthClients.ListScoped). The two writes are held
 * to the same boundary: Disconnect ends only the sign-ins in the user's own
 * environments, and Revoke, which is global, is refused when any other
 * environment has used the client. A client outside the user's scope answers
 * 404, never 403, so the response does not confirm that it exists (and
 * portalFetch signs a user out on a 403).
 *
 * Admin-role portal users are unrestricted, as in every other portal module.
 */
export const portalOAuthClientsRoute = (fastify, opts, done) => {
  const guardFor = (action) => ({
    preHandler: [
      verifyPortalJWT,
      requirePasswordChanged,
      requirePortalPermission("oauth_clients", action),
    ],
  });
  const canRead = guardFor("read");
  const canUpdate = guardFor("update");
  const canDelete = guardFor("delete");

  const isAdminRole = (portalUser) => portalUser?.role === "admin";

  const fail = (reply, err, fallback) =>
    reply.code(err?.statusCode || 400).send({
      success: false,
      message: err?.message || fallback,
    });

  // GET /portal/oauth-clients?include_revoked=true&limit=500&offset=0
  fastify.get("/", { ...ListSchema, ...canRead }, async (req, reply) => {
    try {
      const { include_revoked, limit, offset } = req.query || {};
      const options = {
        includeRevoked: include_revoked === "true" || include_revoked === "1",
        limit,
        offset,
        idleAfterSeconds: defaultIdleAfterSeconds(),
      };

      const data = isAdminRole(req.portalUser)
        ? await OAuthClients.List(options)
        : await OAuthClients.ListScoped({
            ...options,
            envIds: await scopedEnvironmentIdsFor(req.portalUser),
          });

      return reply.code(200).send({
        success: true,
        message: "OAuth clients fetched",
        data,
      });
    } catch (err) {
      return fail(reply, err, "Failed to fetch OAuth clients");
    }
  });

  // POST /portal/oauth-clients/:id/disconnect
  fastify.post(
    "/:id/disconnect",
    { ...IdParamSchema, ...canUpdate },
    async (req, reply) => {
      try {
        const result = isAdminRole(req.portalUser)
          ? await OAuthClients.Disconnect(req.params.id)
          : await OAuthClients.DisconnectScoped(
              req.params.id,
              await scopedEnvironmentIdsFor(req.portalUser),
            );
        req.log.info(
          {
            oauthClientId: result.id,
            signIns: result.disconnected,
            portalUser: req.portalUser?.username,
          },
          "OAuth client disconnected from the portal",
        );
        return reply.code(200).send({
          success: true,
          message: result.disconnected
            ? `Ended ${result.disconnected} sign-in(s)`
            : "No live sign-ins to end",
          data: result,
        });
      } catch (err) {
        return fail(reply, err, "Failed to disconnect OAuth client");
      }
    },
  );

  // POST /portal/oauth-clients/:id/revoke
  fastify.post(
    "/:id/revoke",
    { ...IdParamSchema, ...canDelete },
    async (req, reply) => {
      try {
        const client = isAdminRole(req.portalUser)
          ? await OAuthClients.Revoke(req.params.id, null)
          : await OAuthClients.RevokeScoped(
              req.params.id,
              await scopedEnvironmentIdsFor(req.portalUser),
            );
        req.log.info(
          {
            oauthClientId: client.id,
            signIns: client.disconnected,
            portalUser: req.portalUser?.username,
          },
          "OAuth client revoked from the portal",
        );
        return reply.code(200).send({
          success: true,
          message: "OAuth client revoked",
          data: {
            id: client.id,
            revoked_at: client.revoked_at,
            disconnected: client.disconnected,
          },
        });
      } catch (err) {
        return fail(reply, err, "Failed to revoke OAuth client");
      }
    },
  );

  done();
};

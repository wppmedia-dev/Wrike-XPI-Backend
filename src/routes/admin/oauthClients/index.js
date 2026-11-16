import { verifyAdminJWT } from "../../../middlewares/adminAuth";
import { OAuthClients } from "../../../controllers";
import { IdParamSchema, ListSchema } from "./schema";

import { defaultIdleAfterSeconds } from "../../../utils/oauthClientStatus";

/**
 * Admin API behind /api/v1/admin/oauth-clients: the dynamically registered
 * OAuth clients (POST /oauth/register) and the switch to revoke one.
 *
 * Revoking a client stops it from starting or completing new sign-ins
 * (/oauth/authorize, /oauth/token). XPI tokens it already obtained are
 * separate records; revoke those from the Tokens view.
 */
export const adminOAuthClientsRoute = (fastify, opts, done) => {
  const guard = { preHandler: [verifyAdminJWT] };

  const fail = (reply, err, fallback) =>
    reply.code(err?.statusCode || 400).send({
      success: false,
      message: err?.message || fallback,
    });

  // GET /admin/oauth-clients?include_revoked=true&limit=50&offset=0
  fastify.get("/", { ...ListSchema, ...guard }, async (req, reply) => {
    try {
      const { include_revoked, limit, offset } = req.query || {};
      const data = await OAuthClients.List({
        includeRevoked: include_revoked === "true" || include_revoked === "1",
        limit,
        offset,
        idleAfterSeconds: defaultIdleAfterSeconds(),
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

  // POST /admin/oauth-clients/:id/disconnect: end its live sign-ins and keep
  // the registration.
  fastify.post("/:id/disconnect", { ...IdParamSchema, ...guard }, async (req, reply) => {
    try {
      const result = await OAuthClients.Disconnect(req.params.id);
      req.log.info(
        { oauthClientId: result.id, signIns: result.disconnected, admin: req.adminUser?.username },
        "OAuth client disconnected",
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
  });

  // POST /admin/oauth-clients/:id/revoke
  fastify.post("/:id/revoke", { ...IdParamSchema, ...guard }, async (req, reply) => {
    try {
      const client = await OAuthClients.Revoke(req.params.id, req.adminUser?.id);
      req.log.info(
        { oauthClientId: client.id, admin: req.adminUser?.username },
        "OAuth client revoked",
      );
      return reply.code(200).send({
        success: true,
        message: "OAuth client revoked",
        data: client,
      });
    } catch (err) {
      return fail(reply, err, "Failed to revoke OAuth client");
    }
  });

  done();
};

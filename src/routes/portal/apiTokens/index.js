import { Tokens, TokenPermissions } from "../../../controllers";
import { catalog } from "../../../utils/tokenPermissionCatalog";
import {
  isEnvironmentInScope,
  scopedEnvironmentIdsFor,
} from "../../../utils/portalScope";
import { summarisePermissions } from "../../../utils/tokenPermissionSummary";
import {
  verifyPortalJWT,
  requirePasswordChanged,
  requirePortalPermission,
} from "../../../middlewares/portalAuth";
import { IdParamSchema, SetPermissionsSchema, SetStatusSchema } from "./schema";

/**
 * API tokens, managed from the portal: /api/v1/portal/api-tokens.
 *
 * Everything here is scoped to the environments the caller can see
 * (src/utils/portalScope.js, the same rule the Environments page uses), so a
 * portal user administers exactly the tokens belonging to their own
 * environments and nothing else.
 *
 * Every route carries one of the three grants of the `api_tokens` module from
 * src/utils/portalPermissionCatalog.js:
 *
 *   GET    /                 read   list the tokens of my environments
 *   GET    /catalog          read   the module vocabulary the matrix editor draws
 *   GET    /:id/permissions  read   one token's matrix, uncached
 *   PUT    /:id/permissions  update edit a token's module matrix
 *   PUT    /:id/status       delete switch a token off, or back on
 *   DELETE /:id              delete switch a token off
 *
 * There is no create route, and no create grant. A token is minted in exactly
 * two places: the token service's root login page, and an MCP client's OAuth
 * flow. Both of them exchange a Wrike authorization code for one, which is
 * something only a person signing in can produce, so a console can offer a
 * button that starts that sign-in but never a route that issues a token. The
 * button existed for a while and was removed: a control that cannot do the
 * thing it is named after is worse than no control.
 *
 * Availability is the delete grant's business in both directions. Switching a
 * token off and switching it back on are one lever with two positions, and a
 * caller trusted to take an integration out of service is the same caller who
 * has to be able to put it back; splitting that across two grants produced a
 * state nobody could explain (switchable off, never on). Update is what the
 * matrix is for.
 *
 * Delete is a switch-off, not a row removal. The row is the only copy of the
 * encrypted Wrike credential inside it, so deleting it would break whoever is
 * still calling with that token with no record of why, which is also why the
 * admin console has no hard delete either.
 */

export const portalApiTokensRoute = (fastify, opts, done) => {
  const authGuard = [verifyPortalJWT, requirePasswordChanged];
  const canRead = [...authGuard, requirePortalPermission("api_tokens", "read")];
  const canUpdate = [
    ...authGuard,
    requirePortalPermission("api_tokens", "update"),
  ];
  const canDelete = [
    ...authGuard,
    requirePortalPermission("api_tokens", "delete"),
  ];

  const ok = (reply, data, message) =>
    reply.code(200).send({ success: true, message, data });

  const fail = (reply, err) =>
    reply.code(err?.statusCode || 400).send({
      success: false,
      message: err?.message || err || "Request failed",
    });

  /**
   * A token the caller is allowed to act on, or a 404.
   *
   * 404 rather than 403 for a token outside their environments, on purpose:
   * confirming that some other environment's token exists is itself something
   * this user has not been given. The id is a UUID they would have to guess,
   * and this makes guessing useless.
   */
  const scopedToken = async (portalUser, tokenId) => {
    const record = await Tokens.GetRecord(tokenId);
    if (!record) throw { statusCode: 404, message: "Token not found." };

    const envIds = await scopedEnvironmentIdsFor(portalUser);
    if (!isEnvironmentInScope(envIds, record.env_id)) {
      throw { statusCode: 404, message: "Token not found." };
    }

    return record;
  };

  // GET /portal/api-tokens
  fastify.get("/", { preHandler: canRead }, async (req, reply) => {
    try {
      const envIds = await scopedEnvironmentIdsFor(req.portalUser);
      const tokens = await Tokens.ListForEnvironments(envIds);
      const matrices = await TokenPermissions.GetMatrixForTokens(
        tokens.map((token) => token.id),
      );

      return ok(
        reply,
        tokens.map((token) => ({
          ...token,
          permissions: summarisePermissions(matrices[token.id]),
        })),
        "Tokens retrieved",
      );
    } catch (err) {
      return fail(reply, err);
    }
  });

  // GET /portal/api-tokens/catalog
  fastify.get("/catalog", { preHandler: canRead }, async (req, reply) =>
    ok(reply, catalog()),
  );

  // GET /portal/api-tokens/:id/permissions
  fastify.get(
    "/:id/permissions",
    { ...IdParamSchema, preHandler: canRead },
    async (req, reply) => {
      try {
        await scopedToken(req.portalUser, req.params.id);

        // Uncached, like the admin console's read: the editor has to show what
        // is stored right now, and the cached copy exists for the request-path
        // gate, not for a screen someone is about to change.
        return ok(reply, await TokenPermissions.GetMatrix(req.params.id));
      } catch (err) {
        return fail(reply, err);
      }
    },
  );

  // PUT /portal/api-tokens/:id/permissions
  fastify.put(
    "/:id/permissions",
    { ...SetPermissionsSchema, preHandler: canUpdate },
    async (req, reply) => {
      try {
        await scopedToken(req.portalUser, req.params.id);

        // No profile id: token_permissions.created_by and updated_by are
        // foreign keys to admin_users, and this caller is a portal_users row.
        // Passing their id would fail on the constraint, so the write is
        // attributed to nobody rather than to the wrong table. What changed is
        // still recorded on the row itself (updated_at) and in the activity log
        // of whoever calls the token next.
        const data = await TokenPermissions.SetMatrix(
          null,
          req.params.id,
          req.body?.permissions,
        );

        return ok(
          reply,
          { ...data, permissions: summarisePermissions(data) },
          "Permissions updated.",
        );
      } catch (err) {
        return fail(reply, err);
      }
    },
  );

  // PUT /portal/api-tokens/:id/status — the delete grant, in both directions:
  // the switch that takes a token out of service is the same switch that puts
  // it back, and update is what the matrix is for.
  fastify.put(
    "/:id/status",
    { ...SetStatusSchema, preHandler: canDelete },
    async (req, reply) => {
      try {
        await scopedToken(req.portalUser, req.params.id);

        const { is_active: isActive } = req.body;
        const updated = await Tokens.SetStatus(req.params.id, isActive);
        if (!updated) throw { statusCode: 404, message: "Token not found." };

        return ok(
          reply,
          { id: req.params.id, is_active: isActive },
          `Token ${isActive ? "activated" : "deactivated"}.`,
        );
      } catch (err) {
        return fail(reply, err);
      }
    },
  );

  // DELETE /portal/api-tokens/:id
  fastify.delete(
    "/:id",
    { ...IdParamSchema, preHandler: canDelete },
    async (req, reply) => {
      try {
        const record = await scopedToken(req.portalUser, req.params.id);

        // Already off: nothing to do, and no second write to explain later.
        if (!record.is_active) {
          return ok(
            reply,
            { id: req.params.id, is_active: false },
            "Token is already off.",
          );
        }

        const updated = await Tokens.SetStatus(req.params.id, false);
        if (!updated) throw { statusCode: 404, message: "Token not found." };

        return ok(
          reply,
          { id: req.params.id, is_active: false },
          "Token deactivated. Its record is kept, so anyone still calling with it gets a clear 401.",
        );
      } catch (err) {
        return fail(reply, err);
      }
    },
  );

  done();
};

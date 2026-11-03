import { Tokens, TokenPermissions } from "../../../controllers";
import { catalog } from "../../../utils/tokenPermissionCatalog";
import {
  isEnvironmentInScope,
  scopedEnvironmentIdsFor,
} from "../../../utils/portalScope";
import { parseTokenFilters } from "../../../utils/tokenFilters";
import { summarisePermissions } from "../../../utils/tokenPermissionSummary";
import {
  verifyPortalJWT,
  requirePasswordChanged,
  requirePortalPermission,
} from "../../../middlewares/portalAuth";
import {
  IdParamSchema,
  ListSchema,
  SetPermissionsSchema,
  SetStatusSchema,
} from "./schema";

/**
 * API tokens, managed from the portal: /api/v1/portal/api-tokens.
 *
 * Everything here is scoped to the environments the caller can see
 * (src/utils/portalScope.js, the same rule the Environments page uses), so a
 * portal user administers exactly the tokens belonging to their own
 * environments and nothing else.
 *
 * Every route carries one of the two grants of the `api_tokens` module from
 * src/utils/portalPermissionCatalog.js:
 *
 *   GET    /                 read   list the tokens of my environments
 *   GET    /catalog          read   the module vocabulary the matrix editor draws
 *   GET    /:id/permissions  read   one token's matrix, uncached
 *   PUT    /:id/permissions  update edit a token's module matrix
 *   PUT    /:id/status       update switch a token off, or back on
 *
 * There is no create route, and no create grant. A token is minted in exactly
 * two places: the token service's root login page, and an MCP client's OAuth
 * flow. Both of them exchange a Wrike authorization code for one, which is
 * something only a person signing in can produce, so a console can offer a
 * button that starts that sign-in but never a route that issues a token. The
 * button existed for a while and was removed: a control that cannot do the
 * thing it is named after is worse than no control.
 *
 * Availability is the update grant's business, in both directions. Switching a
 * token off and switching it back on are one lever with two positions, and both
 * are the same kind of act as editing the matrix above them: a narrowing of what
 * a token may do, reversible from this page. Splitting the two positions across
 * two grants produced a state nobody could explain (switchable off, never on),
 * and giving availability a grant of its own produced a different one, a Delete
 * tick on a page where nothing is ever deleted. So this module has one write
 * grant and it is update.
 *
 * There is no DELETE route, for the same reason delete has no grant. The write
 * behind both is a switch-off that keeps the record, because the row holds the
 * only copy of the encrypted Wrike credential and removing it would break
 * whoever is still calling with that token with no record of why. A verb that
 * deletes nothing is a worse name for that write, and the admin console's
 * DELETE /api/v1/admin/tokens/:id is where the verb still lives for anyone
 * scripting against it.
 */

export const portalApiTokensRoute = (fastify, opts, done) => {
  const authGuard = [verifyPortalJWT, requirePasswordChanged];
  const canRead = [...authGuard, requirePortalPermission("api_tokens", "read")];
  const canUpdate = [
    ...authGuard,
    requirePortalPermission("api_tokens", "update"),
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
  // GET /portal/api-tokens: this user's tokens, filtered server-side.
  //
  // The scope comes first and the filters second: the environments decide
  // which rows this caller may see at all, and the filters then narrow that
  // set. Nothing a query parameter says can widen the scope.
  fastify.get(
    "/",
    { ...ListSchema, preHandler: canRead },
    async (req, reply) => {
      try {
        const envIds = await scopedEnvironmentIdsFor(req.portalUser);
        const data = await Tokens.ListForConsole({
          envIds,
          filters: parseTokenFilters(req.query),
        });

        return ok(reply, data, "Tokens retrieved");
      } catch (err) {
        return fail(reply, err);
      }
    },
  );

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

  // PUT /portal/api-tokens/:id/status — the Active switch in the list, and the
  // only route here that writes anything except a matrix.
  //
  // Gated by the update grant, in both directions, because the two positions of
  // one lever cannot sensibly be told apart: a caller trusted to take an
  // integration out of service has to be the caller trusted to put it back, or
  // the portal can strand a token it switched off. Scoped by the same check the
  // matrix write uses, so a token outside this user's environments is a 404.
  fastify.put(
    "/:id/status",
    { ...SetStatusSchema, preHandler: canUpdate },
    async (req, reply) => {
      try {
        await scopedToken(req.portalUser, req.params.id);

        const { is_active: isActive } = req.body;
        const updated = await Tokens.SetStatus(req.params.id, isActive);
        if (!updated) throw { statusCode: 404, message: "Token not found." };

        return ok(
          reply,
          { id: req.params.id, is_active: isActive },
          `Token ${isActive ? "reactivated" : "deactivated"}.`,
        );
      } catch (err) {
        return fail(reply, err);
      }
    },
  );

  done();
};

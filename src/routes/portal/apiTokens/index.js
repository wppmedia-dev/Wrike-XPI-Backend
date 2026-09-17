import { Tokens, TokenPermissions } from "../../../controllers";
import { findRedirectionURL } from "../../../utils/wrikeRedirect";
import { catalog } from "../../../utils/tokenPermissionCatalog";
import {
  isEnvironmentInScope,
  scopedEnvironmentsFor,
  scopedEnvironmentIdsFor,
} from "../../../utils/portalScope";
import { summarisePermissions } from "../../../utils/tokenPermissionSummary";
import {
  verifyPortalJWT,
  requirePasswordChanged,
  requirePortalPermission,
} from "../../../middlewares/portalAuth";
import {
  ConnectSchema,
  IdParamSchema,
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
 * Every route carries one of the four grants of the `api_tokens` module from
 * src/utils/portalPermissionCatalog.js:
 *
 *   GET    /              read    list the tokens of my environments
 *   GET    /catalog       read    the module vocabulary the matrix editor draws
 *   GET    /environments  read    my environments, to choose one at create time
 *   GET    /:id/permissions read  one token's matrix, uncached
 *   POST   /connect       create  start the Wrike sign-in that issues one
 *   PUT    /:id/permissions update edit a token's module matrix
 *   PUT    /:id/status    update  switch a token on or off
 *   DELETE /:id           delete  switch a token off
 *
 * The reads beyond the list exist so this page never has to call another
 * module's endpoints. The create picker could have asked the Environments page's
 * API for the list, but a user granted api_tokens without environments:read
 * would then get a 403 from an unrelated module, and portalFetch treats 403 as
 * an expired session and signs them out. Everything this page needs is served
 * from here, under this module's own grant.
 *
 * Create cannot mint a token on its own. Issuing one means exchanging a Wrike
 * authorization code, which only a person signing in to Wrike can produce, so
 * this route does the part it can: it validates the environment and hands back
 * the consent URL to send the browser to. The mint itself happens on the way
 * back, in the token service's existing callback, and the credentials are shown
 * once on that page. The token is then attributed to the environment it was
 * requested for, and labelled "Portal" in the admin console so an admin can
 * tell where it came from.
 *
 * Delete is a switch-off, not a row removal. The row is the only copy of the
 * encrypted Wrike credential inside it, so deleting it would break whoever is
 * still calling with that token with no record of why, which is also why the
 * admin console has no hard delete either.
 */

/** What the token the portal issues is labelled as in the admin console. */
export const PORTAL_TOKEN_CLIENT_NAME = "Portal";

export const portalApiTokensRoute = (fastify, opts, done) => {
  const authGuard = [verifyPortalJWT, requirePasswordChanged];
  const canRead = [...authGuard, requirePortalPermission("api_tokens", "read")];
  const canCreate = [
    ...authGuard,
    requirePortalPermission("api_tokens", "create"),
  ];
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

  // GET /portal/api-tokens/environments
  fastify.get("/environments", { preHandler: canRead }, async (req, reply) => {
    try {
      const environments = await scopedEnvironmentsFor(req.portalUser);

      // Names and ids only. This list exists to populate a picker, and the
      // environments module is where credentials are read (with its own
      // grant) for anyone who is allowed to see them.
      return ok(
        reply,
        environments.map((env) => ({
          id: env.id,
          environment_name: env.environment_name,
          is_active: !!env.is_active,
        })),
        "Environments retrieved",
      );
    } catch (err) {
      return fail(reply, err);
    }
  });

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

  // POST /portal/api-tokens/connect
  fastify.post(
    "/connect",
    { ...ConnectSchema, preHandler: canCreate },
    async (req, reply) => {
      try {
        const { env_id: envId } = req.body;

        const envIds = await scopedEnvironmentIdsFor(req.portalUser);
        if (!isEnvironmentInScope(envIds, envId)) {
          throw {
            statusCode: 403,
            message: "Forbidden: that environment is not yours to use",
          };
        }

        // Builds the Wrike consent URL for this environment, with our callback
        // as the redirect target: the same URL the root login page sends a
        // browser to. `extra.client_name` rides inside the signed state and is
        // what labels the token once the callback mints it.
        const { redirectUrl, selectedEnvironment } = findRedirectionURL(
          {
            environmentId: envId,
            extra: { client_name: PORTAL_TOKEN_CLIENT_NAME },
          },
          fastify,
        );

        return ok(
          reply,
          { url: redirectUrl, environment_name: selectedEnvironment || null },
          "Sign in to Wrike to issue this token",
        );
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

  // PUT /portal/api-tokens/:id/status
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

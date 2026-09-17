import { verifyAdminJWT } from "../../../middlewares/adminAuth";
import { Tokens, TokenPermissions } from "../../../controllers";
import { catalog } from "../../../utils/tokenPermissionCatalog";
import { summarisePermissions } from "../../../utils/tokenPermissionSummary";

import { IdParamSchema, SetPermissionsSchema, SetStatusSchema } from "./schema";

/**
 * Admin API behind /api/v1/admin/tokens: the console's view of the token
 * records this service has issued, and the only place their module
 * permissions are edited.
 *
 * Two things this module deliberately never does. It never returns a token's
 * secret material (see Tokens.ListAll). An admin identifies a token by its
 * row id, which is also what its permissions are keyed on. And it never reads
 * permissions through the cache: the cached read exists for the request-path
 * gate (src/middlewares/tokenPermissions.js), while an admin editing a matrix
 * has to see what is in Postgres right now or a save would look like it did
 * nothing.
 */
export const adminTokensRoute = (fastify, opts, done) => {
  const guard = { preHandler: [verifyAdminJWT] };

  const ok = (reply, data, message) =>
    reply.code(200).send({ success: true, message, data });

  const fail = (reply, err) =>
    reply.code(err?.statusCode || 400).send({
      success: false,
      message: err?.message || err || "Request failed",
    });

  // GET /admin/tokens: every token, with the permission summary the list
  // column shows. One extra query for all of them, not one per row.
  fastify.get("/", guard, async (req, reply) => {
    try {
      const tokens = await Tokens.ListAll();
      const matrices = await TokenPermissions.GetMatrixForTokens(
        tokens.map((token) => token.id),
      );

      return ok(
        reply,
        tokens.map((token) => ({
          ...token,
          permissions: summarisePermissions(matrices[token.id]),
        })),
      );
    } catch (err) {
      return fail(reply, err);
    }
  });

  // GET /admin/tokens/permissions/catalog: the module vocabulary, fetched by
  // the console rather than duplicated in the frontend.
  fastify.get("/permissions/catalog", guard, async (req, reply) =>
    ok(reply, catalog()),
  );

  // POST /admin/tokens/connect used to live here, and does not any more.
  //
  // A token is minted in exactly two places: the token service's root login
  // page, and an MCP client's OAuth flow. Both exchange a Wrike authorization
  // code for one, and only a person signing in can produce that code, so a
  // console can start that sign-in but can never issue a token itself. The
  // route existed only to serve a Create button that redirected to Wrike, which
  // is not a create feature.

  // GET /admin/tokens/:id/permissions: uncached on purpose, see above.
  fastify.get(
    "/:id/permissions",
    { ...IdParamSchema, ...guard },
    async (req, reply) => {
      try {
        const record = await Tokens.GetRecord(req.params.id);
        if (!record) throw { statusCode: 404, message: "Token not found." };

        return ok(reply, await TokenPermissions.GetMatrix(req.params.id));
      } catch (err) {
        return fail(reply, err);
      }
    },
  );

  // PUT /admin/tokens/:id/permissions: replaces the whole matrix, and is what
  // moves a token from unrestricted to governed for the first time.
  fastify.put(
    "/:id/permissions",
    { ...SetPermissionsSchema, ...guard },
    async (req, reply) => {
      try {
        const data = await TokenPermissions.SetMatrix(
          req.adminUser.id,
          req.params.id,
          req.body?.permissions,
        );

        return ok(reply, data, "Permissions updated.");
      } catch (err) {
        return fail(reply, err);
      }
    },
  );

  // PUT /admin/tokens/:id/status: the Active switch in the list. Kept
  // separate from the full record (there is no "full record" to resend) and
  // from the permissions route, because switching a token off is a different
  // decision from what it may do while it is on.
  fastify.put(
    "/:id/status",
    { ...SetStatusSchema, ...guard },
    async (req, reply) => {
      try {
        const { is_active } = req.body;
        const updated = await Tokens.SetStatus(req.params.id, is_active);
        if (!updated) throw { statusCode: 404, message: "Token not found." };

        return ok(
          reply,
          { id: req.params.id, is_active },
          `Token ${is_active ? "activated" : "deactivated"}.`,
        );
      } catch (err) {
        return fail(reply, err);
      }
    },
  );

  // DELETE /admin/tokens/:id: the switch-off the console's Status column
  // performs when a token is turned off, given its own verb so the write is a
  // real DELETE and the portal can be held to the same route. There is no hard
  // delete on purpose: the row holds the only copy of the encrypted Wrike
  // credential, so removing it would break whoever is still calling with that
  // token with no record of why.
  fastify.delete("/:id", { ...IdParamSchema, ...guard }, async (req, reply) => {
    try {
      const record = await Tokens.GetRecord(req.params.id);
      if (!record) throw { statusCode: 404, message: "Token not found." };

      // Already off: nothing to write, and no second timestamp to explain.
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
  });

  done();
};

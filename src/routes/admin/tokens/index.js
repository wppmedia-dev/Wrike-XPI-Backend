import { verifyAdminJWT } from "../../../middlewares/adminAuth";
import { Tokens, TokenPermissions } from "../../../controllers";
import { MODULES, catalog } from "../../../utils/tokenPermissionCatalog";

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

  // Every module × action a token can be granted, so a summary can read
  // "3 of 18" without the frontend counting the catalogue itself.
  const totalGrants = MODULES.reduce((n, mod) => n + mod.actions.length, 0);

  const summarise = (entry) => {
    if (!entry?.configured) {
      // Unrestricted is not "0 granted". A token nobody has restricted can do
      // all of it, and the list has to say so, otherwise a freshly issued
      // token reads as powerless, which is the opposite of the truth.
      return { configured: false, granted: totalGrants, total: totalGrants };
    }

    let granted = 0;
    for (const mod of MODULES) {
      for (const action of mod.actions) {
        if (entry.matrix?.[mod.key]?.[action]) granted += 1;
      }
    }

    return { configured: true, granted, total: totalGrants };
  };

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
          permissions: summarise(matrices[token.id]),
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

  done();
};

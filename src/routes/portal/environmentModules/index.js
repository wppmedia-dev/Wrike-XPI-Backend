import { EnvironmentModulePermissions } from "../../../controllers";
import { catalog } from "../../../utils/tokenPermissionCatalog";
import {
  isEnvironmentInScope,
  scopedEnvironmentIdsFor,
} from "../../../utils/portalScope";
import {
  verifyPortalJWT,
  requirePasswordChanged,
  requirePortalPermission,
} from "../../../middlewares/portalAuth";
import { IdParamSchema, SetPermissionsSchema } from "./schema";

/**
 * Environment module permissions, managed from the portal:
 * /api/v1/portal/environment-modules.
 *
 * The layer above a token's matrix — what anything in an environment may reach
 * at all (src/middlewares/modulePermissions.js applies it before the token's
 * own grid) — which used to be editable only from the admin console. A portal
 * user who administers tokens needs to see the ceiling those tokens are held
 * to, and often to set it, without asking an admin for every change.
 *
 * Everything here is scoped to the environments the caller can see
 * (src/utils/portalScope.js, the same rule the Environments page uses), so a
 * portal user can only read or edit the ceiling of an environment they already
 * administer. An environment outside that scope answers 404 rather than 403:
 * confirming that some other environment exists is itself something this user
 * has not been given, and the id is a uuid they would have to guess.
 *
 * Every route carries one of the two grants of the `environment_modules`
 * module from src/utils/portalPermissionCatalog.js:
 *
 *   GET  /catalog          read   the module vocabulary the grid editor draws
 *   GET  /:id/permissions  read   one environment's matrix, uncached
 *   PUT  /:id/permissions  update replace that matrix
 *
 * No create and no delete, for the same reason the token module has none: this
 * edits one row set at a time, and an environment is not created or removed
 * from here.
 */

export const portalEnvironmentModulesRoute = (fastify, opts, done) => {
  const authGuard = [verifyPortalJWT, requirePasswordChanged];
  const canRead = [
    ...authGuard,
    requirePortalPermission("environment_modules", "read"),
  ];
  const canUpdate = [
    ...authGuard,
    requirePortalPermission("environment_modules", "update"),
  ];

  const ok = (reply, data, message) =>
    reply.code(200).send({ success: true, message, data });

  const fail = (reply, err) =>
    reply.code(err?.statusCode || 400).send({
      success: false,
      message: err?.message || err || "Request failed",
    });

  /**
   * The environment id, if the caller may act on it. Throws the 404 above when
   * it is not one of theirs, so both routes below scope identically.
   */
  const scopedEnvironment = async (portalUser, envId) => {
    const envIds = await scopedEnvironmentIdsFor(portalUser);
    if (!isEnvironmentInScope(envIds, envId)) {
      throw { statusCode: 404, message: "Environment not found." };
    }

    return envId;
  };

  // GET /portal/environment-modules/catalog
  //
  // The same catalogue the admin console's editor draws, from the same
  // authority (src/utils/tokenPermissionCatalog.js), so both consoles show one
  // vocabulary and one set of supported actions.
  fastify.get("/catalog", { preHandler: canRead }, async (req, reply) => {
    try {
      return ok(reply, catalog(), "Catalog retrieved");
    } catch (err) {
      return fail(reply, err);
    }
  });

  // GET /portal/environment-modules/:id/permissions
  //
  // Uncached on purpose: the cached read exists for the request-path gate,
  // while somebody editing this grid has to see what is in Postgres right now
  // or a save would look like it did nothing.
  fastify.get(
    "/:id/permissions",
    { ...IdParamSchema, preHandler: canRead },
    async (req, reply) => {
      try {
        await scopedEnvironment(req.portalUser, req.params.id);

        return ok(
          reply,
          await EnvironmentModulePermissions.GetMatrix(req.params.id),
        );
      } catch (err) {
        return fail(reply, err);
      }
    },
  );

  // PUT /portal/environment-modules/:id/permissions
  //
  // Replaces the whole matrix, and is what moves an environment from
  // unrestricted to governed for the first time.
  fastify.put(
    "/:id/permissions",
    { ...SetPermissionsSchema, preHandler: canUpdate },
    async (req, reply) => {
      try {
        await scopedEnvironment(req.portalUser, req.params.id);

        const data = await EnvironmentModulePermissions.SetMatrix(
          req.portalUser?.id,
          req.params.id,
          req.body?.permissions,
        );

        return ok(reply, data, "Permissions updated.");
      } catch (err) {
        return fail(reply, err);
      }
    },
  );

  done();
};

export default portalEnvironmentModulesRoute;

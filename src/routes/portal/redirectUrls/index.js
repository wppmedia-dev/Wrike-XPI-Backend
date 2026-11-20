import { RedirectRules, WrikeCredentials } from "../../../controllers";
import { isRedirectUriAllowed } from "../../../utils/redirectAllowlist";
import {
  CreateRuleSchema,
  UpdateRuleSchema,
  IdParamSchema,
  EnvQuerySchema,
  CheckSchema,
} from "../../admin/redirectUrls/schema";
import {
  verifyPortalJWT,
  requirePasswordChanged,
  requirePortalPermission,
} from "../../../middlewares/portalAuth";

/**
 * Portal API over the redirect-URL allow list — the same data and controller
 * calls as src/routes/admin/redirectUrls, gated by the "redirect_urls" portal
 * permission, one action per route:
 *
 *   read    GET  /rules · POST /check
 *   create  POST /rules
 *   update  PUT  /rules/:id
 *   delete  DELETE /rules/:id
 *
 * Every route resolves the environment it touches and refuses unless the caller
 * owns it (admin-role portal users are unrestricted), exactly as
 * src/routes/portal/environmentAccess does. Without that, a portal user could
 * add a redirect target to another tenant's environment by naming its id, which
 * is the very attack this list exists to stop.
 */
export const portalRedirectUrlsRoute = (fastify, opts, done) => {
  const authGuard = [verifyPortalJWT, requirePasswordChanged];
  const can = (action) => [
    ...authGuard,
    requirePortalPermission("redirect_urls", action),
  ];

  const ok = (reply, data, message) =>
    reply.code(200).send({ success: true, message, data });

  const fail = (reply, err) =>
    reply.code(err?.statusCode || 400).send({
      success: false,
      message: err?.message || err || "Request failed",
    });

  const forbidden = (reply) =>
    reply.code(403).send({
      success: false,
      message: "You do not have access to this environment.",
    });

  const ownsEnv = async (portalUser, envId) => {
    if (!envId) return false;
    if (portalUser.role === "admin") return true;

    const owned = await WrikeCredentials.GetByOwnerId(portalUser.id);
    return (owned || []).some((env) => env.id === envId);
  };

  /** The entry, or null after having replied: an id names no environment, so
      it is resolved first and the caller's ownership of ITS environment checked. */
  const loadOwnedRule = async (portalUser, id, reply) => {
    const rule = await RedirectRules.GetRuleById(id);
    if (!rule) {
      reply
        .code(404)
        .send({ success: false, message: "Redirect entry not found." });
      return null;
    }
    if (!(await ownsEnv(portalUser, rule.env_id))) {
      forbidden(reply);
      return null;
    }
    return rule;
  };

  fastify.get(
    "/rules",
    { ...EnvQuerySchema, preHandler: can("read") },
    async (req, reply) => {
      try {
        if (!(await ownsEnv(req.portalUser, req.query.env_id))) {
          return forbidden(reply);
        }
        return ok(
          reply,
          await RedirectRules.ListRulesPage(req.query.env_id, {
            search: req.query.search,
            status: req.query.status,
            page: req.query.page,
            pageSize: req.query.page_size,
          }),
        );
      } catch (err) {
        return fail(reply, err);
      }
    },
  );

  // Created with a null profile id: created_by references admin_users, not
  // portal_users, as in the portal's other write routes.
  fastify.post(
    "/rules",
    { ...CreateRuleSchema, preHandler: can("create") },
    async (req, reply) => {
      try {
        if (!(await ownsEnv(req.portalUser, req.body?.env_id))) {
          return forbidden(reply);
        }
        const rule = await RedirectRules.CreateRule(null, req.body);
        return reply
          .code(201)
          .send({ success: true, message: "Redirect URL added.", data: rule });
      } catch (err) {
        return fail(reply, err);
      }
    },
  );

  fastify.put(
    "/rules/:id",
    { ...UpdateRuleSchema, preHandler: can("update") },
    async (req, reply) => {
      try {
        if (!(await loadOwnedRule(req.portalUser, req.params.id, reply))) return;
        const rule = await RedirectRules.UpdateRule(
          null,
          req.params.id,
          req.body,
        );
        return ok(reply, rule, "Redirect URL updated.");
      } catch (err) {
        return fail(reply, err);
      }
    },
  );

  fastify.delete(
    "/rules/:id",
    { ...IdParamSchema, preHandler: can("delete") },
    async (req, reply) => {
      try {
        if (!(await loadOwnedRule(req.portalUser, req.params.id, reply))) return;
        await RedirectRules.DeleteRule(null, req.params.id);
        return ok(reply, null, "Redirect URL removed.");
      } catch (err) {
        return fail(reply, err);
      }
    },
  );

  fastify.post(
    "/check",
    { ...CheckSchema, preHandler: can("read") },
    async (req, reply) => {
      try {
        const { env_id, redirect_uri } = req.body;
        if (!(await ownsEnv(req.portalUser, env_id))) return forbidden(reply);

        return ok(reply, {
          allowed: await isRedirectUriAllowed(env_id, redirect_uri),
        });
      } catch (err) {
        return fail(reply, err);
      }
    },
  );

  done();
};

export default portalRedirectUrlsRoute;

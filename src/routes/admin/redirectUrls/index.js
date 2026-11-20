import { verifyAdminJWT } from "../../../middlewares/adminAuth";
import { RedirectRules } from "../../../controllers";
import { isRedirectUriAllowed } from "../../../utils/redirectAllowlist";

import {
  CreateRuleSchema,
  UpdateRuleSchema,
  IdParamSchema,
  EnvQuerySchema,
  CheckSchema,
} from "./schema";

/**
 * Admin API behind /api/v1/admin/redirect-urls — the console's control over the
 * list of places a sign-in may return the browser to
 * (src/utils/redirectAllowlist.js). The portal has the same operations behind
 * the "redirect_urls" grant (src/routes/portal/redirectUrls).
 *
 * Writes drop the environment's cached list inside the controller, so an entry
 * removed here stops being honoured on the very next request.
 */
export const adminRedirectUrlsRoute = (fastify, opts, done) => {
  const guard = { preHandler: [verifyAdminJWT] };

  const ok = (reply, data, message) =>
    reply.code(200).send({ success: true, message, data });

  const fail = (reply, err) =>
    reply.code(err?.statusCode || 400).send({
      success: false,
      message: err?.message || err || "Request failed",
    });

  fastify.get("/rules", { ...EnvQuerySchema, ...guard }, async (req, reply) => {
    try {
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
  });

  fastify.post("/rules", { ...CreateRuleSchema, ...guard }, async (req, reply) => {
    try {
      const rule = await RedirectRules.CreateRule(req.adminUser.id, req.body);
      return reply
        .code(201)
        .send({ success: true, message: "Redirect URL added.", data: rule });
    } catch (err) {
      return fail(reply, err);
    }
  });

  fastify.put("/rules/:id", { ...UpdateRuleSchema, ...guard }, async (req, reply) => {
    try {
      const rule = await RedirectRules.UpdateRule(
        req.adminUser.id,
        req.params.id,
        req.body,
      );
      return ok(reply, rule, "Redirect URL updated.");
    } catch (err) {
      return fail(reply, err);
    }
  });

  fastify.delete("/rules/:id", { ...IdParamSchema, ...guard }, async (req, reply) => {
    try {
      await RedirectRules.DeleteRule(req.adminUser.id, req.params.id);
      return ok(reply, null, "Redirect URL removed.");
    } catch (err) {
      return fail(reply, err);
    }
  });

  // POST /redirect-urls/check — runs the exact check the login flow runs.
  fastify.post("/check", { ...CheckSchema, ...guard }, async (req, reply) => {
    try {
      const { env_id, redirect_uri } = req.body;
      const allowed = await isRedirectUriAllowed(env_id, redirect_uri);
      return ok(reply, { allowed });
    } catch (err) {
      return fail(reply, err);
    }
  });

  done();
};

export default adminRedirectUrlsRoute;

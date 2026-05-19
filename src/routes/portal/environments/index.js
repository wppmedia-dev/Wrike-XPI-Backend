import { GetMyEnvironments } from "./handlers/getEnvironments";
import { CreateEnvironment } from "./handlers/createEnvironment";
import { UpdateEnvironment } from "./handlers/updateEnvironment";
import { DeleteEnvironment } from "./handlers/deleteEnvironment";
import { GetEnvironmentsSchema } from "./schema/getEnvironments";
import {
  verifyPortalJWT,
  requirePasswordChanged,
} from "../../../middlewares/portalAuth";

export const portalEnvironmentsRoute = (fastify, opts, done) => {
  const authGuard = [verifyPortalJWT, requirePasswordChanged];

  // GET /portal/environments — returns environments scoped to the logged-in portal user
  fastify.get(
    "/",
    { ...GetEnvironmentsSchema, preHandler: authGuard },
    async (req, reply) => {
      try {
        const result = await GetMyEnvironments(req.portalUser);
        return reply.code(result?.statusCode || 200).send({
          success: true,
          message: result?.message,
          data: result?.data,
        });
      } catch (err) {
        return reply.code(err?.statusCode || 500).send({
          success: false,
          message: err?.message || err,
        });
      }
    },
  );

  // POST /portal/environments — create a new environment
  fastify.post("/", { preHandler: authGuard }, async (req, reply) => {
    try {
      const result = await CreateEnvironment(req.portalUser, req.body || {});
      return reply.code(result?.statusCode || 201).send({
        success: true,
        message: result?.message,
        data: result?.data,
      });
    } catch (err) {
      return reply.code(err?.statusCode || 500).send({
        success: false,
        message: err?.message || err,
      });
    }
  });

  // PUT /portal/environments/:id — update an environment
  fastify.put("/:id", { preHandler: authGuard }, async (req, reply) => {
    try {
      const result = await UpdateEnvironment(
        req.portalUser,
        req.params.id,
        req.body || {},
      );
      return reply.code(result?.statusCode || 200).send({
        success: true,
        message: result?.message,
      });
    } catch (err) {
      return reply.code(err?.statusCode || 500).send({
        success: false,
        message: err?.message || err,
      });
    }
  });

  // DELETE /portal/environments/:id — soft-delete an environment
  fastify.delete("/:id", { preHandler: authGuard }, async (req, reply) => {
    try {
      const result = await DeleteEnvironment(req.portalUser, req.params.id);
      return reply.code(result?.statusCode || 200).send({
        success: true,
        message: result?.message,
      });
    } catch (err) {
      return reply.code(err?.statusCode || 500).send({
        success: false,
        message: err?.message || err,
      });
    }
  });

  done();
};

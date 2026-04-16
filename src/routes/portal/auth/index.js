import { Login } from "./handlers/login";
import { ChangePassword } from "./handlers/changePassword";
import { LoginSchema } from "./schema/login";
import { ChangePasswordSchema } from "./schema/changePassword";
import {
  verifyPortalJWT,
  requirePasswordChanged,
} from "../../../middlewares/portalAuth";

export const portalAuthRoute = (fastify, opts, done) => {
  // POST /portal/auth/login
  fastify.post("/login", LoginSchema, async (req, reply) => {
    try {
      const result = await Login(req.body);

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
  });

  // POST /portal/auth/change-password  (protected — any portal user)
  fastify.post(
    "/change-password",
    { ...ChangePasswordSchema, preHandler: [verifyPortalJWT] },
    async (req, reply) => {
      try {
        const result = await ChangePassword(req.portalUser, req.body);

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
    },
  );

  done();
};

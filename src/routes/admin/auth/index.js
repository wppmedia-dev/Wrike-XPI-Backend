import { Register } from "./handlers/register";
import { Login } from "./handlers/login";
import { VerifyTOTP } from "./handlers/verifyTOTP";
import { GetTOTPSetup } from "./handlers/getTOTPSetup";
import { EnableTOTP } from "./handlers/enableTOTP";
import { Logout } from "./handlers/logout";

import { RegisterSchema } from "./schema/register";
import { LoginSchema } from "./schema/login";
import { VerifyTOTPSchema } from "./schema/verifyTOTP";
import { GetTOTPSetupSchema } from "./schema/getTOTPSetup";
import { EnableTOTPSchema } from "./schema/enableTOTP";
import { LogoutSchema } from "./schema/logout";

import { verifyAdminJWT } from "../../../middlewares/adminAuth";

export const adminAuthRoute = (fastify, opts, done) => {
  // POST /admin/register
  fastify.post("/register", RegisterSchema, async (req, reply) => {
    try {
      const result = await Register(req.body);

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

  // POST /admin/login
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

  // POST /admin/totp/verify
  fastify.post("/totp/verify", VerifyTOTPSchema, async (req, reply) => {
    try {
      const result = await VerifyTOTP(req.body);

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

  // GET /admin/totp/setup  (protected)
  fastify.get(
    "/totp/setup",
    { ...GetTOTPSetupSchema, preHandler: [verifyAdminJWT] },
    async (req, reply) => {
      try {
        const result = await GetTOTPSetup(req.adminUser);

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

  // POST /admin/totp/setup  (protected)
  fastify.post(
    "/totp/setup",
    { ...EnableTOTPSchema, preHandler: [verifyAdminJWT] },
    async (req, reply) => {
      try {
        const result = await EnableTOTP(req.body, req.adminUser);

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

  // POST /admin/logout  (protected)
  fastify.post(
    "/logout",
    { ...LogoutSchema, preHandler: [verifyAdminJWT] },
    async (req, reply) => {
      try {
        const result = await Logout(req.adminUser);

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

import {
  Register,
  Login,
  GenerateTOTPSetup,
  EnableTOTP,
  VerifyTOTP,
  Logout,
} from "./handlers/auth";
import { GetAll, Save, Delete } from "./handlers/credentials";
import { verifyAdminJWT } from "../../middlewares/adminAuth";

export const adminApiRoute = (fastify, opts, done) => {
  // POST /admin/register
  fastify.post("/register", async (req, reply) => {
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
  fastify.post("/login", async (req, reply) => {
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

  // GET /admin/totp/setup  (protected — admin must already have a JWT)
  fastify.get(
    "/totp/setup",
    { preHandler: [verifyAdminJWT] },
    async (req, reply) => {
      try {
        const result = await GenerateTOTPSetup(req.adminUser);

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
    { preHandler: [verifyAdminJWT] },
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

  // POST /admin/totp/verify
  fastify.post("/totp/verify", async (req, reply) => {
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

  // POST /admin/logout  (protected)
  fastify.post(
    "/logout",
    { preHandler: [verifyAdminJWT] },
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

  // GET /admin/credentials  (protected)
  fastify.get(
    "/credentials",
    { preHandler: [verifyAdminJWT] },
    async (req, reply) => {
      try {
        const result = await GetAll();

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

  // POST /admin/credentials  (protected)
  fastify.post(
    "/credentials",
    { preHandler: [verifyAdminJWT] },
    async (req, reply) => {
      try {
        const result = await Save(req.body);

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

  // DELETE /admin/credentials/:id  (protected)
  fastify.delete(
    "/credentials/:id",
    { preHandler: [verifyAdminJWT] },
    async (req, reply) => {
      try {
        const result = await Delete(req.params);

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

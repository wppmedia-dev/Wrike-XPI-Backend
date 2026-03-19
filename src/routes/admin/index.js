import {
  AdminLogin,
  GenerateTOTPSetup,
  SetupTOTP,
  VerifyTOTP,
  AdminLogout,
  AdminRegister,
} from "./handlers/auth";
import {
  GetAllCredentials,
  SaveCredential,
  DeleteCredential,
} from "./handlers/credentials";

export const adminApiRoute = (fastify, opts, done) => {
  /**
   * POST /admin/api/register
   */
  fastify.post("/register", async (req, reply) => {
    try {
      const result = await AdminRegister(req.body, fastify);

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

  /**
   * POST /admin/api/login
   */
  fastify.post("/login", async (req, reply) => {
    try {
      const result = await AdminLogin(req.body, fastify);

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

  /**
   * GET /api/v1/admin/totp/setup?session_token=...
   */
  fastify.get("/totp/setup", async (req, reply) => {
    try {
      const result = await GenerateTOTPSetup(req.query, fastify);

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

  /**
   * POST /api/v1/admin/totp/setup
   */
  fastify.post("/totp/setup", async (req, reply) => {
    try {
      const result = await SetupTOTP(req.body, fastify);

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

  /**
   * POST /api/v1/admin/totp/verify
   */
  fastify.post("/totp/verify", async (req, reply) => {
    try {
      const result = await VerifyTOTP(req.body, fastify);

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

  /**
   * POST /api/v1/admin/logout
   */
  fastify.post("/logout", async (req, reply) => {
    try {
      const result = await AdminLogout(req.body, fastify);

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

  /**
   * GET /api/v1/admin/credentials?session_token=...
   */
  fastify.get("/credentials", async (req, reply) => {
    try {
      const result = await GetAllCredentials(req.query, fastify);

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

  /**
   * POST /api/v1/admin/credentials
   */
  fastify.post("/credentials", async (req, reply) => {
    try {
      const result = await SaveCredential(req.body, fastify);

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

  /**
   * DELETE /api/v1/admin/credentials/:id?session_token=...
   */
  fastify.delete("/credentials/:id", async (req, reply) => {
    try {
      const result = await DeleteCredential(req.params, req.query, fastify);

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

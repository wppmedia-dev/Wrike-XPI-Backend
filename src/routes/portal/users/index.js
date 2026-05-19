import { CreateUser } from "./handlers/createUser";
import { ListUsers } from "./handlers/listUsers";
import { ResetPassword } from "./handlers/resetPassword";
import { ToggleUser } from "./handlers/toggleUser";
import { GenerateCredentials } from "./handlers/generateCredentials";
import { AssignEnv, RevokeEnv } from "./handlers/manageEnvironments";
import {
  CreateUserSchema,
  ResetPasswordSchema,
  ToggleUserSchema,
  AssignEnvSchema,
  RevokeEnvSchema,
} from "./schema/index";
import {
  verifyPortalJWT,
  requireAdminRole,
  requirePasswordChanged,
} from "../../../middlewares/portalAuth";

export const portalUsersRoute = (fastify, opts, done) => {
  const adminGuard = [
    verifyPortalJWT,
    requirePasswordChanged,
    requireAdminRole,
  ];

  // GET /portal/users
  fastify.get("/", { preHandler: adminGuard }, async (req, reply) => {
    try {
      const result = await ListUsers();
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

  // POST /portal/users
  fastify.post(
    "/",
    { ...CreateUserSchema, preHandler: adminGuard },
    async (req, reply) => {
      try {
        const result = await CreateUser(req.portalUser, req.body);
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
    },
  );

  // POST /portal/users/generate-credentials
  fastify.post(
    "/generate-credentials",
    { preHandler: adminGuard },
    async (req, reply) => {
      try {
        const result = await GenerateCredentials();
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

  // PUT /portal/users/:id/reset-password
  fastify.put(
    "/:id/reset-password",
    { ...ResetPasswordSchema, preHandler: adminGuard },
    async (req, reply) => {
      try {
        const result = await ResetPassword(
          req.portalUser,
          req.params,
          req.body,
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
    },
  );

  // PUT /portal/users/:id/status
  fastify.put(
    "/:id/status",
    { ...ToggleUserSchema, preHandler: adminGuard },
    async (req, reply) => {
      try {
        const result = await ToggleUser(req.portalUser, req.params, req.body);
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

  // POST /portal/users/:id/environments
  fastify.post(
    "/:id/environments",
    { ...AssignEnvSchema, preHandler: adminGuard },
    async (req, reply) => {
      try {
        const result = await AssignEnv(req.portalUser, req.params, req.body);
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

  // DELETE /portal/users/:id/environments?env_id=...
  fastify.delete(
    "/:id/environments",
    { ...RevokeEnvSchema, preHandler: adminGuard },
    async (req, reply) => {
      try {
        const result = await RevokeEnv(req.params, req.query);
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

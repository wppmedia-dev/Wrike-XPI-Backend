import { GetAll } from "./handlers/getAll";
import { Save } from "./handlers/save";
import { Update } from "./handlers/update";
import { Delete } from "./handlers/delete";

import { GetAllSchema } from "./schema/getAll";
import { SaveSchema } from "./schema/save";
import { UpdateSchema } from "./schema/update";
import { DeleteSchema } from "./schema/delete";

import { verifyAdminJWT } from "../../../middlewares/adminAuth";

export const adminCredentialsRoute = (fastify, opts, done) => {
  // GET /admin/credentials  (protected)
  fastify.get(
    "/",
    { ...GetAllSchema, preHandler: [verifyAdminJWT] },
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
    "/",
    { ...SaveSchema, preHandler: [verifyAdminJWT] },
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

  // PUT /admin/credentials/:id  (protected)
  fastify.put(
    "/:id",
    { ...UpdateSchema, preHandler: [verifyAdminJWT] },
    async (req, reply) => {
      try {
        const result = await Update(req.params, req.body);

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
    "/:id",
    { ...DeleteSchema, preHandler: [verifyAdminJWT] },
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

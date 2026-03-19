import {
  SaveWrikeCredentials,
  GetWrikeCredentials,
  SyncWrikeCredentials,
} from "./handlers/wrikeCredentials";
import { SaveWrikeCredentialsSchema } from "./schema/wrikeCredentials";

export const credentialsRoute = (fastify, opts, done) => {
  /**
   * POST /api/v1/credentials/save
   * Save or update Wrike credentials
   */
  fastify.post("/save", SaveWrikeCredentialsSchema, async (req, reply) => {
    try {
      const result = await SaveWrikeCredentials(req.body, fastify);

      return reply.code(result?.statusCode || 200).send({
        success: true,
        message: result?.message,
        data: result?.data,
      });
    } catch (err) {
      console.error("Error in save credentials endpoint:", err);
      return reply.code(err?.statusCode || 500).send({
        success: false,
        message: err?.message || err,
        data: null,
      });
    }
  });

  /**
   * GET /api/v1/credentials/get
   * Get Wrike credentials for a specific type
   */
  fastify.get("/get", async (req, reply) => {
    try {
      const result = await GetWrikeCredentials(req.query, fastify);

      return reply.code(result?.statusCode || 200).send({
        success: true,
        message: result?.message,
        data: result?.data,
      });
    } catch (err) {
      console.error("Error in get credentials endpoint:", err);
      return reply.code(err?.statusCode || 500).send({
        success: false,
        message: err?.message || err,
        data: null,
      });
    }
  });

  /**
   * GET /api/v1/credentials/sync
   * Sync credentials from database
   */
  fastify.get("/sync", async (req, reply) => {
    try {
      const result = await SyncWrikeCredentials(req.query, fastify);

      return reply.code(result?.statusCode || 200).send({
        success: true,
        message: result?.message,
        data: result?.data,
      });
    } catch (err) {
      console.error("Error in sync credentials endpoint:", err);
      return reply.code(err?.statusCode || 500).send({
        success: false,
        message: err?.message || err,
        data: null,
      });
    }
  });

  done();
};

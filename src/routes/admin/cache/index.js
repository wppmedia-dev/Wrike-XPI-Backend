import { verifyAdminJWT } from "../../../middlewares/adminAuth";
import redisClient from "../../../utils/redis";
import {
  listCacheEntries,
  getCacheDetail,
} from "../../../utils/cacheInspector";
import {
  BulkDeleteSchema,
  DeleteKeySchema,
  DetailQuerySchema,
  ListQuerySchema,
} from "./schema";

export const adminCacheRoute = (fastify, opts, done) => {
  const guard = { preHandler: [verifyAdminJWT] };

  // GET /admin/cache?pattern=*&limit=200
  // - If pattern contains wildcard chars (*, ?, []), Redis pattern search is used.
  // - Otherwise iLike-style key matching is used (case-insensitive contains).
  fastify.get("/", { ...ListQuerySchema, ...guard }, async (req, reply) => {
    try {
      const patternInput = String(req.query?.pattern || "").trim();
      const data = await listCacheEntries({
        pattern: patternInput,
        limit: req.query?.limit,
      });

      return reply.code(200).send({
        success: true,
        message: "Cache entries fetched",
        data,
      });
    } catch (err) {
      return reply.code(err?.statusCode || 400).send({
        success: false,
        message: err?.message || "Failed to fetch cache entries",
      });
    }
  });

  // GET /admin/cache/detail?key=cache:key
  fastify.get(
    "/detail",
    { ...DetailQuerySchema, ...guard },
    async (req, reply) => {
      try {
        const key = String(req.query?.key || "").trim();
        if (!key) {
          return reply
            .code(400)
            .send({ success: false, message: "Missing key" });
        }

        const data = await getCacheDetail(key);

        return reply.code(200).send({
          success: true,
          message: "Cache detail fetched",
          data,
        });
      } catch (err) {
        return reply.code(err?.statusCode || 400).send({
          success: false,
          message: err?.message || "Failed to fetch cache detail",
        });
      }
    },
  );

  // DELETE /admin/cache?key=cache:key
  fastify.delete("/", { ...DeleteKeySchema, ...guard }, async (req, reply) => {
    try {
      const key = String(req.query?.key || "").trim();
      if (!key) {
        return reply.code(400).send({ success: false, message: "Missing key" });
      }

      const deleted = await redisClient.delMany([key]);

      return reply.code(200).send({
        success: true,
        message: deleted > 0 ? "Cache entry deleted" : "Cache entry not found",
        data: { key, deleted: deleted > 0 },
      });
    } catch (err) {
      return reply.code(err?.statusCode || 400).send({
        success: false,
        message: err?.message || "Failed to delete cache entry",
      });
    }
  });

  // POST /admin/cache/bulk-delete { keys: ["key1", "key2"] }
  fastify.post(
    "/bulk-delete",
    { ...BulkDeleteSchema, ...guard },
    async (req, reply) => {
      try {
        const keys = Array.isArray(req.body?.keys)
          ? req.body.keys
              .map((item) => String(item || "").trim())
              .filter(Boolean)
          : [];

        if (keys.length === 0) {
          return reply.code(400).send({
            success: false,
            message: "At least one cache key is required",
          });
        }

        const deletedCount = await redisClient.delMany(keys);

        return reply.code(200).send({
          success: true,
          message: `${deletedCount} cache key(s) deleted`,
          data: {
            requested: keys.length,
            deleted: deletedCount,
          },
        });
      } catch (err) {
        return reply.code(err?.statusCode || 400).send({
          success: false,
          message: err?.message || "Failed to bulk delete cache entries",
        });
      }
    },
  );

  done();
};

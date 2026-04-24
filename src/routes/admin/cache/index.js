import { verifyAdminJWT } from "../../../middlewares/adminAuth";
import redisClient from "../../../utils/redis";

const DEFAULT_PATTERN = "*";
const MAX_LIST_LIMIT = 500;

const toTtlLabel = (ttlSeconds) => {
  if (ttlSeconds === null || ttlSeconds === undefined) return "Unavailable";
  if (ttlSeconds === -2) return "Missing";
  if (ttlSeconds === -1) return "No Expiry";
  if (ttlSeconds < 60) return `${ttlSeconds}s`;
  if (ttlSeconds < 3600)
    return `${Math.floor(ttlSeconds / 60)}m ${ttlSeconds % 60}s`;
  if (ttlSeconds < 86400)
    return `${Math.floor(ttlSeconds / 3600)}h ${Math.floor((ttlSeconds % 3600) / 60)}m`;
  return `${Math.floor(ttlSeconds / 86400)}d ${Math.floor((ttlSeconds % 86400) / 3600)}h`;
};

const safeJsonPreview = (value, maxLength = 180) => {
  try {
    const raw = typeof value === "string" ? value : JSON.stringify(value);
    if (!raw) return "";
    return raw.length > maxLength ? `${raw.slice(0, maxLength)}…` : raw;
  } catch {
    return "[unserializable]";
  }
};

const inferValueType = (value) => {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
};

const getCacheValue = async (key) => {
  const jsonValue = await redisClient.get(key);
  if (jsonValue !== null && jsonValue !== undefined) {
    return {
      value: jsonValue,
      valueType: inferValueType(jsonValue),
      preview: safeJsonPreview(jsonValue),
      source: "json",
    };
  }

  const stringValue = await redisClient.getString(key);
  if (stringValue !== null && stringValue !== undefined) {
    let parsed = stringValue;
    let parsedAsJson = false;

    try {
      parsed = JSON.parse(stringValue);
      parsedAsJson = true;
    } catch {
      parsed = stringValue;
    }

    return {
      value: parsed,
      valueType: parsedAsJson ? inferValueType(parsed) : "string",
      preview: safeJsonPreview(parsed),
      source: parsedAsJson ? "string-json" : "string",
    };
  }

  return {
    value: null,
    valueType: "unknown",
    preview: "",
    source: "unknown",
  };
};

export const adminCacheRoute = (fastify, opts, done) => {
  const guard = { preHandler: [verifyAdminJWT] };

  // GET /admin/cache?pattern=*&limit=200
  fastify.get("/", guard, async (req, reply) => {
    try {
      const pattern =
        String(req.query?.pattern || DEFAULT_PATTERN).trim() || DEFAULT_PATTERN;
      const limit = Math.min(
        Math.max(parseInt(req.query?.limit || "200", 10) || 200, 1),
        MAX_LIST_LIMIT,
      );

      const keys = (await redisClient.keys(pattern)).slice(0, limit);

      const entries = await Promise.all(
        keys.map(async (key) => {
          const [ttlSeconds, redisType, valueInfo] = await Promise.all([
            redisClient.ttl(key),
            redisClient.type(key),
            getCacheValue(key),
          ]);

          const approximateSize = valueInfo?.preview
            ? Buffer.byteLength(valueInfo.preview, "utf8")
            : 0;

          return {
            key,
            redis_type: redisType || "unknown",
            value_type: valueInfo.valueType,
            ttl_seconds: ttlSeconds,
            ttl_label: toTtlLabel(ttlSeconds),
            size_bytes: approximateSize,
            preview: valueInfo.preview,
          };
        }),
      );

      return reply.code(200).send({
        success: true,
        message: "Cache entries fetched",
        data: {
          pattern,
          total: entries.length,
          entries,
        },
      });
    } catch (err) {
      return reply.code(err?.statusCode || 500).send({
        success: false,
        message: err?.message || "Failed to fetch cache entries",
      });
    }
  });

  // GET /admin/cache/detail?key=cache:key
  fastify.get("/detail", guard, async (req, reply) => {
    try {
      const key = String(req.query?.key || "").trim();
      if (!key) {
        return reply.code(400).send({ success: false, message: "Missing key" });
      }

      const [ttlSeconds, redisType, valueInfo] = await Promise.all([
        redisClient.ttl(key),
        redisClient.type(key),
        getCacheValue(key),
      ]);

      return reply.code(200).send({
        success: true,
        message: "Cache detail fetched",
        data: {
          key,
          redis_type: redisType || "unknown",
          value_type: valueInfo.valueType,
          ttl_seconds: ttlSeconds,
          ttl_label: toTtlLabel(ttlSeconds),
          value_source: valueInfo.source,
          value: valueInfo.value,
        },
      });
    } catch (err) {
      return reply.code(err?.statusCode || 500).send({
        success: false,
        message: err?.message || "Failed to fetch cache detail",
      });
    }
  });

  // DELETE /admin/cache?key=cache:key
  fastify.delete("/", guard, async (req, reply) => {
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
      return reply.code(err?.statusCode || 500).send({
        success: false,
        message: err?.message || "Failed to delete cache entry",
      });
    }
  });

  // POST /admin/cache/bulk-delete { keys: ["key1", "key2"] }
  fastify.post("/bulk-delete", guard, async (req, reply) => {
    try {
      const keys = Array.isArray(req.body?.keys)
        ? req.body.keys.map((item) => String(item || "").trim()).filter(Boolean)
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
      return reply.code(err?.statusCode || 500).send({
        success: false,
        message: err?.message || "Failed to bulk delete cache entries",
      });
    }
  });

  done();
};

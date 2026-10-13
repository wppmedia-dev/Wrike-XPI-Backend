import crypto from "crypto";

require("dotenv").config();

/**
 * The rate limit for the MCP endpoint (POST /mcp and POST /mcp/:environmentId),
 * applied as route-level `config.rateLimit` for @fastify/rate-limit
 * (src/plugins/mcp.js, registered globally in src/plugins/rate-limit.js).
 *
 * Why MCP gets its own limit rather than sharing the global one:
 *
 *   · The global limit is per client IP. MCP traffic from a hosted agent
 *     platform reaches this service from a handful of shared addresses, so one
 *     busy user would exhaust the allowance of every other user behind the same
 *     address. Here the key is the caller's bearer token instead, so each
 *     connection is limited on its own and nobody is throttled by a neighbour.
 *
 *   · An agent in a loop is the realistic way to hammer this service, and it
 *     does so at a rate no human API client reaches, so the number worth
 *     choosing for it is not the number worth choosing for everyone else.
 *
 * A route-level config REPLACES the global limit for that route (the plugin
 * merges the two, route winning), so the global per-IP limit no longer applies
 * to the MCP POST routes. A request with no bearer token still falls back to
 * the IP key, so an unauthenticated caller is limited exactly as before.
 *
 * What is counted: one unit per HTTP request to the endpoint. A request is
 * either a handshake (initialize, tools/list) or a tool call, so a client that
 * connects and calls one tool spends a few units, which the default allows for.
 *
 * Settings, read once at startup:
 *   MCP_RATE_LIMIT        requests allowed per window per token (default 60)
 *   MCP_RATE_LIMIT_TIME   the window, e.g. "1 minute" (default "1 minute")
 *
 * Counts are held in this process's memory, like the global limiter's: with
 * several instances behind a balancer each keeps its own count.
 */

const DEFAULT_MAX = 60;
const DEFAULT_WINDOW = "1 minute";

const parsePositive = (raw, fallback) => {
  const value = parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

/**
 * The limiter key: a digest of the bearer token, never the token itself, so a
 * heap dump or a debug print of the cache does not hold a usable credential.
 */
export const mcpKeyGenerator = (req) => {
  const [scheme, token] = String(req?.headers?.authorization || "").split(" ");

  if (scheme?.toLowerCase() === "bearer" && token) {
    return (
      "mcp:token:" +
      crypto.createHash("sha256").update(token).digest("hex").slice(0, 32)
    );
  }

  return `mcp:ip:${req?.ip || "unknown"}`;
};

export const MCP_RATE_LIMIT = {
  max: parsePositive(process.env.MCP_RATE_LIMIT, DEFAULT_MAX),
  timeWindow: process.env.MCP_RATE_LIMIT_TIME || DEFAULT_WINDOW,
  keyGenerator: mcpKeyGenerator,
  errorResponseBuilder: (request, context) => ({
    statusCode: 429,
    error: "rate_limited",
    error_description: `Too many MCP requests. This connection is limited to ${context.max} per ${
      process.env.MCP_RATE_LIMIT_TIME || DEFAULT_WINDOW
    }. Retry in ${Math.max(1, Math.ceil(context.ttl / 1000))} seconds.`,
  }),
};

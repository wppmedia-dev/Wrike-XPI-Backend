import { verifyAdminJWT } from "../../../middlewares/adminAuth";
import {
  getMcpTokenLifetimes,
  saveMcpTokenLifetimes,
} from "../../../utils/mcpTokenSettings";
import {
  MCP_TOKEN_BOUNDS,
  MCP_TOKEN_DEFAULTS,
} from "../../../utils/mcpTokenPolicy";
import { SetMcpTokenLifetimesSchema } from "./schema";

/**
 * Admin API behind /api/v1/admin/settings: preferences the console edits.
 * Today that is the lifetimes of the tokens the MCP OAuth flow issues.
 */
export const adminSettingsRoute = (fastify, opts, done) => {
  const guard = { preHandler: [verifyAdminJWT] };

  const ok = (reply, data, message) =>
    reply.code(200).send({ success: true, message, data });

  const fail = (reply, err) =>
    reply.code(err?.statusCode || 400).send({
      success: false,
      message: err?.message || err || "Request failed",
    });

  // The current values together with the bounds and defaults, so the console
  // validates against what the server enforces instead of its own copy.
  const mcpTokenSettings = async () => ({
    ...(await getMcpTokenLifetimes()),
    bounds: MCP_TOKEN_BOUNDS,
    defaults: MCP_TOKEN_DEFAULTS,
  });

  // GET /admin/settings/mcp-tokens
  fastify.get("/mcp-tokens", guard, async (req, reply) => {
    try {
      return ok(reply, await mcpTokenSettings(), "MCP token settings");
    } catch (err) {
      return fail(reply, err);
    }
  });

  // PUT /admin/settings/mcp-tokens: applies to tokens issued from now on.
  // Tokens already out keep the lifetime they were issued with.
  fastify.put(
    "/mcp-tokens",
    { ...SetMcpTokenLifetimesSchema, ...guard },
    async (req, reply) => {
      try {
        await saveMcpTokenLifetimes(req.body, req.adminUser.id);
        return ok(
          reply,
          await mcpTokenSettings(),
          "Saved. New lifetimes apply to tokens issued from now on.",
        );
      } catch (err) {
        return fail(reply, err);
      }
    },
  );

  done();
};

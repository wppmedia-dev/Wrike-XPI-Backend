"use strict";

const {
  StreamableHTTPServerTransport,
} = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const { createMcpServer } = require("../mcp/index.js");

/**
 * Fastify plugin that exposes the MCP (Model Context Protocol) endpoint.
 *
 * Authentication is handled by the enclosing Fastify route group —
 * register this plugin inside a protected scope (e.g. PrivateRouters)
 * where the ValidateToken onRequest hook is active.
 *
 * The plugin bridges the authenticated context (req.wrikeToken,
 * req.environmentName) into the MCP Streamable HTTP transport so that
 * every tool invocation has the correct Wrike API credentials.
 *
 * POST /mcp  – JSON-RPC MCP endpoint (initialize, tools/list, tools/call)
 * GET  /mcp  – Health / readiness check
 *
 * IMPORTANT: NOT wrapped with fastify-plugin so that the prefix applied
 * by the parent scope (/wrikexpi) takes effect correctly.
 */
module.exports = async function (fastify, opts) {
  // ── MCP POST handler ──────────────────────────────────────────────
  fastify.post("/mcp", async (req, reply) => {
    try {
      // Auth is handled by the enclosing PrivateRouters' onRequest hook
      // (ValidateToken), which has already set req.wrikeToken and
      // req.environmentName before this handler runs.

      // Bridge the authenticated context into the raw Node.js IncomingMessage
      // so the StreamableHTTP transport can pass it to the SDK.
      req.raw.auth = {
        wrikeToken: req.wrikeToken,
        environmentName: req.environmentName,
      };

      // Create a fresh transport per request (stateless mode).
      // enableJsonResponse: true returns standard JSON for tools/list
      // and tools/call instead of SSE, which is simpler for agents.
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // stateless
        enableJsonResponse: true,
      });

      // Create a fresh MCP server per request so tool callbacks capture
      // the correct auth context via closure.
      const mcpServer = createMcpServer({
        wrikeToken: req.wrikeToken,
        environmentName: req.environmentName,
        fastify,
      });

      // Wire the server to the transport
      await mcpServer.connect(transport);

      // Let the transport handle the request — it will read req.body,
      // dispatch to the McpServer, and write the response to reply.raw.
      await transport.handleRequest(req.raw, reply.raw, req.body);

      // Prevent Fastify from sending its own response since the
      // transport has already written to the raw ServerResponse.
      if (typeof reply.hijack === "function") {
        reply.hijack();
      }
    } catch (err) {
      // If anything fails before the transport can respond, send a
      // structured error fallback.
      return reply.code(err?.statusCode || 500).send({
        success: false,
        message: err?.message || "MCP request handling failed.",
        details: err?.details || null,
      });
    }
  });

  // ── MCP GET health endpoint ──────────────────────────────────────
  fastify.get("/mcp", async (req, reply) => {
    reply.send({
      success: true,
      message: "WrikeXPI MCP endpoint is ready.",
      transport: "streamable-http",
      protocol: "Model Context Protocol",
    });
  });
};

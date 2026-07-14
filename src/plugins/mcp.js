"use strict";

const { v4: uuidv4 } = require("uuid");
const {
  StreamableHTTPServerTransport,
} = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const { createMcpServer } = require("../mcp/index.js");

/**
 * Fastify plugin that exposes the MCP (Model Context Protocol) endpoint.
 *
 * The route is intentionally public. Authentication is handled by the
 * MCP auth.login tool and the sessionAuthStore, not by a request-level
 * onRequest hook.
 *
 * POST /mcp  – JSON-RPC MCP endpoint (initialize, tools/list, tools/call)
 * GET  /mcp  – Health / readiness check
 *
 * IMPORTANT: NOT wrapped with fastify-plugin so that the prefix applied
 * by the parent scope (/wrikexpi) takes effect correctly.
 */
module.exports = async function (fastify, opts) {
  const serverUrl = process.env.APP_URL || "http://localhost:3000";

  // Create the server and a stateful transport ONCE at plugin registration.
  // sessionIdGenerator enables stateful mode so the transport can handle
  // multiple requests across the same session.
  const mcpServer = createMcpServer(fastify, serverUrl);
  const transport = new StreamableHTTPServerTransport({
    enableJsonResponse: true,
    sessionIdGenerator: () => uuidv4(),
  });
  await mcpServer.connect(transport);

  // ── MCP POST handler ──────────────────────────────────────────────
  fastify.post("/mcp", async (req, reply) => {
    // Hijack BEFORE the transport writes, so Fastify doesn't interfere.
    if (typeof reply.hijack === "function") {
      reply.hijack();
    }

    try {
      // The transport is already connected — just forward each request.
      await transport.handleRequest(req.raw, reply.raw, req.body);
    } catch (err) {
      // reply is hijacked so write directly to the raw response
      const code = err?.statusCode || 500;
      const body = JSON.stringify({
        success: false,
        message: err?.message || "MCP request handling failed.",
        details: err?.details || null,
      });
      reply.raw.writeHead(code, { "Content-Type": "application/json" });
      reply.raw.end(body);
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

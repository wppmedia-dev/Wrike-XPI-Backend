"use strict";

const { v4: uuidv4 } = require("uuid");
const {
  StreamableHTTPServerTransport,
} = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const { createMcpServer } = require("../mcp/index.js");

/**
 * Map of active MCP sessions.
 * Each new client gets its own server + transport so multiple
 * clients can connect simultaneously.
 * @type {Map<string, {transport: import("@modelcontextprotocol/sdk/server/streamableHttp.js").StreamableHTTPServerTransport}>}
 */
const sessions = new Map();

/**
 * Fastify plugin that exposes the MCP (Model Context Protocol) endpoint.
 *
 * The route is intentionally public. Authentication is handled by the
 * MCP auth_login tool and the sessionAuthStore, not by a request-level
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

  // ── MCP POST handler ──────────────────────────────────────────────
  fastify.post("/mcp", async (req, reply) => {
    if (typeof reply.hijack === "function") {
      reply.hijack();
    }

    try {
      const mcpSessionId = req.headers["mcp-session-id"];
      console.error(
        "[MCP] Request received, mcp-session-id:",
        mcpSessionId,
        "sessions count:",
        sessions.size,
      );

      if (mcpSessionId && sessions.has(mcpSessionId)) {
        // ── Existing session — reuse its transport ──
        console.error("[MCP] Using existing session:", mcpSessionId);
        const transport = sessions.get(mcpSessionId).transport;
        await transport.handleRequest(req.raw, reply.raw, req.body);
      } else {
        // ── New session — create a fresh server + transport ──
        console.error(
          "[MCP] Creating new session, client provided session ID:",
          mcpSessionId,
        );
        const server = createMcpServer(fastify, serverUrl);
        const transport = new StreamableHTTPServerTransport({
          enableJsonResponse: true,
          sessionIdGenerator: () => uuidv4(),
        });
        await server.connect(transport);
        await transport.handleRequest(req.raw, reply.raw, req.body);

        // Store the session for subsequent requests
        const newSessionId = transport.sessionId;
        console.error(
          "[MCP] New session created, transport.sessionId:",
          newSessionId,
        );
        if (newSessionId) {
          sessions.set(newSessionId, { transport });
          console.error("[MCP] Stored session, total sessions:", sessions.size);
        } else {
          console.error(
            "[MCP] WARNING: transport.sessionId was null/undefined after handleRequest",
          );
        }
      }
    } catch (err) {
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

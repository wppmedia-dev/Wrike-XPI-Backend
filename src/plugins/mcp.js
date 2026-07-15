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
 * auth_token_validator tool — pass the validated token as auth_token
 * to every tool call.
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
      // Log incoming session ID for diagnostics
      const mcpSessionId = req.headers["mcp-session-id"];
      const clientIp =
        req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
        req.ip ||
        "unknown";
      console.log(
        `[MCP] POST sessionId=${mcpSessionId || "(none)"} ip=${clientIp}`,
      );

      // Ensure Accept header has both values required by the Streamable HTTP transport
      const accept = req.headers.accept || "";
      if (
        !accept.includes("text/event-stream") ||
        !accept.includes("application/json")
      ) {
        req.raw.headers.accept = "application/json, text/event-stream";
      }

      // Embed client IP so tool handlers can retrieve it from extra.requestInfo
      if (req.raw.headers) {
        req.raw.headers["x-forwarded-for"] = clientIp;
      }

      if (mcpSessionId && sessions.has(mcpSessionId)) {
        // ── Existing session — reuse its transport ──
        const transport = sessions.get(mcpSessionId).transport;
        await transport.handleRequest(req.raw, reply.raw, req.body);
      } else {
        // ── New session — create a fresh server + transport ──
        const server = createMcpServer(fastify, serverUrl);
        const transport = new StreamableHTTPServerTransport({
          enableJsonResponse: true,
          sessionIdGenerator: () => uuidv4(),
        });
        await server.connect(transport);
        await transport.handleRequest(req.raw, reply.raw, req.body);

        // Store the session for subsequent requests
        const newSessionId = transport.sessionId;
        if (newSessionId) {
          sessions.set(newSessionId, { transport });
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

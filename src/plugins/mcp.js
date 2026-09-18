"use strict";

const { v4: uuidv4 } = require("uuid");
const {
  StreamableHTTPServerTransport,
} = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const { createMcpServer } = require("../mcp/index.js");
const { resolveAuth } = require("../mcp/tools/auth.js");
const {
  evaluateAccess,
  clientIp,
  SURFACE,
  PUBLIC_DENIAL_MESSAGE,
} = require("../utils/environmentAccess.js");
const { log: logActivity } = require("../utils/activityLog.js");
const { referenceFor } = require("../utils/activityReference.js");
const { SetMcpTools } = require("../controllers/activityLog.js");
const {
  captureRequest,
  buildResponseSnapshot,
} = require("../utils/capture.js");

/**
 * Fastify plugin that exposes the MCP (Model Context Protocol) endpoint.
 *
 * Each POST request gets a fresh server + transport so multiple agents
 * can connect simultaneously. Auth is a bearer token on the HTTP
 * Authorization header (obtained via the MCP OAuth flow at /oauth/*),
 * resolved once per request and threaded into every tool — never a
 * tool-call parameter, so it never touches LLM context.
 *
 * POST /mcp                  – JSON-RPC MCP endpoint (environment picker on connect)
 * POST /mcp/:environmentId   – Same endpoint, pre-locked to one environment (no picker)
 * GET  /mcp[/:environmentId] – Health / readiness check
 */
module.exports = async function (fastify, opts) {
  const serverUrl = process.env.APP_URL || "http://localhost:3000";
  const baseResourceMetadataUrl = `${serverUrl}/.well-known/oauth-protected-resource/api/v1/wrikexpi/mcp`;

  // Capture the response for non-hijacked MCP replies (the authorised
  // streaming path never reaches onSend — those rows carry no response
  // payload, and the UI shows "not captured" for them).
  // Store the response body for everything EXCEPT the 200/201 success path —
  // most rows are those, so skipping them keeps the table lean while still
  // capturing the payloads that matter (gate denials, 4xx/5xx, etc.).
  fastify.addHook("onSend", (req, reply, payload, done) => {
    try {
      const code = reply.statusCode;
      const capture = !(code === 200 || code === 201);
      if (
        capture &&
        payload !== undefined &&
        payload !== null &&
        typeof payload !== "function"
      ) {
        req.activityResponsePayload = buildResponseSnapshot(code, payload);
      }
    } catch {
      req.activityResponsePayload = null;
    }
    done();
  });

  /**
   * The reference for this request: created on first use, then the same value
   * for the rest of the request.
   *
   * MCP mints it itself instead of letting the generic error-reference hook do
   * it, because on this surface the row is written BEFORE the response goes
   * out (see recordActivity below). The row and the message have to name each
   * other, so whoever gets there first mints it and the other reuses it.
   */
  const referenceOnce = (req) => referenceFor(req, "mcp");

  /* The 401 this surface sends carries the reference too, so the row it just
     wrote and the message the client reads agree. */
  const sendUnauthorized = (
    reply,
    description,
    resourceMetadataUrl,
    reference,
  ) => {
    reply
      .code(401)
      .header(
        "WWW-Authenticate",
        `Bearer error="invalid_token", error_description="${description}", resource_metadata="${resourceMetadataUrl}"`,
      )
      .send({
        error: "invalid_token",
        error_description: description,
        reference,
      });
  };

  // Shared POST handler for both /mcp and /mcp/:environmentId — auth
  // resolution and tool wiring are identical either way (the bearer token
  // already carries its own environment from when it was minted); only the
  // resource_metadata URL advertised on a 401 differs, so OAuth discovery
  // for the env-specific route points at env-specific authorize metadata
  // (see routes/oauth/wellKnown.js) instead of the generic picker flow.
  const handleMcpPost = (resourceMetadataUrl) => async (req, reply) => {
    // Activity log — one row per MCP request (the REST path logs one row
    // per HTTP call the same way). Which TOOL that request called is only
    // known once the call has happened, so the row is annotated afterwards:
    // the permission gate reports every call through `onToolCall` below, and
    // the summary is written onto this row when the request is done. See
    // SetMcpTools in src/controllers/activityLog.js for why it is an update
    // rather than a second row, and why a refused tool call also flips the
    // row's outcome.
    const toolCalls = [];
    const recordActivity = ({
      envId,
      environmentName,
      actorEmail,
      tokenId,
      allowed,
      code,
      statusCode,
      referenceId,
    }) =>
      logActivity({
        envId: envId || null,
        environmentName: environmentName || null,
        tokenId: tokenId || null,
        surface: "mcp",
        actorEmail: actorEmail || null,
        action: null,
        resource: req.raw?.url || "/mcp",
        method: null,
        allowed,
        code,
        statusCode,
        referenceId: referenceId || null,
        ip: clientIp(req),
        category: "mcp",
        requestPayload: captureRequest(req),
        responsePayload: req.activityResponsePayload || null,
      });

    /**
     * The tool summary for this request, or null when it called no tool (an
     * `initialize` or `tools/list` handshake). Names in call order, deduped:
     * an agent that calls the same tool twice asked one question twice, and
     * the row is a summary rather than a transcript.
     */
    const toolSummary = () => {
      const names = [...new Set(toolCalls.map((call) => call.tool))];
      return names.length ? names.join(", ").slice(0, 255) : null;
    };

    /** The first refusal, if any tool call was refused. */
    const firstDenial = () => toolCalls.find((call) => !call.allowed) || null;

    const authHeader = req.headers.authorization || "";
    const [scheme, token] = authHeader.split(" ");
    if (scheme?.toLowerCase() !== "bearer" || !token) {
      const reference = referenceOnce(req);
      recordActivity({
        allowed: false,
        code: "UNAUTHORIZED",
        statusCode: 401,
        referenceId: reference,
      });
      return sendUnauthorized(
        reply,
        "Authorization required",
        resourceMetadataUrl,
        reference,
      );
    }

    const auth = await resolveAuth(token);
    if (!auth) {
      const reference = referenceOnce(req);
      recordActivity({
        allowed: false,
        code: "TOKEN_INVALID",
        statusCode: 401,
        referenceId: reference,
      });
      return sendUnauthorized(
        reply,
        "Token is invalid or expired",
        resourceMetadataUrl,
        reference,
      );
    }

    // Environment access scope, immediately after token validation — same
    // gate and same rules as the REST path (src/middlewares/authentication.js).
    let access;
    try {
      access = await evaluateAccess({
        envId: auth.envId,
        wrikeToken: auth.wrikeToken,
        ip: clientIp(req),
        // This is the MCP path, so entries scoped to the REST API only do
        // not apply.
        surface: SURFACE.MCP,
      });
    } catch (err) {
      recordActivity({
        envId: auth.envId,
        environmentName: auth.environmentName,
        tokenId: auth.tokenId,
        allowed: false,
        code: "AUTHORIZATION_ERROR",
        statusCode: 403,
        referenceId: referenceOnce(req),
      });
      return reply.code(403).send({
        error: "forbidden",
        error_description: "Access could not be verified for this token.",
        code: "AUTHORIZATION_ERROR",
        reference: referenceOnce(req),
      });
    }

    if (!access.allowed) {
      recordActivity({
        envId: auth.envId,
        environmentName: auth.environmentName,
        actorEmail: access.email,
        tokenId: auth.tokenId,
        allowed: false,
        code: access.code,
        statusCode: 403,
        referenceId: referenceOnce(req),
      });
      return reply.code(403).send({
        error: "forbidden",
        error_description: PUBLIC_DENIAL_MESSAGE,
        code: access.code,
        reference: referenceOnce(req),
      });
    }

    // Logged as "accepted" here, before the response is hijacked for
    // streaming — this measures whether the MCP connection was authorized,
    // not the success/failure of whatever tool calls happen over it. The
    // handshake row's id is kept so the tool summary can be written onto it
    // once the calls have happened.
    const rowWritten = recordActivity({
      envId: auth.envId,
      environmentName: auth.environmentName,
      actorEmail: access.email,
      tokenId: auth.tokenId,
      allowed: true,
      code: access.code,
      statusCode: 200,
    });

    if (typeof reply.hijack === "function") reply.hijack();

    // The response is written straight to the socket from here on, so the
    // generic error-reference hook never sees it: this surface mints its own
    // reference, and keeps a failed request's one so the row can carry it.
    let failureReference = null;

    try {
      // Ensure Accept header has both values required by the transport
      const accept = req.headers.accept || "";
      if (
        !accept.includes("text/event-stream") ||
        !accept.includes("application/json")
      ) {
        req.raw.headers.accept = "application/json, text/event-stream";
      }

      // Fresh server + transport per request — no shared session state. The
      // gate is handed the collector, so every tool call this request makes
      // is reported as it happens.
      const server = await createMcpServer(fastify, serverUrl, auth, (call) =>
        toolCalls.push(call),
      );
      const transport = new StreamableHTTPServerTransport({
        enableJsonResponse: true,
      });
      await server.connect(transport);
      await transport.handleRequest(req.raw, reply.raw, req.body);
    } catch (err) {
      const code = err?.statusCode || 500;
      failureReference = referenceOnce(req);
      reply.raw.writeHead(code, { "Content-Type": "application/json" });
      reply.raw.end(
        JSON.stringify({
          success: false,
          message: err?.message || "MCP request handling failed.",
          reference: failureReference,
        }),
      );
    } finally {
      // The tool names and any refusal, onto the row this request wrote. Chained
      // off the (already started) write rather than awaited: the response is on
      // the wire by now, and nothing about the caller's result depends on this.
      rowWritten.then((row) => {
        if (!row?.id) return null;
        const refusal = firstDenial();
        return SetMcpTools(row.id, {
          tool: toolSummary(),
          code: refusal?.code || null,
          // Reported by the gate with the refusal, so it matches the id the
          // agent was given in the FORBIDDEN result. A request that failed
          // before any tool ran stores its own, which is the one its caller
          // was shown.
          referenceId: refusal?.reference || failureReference || null,
        });
      });
    }
  };

  fastify.post("/mcp", handleMcpPost(baseResourceMetadataUrl));
  fastify.post("/mcp/:environmentId", (req, reply) =>
    handleMcpPost(`${baseResourceMetadataUrl}/${req.params.environmentId}`)(
      req,
      reply,
    ),
  );

  // ── MCP GET health endpoint ──────────────────────────────────────
  fastify.get("/mcp", async (req, reply) => {
    reply.send({
      success: true,
      message: "WrikeXPI MCP endpoint is ready.",
      transport: "streamable-http",
      protocol: "Model Context Protocol",
    });
  });
  fastify.get("/mcp/:environmentId", async (req, reply) => {
    reply.send({
      success: true,
      message: `WrikeXPI MCP endpoint is ready (environment ${req.params.environmentId}).`,
      transport: "streamable-http",
      protocol: "Model Context Protocol",
    });
  });
};

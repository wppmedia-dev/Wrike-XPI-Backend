import crypto from "crypto";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import redisClient from "../utils/redis";
import {
  CONFIRM_KEY,
  CONFIRMATION_TOOL_NOTE,
  confirmField,
  confirmationRequest,
  isConfirmed,
  isDestructiveTool,
  isMutatingTool,
} from "./tools/confirmation.js";

const WRIKE_MCP_TIMEOUT_MS = 8000;
const WRIKE_MCP_TOOLS_CACHE_TTL_SECONDS = 300;

/**
 * `fetch()` failures collapse to a useless generic "fetch failed" message —
 * the real reason (DNS, TLS, ECONNREFUSED, a 401/403 from the remote server)
 * lives in `err.cause` or, for HTTP-status errors the SDK throws, in
 * `err.code`/`err.data`. Surface all of it so this is actually debuggable.
 */
const describeError = (err) => {
  const parts = [err?.message || String(err)];
  if (err?.cause) parts.push(`cause: ${err.cause.message || err.cause}`);
  if (err?.code !== undefined) parts.push(`code: ${err.code}`);
  if (err?.data !== undefined) parts.push(`data: ${JSON.stringify(err.data)}`);
  return parts.join(" | ");
};

/**
 * Connect a short-lived MCP client to Wrike's own hosted MCP server, using
 * the same raw Wrike OAuth access token this app already holds per-request.
 * Guarded by an AbortController so a slow/down Wrike MCP can't hang requests.
 */
const connectWrikeMcpClient = async (wrikeToken) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WRIKE_MCP_TIMEOUT_MS);
  try {
    const transport = new StreamableHTTPClientTransport(
      new URL(process.env.WRIKE_MCP_URL),
      {
        requestInit: {
          headers: { Authorization: `Bearer ${wrikeToken}` },
          signal: controller.signal,
        },
      },
    );
    const client = new Client(
      { name: "wrikexpi-mcp-proxy", version: "1.0.0" },
      { capabilities: {} },
    );
    await client.connect(transport);
    return client;
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Best-effort JSON-Schema -> zod raw shape converter, scoped to what MCP
 * tool schemas actually use (flat/shallow string/number/boolean/array/object
 * fields, optionally an enum). Falls back to z.any() for anything exotic
 * (oneOf/anyOf/const/etc.) rather than trying to be spec-complete.
 */
const jsonSchemaPropertyToZod = (prop) => {
  if (!prop || typeof prop !== "object") return z.any();

  let schema;
  if (
    Array.isArray(prop.enum) &&
    prop.enum.every((v) => typeof v === "string")
  ) {
    schema = prop.enum.length > 0 ? z.enum(prop.enum) : z.string();
  } else {
    switch (prop.type) {
      case "string":
        schema = z.string();
        break;
      case "number":
      case "integer":
        schema = z.number();
        break;
      case "boolean":
        schema = z.boolean();
        break;
      case "array":
        schema = z.array(
          prop.items ? jsonSchemaPropertyToZod(prop.items) : z.any(),
        );
        break;
      case "object":
        schema = prop.properties
          ? z.object(jsonSchemaToZodShape(prop)).partial()
          : z.record(z.any());
        break;
      default:
        schema = z.any();
    }
  }

  if (prop.description) schema = schema.describe(prop.description);
  return schema;
};

export const jsonSchemaToZodShape = (schema) => {
  const properties = schema?.properties || {};
  const required = new Set(schema?.required || []);
  const shape = {};

  Object.entries(properties).forEach(([key, prop]) => {
    let fieldSchema = jsonSchemaPropertyToZod(prop);
    if (!required.has(key)) fieldSchema = fieldSchema.optional();
    shape[key] = fieldSchema;
  });

  return shape;
};

const cacheKeyForToken = (wrikeToken) =>
  redisClient.generateKey(
    "wrike-mcp-tools",
    crypto.createHash("sha256").update(wrikeToken).digest("hex"),
  );

/**
 * Fetch Wrike's own MCP tool list for this token, Redis-cached briefly so we
 * aren't round-tripping to mcp.wrike.com on every single request. Never
 * throws — returns [] on any failure (missing config, network error,
 * timeout, invalid token) so native XPI tools always stay available.
 */
export const getWrikeMcpTools = async (fastify, wrikeToken) => {
  if (!process.env.WRIKE_MCP_URL || !wrikeToken) return [];

  const cacheKey = cacheKeyForToken(wrikeToken);
  const cached = await redisClient.get(cacheKey);
  if (Array.isArray(cached)) return cached;

  let client;
  try {
    client = await connectWrikeMcpClient(wrikeToken);
    const { tools } = await client.listTools();
    fastify?.log?.info?.(
      `Wrike MCP tools/list returned ${tools?.length ?? 0} tool(s)${
        !tools?.length
          ? " — check the token's scope/app authorization on Wrike's side"
          : ""
      }`,
    );
    await redisClient.set(cacheKey, tools, WRIKE_MCP_TOOLS_CACHE_TTL_SECONDS);
    return tools;
  } catch (err) {
    fastify?.log?.warn?.(
      `Wrike MCP tools/list failed, continuing with native tools only: ${describeError(err)}`,
    );
    return [];
  } finally {
    await client?.close?.().catch(() => {});
  }
};

/**
 * Proxy a single tool call through to Wrike's own MCP server. On success,
 * relays the result as-is (already the correct MCP CallToolResult shape).
 * On failure, returns an MCP-shaped error result rather than throwing.
 */
const proxyCallTool = async (fastify, wrikeToken, remoteName, args) => {
  let client;
  try {
    client = await connectWrikeMcpClient(wrikeToken);
    return await client.callTool({ name: remoteName, arguments: args || {} });
  } catch (err) {
    fastify?.log?.warn?.(
      `Wrike MCP call to "${remoteName}" failed: ${describeError(err)}`,
    );
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: err?.message || "Wrike MCP call failed",
        },
      ],
    };
  } finally {
    await client?.close?.().catch(() => {});
  }
};

/**
 * Register every tool Wrike's own MCP currently exposes onto our local
 * server, prefixed with `wrike_` to avoid colliding with native XPI tool
 * names and to signal to the LLM which tools are raw Wrike operations vs
 * XPI business-logic tools. No-ops (registers nothing) if WRIKE_MCP_URL is
 * unset or if fetching the remote tool list fails for any reason.
 *
 * Mutating tools are wrapped in the same two-step confirmation gate as the
 * native write tools (see tools/confirmation.js): a call without an explicit
 * `confirm: true` returns a preview and is never forwarded to Wrike. The
 * `confirm` flag is stripped from the arguments before forwarding, so Wrike
 * never receives a parameter its own schema does not define.
 *
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server
 * @param {object} fastify
 * @param {string} wrikeToken
 */
export const registerWrikeProxyTools = async (server, fastify, wrikeToken) => {
  const tools = await getWrikeMcpTools(fastify, wrikeToken);

  tools.forEach((tool) => {
    try {
      const localName = `wrike_${tool.name}`;
      const gated = isMutatingTool(tool);
      const destructive = isDestructiveTool(tool);
      const inputSchema = jsonSchemaToZodShape(tool.inputSchema);

      // Guard the key: if Wrike ever ships its own `confirm` field, its
      // schema wins rather than being silently replaced.
      if (gated && !inputSchema[CONFIRM_KEY]) {
        inputSchema[CONFIRM_KEY] = confirmField(`call to ${tool.name}`);
      }

      server.registerTool(
        localName,
        {
          description:
            `[Wrike] ${tool.description || ""}`.trim() +
            (gated ? CONFIRMATION_TOOL_NOTE : ""),
          inputSchema,
          annotations: gated
            ? {
                ...tool.annotations,
                readOnlyHint: false,
                destructiveHint: destructive,
              }
            : tool.annotations,
        },
        async (args) => {
          const { [CONFIRM_KEY]: confirm, ...forwarded } = args || {};

          if (gated && !isConfirmed(confirm)) {
            return confirmationRequest({
              toolName: localName,
              action: "perform this Wrike write",
              target: `Wrike tool ${tool.name}`,
              arguments: forwarded,
              warning: destructive
                ? "This Wrike operation can overwrite or remove existing data and may not be reversible from this server."
                : "This Wrike operation changes data in the connected Wrike account.",
            });
          }

          return proxyCallTool(fastify, wrikeToken, tool.name, forwarded);
        },
      );
    } catch (err) {
      fastify?.log?.warn?.(
        `Skipping Wrike MCP tool "${tool.name}" — failed to register: ${err?.message || err}`,
      );
    }
  });
};

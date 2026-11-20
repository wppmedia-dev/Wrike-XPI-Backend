import { adminFetch } from "./authApi";
import { portalFetch } from "./portalAuthApi";

/* Mirrors /api/v1/admin/settings/* (src/routes/admin/settings) and, for portal
   users granted the "security" module, /api/v1/portal/security/*
   (src/routes/portal/security): the same two settings behind two sign-ins. The
   bounds and defaults come from the server so the form checks against what is
   actually enforced. */

export interface Range {
  min: number;
  max: number;
}

export interface McpTokenSettings {
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
  bounds: { accessTtlSeconds: Range; refreshTtlSeconds: Range };
  defaults: { accessTtlSeconds: number; refreshTtlSeconds: number };
}

/** The admin console's own sign-in by default; the portal passes its token.
    Explicit per call, never module state, so the two cannot bleed together. */
export interface Transport {
  surface: "admin" | "portal";
  token?: string | null;
}

async function request(
  path: string,
  init: RequestInit | undefined,
  transport: Transport | undefined,
  failure: string,
): Promise<any> {
  const res =
    transport?.surface === "portal"
      ? await portalFetch(`/api/v1/portal/security${path}`, transport.token || "", init)
      : await adminFetch(`/api/v1/admin/settings${path}`, init);
  const body = await res.json().catch(() => null);

  if (!res.ok || !body?.success) {
    throw new Error(body?.message || failure);
  }

  return body.data;
}

const put = (body: unknown): RequestInit => ({
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const getMcpTokenSettings = (t?: Transport): Promise<McpTokenSettings> =>
  request("/mcp-tokens", undefined, t, "Failed to load MCP token settings");

export const saveMcpTokenSettings = (
  values: { accessTtlSeconds: number; refreshTtlSeconds: number },
  t?: Transport,
): Promise<McpTokenSettings> =>
  request("/mcp-tokens", put(values), t, "Failed to save MCP token settings");

export const getCrossTokenAccess = async (t?: Transport): Promise<boolean> =>
  !!(await request("/cross-token-access", undefined, t, "Failed to load cross-token access setting"))
    .enabled;

export const saveCrossTokenAccess = async (
  enabled: boolean,
  t?: Transport,
): Promise<boolean> =>
  !!(await request("/cross-token-access", put({ enabled }), t, "Failed to save cross-token access setting"))
    .enabled;

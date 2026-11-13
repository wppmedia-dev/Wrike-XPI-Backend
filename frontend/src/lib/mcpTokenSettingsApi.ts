import { adminFetch } from "./authApi";

/* Mirrors /api/v1/admin/settings/mcp-tokens (src/routes/admin/settings). The
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

const BASE = "/api/v1/admin/settings/mcp-tokens";

export const getMcpTokenSettings = async (): Promise<McpTokenSettings> => {
  const res = await adminFetch(BASE);
  const body = await res.json().catch(() => null);

  if (!res.ok || !body?.success) {
    throw new Error(body?.message || "Failed to load MCP token settings");
  }

  return body.data;
};

export const saveMcpTokenSettings = async (values: {
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
}): Promise<McpTokenSettings> => {
  const res = await adminFetch(BASE, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values),
  });
  const body = await res.json().catch(() => null);

  if (!res.ok || !body?.success) {
    throw new Error(body?.message || "Failed to save MCP token settings");
  }

  return body.data;
};

const CROSS_BASE = "/api/v1/admin/settings/cross-token-access";

export const getCrossTokenAccess = async (): Promise<boolean> => {
  const res = await adminFetch(CROSS_BASE);
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success) {
    throw new Error(body?.message || "Failed to load cross-token access setting");
  }
  return !!body.data.enabled;
};

export const saveCrossTokenAccess = async (enabled: boolean): Promise<boolean> => {
  const res = await adminFetch(CROSS_BASE, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success) {
    throw new Error(body?.message || "Failed to save cross-token access setting");
  }
  return !!body.data.enabled;
};

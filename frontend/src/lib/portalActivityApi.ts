import { portalFetch } from "./portalAuthApi";
import { toQueryString } from "./queryString";

/* ── Types ──────────────────────────────────────────────────────────────
   Mirrors /api/v1/portal/activity-logs/* (src/routes/portal/activity/index.js),
   the read-only counterpart of frontend/src/lib/activityLogApi.ts. */

export type PortalSurface = "rest" | "mcp";

export interface PortalActivityRow {
  id: string;
  env_id: string | null;
  environment_name: string | null;
  /** The token row this call was made with, when the call carried one. Null on
      rows written before the column existed. */
  token_id: string | null;
  surface: PortalSurface;
  actor_email: string | null;
  action: string | null;
  resource: string;
  method: string | null;
  allowed: boolean;
  code: string | null;
  status_code: number | null;
  ip: string | null;
  category: string | null;
  /** The MCP tool(s) the agent called, in call order. Null for REST rows. */
  mcp_tool: string | null;
  /** The reference the caller was shown when this call failed ("XPI-XXXXXXXX").
      Set only on error rows. src/utils/activityReference.js. */
  reference_id: string | null;
  created_at: string;
}

export interface PortalActivityList {
  rows: PortalActivityRow[];
  total: number;
  limit: number;
  offset: number;
}

export interface PortalActivitySummary {
  total: number;
  allowed: number;
  denied: number;
}

export interface PortalActivityConfig {
  retention_days: number;
}

export interface PortalActivityFilters {
  env_id?: string;
  /** One token's rows only, the filter the API Tokens page's "Activity logs"
      action applies. The server refuses to honour an id outside the caller's
      own environments (src/routes/portal/activity/index.js). */
  token_id?: string;
  /** The one search box: matched against the caller's email and the reference
      id of a failed call, as substrings. */
  search?: string;
  surface?: PortalSurface;
  allowed?: boolean;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

const BASE = "/api/v1/portal/activity-logs";

async function request<T>(token: string, path: string): Promise<T> {
  const res = await portalFetch(`${BASE}${path}`, token);
  const json = await res.json().catch(() => null);
  if (!res.ok || json?.success === false) {
    throw new Error(json?.message || "Request failed");
  }
  return json?.data as T;
}

const qs = (filters: PortalActivityFilters): string =>
  toQueryString({
    env_id: filters.env_id,
    token_id: filters.token_id,
    search: filters.search,
    surface: filters.surface,
    allowed: filters.allowed === undefined ? undefined : String(filters.allowed),
    from: filters.from,
    to: filters.to,
    limit: filters.limit,
    offset: filters.offset,
  });

export const getPortalActivitySummary = (
  token: string,
  envId?: string,
  tokenId?: string,
) =>
  request<PortalActivitySummary>(
    token,
    `/summary${toQueryString({ env_id: envId, token_id: tokenId })}`,
  );

/** GET /api/v1/portal/activity-logs/config — how long rows are kept, so the
    page can show the same retention note the admin console does. */
export const getPortalActivityConfig = (token: string) =>
  request<PortalActivityConfig>(token, "/config");

export const listPortalActivity = (token: string, filters: PortalActivityFilters = {}) =>
  request<PortalActivityList>(token, qs(filters));

/**
 * GET /api/v1/portal/activity-logs/export — same filters as the list, minus
 * pagination, streamed back as a CSV file. Read as a blob and handed to the
 * browser as a download, same approach as the admin console's
 * exportActivityCsv (frontend/src/lib/activityLogApi.ts).
 */
export const exportPortalActivity = async (
  token: string,
  filters: Omit<PortalActivityFilters, "limit" | "offset"> = {},
): Promise<void> => {
  const res = await portalFetch(`${BASE}/export${qs(filters)}`, token);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message || "Export failed");
  }
  const blob = await res.blob();
  const match = res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/);
  downloadBlob(blob, match?.[1] || "activity-log.csv");
};

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

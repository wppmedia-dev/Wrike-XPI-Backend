import { adminFetch } from "./authApi";

/* ── Types ──────────────────────────────────────────────────────────────
   Mirrors /api/v1/admin/activity/* (src/routes/admin/activity/index.js). */

export type Surface = "rest" | "mcp";

export interface ActivityRow {
  id: string;
  env_id: string | null;
  environment_name: string | null;
  /** The token that made the call — null for rows written before this was
      recorded, and for calls that fail before a token is identified. */
  token_id: string | null;
  surface: Surface;
  actor_email: string | null;
  action: string | null;
  resource: string;
  method: string | null;
  allowed: boolean;
  code: string | null;
  status_code: number | null;
  ip: string | null;
  category: string | null;
  /**
   * The MCP tool(s) the agent called, in call order. Null for REST rows and for
   * an MCP request that only handshook — the row is written before the tool
   * runs, and annotated once it has (src/controllers/activityLog.js
   * SetMcpTools).
   */
  mcp_tool: string | null;
  /**
   * The reference the caller was shown when this call failed (the `reference`
   * field in the error body, "XPI-XXXXXXXX"). Set only on error rows: a call
   * that succeeded was never given one. src/utils/activityReference.js.
   */
  reference_id: string | null;
  request_payload: unknown;
  response_payload: unknown;
  created_at: string;
}

export interface ActivityList {
  rows: ActivityRow[];
  total: number;
  limit: number;
  offset: number;
}

export interface ActivitySummary {
  total: number;
  allowed: number;
  denied: number;
}

export interface ActivityConfig {
  retention_days: number;
}

export interface ActivityFilters {
  env_id?: string;
  /** Exact token id — what the API Tokens table's "Activity logs" action
      sets, so the page opens on one token's history. */
  token_id?: string;
  /** The one search box: matched against the caller's email and the reference
      id of a failed call, as substrings. */
  search?: string;
  surface?: Surface;
  allowed?: boolean;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

const BASE = "/api/v1/admin/activity";

async function request<T>(path: string): Promise<T> {
  const res = await adminFetch(`${BASE}${path}`);
  const json = await res.json().catch(() => null);

  if (!res.ok || json?.success === false) {
    throw new Error(json?.message || "Request failed");
  }

  return json?.data as T;
}

const qs = (filters: ActivityFilters): string => {
  const params = new URLSearchParams();
  if (filters.env_id) params.set("env_id", filters.env_id);
  if (filters.token_id) params.set("token_id", filters.token_id);
  if (filters.search) params.set("search", filters.search);
  if (filters.surface) params.set("surface", filters.surface);
  if (filters.allowed !== undefined) params.set("allowed", String(filters.allowed));
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.limit) params.set("limit", String(filters.limit));
  if (filters.offset) params.set("offset", String(filters.offset));
  const s = params.toString();
  return s ? `?${s}` : "";
};

export const getActivityConfig = () => request<ActivityConfig>("/config");

/** The strip above the list counts the same slice of the log the list shows,
    so a token-filtered view does not report the whole environment's totals. */
export const getActivitySummary = (
  filters: { env_id?: string; token_id?: string } = {},
) => {
  const params = new URLSearchParams();
  if (filters.env_id) params.set("env_id", filters.env_id);
  if (filters.token_id) params.set("token_id", filters.token_id);
  const s = params.toString();
  return request<ActivitySummary>(`/summary${s ? `?${s}` : ""}`);
};

export const listActivity = (filters: ActivityFilters = {}) =>
  request<ActivityList>(`${qs(filters)}`);

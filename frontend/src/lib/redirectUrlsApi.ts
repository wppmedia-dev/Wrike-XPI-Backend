import { adminFetch } from "./authApi";
import { portalFetch } from "./portalAuthApi";

/* Mirrors /api/v1/admin/redirect-urls/* (src/routes/admin/redirectUrls) and
   /api/v1/portal/redirect-urls/* (src/routes/portal/redirectUrls): the list of
   addresses a sign-in may return the browser to, per environment. */

export interface RedirectRule {
  id: string;
  env_id: string;
  value: string;
  label: string | null;
  is_enabled: boolean;
  created_at?: string;
  updated_at?: string;
}

/** Same shape as environmentAccessApi's Transport: the admin console's own by
    default, or the portal with its token. Explicit per call, never module
    state, so the two surfaces cannot bleed into each other. */
export interface Transport {
  surface: "admin" | "portal";
  token?: string | null;
}

const ADMIN_TRANSPORT: Transport = { surface: "admin" };

async function request<T>(
  path: string,
  init?: RequestInit,
  transport: Transport = ADMIN_TRANSPORT,
): Promise<T> {
  const res =
    transport.surface === "portal"
      ? await portalFetch(`/api/v1/portal/redirect-urls${path}`, transport.token || "", init)
      : await adminFetch(`/api/v1/admin/redirect-urls${path}`, init);
  const json = await res.json().catch(() => null);

  if (!res.ok || json?.success === false) {
    throw new Error(json?.message || "Request failed");
  }

  return json?.data as T;
}

const jsonBody = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export type StatusFilter = "all" | "enabled" | "disabled";

export interface RedirectRulePage {
  rows: RedirectRule[];
  /** Entries matching the search and filter, across every page. */
  total: number;
  /** The page actually returned: the server pulls a page past the end back. */
  page: number;
  page_size: number;
  total_pages: number;
  /** The whole list, whatever the search or filter says. */
  counts: { total: number; enabled: number };
}

/** One page of the list. Search, the status filter and paging are done by the
    server (RedirectRules.ListRulesPage), never in the browser, because the list
    can be any length. */
export const listRedirectRules = (
  envId: string,
  query: { search?: string; status?: StatusFilter; page?: number; pageSize?: number } = {},
  t?: Transport,
) => {
  const params = new URLSearchParams({ env_id: envId });
  if (query.search?.trim()) params.set("search", query.search.trim());
  if (query.status && query.status !== "all") params.set("status", query.status);
  if (query.page) params.set("page", String(query.page));
  if (query.pageSize) params.set("page_size", String(query.pageSize));

  return request<RedirectRulePage>(`/rules?${params.toString()}`, undefined, t);
};

export const createRedirectRule = (
  payload: { env_id: string; value: string; label?: string | null; is_enabled?: boolean },
  t?: Transport,
) => request<RedirectRule>("/rules", jsonBody("POST", payload), t);

export const updateRedirectRule = (
  id: string,
  payload: { value?: string; label?: string | null; is_enabled?: boolean },
  t?: Transport,
) => request<RedirectRule>(`/rules/${id}`, jsonBody("PUT", payload), t);

export const deleteRedirectRule = (id: string, t?: Transport) =>
  request<null>(`/rules/${id}`, { method: "DELETE" }, t);

/** Would the login flow honour this address for this environment? Asked of the
    server, so the answer is the real gate's, not a copy of its rules. */
export const checkRedirectUri = (envId: string, redirectUri: string, t?: Transport) =>
  request<{ allowed: boolean }>(
    "/check",
    jsonBody("POST", { env_id: envId, redirect_uri: redirectUri }),
    t,
  );

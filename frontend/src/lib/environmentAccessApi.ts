import ipaddr from "ipaddr.js";
import { adminFetch } from "./authApi";
import { portalFetch } from "./portalAuthApi";
import { toggleEnvironmentStatus } from "./adminApi";

/* ── Types ──────────────────────────────────────────────────────────────
   Mirrors /api/v1/admin/environment-access/* (src/routes/admin/environmentAccess)
   and, read-side only, /api/v1/portal/environment-access/*
   (src/routes/portal/environmentAccess). */

export type RuleType = "email" | "domain" | "ip";

/** Which surface an entry grants access to. */
export type AppliesTo = "api" | "mcp" | "both";

/** The surface the check simulator evaluates against. */
export type Surface = "api" | "mcp";

export interface AccessRule {
  id: string;
  env_id: string;
  rule_type: RuleType;
  value: string;
  label: string | null;
  applies_to: AppliesTo;
  is_enabled: boolean;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface AccessSummaryRow {
  env_id: string;
  rules_total: number;
  rules_enabled: number;
}

export type CheckStatus = "pass" | "fail";

export interface CheckStep {
  status: CheckStatus;
  detail: string;
}

export interface CheckResult {
  allowed: boolean;
  code: string;
  message: string;
  email: string | null;
  ip: string | null;
  surface: Surface;
  matchedRule: {
    rule_type: RuleType;
    value: string;
    label: string | null;
    applies_to: AppliesTo;
  } | null;
  checks: CheckStep[];
}

/* ── Transport ──────────────────────────────────────────────────────── */

const ADMIN_BASE = "/api/v1/admin/environment-access";
const PORTAL_BASE = "/api/v1/portal/environment-access";

/**
 * Explicit per-call transport, not module state: every exported function
 * below takes an optional trailing `Transport`, defaulting to the admin
 * console's own (adminFetch reads its stored token internally) so every
 * existing admin call site — none of which pass this — keeps working
 * unchanged. The portal's read-only environment-access view (rendered
 * through the same <EnvironmentAccess /> component, canWrite=false) passes
 * `{ surface: "portal", token }` on every call — see
 * PortalEnvironmentAccess.tsx. Kept explicit rather than a module-level
 * "current surface" so admin and portal usage can never bleed into each
 * other regardless of render order.
 */
export interface Transport {
  surface: "admin" | "portal";
  /** Required when surface is "portal" (portalFetch needs it explicitly). */
  token?: string | null;
}

const ADMIN_TRANSPORT: Transport = { surface: "admin" };

async function parseJson(res: Response): Promise<any> {
  return res.json().catch(() => null);
}

async function request<T>(
  path: string,
  init?: RequestInit,
  transport: Transport = ADMIN_TRANSPORT,
): Promise<T> {
  const base = transport.surface === "portal" ? PORTAL_BASE : ADMIN_BASE;
  const res =
    transport.surface === "portal"
      ? await portalFetch(`${base}${path}`, transport.token || "", init)
      : await adminFetch(`${base}${path}`, init);
  const json = await parseJson(res);

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

/** The IP the server sees this caller's request from — the exact value the
    real IP allow-list gate reads, so "Use my IP" always fills in something
    that would actually match if saved as-is. */
export const getMyIp = (t?: Transport) => request<{ ip: string | null }>("/my-ip", undefined, t);

export const getAccessSummary = (t?: Transport) =>
  request<Record<string, AccessSummaryRow>>("/summary", undefined, t).then((rows) => rows || {});

export const listRules = (envId: string, t?: Transport) =>
  request<AccessRule[]>(`/rules?env_id=${encodeURIComponent(envId)}`, undefined, t).then(
    (rows) => rows || [],
  );

export const createRule = (
  payload: {
    env_id: string;
    rule_type: RuleType;
    value: string;
    label?: string | null;
    applies_to?: AppliesTo;
    is_enabled?: boolean;
  },
  t?: Transport,
) => request<AccessRule>("/rules", jsonBody("POST", payload), t);

export const updateRule = (
  id: string,
  payload: {
    value?: string;
    label?: string | null;
    applies_to?: AppliesTo;
    is_enabled?: boolean;
  },
  t?: Transport,
) => request<AccessRule>(`/rules/${id}`, jsonBody("PUT", payload), t);

export const deleteRule = (id: string, t?: Transport) =>
  request<null>(`/rules/${id}`, { method: "DELETE" }, t);

/**
 * The two API-access gate switches.
 *
 * The admin console already had a home for these — PATCH
 * /admin/credentials/:id/status (frontend/src/lib/adminApi.ts
 * toggleEnvironmentStatus, which also carries is_active/is_visible) — so the
 * admin branch keeps calling that and the console is untouched. The portal has
 * no credentials route, so it gets its own: PATCH
 * /portal/environment-access/gates (src/routes/portal/environmentAccess),
 * behind the environment_access module's "update" action and scoped to
 * environments the caller owns.
 */
export const setEnvironmentGates = async (
  envId: string,
  payload: { allowlist_check_enabled?: boolean; custom_field_check_enabled?: boolean },
  t?: Transport,
): Promise<void> => {
  if (!t || t.surface === "admin") {
    await toggleEnvironmentStatus(envId, payload);
    return;
  }

  await request<null>("/gates", jsonBody("PATCH", { env_id: envId, ...payload }), t);
};

export const checkAccess = (
  env_id: string,
  email: string,
  ip: string,
  surface: Surface = "api",
  t?: Transport,
) =>
  request<CheckResult>(
    "/check",
    jsonBody("POST", {
      env_id,
      email: email || undefined,
      ip: ip || undefined,
      surface,
    }),
    t,
  );

/* ── Shaping helpers ───────────────────────────────────────────────── */

const RULE_TYPE_LABEL: Record<RuleType, string> = {
  email: "Email",
  domain: "Domain",
  ip: "IP address",
};

export const ruleTypeLabel = (type: RuleType) => RULE_TYPE_LABEL[type];

const APPLIES_TO_LABEL: Record<AppliesTo, string> = {
  api: "API",
  mcp: "MCP",
  both: "API + MCP",
};

export const appliesToLabel = (scope: AppliesTo) => APPLIES_TO_LABEL[scope] || scope;

export const APPLIES_TO_OPTIONS: { value: AppliesTo; label: string; hint: string }[] = [
  { value: "both", label: "API + MCP", hint: "Works everywhere" },
  { value: "api", label: "API only", hint: "REST calls only" },
  { value: "mcp", label: "MCP only", hint: "MCP agents only" },
];

/**
 * Guess the rule type from raw input as the admin types, so they don't have
 * to pick a tab before they've typed anything. Order matters: an IP is the
 * most structurally distinct, then an email (has "@"), then everything else
 * is treated as a domain.
 */
export const inferRuleType = (raw: string): RuleType => {
  const value = raw.trim();
  if (!value) return "email";
  if (/^[0-9a-f:.]+(\/\d{1,3})?$/i.test(value) && (value.includes(":") || value.includes("."))) {
    // Only treat it as an IP if it doesn't look like an email/domain — a bare
    // dotted token with no "@" and no letters outside hex is the IPv4 case;
    // IPv6 always has a colon.
    if (value.includes(":") || /^\d{1,3}(\.\d{1,3}){3}(\/\d{1,2})?$/.test(value)) {
      return "ip";
    }
  }
  if (value.includes("@")) return "email";
  return "domain";
};

/**
 * The console's copy of `validateRuleValue` in
 * src/controllers/environmentAccess.js — same rules, and the messages are
 * copied word for word, so a value the form refuses and the same value the
 * API refuses read identically to the admin rather than describing one rule
 * two ways.
 *
 * Returns null when the value is acceptable, or the reason it is not. The
 * server stays the authority (an API caller sets rule_type without this form
 * in the way); this only moves the answer to where the admin is typing.
 *
 * The IP check imports the SAME parser the API uses rather than re-deriving
 * it, because "what is an IP" is full of corners that a hand-rolled regex gets
 * wrong in the direction that hurts: `ipaddr.js` accepts shortened IPv4
 * ("1.2.3"), leading zeros ("1.2.3.04") and IPv6 zone ids ("fe80::1%eth0"),
 * and a stricter client would refuse values the API happily stores.
 */
export const validateRuleValue = (ruleType: RuleType, rawValue: string): string | null => {
  const value = String(rawValue ?? "").trim();

  if (!value) return "Value must not be empty!";

  if (ruleType === "email") {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
      ? null
      : `"${value}" is not a valid email address.`;
  }

  if (ruleType === "domain") {
    const bare = value.replace(/^@+/, "");
    return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(bare)
      ? null
      : `"${value}" is not a valid domain.`;
  }

  if (ruleType === "ip") {
    try {
      if (value.includes("/")) ipaddr.parseCIDR(value);
      else ipaddr.parse(value);
      return null;
    } catch {
      return `"${value}" is not a valid IP address or CIDR range (e.g. 203.0.113.4 or 203.0.113.0/24).`;
    }
  }

  return `Unknown rule type "${ruleType}".`;
};

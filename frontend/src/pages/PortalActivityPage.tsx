import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { getPortalToken } from "../lib/portalAuthApi";
import {
  exportPortalActivity,
  getPortalActivityConfig,
  getPortalActivitySummary,
  listPortalActivity,
  type PortalActivityConfig,
  type PortalActivityRow,
  type PortalActivitySummary,
  type PortalSurface,
} from "../lib/portalActivityApi";
import { formatDateTime } from "../lib/format";
import AdminSelect from "../components/AdminSelect";
import { CopyButton } from "../components/ui/CopyButton";
import { PageInfo } from "../components/ui/PageInfo";
import { PORTAL_HELP } from "../lib/pageHelp";
import { callerNote } from "../lib/activityCaller";
import { InfoTip } from "../components/ui/InfoTip";
import { FilterPopover } from "../components/ui/FilterPopover";
import { toast } from "../lib/notify";
import "./PortalActivityPage.css";

/* The portal Activity Log.
 *
 * Deliberately the same page as the admin console's Activity Log
 * (frontend/src/pages/ActivityLog.tsx) — same retention pill, same filter
 * bar with its two chip groups, same table card, clickable rows opening the
 * same call-details modal, same numbered pager. The differences are all
 * consequences of the portal side of the API, not design choices:
 *
 *   - Read-only. The "activity_logs" portal-permission module only ever
 *     grants "read" (src/utils/portalPermissionCatalog.js), so there is no
 *     write action to render — the page says so once, in the header.
 *   - Row-level scoping. src/routes/portal/activity/index.js only lets a
 *     portal user query environments they own, so the environment filter is
 *     built from the caller's own environments and omitted entirely when
 *     they have none (or no permission to list them).
 */

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const DEFAULT_PAGE_SIZE = 10;

/**
 * The portal's CSV export is capped at a one-week date range — the on-screen
 * Filters popover's date range is unrestricted, same as the admin console
 * (frontend/src/pages/ActivityLog.tsx). Only export needs the cap: it pulls
 * every matching row in one go rather than a page at a time, so an unbounded
 * range there (not just an unbounded row count) is what actually risks a
 * huge download.
 */
const MAX_RANGE_DAYS = 7;

const toDateOnly = (iso: string): string => iso.slice(0, 10);

const addDays = (iso: string, days: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateOnly(d.toISOString());
};

/**
 * Keeps a {fromFilter, toFilter} pair within MAX_RANGE_DAYS of each other.
 * Named to match the draft state's own field names, so the result can be
 * spread straight into it (`{ ...d, ...clampDateRange(...) }`) without a
 * mismatch — a from/to-keyed result silently spreading in as two new,
 * unused properties instead of updating fromFilter/toFilter was exactly
 * the bug that left the picker showing nothing after a selection.
 *
 * Called with whichever side just changed; clamps the *other* side down/up
 * if the edit pushed the pair wider than the cap, rather than rejecting the
 * edit itself — so picking a "From" date always wins, and "To" moves to
 * stay in range.
 */
const clampDateRange = (
  from: string,
  to: string,
  changed: "from" | "to",
): { fromFilter: string; toFilter: string } => {
  if (!from || !to) return { fromFilter: from, toFilter: to };
  const fromMs = new Date(`${from}T00:00:00Z`).getTime();
  const toMs = new Date(`${to}T00:00:00Z`).getTime();
  const spanDays = Math.round((toMs - fromMs) / 86400000);
  if (spanDays <= MAX_RANGE_DAYS) return { fromFilter: from, toFilter: to };

  // Whichever side the user just moved stays put; the other one is pulled
  // back to the edge of the allowed window.
  return changed === "from"
    ? { fromFilter: from, toFilter: addDays(from, MAX_RANGE_DAYS) }
    : { fromFilter: addDays(to, -MAX_RANGE_DAYS), toFilter: to };
};

/* Same vocabulary the admin page uses, so a code means the same thing on
   both surfaces. Rendered as the row's tooltip, not a column. */
const CODE_LABEL: Record<string, string> = {
  ALLOWED: "Matched an allow-list entry",
  ALLOWED_GATE_DISABLED: "Allow-list check is off",
  NOT_ALLOWED: "No allow-list match",
  IDENTITY_UNAVAILABLE: "Could not verify the caller",
  ENVIRONMENT_UNKNOWN: "Token has no environment",
  AUTHORIZATION_ERROR: "Access could not be verified",
  UNAUTHORIZED: "No bearer token",
  TOKEN_INVALID: "Token invalid or expired",
  AUTH_FAILED: "Authentication failed",
  // The two module layers, which is what a refused MCP tool call carries.
  MODULE_FORBIDDEN: "Not permitted for this token",
  ENVIRONMENT_MODULE_FORBIDDEN: "Not permitted in this environment",
  PERMISSION_CHECK_FAILED: "Permission check could not be completed",
};

const codeLabel = (code: string | null) => (code ? CODE_LABEL[code] || code : "—");

const CATEGORY_LABEL: Record<string, string> = {
  campaign: "Campaign",
  channel: "Channel",
  task: "Task",
  token: "Token service",
  master: "Master",
  amoeba: "Service",
  calendar: "Calendar",
  mcp: "MCP",
};

const categoryLabel = (c: string | null) => (c && CATEGORY_LABEL[c]) || c || "—";

/** Compact timestamp for the table — the modal prints the full one. */
function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

/** The environments a portal user may filter by — a structural subset of
    PortalEnvironmentFull, so the caller doesn't have to pass anything more. */
export interface PortalActivityEnvironment {
  id: string;
  environment_name: string;
}

interface Props {
  active: boolean;
  environments: PortalActivityEnvironment[];
  /** Incremented by the shell's top-bar Refresh button to force a reload. */
  refreshKey?: number;
  /**
   * One token's activity only, set by the API Tokens page's "Activity logs"
   * row action. Same shape and same behaviour as the admin console's token
   * scope (frontend/src/pages/ActivityLog.tsx), including the removable chip,
   * so arriving from a token row never traps the user in that filter.
   */
  tokenFilter?: { id: string; label: string } | null;
  onClearTokenFilter?: () => void;
  /**
   * Scope the page to one environment, set by the Environments table's
   * "Activity logs" row action. Like the admin console, no chip for this one:
   * the environment filter below is a first-class control here, so the scope
   * shows up selected and clearable exactly as if it had been picked by hand.
   */
  envScope?: { id: string; name: string } | null;
}

export default function PortalActivityPage({
  active,
  environments,
  refreshKey = 0,
  tokenFilter = null,
  onClearTokenFilter,
  envScope = null,
}: Props) {
  const token = getPortalToken();

  const [config, setConfig] = useState<PortalActivityConfig | null>(null);
  const [summary, setSummary] = useState<PortalActivitySummary | null>(null);
  const [rows, setRows] = useState<PortalActivityRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [detailRow, setDetailRow] = useState<PortalActivityRow | null>(null);

  const [envFilter, setEnvFilter] = useState("");
  const [surfaceFilter, setSurfaceFilter] = useState<PortalSurface | "">("");
  const [resultFilter, setResultFilter] = useState<"allowed" | "denied" | "">("");
  // The one search box: the caller's email, or the reference id from an error
  // a caller reported — the two things someone arrives here holding.
  const [searchFilter, setSearchFilter] = useState("");
  // Date range — whole-day boundaries via <input type="date">, same as the
  // admin console's Activity Log (frontend/src/pages/ActivityLog.tsx).
  const [fromFilter, setFromFilter] = useState("");
  const [toFilter, setToFilter] = useState("");

  // Environment/surface/result/date live in this popover instead of on the
  // bar; the bar keeps only search, which is free text used on most visits.
  const [filtersOpen, setFiltersOpen] = useState(false);
  // The popover's own copy of the filter fields — editing it must not touch
  // the table until "Done" is clicked. Applied to the real filters (and so
  // to the table) only on commit, same pattern as exportDraft below.
  const [filtersDraft, setFiltersDraft] = useState({
    envFilter: "",
    surfaceFilter: "" as PortalSurface | "",
    resultFilter: "" as "allowed" | "denied" | "",
    fromFilter: "",
    toFilter: "",
  });
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportDraft, setExportDraft] = useState({
    envFilter: "",
    surfaceFilter: "" as PortalSurface | "",
    resultFilter: "" as "allowed" | "denied" | "",
    searchFilter: "",
    fromFilter: "",
    toFilter: "",
  });

  const loadedOnce = useRef(false);
  const emailPrimed = useRef(false);
  const searchDebounce = useRef<number | null>(null);

  // Read by the fetch callbacks, which is why it is a plain value here rather
  // than read off the prop at call time.
  const tokenFilterId = tokenFilter?.id || undefined;

  // Follows the shell rather than just initialising: arriving from an
  // environment row pre-selects that environment here, and the shell clearing
  // the scope (opening this page from the sidebar means "the whole log") puts
  // the filter back to every environment. Keyed on the prop's identity, so a
  // filter the user picks on this page is left alone until the shell asks for
  // something else.
  useEffect(() => {
    setEnvFilter(envScope?.id || "");
  }, [envScope]);

  const load = useCallback(
    async (nextOffset = offset) => {
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        const [list, sum] = await Promise.all([
          listPortalActivity(token, {
            env_id: envFilter || undefined,
            token_id: tokenFilterId,
            surface: surfaceFilter || undefined,
            allowed: resultFilter ? resultFilter === "allowed" : undefined,
            search: searchFilter.trim() || undefined,
            from: fromFilter || undefined,
            to: toFilter || undefined,
            limit: pageSize,
            offset: nextOffset,
          }),
          getPortalActivitySummary(token, envFilter || undefined, tokenFilterId),
        ]);
        setRows(list.rows);
        setTotal(list.total);
        setSummary(sum);
        setOffset(nextOffset);
      } catch (err) {
        setError((err as Error).message || "Could not load the activity log");
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [token, envFilter, surfaceFilter, resultFilter, searchFilter, fromFilter, toFilter, pageSize, tokenFilterId],
  );

  useEffect(() => {
    if (!active || !token) return;
    if (!loadedOnce.current) {
      loadedOnce.current = true;
      getPortalActivityConfig(token).then(setConfig).catch(() => {});
    }
    load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, token, envFilter, surfaceFilter, resultFilter, fromFilter, toFilter, pageSize, tokenFilterId]);

  // Top-bar Refresh — reload the current page (keeping filters and page) and
  // the summary stats without resetting the view.
  useEffect(() => {
    if (!active || refreshKey === 0) return;
    load(offset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, refreshKey]);

  // The search box is free text — debounce it instead of firing on every
  // keystroke. The ref guard keeps the first render from firing a second,
  // redundant fetch for the empty value the effect above already loaded.
  useEffect(() => {
    if (!active) return;
    if (!emailPrimed.current) {
      emailPrimed.current = true;
      return;
    }
    if (searchDebounce.current) window.clearTimeout(searchDebounce.current);
    searchDebounce.current = window.setTimeout(() => load(0), 350);
    return () => {
      if (searchDebounce.current) window.clearTimeout(searchDebounce.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchFilter]);

  const page = Math.floor(offset / pageSize) + 1;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const rangeFrom = total === 0 ? 0 : offset + 1;
  const rangeTo = Math.min(offset + rows.length, total);

  // Numbered pager with ellipses for large result sets — stays compact and
  // readable even when the log spans many pages.
  const pageItems = useMemo<Array<number | "…">>(() => {
    if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
    const items: Array<number | "…"> = [1];
    const left = Math.max(2, page - 2);
    const right = Math.min(pageCount - 1, page + 2);
    if (left > 2) items.push("…");
    for (let p = left; p <= right; p++) items.push(p);
    if (right < pageCount - 1) items.push("…");
    items.push(pageCount);
    return items;
  }, [page, pageCount]);

  const hasRows = !loading && !error && rows.length > 0;

  const advancedFilterCount = [envFilter, surfaceFilter, resultFilter, fromFilter, toFilter].filter(
    Boolean,
  ).length;

  const openFilters = () => {
    setFiltersDraft({ envFilter, surfaceFilter, resultFilter, fromFilter, toFilter });
    setFiltersOpen(true);
  };

  // Commits the draft to the real filters — the only place that triggers the
  // table's fetch, so every edit inside the popover until now has been free.
  const applyFilters = () => {
    setEnvFilter(filtersDraft.envFilter);
    setSurfaceFilter(filtersDraft.surfaceFilter);
    setResultFilter(filtersDraft.resultFilter);
    setFromFilter(filtersDraft.fromFilter);
    setToFilter(filtersDraft.toFilter);
    setFiltersOpen(false);
  };

  const clearFilters = () => {
    setFiltersDraft({
      envFilter: "",
      surfaceFilter: "",
      resultFilter: "",
      fromFilter: "",
      toFilter: "",
    });
    setEnvFilter("");
    setSurfaceFilter("");
    setResultFilter("");
    setFromFilter("");
    setToFilter("");
  };

  const openExport = () => {
    setExportDraft({
      envFilter,
      surfaceFilter,
      resultFilter,
      searchFilter,
      fromFilter,
      toFilter,
    });
    setExportOpen(true);
  };

  const handleExport = async () => {
    if (!token) return;
    setExporting(true);
    try {
      await exportPortalActivity(token, {
        env_id: exportDraft.envFilter || undefined,
        token_id: tokenFilterId,
        surface: exportDraft.surfaceFilter || undefined,
        allowed: exportDraft.resultFilter ? exportDraft.resultFilter === "allowed" : undefined,
        search: exportDraft.searchFilter.trim() || undefined,
        from: exportDraft.fromFilter || undefined,
        to: exportDraft.toFilter || undefined,
      });
      setExportOpen(false);
    } catch (err) {
      toast((err as Error).message || "Could not export the activity log", "error");
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <div className="section-header">
        <div>
          <div className="section-title">
            Activity Log <PageInfo help={PORTAL_HELP.activity} />
          </div>
          <div className="section-subtitle">
            Every API and MCP call on your environments: who called, what they called, and whether
            it was let through
          </div>
        </div>
        <div className="pal-head-meta">
          {config && (
            <span className="pal-retention" title="Older rows are purged automatically">
              <i className="fa-solid fa-clock-rotate-left" aria-hidden="true" />
              Kept for {config.retention_days} day{config.retention_days === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </div>

      <div className="stats-grid pal-stats">
        <div className="stat-card blue">
          <div className="stat-icon blue">
            <i className="fa-solid fa-list-check" />
          </div>
          <div className="stat-body">
            <div className="stat-value">{summary ? summary.total : "—"}</div>
            <div className="stat-label">Calls</div>
          </div>
        </div>
        <div className="stat-card green">
          <div className="stat-icon green">
            <i className="fa-solid fa-circle-check" />
          </div>
          <div className="stat-body">
            <div className="stat-value">{summary ? summary.allowed : "—"}</div>
            <div className="stat-label">Allowed</div>
          </div>
        </div>
        <div className="stat-card red">
          <div className="stat-icon red">
            <i className="fa-solid fa-circle-xmark" />
          </div>
          <div className="stat-body">
            <div className="stat-value">{summary ? summary.denied : "—"}</div>
            <div className="stat-label">Denied</div>
          </div>
        </div>
      </div>

      <div className="pal-table-card">
        {/* The table's own toolbar, same shape as the Sessions table's
            (frontend/src/components/ui/DataTable.tsx .dt2-toolbar): search,
            the filter/export controls, and rows-per-page all live at the top
            of the card instead of above it. */}
        <div className="pal-toolbar">
          {/* The token scope, first because it is the one nobody set from
              this page, and removable right here so arriving from a token
              row never traps them in it. Mirrors the admin console's
              al-token-chip. */}
          {tokenFilter && (
            <span className="pal-token-chip" title={`Filtered to ${tokenFilter.label}`}>
              <i className="fa-solid fa-key" aria-hidden="true" />
              <span className="pal-token-chip-label">{tokenFilter.label}</span>
              {onClearTokenFilter && (
                <button
                  type="button"
                  className="pal-token-chip-clear"
                  onClick={onClearTokenFilter}
                  aria-label="Clear the token filter"
                  title="Clear the token filter"
                >
                  <i className="fa-solid fa-xmark" aria-hidden="true" />
                </button>
              )}
            </span>
          )}

          <div className="pal-search">
            <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
            <input
              type="search"
              placeholder="Search caller or reference…"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              aria-label="Search by caller email or reference id"
            />
          </div>

          <div className="pal-filterbar-actions">
          <FilterPopover
            label="Filters"
            icon="fa-sliders"
            badge={advancedFilterCount}
            open={filtersOpen}
            onOpenChange={(v) => (v ? openFilters() : setFiltersOpen(false))}
            footer={
              <>
                <button type="button" className="btn btn-ghost btn-sm" onClick={clearFilters}>
                  Clear filters
                </button>
                <button type="button" className="btn btn-primary btn-sm" onClick={applyFilters}>
                  Done
                </button>
              </>
            }
          >
            {environments.length > 0 && (
              <div className="fpop-field">
                <label htmlFor="pal-flt-env">Environment</label>
                <AdminSelect
                  id="pal-flt-env"
                  icon="fa-layer-group"
                  ariaLabel="Filter by environment"
                  value={filtersDraft.envFilter}
                  onChange={(v) => setFiltersDraft((d) => ({ ...d, envFilter: v }))}
                  placeholder="All environments"
                  options={[
                    { value: "", label: "All environments" },
                    ...environments.map((env) => ({ value: env.id, label: env.environment_name })),
                  ]}
                />
              </div>
            )}

            <div className="fpop-field">
              <label>Surface</label>
              <div className="pal-chipgroup" role="group" aria-label="Filter by surface">
                {(
                  [
                    { value: "", label: "All surfaces" },
                    { value: "rest", label: "API" },
                    { value: "mcp", label: "MCP" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.value || "all"}
                    type="button"
                    className="pal-chip"
                    aria-pressed={filtersDraft.surfaceFilter === opt.value}
                    onClick={() =>
                      setFiltersDraft((d) => ({ ...d, surfaceFilter: opt.value as PortalSurface | "" }))
                    }
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="fpop-field">
              <label>Result</label>
              <div className="pal-chipgroup" role="group" aria-label="Filter by result">
                {(
                  [
                    { value: "", label: "All results" },
                    { value: "allowed", label: "Allowed" },
                    { value: "denied", label: "Denied" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.value || "all"}
                    type="button"
                    className={`pal-chip${
                      opt.value === "denied"
                        ? " pal-chip-danger"
                        : opt.value === "allowed"
                          ? " pal-chip-success"
                          : ""
                    }`}
                    aria-pressed={filtersDraft.resultFilter === opt.value}
                    onClick={() =>
                      setFiltersDraft((d) => ({
                        ...d,
                        resultFilter: opt.value as "allowed" | "denied" | "",
                      }))
                    }
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="fpop-field">
              <label>Date range</label>
              <div className="fpop-row">
                <input
                  type="date"
                  value={filtersDraft.fromFilter}
                  max={filtersDraft.toFilter || undefined}
                  onChange={(e) =>
                    setFiltersDraft((d) => ({
                      ...d,
                      fromFilter: e.target.value,
                      // Clearing "From" leaves an open-ended "To" meaning
                      // nothing on its own — clear it too rather than leave
                      // a dangling upper bound with no lower one.
                      toFilter: e.target.value ? d.toFilter : "",
                    }))
                  }
                  aria-label="From date"
                />
                <input
                  type="date"
                  value={filtersDraft.toFilter}
                  min={filtersDraft.fromFilter || undefined}
                  disabled={!filtersDraft.fromFilter}
                  onChange={(e) => setFiltersDraft((d) => ({ ...d, toFilter: e.target.value }))}
                  aria-label="To date"
                />
              </div>
            </div>
          </FilterPopover>

          <FilterPopover
            label="Export"
            icon="fa-file-arrow-down"
            open={exportOpen}
            onOpenChange={(v) => (v ? openExport() : setExportOpen(false))}
            footer={
              <>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setExportOpen(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className={`btn btn-primary btn-sm${exporting ? " loading" : ""}`}
                  disabled={exporting}
                  onClick={handleExport}
                >
                  <i className="fa-solid fa-download" aria-hidden="true" /> Download CSV
                </button>
              </>
            }
          >
            {environments.length > 0 && (
              <div className="fpop-field">
                <label htmlFor="pal-exp-env">Environment</label>
                <AdminSelect
                  id="pal-exp-env"
                  icon="fa-layer-group"
                  ariaLabel="Export: filter by environment"
                  value={exportDraft.envFilter}
                  onChange={(v) => setExportDraft((d) => ({ ...d, envFilter: v }))}
                  placeholder="All environments"
                  options={[
                    { value: "", label: "All environments" },
                    ...environments.map((env) => ({ value: env.id, label: env.environment_name })),
                  ]}
                />
              </div>
            )}

            <div className="fpop-field">
              <label>Surface</label>
              <div className="pal-chipgroup" role="group" aria-label="Export: filter by surface">
                {(
                  [
                    { value: "", label: "All surfaces" },
                    { value: "rest", label: "API" },
                    { value: "mcp", label: "MCP" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.value || "all"}
                    type="button"
                    className="pal-chip"
                    aria-pressed={exportDraft.surfaceFilter === opt.value}
                    onClick={() =>
                      setExportDraft((d) => ({ ...d, surfaceFilter: opt.value as PortalSurface | "" }))
                    }
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="fpop-field">
              <label>Result</label>
              <div className="pal-chipgroup" role="group" aria-label="Export: filter by result">
                {(
                  [
                    { value: "", label: "All results" },
                    { value: "allowed", label: "Allowed" },
                    { value: "denied", label: "Denied" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.value || "all"}
                    type="button"
                    className={`pal-chip${
                      opt.value === "denied"
                        ? " pal-chip-danger"
                        : opt.value === "allowed"
                          ? " pal-chip-success"
                          : ""
                    }`}
                    aria-pressed={exportDraft.resultFilter === opt.value}
                    onClick={() =>
                      setExportDraft((d) => ({
                        ...d,
                        resultFilter: opt.value as "allowed" | "denied" | "",
                      }))
                    }
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="fpop-field">
              <label htmlFor="pal-exp-search">Search</label>
              <div className="pal-search pal-search-in-popover">
                <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
                <input
                  id="pal-exp-search"
                  type="search"
                  placeholder="Caller or reference…"
                  value={exportDraft.searchFilter}
                  onChange={(e) => setExportDraft((d) => ({ ...d, searchFilter: e.target.value }))}
                />
              </div>
            </div>

            <div className="fpop-field">
              <label>Date range</label>
              <div className="fpop-row">
                <input
                  type="date"
                  value={exportDraft.fromFilter}
                  max={exportDraft.toFilter || undefined}
                  onChange={(e) =>
                    setExportDraft((d) =>
                      ({ ...d, ...clampDateRange(e.target.value, d.toFilter, "from") }),
                    )
                  }
                  aria-label="Export: from date"
                />
                <input
                  type="date"
                  value={exportDraft.toFilter}
                  min={exportDraft.fromFilter || undefined}
                  // The window is capped from "From", not just clamped after
                  // the fact — the picker itself won't offer a date beyond
                  // it. Disabled until "From" is picked: an open-ended "To"
                  // with no lower bound isn't a 7-day window at all.
                  max={exportDraft.fromFilter ? addDays(exportDraft.fromFilter, MAX_RANGE_DAYS) : undefined}
                  disabled={!exportDraft.fromFilter}
                  onChange={(e) =>
                    setExportDraft((d) =>
                      ({ ...d, ...clampDateRange(d.fromFilter, e.target.value, "to") }),
                    )
                  }
                  aria-label="Export: to date"
                />
              </div>
              <div className="fpop-hint">
                <i className="fa-solid fa-circle-info" aria-hidden="true" />
                Exports are limited to a {MAX_RANGE_DAYS}-day range. Pick a "From" date first.
              </div>
            </div>

          </FilterPopover>
          </div>

          {/* Rows-per-page, pinned to the end of the same toolbar row —
              search, filters, export and page size all live in one place at
              the top of the card. */}
          <label className="pal-pagesize">
            Show
            <select
              className="pal-pagesize-select"
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              aria-label="Rows per page"
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            rows
          </label>
        </div>

        <div className="pal-scroll">
          <table className="pal-table">
            <caption className="pal-sr-only">Activity log</caption>
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Caller</th>
                <th scope="col">Token</th>
                <th scope="col">Surface</th>
                <th scope="col">Called</th>
                <th scope="col">IP</th>
                <th scope="col">Result</th>
                {/* The id a caller quotes back to us. Its own column so a
                    report can be matched to a row by eye. */}
                <th scope="col">Reference</th>
              </tr>
            </thead>
            <tbody>
              {loading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <tr className="pal-skeleton-row" key={`skeleton-${i}`}>
                    <td colSpan={8}>
                      <div className="pal-skeleton" />
                    </td>
                  </tr>
                ))}

              {hasRows &&
                rows.map((row, i) => (
                  <tr
                    key={row.id}
                    className={`pal-row-in pal-row-clickable ${
                      row.allowed ? "pal-row-allowed" : "pal-row-denied"
                    }`}
                    style={{ "--row-index": Math.min(i, 12) } as CSSProperties}
                    title="View call details"
                    tabIndex={0}
                    onClick={() => setDetailRow(row)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setDetailRow(row);
                      }
                    }}
                  >
                    <td className="pal-time">{formatTime(row.created_at)}</td>
                    <td className="pal-caller">
                      {row.actor_email || (
                        <span className="pal-unresolved">
                          <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
                          Unresolved
                          {/* Why the cell is empty, behind the icon rather than
                              printed in every row: it is the same sentence
                              each time. */}
                          <InfoTip
                            text={callerNote(row)}
                            label="Why is this row unresolved?"
                          />
                        </span>
                      )}
                    </td>
                    {/* The id of the token this call was made with, from the
                        caller's own environments: the same id the Tokens page
                        lists and the id the token filter above takes. */}
                    <td className="pal-token">
                      {row.token_id ? (
                        <span className="pal-token-cell">
                          <code className="pal-token-code" title={row.token_id}>
                            {row.token_id}
                          </code>
                          <CopyButton value={row.token_id} title="Copy token ID" />
                        </span>
                      ) : (
                        <span className="pal-muted">—</span>
                      )}
                    </td>
                    <td>
                      <span className={`pal-surface-badge pal-surface-${row.surface}`}>
                        {row.surface === "mcp" ? "MCP" : "API"}
                      </span>
                    </td>
                    <td className="pal-called">
                      {row.method && <span className="pal-method">{row.method}</span>}
                      {/* An MCP row's interesting half is the tool: the URL is
                          the same for every call an agent makes. */}
                      {row.mcp_tool ? (
                        <code className="pal-tool" title={`MCP tool · ${row.resource}`}>
                          {row.mcp_tool}
                        </code>
                      ) : (
                        <code>{row.resource}</code>
                      )}
                    </td>
                    <td className="pal-ip">
                      {row.ip ? (
                        <code className="pal-ip-code">{row.ip}</code>
                      ) : (
                        <span className="pal-muted">—</span>
                      )}
                    </td>
                    <td>
                      <span className="pal-result" title={codeLabel(row.code)}>
                        <span
                          className={`pal-result-icon ${
                            row.allowed ? "pal-result-allow" : "pal-result-deny"
                          }`}
                        >
                          <i
                            className={`fa-solid ${row.allowed ? "fa-check" : "fa-xmark"}`}
                            aria-hidden="true"
                          />
                        </span>
                        <span className="pal-result-text">
                          {row.allowed ? "Allowed" : "Denied"}
                          {row.status_code != null && (
                            <span className="pal-status">{row.status_code}</span>
                          )}
                        </span>
                      </span>
                    </td>
                    <td className="pal-ref-cell">
                      {row.reference_id ? (
                        <span className="pal-token-cell">
                          <code
                            className="pal-ref-code"
                            title={`Reference ${row.reference_id}. This is what the caller was shown with the error.`}
                          >
                            {row.reference_id}
                          </code>
                          <CopyButton
                            value={row.reference_id}
                            title="Copy reference id"
                          />
                        </span>
                      ) : (
                        // Only a failed call has one.
                        <span className="pal-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {error && (
          <div className="pal-empty">
            <div className="pal-empty-icon pal-empty-danger">
              <i className="fa-solid fa-triangle-exclamation" />
            </div>
            <div className="pal-empty-title">Couldn't load the activity log</div>
            <div className="pal-empty-desc">{error}</div>
          </div>
        )}

        {!loading && !error && rows.length === 0 && (
          <div className="pal-empty">
            <div className="pal-empty-icon">
              <i className="fa-solid fa-list-check" />
            </div>
            <div className="pal-empty-title">No calls match these filters</div>
            <div className="pal-empty-desc">
              Once a call comes through the API or MCP surface on your environments, it shows up
              here.
            </div>
          </div>
        )}

        {!loading && !error && total > 0 && (
          <div className="pal-pagination">
            {/* Same left/right split as the Sessions table's footer
                (frontend/src/components/ui/DataTable.tsx .dt2-footer): the
                live range on the left, the pager on the right. */}
            <span className="pal-pageinfo" aria-live="polite">
              Showing {rangeFrom}–{rangeTo} of {total}
            </span>
            <nav className="pal-page-numbers" aria-label="Activity log pagination">
              <button
                type="button"
                className="pal-page-arrow"
                disabled={page <= 1}
                aria-label="Previous page"
                onClick={() => load((page - 2) * pageSize)}
              >
                <i className="fa-solid fa-chevron-left" />
              </button>
              {pageItems.map((item, idx) =>
                typeof item === "number" ? (
                  <button
                    key={item}
                    type="button"
                    className={`pal-page-btn${item === page ? " current" : ""}`}
                    aria-current={item === page ? "page" : undefined}
                    onClick={() => load((item - 1) * pageSize)}
                  >
                    {item}
                  </button>
                ) : (
                  <span key={`gap-${idx}`} className="pal-page-ellipsis" aria-hidden="true">
                    …
                  </span>
                ),
              )}
              <button
                type="button"
                className="pal-page-arrow"
                disabled={page >= pageCount}
                aria-label="Next page"
                onClick={() => load(page * pageSize)}
              >
                <i className="fa-solid fa-chevron-right" />
              </button>
            </nav>
          </div>
        )}
      </div>

      {detailRow && (
        <div className="modal-backdrop open" onClick={() => setDetailRow(null)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Call details"
            style={{ maxWidth: 780 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div className="modal-title">
                <i className="fa-solid fa-magnifying-glass" /> Call details
                <span
                  className={`pal-surface-badge pal-surface-${detailRow.surface}`}
                  style={{ marginLeft: 8 }}
                >
                  {detailRow.surface === "mcp" ? "MCP" : "API"}
                </span>
              </div>
              <button className="modal-close" onClick={() => setDetailRow(null)} aria-label="Close">
                <i className="fa-solid fa-xmark" />
              </button>
            </div>

            <div className="modal-body">
              <dl className="pal-detail-grid">
                <div>
                  <dt>Time</dt>
                  <dd>{formatDateTime(detailRow.created_at)}</dd>
                </div>
                <div>
                  <dt>Caller</dt>
                  <dd>
                    {detailRow.actor_email || (
                      <span className="pal-unresolved-detail">
                        <span className="pal-muted">Unresolved</span>
                        <InfoTip
                          text={callerNote(detailRow)}
                          label="Why is this row unresolved?"
                        />
                      </span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Environment</dt>
                  <dd>{detailRow.environment_name || "—"}</dd>
                </div>
                <div>
                  <dt>Token</dt>
                  <dd>
                    {detailRow.token_id ? (
                      <span className="pal-token-cell">
                        <code className="pal-token-code">{detailRow.token_id}</code>
                        <CopyButton
                          value={detailRow.token_id}
                          title="Copy token ID"
                        />
                      </span>
                    ) : (
                      <span className="pal-muted">—</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>IP address</dt>
                  <dd>
                    {detailRow.ip ? (
                      <code className="pal-ip-code">{detailRow.ip}</code>
                    ) : (
                      <span className="pal-muted">—</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Category</dt>
                  <dd>{categoryLabel(detailRow.category)}</dd>
                </div>
                <div>
                  <dt>Outcome</dt>
                  <dd>
                    <span className="pal-result">
                      <span
                        className={`pal-result-icon ${
                          detailRow.allowed ? "pal-result-allow" : "pal-result-deny"
                        }`}
                      >
                        <i
                          className={`fa-solid ${detailRow.allowed ? "fa-check" : "fa-xmark"}`}
                          aria-hidden="true"
                        />
                      </span>
                      <span className="pal-result-text">
                        {detailRow.allowed ? "Allowed" : "Denied"}
                        {detailRow.status_code != null && (
                          <span className="pal-status">{detailRow.status_code}</span>
                        )}
                      </span>
                    </span>
                  </dd>
                </div>
                <div className="pal-detail-resource">
                  <dt>Called</dt>
                  <dd>
                    <code>
                      {detailRow.method ? `${detailRow.method} ` : ""}
                      {detailRow.resource}
                    </code>
                  </dd>
                </div>
                {detailRow.mcp_tool && (
                  <div className="pal-detail-resource">
                    <dt>MCP tool</dt>
                    <dd>
                      <code>{detailRow.mcp_tool}</code>
                    </dd>
                  </div>
                )}
                <div className="pal-detail-resource">
                  <dt>Reason</dt>
                  <dd>{codeLabel(detailRow.code)}</dd>
                </div>
                {detailRow.reference_id && (
                  <div className="pal-detail-resource">
                    <dt>Reference</dt>
                    <dd>
                      <span className="pal-token-cell">
                        <code className="pal-token-code">
                          {detailRow.reference_id}
                        </code>
                        <CopyButton
                          value={detailRow.reference_id}
                          title="Copy reference id"
                        />
                      </span>
                      {/* <div className="pal-detail-note">
                        What the caller was shown with the error they reported.
                      </div> */}
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setDetailRow(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

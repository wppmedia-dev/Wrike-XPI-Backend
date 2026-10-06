import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  exportActivityCsv,
  getActivityConfig,
  getActivitySummary,
  listActivity,
  type ActivityConfig,
  type ActivityRow,
  type ActivitySummary,
  type Surface,
} from "../lib/activityLogApi";
import type { AdminEnvironment } from "../lib/adminApi";
import { toast } from "../lib/notify";
import { AGENT_OPTIONS } from "../lib/agentIdentity";
import AdminSelect from "../components/AdminSelect";
import { CopyButton } from "../components/ui/CopyButton";
import { PageInfo } from "../components/ui/PageInfo";
import { ADMIN_HELP } from "../lib/pageHelp";
import { callerNote } from "../lib/activityCaller";
import { InfoTip } from "../components/ui/InfoTip";
import { mcpMethodInfo } from "../lib/mcpMethod";
import { PayloadBlock } from "../components/ui/PayloadBlock";
import { FilterPopover } from "../components/ui/FilterPopover";
import "./ActivityLog.css";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const DEFAULT_PAGE_SIZE = 10;

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

const categoryLabel = (c: string | null) =>
  (c && CATEGORY_LABEL[c]) || c || "—";

interface Props {
  environments: AdminEnvironment[];
  active: boolean;
  /** Incremented by the top-bar Refresh button to force a reload. */
  refreshKey?: number;
  /**
   * Scope the whole page to one token. Set by the API Tokens table's
   * "Activity logs" row action. `label` is only for the chip; the server
   * filters on `id` alone.
   */
  tokenFilter?: { id: string; label: string } | null;
  /** Clears the token scope, returning the page to the whole log. */
  onClearTokenFilter?: () => void;
  /**
   * Scope the page to one environment, set by the Environments table's
   * "Activity logs" row action. No chip for this one: the environment filter
   * below is a first-class control on this page, so the scope is already
   * visible and clearable there, exactly as if it had been picked by hand.
   */
  envScope?: { id: string; name: string } | null;
}

/**
 * Who called the API/MCP surface, what they called, and whether the
 * security gates let it through — filtered, paginated, and explicitly not
 * kept forever. Every row here ages out on its own; see the retention note
 * in the header, sourced from the same config the background sweep reads.
 */
export default function ActivityLog({
  environments,
  active,
  refreshKey = 0,
  tokenFilter = null,
  onClearTokenFilter,
  envScope = null,
}: Props) {
  const [config, setConfig] = useState<ActivityConfig | null>(null);
  const [summary, setSummary] = useState<ActivitySummary | null>(null);
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [detailRow, setDetailRow] = useState<ActivityRow | null>(null);

  const [envFilter, setEnvFilter] = useState("");
  const [surfaceFilter, setSurfaceFilter] = useState<Surface | "">("");
  const [resultFilter, setResultFilter] = useState<"allowed" | "denied" | "">("");
  // The client that made the call (Claude, ChatGPT, VS Code, …), derived
  // server-side from the stored User-Agent header — see
  // src/utils/agentIdentity.js for what "" (all), "other" and "unknown" mean.
  const [agentFilter, setAgentFilter] = useState("");
  // The one search box. It matches the caller's email and the reference id of
  // a failed call, because those are the two things a person arrives here
  // holding — an email from the caller, or the id out of the error message.
  const [searchFilter, setSearchFilter] = useState("");
  // Date range — the one filter the console didn't have a control for at all;
  // <input type="date"> gives whole-day boundaries, which is what "show me
  // last Tuesday" actually means to a person filtering an audit log.
  const [fromFilter, setFromFilter] = useState("");
  const [toFilter, setToFilter] = useState("");

  // The env/surface/result/client/date controls moved off the bar and into
  // this popover (Advanced filters) — the bar now holds only search, which
  // is free text and used on nearly every visit, plus the Filters and
  // Export triggers.
  const [filtersOpen, setFiltersOpen] = useState(false);
  // The popover's own copy of the filter fields: editing a chip or a date
  // inside it must not touch the table until "Done" is clicked — otherwise
  // every click mid-adjustment (e.g. picking "From" before "To" is set)
  // fires a fetch for a half-finished filter. Applied to the real filters,
  // and so to the table, only on commit.
  const [filtersDraft, setFiltersDraft] = useState({
    envFilter: "",
    surfaceFilter: "" as Surface | "",
    resultFilter: "" as "allowed" | "denied" | "",
    agentFilter: "",
    fromFilter: "",
    toFilter: "",
  });
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  // The export dialog's own copy of the filter fields: it opens pre-filled
  // from whatever is currently applied, but editing it (e.g. widening the
  // date range for a bigger report) must not also change what the table on
  // screen is showing.
  const [exportDraft, setExportDraft] = useState({
    envFilter: "",
    surfaceFilter: "" as Surface | "",
    resultFilter: "" as "allowed" | "denied" | "",
    agentFilter: "",
    searchFilter: "",
    fromFilter: "",
    toFilter: "",
  });

  const loadedOnce = useRef(false);
  const searchDebounce = useRef<number | null>(null);

  // Narrowed to a plain string so the effect below depends on the value
  // rather than on the object identity of the prop.
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
      setLoading(true);
      try {
        const [list, sum] = await Promise.all([
          listActivity({
            env_id: envFilter || undefined,
            token_id: tokenFilterId,
            surface: surfaceFilter || undefined,
            allowed: resultFilter ? resultFilter === "allowed" : undefined,
            agent: agentFilter || undefined,
            search: searchFilter.trim() || undefined,
            from: fromFilter || undefined,
            to: toFilter || undefined,
            limit: pageSize,
            offset: nextOffset,
          }),
          getActivitySummary({
            env_id: envFilter || undefined,
            token_id: tokenFilterId,
          }),
        ]);
        setRows(list.rows);
        setTotal(list.total);
        setSummary(sum);
        setOffset(nextOffset);
      } catch (err: any) {
        toast(err?.message || "Could not load the activity log", "error");
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [envFilter, surfaceFilter, resultFilter, agentFilter, searchFilter, fromFilter, toFilter, pageSize, tokenFilterId],
  );

  useEffect(() => {
    if (!active) return;
    if (!loadedOnce.current) {
      loadedOnce.current = true;
      getActivityConfig().then(setConfig).catch(() => {});
    }
    load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, envFilter, surfaceFilter, resultFilter, agentFilter, fromFilter, toFilter, pageSize, tokenFilterId]);

  // Top-bar Refresh — reload the current page (keeps filters + page) and the
  // summary stats without resetting the view.
  useEffect(() => {
    if (!active || refreshKey === 0) return;
    load(offset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, refreshKey]);

  // The search box is free text — debounce it instead of firing on every
  // keystroke.
  useEffect(() => {
    if (!active) return;
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

  // Badge on the Filters trigger — how many of the drawer's own filters are
  // set, so a collapsed panel still tells you something is narrowing the
  // table. The token scope and search box have their own visible affordance
  // (the chip, the box itself), so they aren't counted here.
  const advancedFilterCount = [
    envFilter,
    surfaceFilter,
    resultFilter,
    agentFilter,
    fromFilter,
    toFilter,
  ].filter(Boolean).length;

  const openFilters = () => {
    setFiltersDraft({ envFilter, surfaceFilter, resultFilter, agentFilter, fromFilter, toFilter });
    setFiltersOpen(true);
  };

  // Commits the draft to the real filters — this is the one place that
  // triggers the table's fetch, so every edit inside the popover until now
  // has been free.
  const applyFilters = () => {
    setEnvFilter(filtersDraft.envFilter);
    setSurfaceFilter(filtersDraft.surfaceFilter);
    setResultFilter(filtersDraft.resultFilter);
    setAgentFilter(filtersDraft.agentFilter);
    setFromFilter(filtersDraft.fromFilter);
    setToFilter(filtersDraft.toFilter);
    setFiltersOpen(false);
  };

  const clearFilters = () => {
    const cleared = {
      envFilter: "",
      surfaceFilter: "" as Surface | "",
      resultFilter: "" as "allowed" | "denied" | "",
      agentFilter: "",
      fromFilter: "",
      toFilter: "",
    };
    setFiltersDraft(cleared);
    setEnvFilter("");
    setSurfaceFilter("");
    setResultFilter("");
    setAgentFilter("");
    setFromFilter("");
    setToFilter("");
  };

  const openExport = () => {
    setExportDraft({
      envFilter,
      surfaceFilter,
      resultFilter,
      agentFilter,
      searchFilter,
      fromFilter,
      toFilter,
    });
    setExportOpen(true);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportActivityCsv({
        env_id: exportDraft.envFilter || undefined,
        token_id: tokenFilterId,
        surface: exportDraft.surfaceFilter || undefined,
        allowed: exportDraft.resultFilter ? exportDraft.resultFilter === "allowed" : undefined,
        agent: exportDraft.agentFilter || undefined,
        search: exportDraft.searchFilter.trim() || undefined,
        from: exportDraft.fromFilter || undefined,
        to: exportDraft.toFilter || undefined,
      });
      setExportOpen(false);
    } catch (err: any) {
      toast(err?.message || "Could not export the activity log", "error");
    } finally {
      setExporting(false);
    }
  };

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

  return (
    <>
      <div className="section-header">
        <div>
          <div className="section-title">
            Activity Log <PageInfo help={ADMIN_HELP.activity} />
          </div>
          <div className="section-subtitle">
            Every API and MCP call: who called, what they called, and whether it was let through
          </div>
        </div>
        {config && (
          <span className="al-retention" title="Older rows are purged automatically">
            <i className="fa-solid fa-clock-rotate-left" aria-hidden="true" />
            Kept for {config.retention_days} day{config.retention_days === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <div className="stats-grid al-stats">
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

      <div className="ea-table-card">
        {/* The table's own toolbar, same shape as the Sessions table's
            (frontend/src/components/ui/DataTable.tsx .dt2-toolbar): search,
            the filter/export controls, and rows-per-page all live at the top
            of the card instead of above it. */}
        <div className="al-toolbar">
          {/* The token scope, shown before the other filters because it is
              the one the admin did not set from this page, and removable
              right here, so arriving from a token row never traps them. */}
          {tokenFilter && (
            <span className="al-token-chip" title={`Filtered to ${tokenFilter.label}`}>
              <i className="fa-solid fa-key" aria-hidden="true" />
              <span className="al-token-chip-label">{tokenFilter.label}</span>
              {onClearTokenFilter && (
                <button
                  type="button"
                  className="al-token-chip-clear"
                  onClick={onClearTokenFilter}
                  aria-label="Clear the token filter"
                  title="Clear the token filter"
                >
                  <i className="fa-solid fa-xmark" aria-hidden="true" />
                </button>
              )}
            </span>
          )}

          <div className="al-search">
            <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
            <input
              type="search"
              placeholder="Search caller or reference…"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              aria-label="Search by caller email or reference id"
            />
          </div>

          <div className="al-filterbar-actions">
          <FilterPopover
            label="Filters"
            icon="fa-filter"
            badge={advancedFilterCount}
            open={filtersOpen}
            onOpenChange={(v) => (v ? openFilters() : setFiltersOpen(false))}
            footer={
              <>
                <button
                  type="button"
                  className="fpop-text-btn"
                  onClick={clearFilters}
                  disabled={advancedFilterCount === 0}
                >
                  Clear filters
                </button>
                <button type="button" className="btn btn-primary" onClick={applyFilters}>
                  Done
                </button>
              </>
            }
          >
            <div className="fpop-field">
              {/* Not htmlFor-linked to the select: AdminSelect's trigger is a
                  <button>, and a <label for> over a button makes clicking
                  this plain heading open the dropdown — surprising, since
                  every other field label here (Surface, Result) is inert.
                  ariaLabel below already names the control for a screen
                  reader, so nothing is lost by keeping this one visual-only. */}
              <label>Environment</label>
              <AdminSelect
                id="al-flt-env"
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

            <div className="fpop-field">
              <label>Surface</label>
              <div className="al-chipgroup" role="group" aria-label="Filter by surface">
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
                    className="al-chip"
                    aria-pressed={filtersDraft.surfaceFilter === opt.value}
                    onClick={() =>
                      setFiltersDraft((d) => ({ ...d, surfaceFilter: opt.value as Surface | "" }))
                    }
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="fpop-field">
              <label>Result</label>
              <div className="al-chipgroup" role="group" aria-label="Filter by result">
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
                    className={`al-chip${
                      opt.value === "denied"
                        ? " al-chip-danger"
                        : opt.value === "allowed"
                          ? " al-chip-success"
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
              <label>Client</label>
              <AdminSelect
                id="al-flt-agent"
                icon="fa-robot"
                ariaLabel="Filter by client"
                value={filtersDraft.agentFilter}
                onChange={(v) => setFiltersDraft((d) => ({ ...d, agentFilter: v }))}
                placeholder="All clients"
                options={AGENT_OPTIONS}
              />
            </div>

            <div className="fpop-field">
              <label>Date range</label>
              <div className="fpop-row">
                <input
                  type="date"
                  value={filtersDraft.fromFilter}
                  max={filtersDraft.toFilter || undefined}
                  onChange={(e) => setFiltersDraft((d) => ({ ...d, fromFilter: e.target.value }))}
                  aria-label="From date"
                />
                <input
                  type="date"
                  value={filtersDraft.toFilter}
                  min={filtersDraft.fromFilter || undefined}
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
                <button type="button" className="fpop-text-btn" onClick={() => setExportOpen(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className={`btn btn-primary${exporting ? " loading" : ""}`}
                  disabled={exporting}
                  onClick={handleExport}
                >
                  <i className="fa-solid fa-download" aria-hidden="true" /> Download CSV
                </button>
              </>
            }
          >
            <div className="fpop-field">
              <label>Environment</label>
              <AdminSelect
                id="al-exp-env"
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

            <div className="fpop-field">
              <label>Surface</label>
              <div className="al-chipgroup" role="group" aria-label="Export: filter by surface">
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
                    className="al-chip"
                    aria-pressed={exportDraft.surfaceFilter === opt.value}
                    onClick={() =>
                      setExportDraft((d) => ({ ...d, surfaceFilter: opt.value as Surface | "" }))
                    }
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="fpop-field">
              <label>Result</label>
              <div className="al-chipgroup" role="group" aria-label="Export: filter by result">
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
                    className={`al-chip${
                      opt.value === "denied"
                        ? " al-chip-danger"
                        : opt.value === "allowed"
                          ? " al-chip-success"
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
              <label>Client</label>
              <AdminSelect
                id="al-exp-agent"
                icon="fa-robot"
                ariaLabel="Export: filter by client"
                value={exportDraft.agentFilter}
                onChange={(v) => setExportDraft((d) => ({ ...d, agentFilter: v }))}
                placeholder="All clients"
                options={AGENT_OPTIONS}
              />
            </div>

            <div className="fpop-field">
              <label htmlFor="al-exp-search">Search</label>
              <div className="al-search al-search-in-popover">
                <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
                <input
                  id="al-exp-search"
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
                  onChange={(e) => setExportDraft((d) => ({ ...d, fromFilter: e.target.value }))}
                  aria-label="Export: from date"
                />
                <input
                  type="date"
                  value={exportDraft.toFilter}
                  min={exportDraft.fromFilter || undefined}
                  onChange={(e) => setExportDraft((d) => ({ ...d, toFilter: e.target.value }))}
                  aria-label="Export: to date"
                />
              </div>
            </div>

          </FilterPopover>
          </div>

          {/* Rows-per-page, pinned to the end of the same toolbar row —
              search, filters, export and page size all live in one place at
              the top of the card. */}
          <label className="al-pagesize">
            Show
            <select
              className="al-pagesize-select"
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

        <div className="ea-scroll">
          <table className="ea-table al-table">
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Caller</th>
                <th scope="col">Token ID</th>
                <th scope="col">Surface</th>
                <th scope="col">Client</th>
                <th scope="col">Called</th>
                <th scope="col">IP</th>
                <th scope="col">Result</th>
                {/* The id a caller quotes back to support. A column of its own
                    because a report arrives as that string: it has to be
                    findable by eye, not just by the filter above. */}
                <th scope="col">Reference</th>
              </tr>
            </thead>
            <tbody>
              {loading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <tr className="ea-skeleton-row" key={i}>
                    <td colSpan={9}>
                      <div className="ea-skeleton" />
                    </td>
                  </tr>
                ))}

              {!loading &&
                rows.map((row, i) => (
                  <tr
                    key={row.id}
                    className={`al-row-in al-row-clickable ${row.allowed ? "al-row-allowed" : "al-row-denied"}`}
                    style={{ "--row-index": Math.min(i, 12) } as React.CSSProperties}
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
                    <td className="al-time">{formatTime(row.created_at)}</td>
                    <td className="al-caller">
                      {row.actor_email || (
                        <span className="al-unresolved">
                          <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" />
                          Unresolved
                          {/* Why the cell is empty, behind the icon rather than
                              printed in the row: it is the same sentence on
                              every such row, and the table is read for the
                              calls, not the explanation. */}
                          <InfoTip
                            text={callerNote(row)}
                            label="Why is this row unresolved?"
                          />
                        </span>
                      )}
                    </td>
                    <td className="al-token">
                      {row.token_id ? (
                        <span className="al-token-cell">
                          {/* The id, not the credential: this is the row in the
                              Tokens list, which is what the permissions are
                              keyed on and what a support question names. */}
                          <code className="al-token-code" title={row.token_id}>
                            {row.token_id}
                          </code>
                          <CopyButton value={row.token_id} title="Copy token ID" />
                        </span>
                      ) : (
                        <span className="al-muted">—</span>
                      )}
                    </td>
                    <td>
                      <span className={`al-surface-badge al-surface-${row.surface}`}>
                        {row.surface === "mcp" ? "MCP" : "API"}
                      </span>
                    </td>
                    <td className="al-client">{row.client}</td>
                    <td className="al-called">
                      {row.method && <span className="al-method">{row.method}</span>}
                      {/* An MCP row's interesting half is the tool: the URL is
                          the same for every call an agent makes. The resource
                          is still in the title and in the detail drawer. */}
                      {row.mcp_tool ? (
                        <code className="al-tool" title={`MCP tool · ${row.resource}`}>
                          {row.mcp_tool}
                        </code>
                      ) : row.surface === "mcp" && mcpMethodInfo(row.action) ? (
                        <span
                          className="al-muted"
                          title={`${mcpMethodInfo(row.action)!.hint} (${row.action})`}
                        >
                          {mcpMethodInfo(row.action)!.label}
                        </span>
                      ) : (
                        <code>{row.resource}</code>
                      )}
                    </td>
                    <td className="al-ip">
                      {row.ip ? (
                        <code className="al-ip-code">{row.ip}</code>
                      ) : (
                        <span className="al-muted">—</span>
                      )}
                    </td>
                    <td>
                      <span className="al-result" title={codeLabel(row.code)}>
                        <span
                          className={`al-result-icon ${row.allowed ? "al-result-allow" : "al-result-deny"}`}
                        >
                          <i
                            className={`fa-solid ${row.allowed ? "fa-check" : "fa-xmark"}`}
                            aria-hidden="true"
                          />
                        </span>
                        <span className="al-result-text">
                          {row.allowed ? "Allowed" : "Denied"}
                          {row.status_code != null && (
                            <span className="al-status">{row.status_code}</span>
                          )}
                        </span>
                      </span>
                    </td>
                    <td className="al-ref-cell">
                      {row.reference_id ? (
                        <span className="al-token-cell">
                          <code
                            className="al-ref-code"
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
                        // Only a failed call is given one, so this is the
                        // common case rather than a gap in the data.
                        <span className="al-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {!loading && rows.length === 0 && (
          <div className="ea-empty">
            <div className="ea-empty-icon">
              <i className="fa-solid fa-list-check" />
            </div>
            <div className="ea-empty-title">No calls match these filters</div>
            <div className="ea-empty-desc">
              Once a call comes through the API or MCP surface, it shows up here in real time.
            </div>
          </div>
        )}

        {!loading && total > 0 && (
          <div className="al-pagination">
            {/* Same left/right split as the Sessions table's footer
                (frontend/src/components/ui/DataTable.tsx .dt2-footer): the
                live range on the left, the pager on the right. */}
            <span className="al-pageinfo" aria-live="polite">
              Showing {rangeFrom}–{rangeTo} of {total}
            </span>
            <nav className="al-page-numbers" aria-label="Pagination">
              <button
                type="button"
                className="al-page-arrow"
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
                    className={`al-page-btn${item === page ? " current" : ""}`}
                    aria-current={item === page ? "page" : undefined}
                    onClick={() => load((item - 1) * pageSize)}
                  >
                    {item}
                  </button>
                ) : (
                  <span key={`gap-${idx}`} className="al-page-ellipsis" aria-hidden="true">
                    …
                  </span>
                ),
              )}
              <button
                type="button"
                className="al-page-arrow"
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
                <span className={`al-surface-badge al-surface-${detailRow.surface}`} style={{ marginLeft: 8 }}>
                  {detailRow.surface === "mcp" ? "MCP" : "API"}
                </span>
              </div>
              <button className="modal-close" onClick={() => setDetailRow(null)} aria-label="Close">
                <i className="fa-solid fa-xmark" />
              </button>
            </div>

            <div className="modal-body">
              <dl className="al-detail-grid">
                <div>
                  <dt>Time</dt>
                  <dd>{formatTime(detailRow.created_at)}</dd>
                </div>
                <div>
                  <dt>Caller</dt>
                  <dd>
                    {detailRow.actor_email || (
                      <span className="al-unresolved-detail">
                        <span className="al-muted">Unresolved</span>
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
                  <dt>Client</dt>
                  <dd>{detailRow.client}</dd>
                </div>
                <div>
                  <dt>Token ID</dt>
                  <dd>
                    {detailRow.token_id ? (
                      <span className="al-token-cell">
                        <code className="al-token-code">{detailRow.token_id}</code>
                        <CopyButton
                          value={detailRow.token_id}
                          title="Copy token ID"
                        />
                      </span>
                    ) : (
                      <span className="al-muted">—</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>IP address</dt>
                  <dd>
                    {detailRow.ip ? (
                      <code className="al-ip-code">{detailRow.ip}</code>
                    ) : (
                      <span className="al-muted">—</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Category</dt>
                  <dd>{categoryLabel(detailRow.category)}</dd>
                </div>
                <div>
                  <dt>Action</dt>
                  <dd>
                    {detailRow.surface === "mcp" && mcpMethodInfo(detailRow.action)
                      ? `${mcpMethodInfo(detailRow.action)!.label} (${detailRow.action}): ${mcpMethodInfo(detailRow.action)!.hint}`
                      : detailRow.action || "—"}
                  </dd>
                </div>
                <div>
                  <dt>Method</dt>
                  <dd>{detailRow.method || "—"}</dd>
                </div>
                <div className="al-detail-resource">
                  <dt>Resource</dt>
                  <dd>
                    <code>{detailRow.resource}</code>
                  </dd>
                </div>
                {detailRow.mcp_tool && (
                  <div>
                    <dt>MCP tool</dt>
                    <dd>
                      <code>{detailRow.mcp_tool}</code>
                    </dd>
                  </div>
                )}
                <div>
                  <dt>Status</dt>
                  <dd>{detailRow.status_code ?? "—"}</dd>
                </div>
                <div>
                  <dt>Result</dt>
                  <dd>
                    <span className="al-result-text">
                      {detailRow.allowed ? "Allowed" : "Denied"}
                    </span>
                    {detailRow.code ? (
                      <span className="al-status" title={codeLabel(detailRow.code)}>
                        {detailRow.code}
                      </span>
                    ) : null}
                  </dd>
                </div>
                {detailRow.reference_id && (
                  <div>
                    <dt>Reference</dt>
                    <dd>
                      <span className="al-token-cell">
                        <code className="al-token-code">
                          {detailRow.reference_id}
                        </code>
                        <CopyButton
                          value={detailRow.reference_id}
                          title="Copy reference id"
                        />
                      </span>
                      {/* <div className="al-detail-note">
                        What the caller was shown with the error they reported.
                      </div> */}
                    </dd>
                  </div>
                )}
              </dl>

              <PayloadBlock title="Request payload" payload={detailRow.request_payload} />
              <PayloadBlock title="Response payload" payload={detailRow.response_payload} />
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

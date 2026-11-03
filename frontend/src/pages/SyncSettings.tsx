import { useCallback, useEffect, useState } from "react";
import {
  listSyncSources,
  runSync,
  type SyncRun,
  type SyncSource,
  type SyncStatus,
} from "../lib/syncApi";
import { Badge, type BadgeTone } from "../components/ui/Badge";
import { EMPTY, formatDateTime } from "../lib/format";
import { toast } from "../lib/notify";
import "./SyncSettings.css";

const STATUS_TONE: Record<SyncStatus, BadgeTone> = {
  success: "success",
  partial: "warning",
  failed: "danger",
};

const STATUS_LABEL: Record<SyncStatus, string> = {
  success: "Success",
  partial: "Partial",
  failed: "Failed",
};

const SEARCH_DEBOUNCE_MS = 250;

const formatDuration = (ms: number | null) =>
  ms == null ? EMPTY : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;

/** "5 min ago" for anything recent, the full date after that. */
function timeAgo(value: string | null | undefined): string {
  if (!value) return "Never";
  const seconds = Math.round((Date.now() - new Date(value).getTime()) / 1000);
  if (Number.isNaN(seconds)) return EMPTY;
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hr ago`;
  return formatDateTime(value);
}

/** Browser and OS from a user-agent string, short enough for a table cell. */
function describeAgent(ua: string | null): string {
  if (!ua) return EMPTY;
  const browser =
    /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Other";
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Android/.test(ua) ? "Android" : /Linux/.test(ua) ? "Linux" : /iPhone|iPad/.test(ua) ? "iOS" : "";
  return os ? `${browser} on ${os}` : browser;
}

export default function SyncSettings({ refreshKey = 0 }: { refreshKey?: number }) {
  const [sources, setSources] = useState<SyncSource[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  // What the box shows, and the debounced term the cards are filtered by.
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim().toLowerCase()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async () => {
    try {
      setSources(await listSyncSources());
    } catch (err: any) {
      toast(err?.message || "Failed to load syncs", "error");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  async function handleRun(source: SyncSource) {
    setRunning(source.key);
    try {
      const run = await runSync(source.key);
      if (run.status === "success") toast(`${source.label} synced`, "success");
      else if (run.status === "partial") toast(run.error || "Synced with some items missing", "warning");
      else toast(run.error || `${source.label} sync failed`, "error");
      await load();
    } catch (err: any) {
      toast(err?.message || "Sync could not be started", "error");
    } finally {
      setRunning(null);
    }
  }

  const visible = sources.filter(
    (s) =>
      !search ||
      [s.key, s.label, s.description, s.hint, s.last_run?.triggered_by, s.last_run?.ip]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(search)),
  );

  const healthy = sources.filter((s) => s.last_run?.status === "success").length;
  const lastRun = sources
    .map((s) => s.last_run)
    .filter((r): r is SyncRun => !!r)
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))[0];

  return (
    <>
      <div className="stats-grid">
        <div className="stat-card blue">
          <div className="stat-icon blue">
            <i className="fa-solid fa-arrows-rotate" />
          </div>
          <div className="stat-body">
            <div className="stat-value">{loaded ? sources.length : EMPTY}</div>
            <div className="stat-label">Sync Sources</div>
          </div>
        </div>
        <div className="stat-card green">
          <div className="stat-icon green">
            <i className="fa-solid fa-circle-check" />
          </div>
          <div className="stat-body">
            <div className="stat-value">{loaded ? `${healthy} of ${sources.length}` : EMPTY}</div>
            <div className="stat-label">Last Sync Succeeded</div>
          </div>
        </div>
        <div className="stat-card yellow">
          <div className="stat-icon yellow">
            <i className="fa-solid fa-clock" />
          </div>
          <div className="stat-body">
            <div className="stat-value sync-stat-text">{loaded ? timeAgo(lastRun?.created_at) : EMPTY}</div>
            <div className="stat-label">Last Sync</div>
          </div>
        </div>
        <div className="stat-card red">
          <div className="stat-icon red">
            <i className="fa-solid fa-user" />
          </div>
          <div className="stat-body">
            <div className="stat-value sync-stat-text">{lastRun?.triggered_by || EMPTY}</div>
            <div className="stat-label">Last Run By</div>
          </div>
        </div>
      </div>

      <div className="sync-toolbar">
        <div className="sync-count" aria-live="polite">
          {loaded ? `Showing ${visible.length} of ${sources.length} ${sources.length === 1 ? "sync" : "syncs"}` : "Loading…"}
        </div>
        <div className="sync-search">
          <i className="fa-solid fa-magnifying-glass" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search syncs…"
            aria-label="Search syncs"
          />
        </div>
      </div>

      {loaded && visible.length === 0 && (
        <div className="sync-none">No sync matches "{searchInput.trim()}".</div>
      )}

      <div className="sync-grid">
        {visible.map((source) => {
          const last = source.last_run;
          const busy = running === source.key;
          return (
            <div className="card sync-card" key={source.key}>
              <div className="card-body">
                <div className="sync-card-head">
                  <div className="sync-card-title">
                    <i className={`fa-solid ${source.icon}`} /> {source.label}
                  </div>
                  {last ? (
                    <Badge tone={STATUS_TONE[last.status]} dot>
                      {STATUS_LABEL[last.status]}
                    </Badge>
                  ) : (
                    <Badge tone="neutral">Never run</Badge>
                  )}
                </div>
                <div className="sync-card-desc">{source.description}</div>
                <div className="sync-card-hint">{source.hint}</div>

                <dl className="sync-meta">
                  <dt>Last sync</dt>
                  <dd title={last ? formatDateTime(last.created_at) : undefined}>{timeAgo(last?.created_at)}</dd>
                  <dt>Run by</dt>
                  <dd>{last?.triggered_by || EMPTY}</dd>
                  <dt>IP address</dt>
                  <dd>{last?.ip || EMPTY}</dd>
                  <dt>Items</dt>
                  <dd>{last && last.items_synced != null ? `${last.items_synced} of ${last.items_requested}` : EMPTY}</dd>
                  <dt>Duration</dt>
                  <dd>{formatDuration(last?.duration_ms ?? null)}</dd>
                  <dt>Client</dt>
                  <dd>{describeAgent(last?.user_agent ?? null)}</dd>
                </dl>

                {last?.status !== "success" && last?.error && (
                  <div className="sync-error">{last.error}</div>
                )}

                <button className="btn btn-primary" disabled={busy || running !== null} onClick={() => handleRun(source)}>
                  <i className={`fa-solid fa-arrows-rotate${busy ? " fa-spin" : ""}`} /> {busy ? "Syncing" : "Sync now"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

    </>
  );
}

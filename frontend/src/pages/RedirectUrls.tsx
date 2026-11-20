import { useCallback, useEffect, useRef, useState } from "react";
import {
  checkRedirectUri,
  createRedirectRule,
  deleteRedirectRule,
  listRedirectRules,
  updateRedirectRule,
  type RedirectRule,
  type RedirectRulePage,
  type StatusFilter,
  type Transport,
} from "../lib/redirectUrlsApi";
import { confirmDanger, escHtml, toast } from "../lib/notify";
// The drawer shell, table and empty state are the API Access Scope drawer's.
import "./EnvironmentAccess.css";

/** Rows per page, and how long the search box waits after the last keystroke
    before asking the server. */
const PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 300;

interface Props {
  envId: string | null;
  envName: string | null;
  open: boolean;
  onClose: () => void;
  /** redirect_urls create / update / delete. The admin console passes true. */
  canCreate?: boolean;
  canUpdate?: boolean;
  canDelete?: boolean;
  /** Defaults to the admin console's own transport. */
  transport?: Transport;
}

/**
 * The list of addresses a sign-in may send the browser back to, for one
 * environment (src/utils/redirectAllowlist.js).
 *
 * The login flow ends by redirecting to the `redirectUri` the sign-in carried,
 * with the OAuth authorization code attached, so this list decides where a code
 * can be delivered. An address that is not here is refused; an environment with
 * no entries refuses every redirectUri. An entry is an origin
 * (https://app.example.com) or an origin plus a path prefix.
 */
export default function RedirectUrls({
  envId,
  envName,
  open,
  onClose,
  canCreate = true,
  canUpdate = true,
  canDelete = true,
  transport,
}: Props) {
  /* What the server last sent: one page of rows plus the totals. Nothing in
     here is filtered or sliced in the browser. */
  const [data, setData] = useState<RedirectRulePage | null>(null);
  const rules: RedirectRule[] = data?.rows ?? [];
  const [loading, setLoading] = useState(false);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  /* An older answer must never overwrite a newer one: typing fires several
     requests and they can land out of order. */
  const requestRef = useRef(0);
  const [busy, setBusy] = useState(false);

  const [value, setValue] = useState("");
  const [label, setLabel] = useState("");

  const [testUri, setTestUri] = useState("");
  const [testResult, setTestResult] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    if (!envId) return;
    const mine = ++requestRef.current;
    setLoading(true);
    try {
      const next = await listRedirectRules(
        envId,
        { search, status, page, pageSize: PAGE_SIZE },
        transport,
      );
      if (mine !== requestRef.current) return;
      setData(next);
      // The server moves a page past the end back to the last one (the final
      // row of a page was just deleted); follow it so the pager agrees.
      if (next.page !== page) setPage(next.page);
    } catch (err: any) {
      if (mine !== requestRef.current) return;
      toast(err?.message || "Could not load the redirect URLs", "error");
      setData(null);
    } finally {
      if (mine === requestRef.current) setLoading(false);
    }
  }, [envId, transport, search, status, page]);

  // Opening, or pointing the drawer at another environment, starts clean.
  useEffect(() => {
    if (open && envId) {
      setValue("");
      setLabel("");
      setTestUri("");
      setTestResult(null);
      setSearchInput("");
      setSearch("");
      setStatus("all");
      setPage(1);
    }
  }, [open, envId]);

  useEffect(() => {
    if (open && envId) load();
  }, [open, envId, load]);

  // The search box asks the server once typing pauses, not on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      const term = searchInput.trim();
      if (term !== search) {
        setSearch(term);
        setPage(1);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput, search]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function add() {
    if (!envId || !value.trim()) return;
    setBusy(true);
    try {
      // The server normalises and validates; what comes back is what is stored.
      await createRedirectRule(
        { env_id: envId, value: value.trim(), label: label.trim() || null },
        transport,
      );
      setValue("");
      setLabel("");
      setTestResult(null);
      toast("Redirect URL added", "success");
      // Where the new entry sorts is the server's call, so ask it again.
      await load();
    } catch (err: any) {
      toast(err?.message || "Could not add the redirect URL", "error");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(rule: RedirectRule) {
    setBusy(true);
    try {
      await updateRedirectRule(rule.id, { is_enabled: !rule.is_enabled }, transport);
      setTestResult(null);
      // Reloaded rather than patched: under the enabled/disabled filter the row
      // may no longer belong on this page, and the totals have changed.
      await load();
    } catch (err: any) {
      toast(err?.message || "Could not update the redirect URL", "error");
    } finally {
      setBusy(false);
    }
  }

  async function remove(rule: RedirectRule) {
    const go = await confirmDanger({
      title: "Remove this redirect URL?",
      html: `Sign-ins for <strong>${escHtml(envName || "this environment")}</strong> will no longer be returned to <strong>${escHtml(rule.value)}</strong>.`,
      confirmText: "Remove",
    });
    if (!go) return;

    setBusy(true);
    try {
      await deleteRedirectRule(rule.id, transport);
      setTestResult(null);
      toast("Redirect URL removed", "success");
      await load();
    } catch (err: any) {
      toast(err?.message || "Could not remove the redirect URL", "error");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    if (!envId || !testUri.trim()) return;
    try {
      setTestResult((await checkRedirectUri(envId, testUri.trim(), transport)).allowed);
    } catch (err: any) {
      setTestResult(null);
      toast(err?.message || "Could not run the check", "error");
    }
  }

  return (
    <div
      className={`ea-scrim${open ? " open" : ""}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside className="ea-drawer" role="dialog" aria-modal="true" aria-label="Redirect URLs">
        <header className="ea-head">
          <div className="ea-head-title">
            <span className="ea-head-icon" aria-hidden="true">
              <i className="fa-solid fa-arrow-up-right-from-square" />
            </span>
            <div>
              <div className="ea-head-name">Redirect URLs</div>
              <div className="ea-head-env">{envName || "—"}</div>
            </div>
          </div>
          <button type="button" className="ea-close" aria-label="Close" onClick={onClose}>
            <i className="fa-solid fa-xmark" />
          </button>
        </header>

        <div className="ea-body">
          <div className="ea-explainer">
            <i className="fa-solid fa-circle-info" aria-hidden="true" />
            <span>
              After signing in, the browser is sent back to the <code>redirectUri</code> the
              sign-in carried, with the authorization code attached. Only addresses listed here
              are honoured; an environment with no entries refuses every <code>redirectUri</code>.
              Use an origin such as <code>https://app.example.com</code>, optionally with a path
              prefix. https only (http for localhost); no wildcards.
            </span>
          </div>

          {canCreate && (
            <div className="ea-check-form" style={{ marginBottom: 16 }}>
              <div className="ea-check-fields">
                <div className="form-group">
                  <label className="form-label" htmlFor="ru-value">
                    Redirect URL
                  </label>
                  <input
                    id="ru-value"
                    className="form-control"
                    type="url"
                    autoComplete="off"
                    placeholder="https://app.example.com/auth/done"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && add()}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="ru-label">
                    Label <span style={{ opacity: 0.6 }}>(optional)</span>
                  </label>
                  <input
                    id="ru-label"
                    className="form-control"
                    type="text"
                    autoComplete="off"
                    placeholder="Intranet portal"
                    maxLength={255}
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && add()}
                  />
                </div>
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={add}
                disabled={busy || !value.trim()}
              >
                <i className="fa-solid fa-plus" aria-hidden="true" />
                &nbsp;Add redirect URL
              </button>
            </div>
          )}

          <div className="ea-toolbar" style={{ marginBottom: 12 }}>
            <div className="ea-search">
              <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
              <input
                type="search"
                value={searchInput}
                placeholder="Search URL or label…"
                aria-label="Search the redirect URLs"
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            <select
              className="form-control"
              style={{ maxWidth: 160 }}
              aria-label="Filter by status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as StatusFilter);
                setPage(1);
              }}
            >
              <option value="all">All entries</option>
              <option value="enabled">Enabled</option>
              <option value="disabled">Disabled</option>
            </select>
          </div>

          <div className="ea-table-card">
            <div className="ea-table-scroll">
              <table className="ea-table">
                <thead>
                  <tr>
                    <th scope="col">Redirect URL</th>
                    <th scope="col">Enabled</th>
                    {canDelete && <th scope="col" className="ea-col-actions" />}
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan={canDelete ? 3 : 2}>
                        <div className="ea-skeleton ea-skeleton-seg" />
                      </td>
                    </tr>
                  )}
                  {!loading &&
                    rules.map((rule) => (
                      <tr key={rule.id}>
                        <td>
                          <div className="ea-identity-main">
                            <div className="ea-identity-value">{rule.value}</div>
                            {rule.label && <div className="ea-identity-sub">{rule.label}</div>}
                          </div>
                        </td>
                        <td>
                          <label
                            className="toggle-wrap"
                            title={rule.is_enabled ? "Switch off to stop honouring this address" : "Switch on to honour this address"}
                          >
                            <input
                              type="checkbox"
                              checked={rule.is_enabled}
                              disabled={!canUpdate || busy}
                              aria-label={`Redirect to ${rule.value}`}
                              onChange={() => toggle(rule)}
                            />
                            <div className="toggle-track" />
                          </label>
                        </td>
                        {canDelete && (
                          <td className="ea-col-actions">
                            <button
                              type="button"
                              className="ea-icon-btn ea-danger"
                              title="Remove"
                              aria-label={`Remove ${rule.value}`}
                              disabled={busy}
                              onClick={() => remove(rule)}
                            >
                              <i className="fa-solid fa-trash" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {!loading && data && data.total === 0 && data.counts.total > 0 && (
              <div className="ea-empty">
                <div className="ea-empty-icon" aria-hidden="true">
                  <i className="fa-solid fa-magnifying-glass" />
                </div>
                <div className="ea-empty-title">Nothing matches</div>
                <div className="ea-empty-desc">
                  No entry matches your search or filter. There are {data.counts.total} entries in
                  all.
                </div>
              </div>
            )}

            {!loading && data && data.counts.total === 0 && (
              <div className="ea-empty">
                <div className="ea-empty-icon" aria-hidden="true">
                  <i className="fa-solid fa-arrow-up-right-from-square" />
                </div>
                <div className="ea-empty-title">No redirect URLs yet</div>
                <div className="ea-empty-desc">
                  Every <code>redirectUri</code> is refused for {envName || "this environment"}{" "}
                  until one is added.
                </div>
              </div>
            )}

            {data && data.total > 0 && (
              <div className="ea-pager">
                <div className="ea-pager-count">
                  Showing {(data.page - 1) * data.page_size + 1} to{" "}
                  {Math.min(data.page * data.page_size, data.total)} of {data.total}
                  {data.total !== data.counts.total && (
                    <span className="ea-pager-total"> (filtered from {data.counts.total})</span>
                  )}
                  <span className="ea-pager-total"> · {data.counts.enabled} enabled</span>
                </div>

                {data.total_pages > 1 && (
                  <div className="ea-pager-nav">
                    <button
                      type="button"
                      onClick={() => setPage(data.page - 1)}
                      disabled={loading || data.page <= 1}
                      aria-label="Previous page"
                    >
                      <i className="fa-solid fa-chevron-left" aria-hidden="true" />
                    </button>
                    <span className="ea-pager-status">
                      Page {data.page} of {data.total_pages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPage(data.page + 1)}
                      disabled={loading || data.page >= data.total_pages}
                      aria-label="Next page"
                    >
                      <i className="fa-solid fa-chevron-right" aria-hidden="true" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="ea-check-form" style={{ marginTop: 16 }}>
            <div className="form-group">
              <label className="form-label" htmlFor="ru-test">
                Test an address
              </label>
              <input
                id="ru-test"
                className="form-control"
                type="text"
                autoComplete="off"
                placeholder="https://app.example.com/auth/done"
                value={testUri}
                onChange={(e) => {
                  setTestUri(e.target.value);
                  setTestResult(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && test()}
              />
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={test}
              disabled={!testUri.trim()}
            >
              Check
            </button>
            {testResult !== null && (
              <div style={{ marginTop: 8 }} role="status">
                {testResult ? (
                  <span>
                    <i className="fa-solid fa-circle-check" style={{ color: "var(--success, #2e9e5b)" }} />{" "}
                    Allowed: a sign-in may return here.
                  </span>
                ) : (
                  <span>
                    <i className="fa-solid fa-circle-xmark" style={{ color: "var(--danger)" }} />{" "}
                    Refused: not on the list, or not a valid address.
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

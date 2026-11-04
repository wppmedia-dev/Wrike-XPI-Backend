import { useCallback, useEffect, useMemo, useState } from "react";
import {
  listOAuthClients,
  revokeOAuthClient,
  type OAuthClient,
  type OAuthClientList,
} from "../lib/oauthClientsApi";
import { DataTable } from "../components/ui/DataTable";
import { useTable, type ColumnDef } from "../components/ui/useTable";
import { RowMenu } from "../components/ui/RowMenu";
import { Badge } from "../components/ui/Badge";
import { CopyButton } from "../components/ui/CopyButton";
import { EMPTY, dateSortValue, formatDate, formatDateTime } from "../lib/format";
import { confirmDanger, escHtml, progress, toast } from "../lib/notify";
import "./OAuthClients.css";

/* OAuth Clients: every MCP connector that registered itself through
 * POST /oauth/register, and the switch to revoke one. Revoking blocks new
 * sign-ins for that registration; tokens it already minted are separate
 * records, revoked from Tokens. */

type ClientStatus = "active" | "expired" | "revoked";

const DAY_MS = 24 * 60 * 60 * 1000;

const statusOf = (client: OAuthClient): ClientStatus => {
  if (client.revoked_at) return "revoked";
  if (client.expires_at && new Date(client.expires_at).getTime() <= Date.now()) return "expired";
  return "active";
};

const STATUS_BADGE: Record<ClientStatus, { tone: "success" | "warning" | "danger"; label: string }> = {
  active: { tone: "success", label: "Active" },
  expired: { tone: "warning", label: "Expired" },
  revoked: { tone: "danger", label: "Revoked" },
};

/** "5 min ago" for anything recent, the date after that. */
function timeAgo(value: string | null | undefined): string {
  if (!value) return "Never";
  const seconds = Math.round((Date.now() - new Date(value).getTime()) / 1000);
  if (Number.isNaN(seconds)) return EMPTY;
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hr ago`;
  return formatDate(value);
}

/** Host of each redirect URI: what an admin recognises a connector by. */
const redirectHosts = (client: OAuthClient): string => {
  const hosts = (client.redirect_uris || []).map((uri) => {
    try {
      return new URL(uri).host;
    } catch {
      return uri;
    }
  });
  return [...new Set(hosts)].join(", ");
};

export default function OAuthClients({ refreshKey = 0 }: { refreshKey?: number }) {
  const [data, setData] = useState<OAuthClientList | null>(null);
  const [loading, setLoading] = useState(true);
  const [showRevoked, setShowRevoked] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await listOAuthClients(showRevoked));
    } catch (err: any) {
      toast(err?.message || "Failed to load OAuth clients", "error");
    } finally {
      setLoading(false);
    }
  }, [showRevoked]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const handleRevoke = useCallback(
    async (client: OAuthClient) => {
      const name = client.client_name || "Unnamed client";
      const ok = await confirmDanger({
        title: "Revoke this OAuth client?",
        html:
          `<b>${escHtml(name)}</b> will no longer be able to start or finish a sign-in.<br><br>` +
          `Tokens it already obtained keep working until you revoke them from <b>Tokens</b>. ` +
          `This cannot be undone; the connector has to register again.`,
        confirmText: "Revoke",
      });
      if (!ok) return;

      progress.start();
      try {
        await revokeOAuthClient(client.id);
        toast(`${name} revoked`, "success");
        await load();
      } catch (err: any) {
        toast(err?.message || "Failed to revoke OAuth client", "error");
      } finally {
        progress.done();
      }
    },
    [load],
  );

  const rows = data?.rows || [];

  const columns = useMemo<ColumnDef<OAuthClient>[]>(
    () => [
      {
        id: "client_name",
        header: "Client",
        accessor: (c) => c.client_name || "",
        cell: (c) => (
          <div className="oc-client">
            <strong>{c.client_name || <span className="text-muted">Unnamed client</span>}</strong>
            <span className="oc-id" title={c.id}>
              {c.id.slice(0, 8)}
              <CopyButton value={c.id} title="Copy registration id" />
            </span>
          </div>
        ),
      },
      {
        id: "redirect",
        header: "Redirect to",
        accessor: (c) => (c.redirect_uris || []).join(" "),
        cell: (c) => (
          <span className="oc-redirect" title={(c.redirect_uris || []).join("\n")}>
            {redirectHosts(c) || EMPTY}
          </span>
        ),
      },
      {
        id: "status",
        header: "Status",
        accessor: (c) => statusOf(c),
        cell: (c) => {
          const s = STATUS_BADGE[statusOf(c)];
          return (
            <Badge tone={s.tone} dot>
              {s.label}
            </Badge>
          );
        },
      },
      {
        id: "created_at",
        header: "Registered",
        accessor: (c) => dateSortValue(c.created_at),
        searchable: false,
        cell: (c) => <span title={formatDateTime(c.created_at)}>{formatDate(c.created_at)}</span>,
      },
      {
        id: "last_used_at",
        header: "Last sign-in",
        accessor: (c) => dateSortValue(c.last_used_at),
        searchable: false,
        cell: (c) => (
          <span title={c.last_used_at ? formatDateTime(c.last_used_at) : undefined}>
            {timeAgo(c.last_used_at)}
          </span>
        ),
      },
      {
        id: "expires_at",
        header: "Expires",
        accessor: (c) => dateSortValue(c.expires_at),
        searchable: false,
        cell: (c) => (c.revoked_at ? <span className="text-muted">{EMPTY}</span> : formatDate(c.expires_at)),
      },
      {
        id: "created_ip",
        header: "Registered from",
        accessor: (c) => c.created_ip || "",
        cell: (c) => (c.created_ip ? <span className="oc-mono">{c.created_ip}</span> : <span className="text-muted">{EMPTY}</span>),
      },
      {
        id: "actions",
        header: "Actions",
        width: "64px",
        align: "center",
        cell: (c) =>
          statusOf(c) === "active" ? (
            <RowMenu
              label={`Actions for ${c.client_name || c.id}`}
              items={[
                {
                  label: "Revoke",
                  icon: "fa-solid fa-ban",
                  danger: true,
                  onSelect: () => handleRevoke(c),
                },
              ]}
            />
          ) : (
            <span
              className="text-muted"
              title={c.revoked_at ? `Revoked ${formatDateTime(c.revoked_at)}` : "Expired"}
            >
              {EMPTY}
            </span>
          ),
      },
    ],
    [handleRevoke],
  );

  const table = useTable({
    data: rows,
    columns,
    getRowId: (c) => c.id,
    initialSort: { columnId: "created_at", direction: "desc" },
    initialPageSize: 10,
  });

  const active = data?.counts.active ?? 0;
  const revoked = data?.counts.revoked ?? 0;
  const usedRecently = rows.filter(
    (c) => !c.revoked_at && c.last_used_at && Date.now() - new Date(c.last_used_at).getTime() <= 30 * DAY_MS,
  ).length;
  const expiringSoon = rows.filter((c) => {
    if (c.revoked_at || !c.expires_at) return false;
    const left = new Date(c.expires_at).getTime() - Date.now();
    return left > 0 && left <= 30 * DAY_MS;
  }).length;
  const truncated = !!data && data.total > rows.length;

  return (
    <>
      <div className="stats-grid">
        <div className="stat-card green">
          <div className="stat-icon green">
            <i className="fa-solid fa-plug-circle-check" />
          </div>
          <div className="stat-body">
            <div className="stat-value">{data ? active : EMPTY}</div>
            <div className="stat-label">Active Clients</div>
          </div>
        </div>
        <div className="stat-card blue">
          <div className="stat-icon blue">
            <i className="fa-solid fa-right-to-bracket" />
          </div>
          <div className="stat-body">
            <div className="stat-value">{data ? usedRecently : EMPTY}</div>
            <div className="stat-label">Signed In (30 days)</div>
          </div>
        </div>
        <div className="stat-card yellow">
          <div className="stat-icon yellow">
            <i className="fa-solid fa-hourglass-half" />
          </div>
          <div className="stat-body">
            <div className="stat-value">{data ? expiringSoon : EMPTY}</div>
            <div className="stat-label">Expiring (30 days)</div>
          </div>
        </div>
        <div className="stat-card red">
          <div className="stat-icon red">
            <i className="fa-solid fa-ban" />
          </div>
          <div className="stat-body">
            <div className="stat-value">{data ? revoked : EMPTY}</div>
            <div className="stat-label">Revoked</div>
          </div>
        </div>
      </div>

      {truncated && (
        <div className="oc-note">
          <i className="fa-solid fa-circle-info" /> Showing the newest {rows.length} of {data!.total} registrations.
        </div>
      )}

      <div className="card">
        <div className="card-body">
          <DataTable
            table={table}
            caption="OAuth clients"
            loading={loading && !data}
            className="oc-table"
            searchPlaceholder="Search clients…"
            toolbar={
              <label className="oc-filter">
                <input
                  type="checkbox"
                  checked={showRevoked}
                  onChange={(e) => setShowRevoked(e.target.checked)}
                />
                Show revoked
              </label>
            }
            empty={
              <div className="dt2-empty">
                <div className="dt2-empty-icon">
                  <i className="fa-solid fa-plug" aria-hidden="true" />
                </div>
                <h3>No OAuth clients yet</h3>
                <p>MCP connectors appear here once they register with this service.</p>
              </div>
            }
          />
        </div>
      </div>
    </>
  );
}

import { useMemo } from "react";
import type { PortalEnvironmentFull } from "../lib/portalAuthApi";
import { DataTable } from "../components/ui/DataTable";
import { useTable, type ColumnDef } from "../components/ui/useTable";
import { RowMenu } from "../components/ui/RowMenu";
import { ActiveBadge, Badge } from "../components/ui/Badge";
import {
  ACCESS_BADGE,
  accessLabel,
  accessStateOf,
} from "../lib/tokenDisplay";
import { EMPTY, dateSortValue, formatDateTime } from "../lib/format";

/* The portal user's "My Environments" table — same useTable/DataTable/RowMenu
 * stack as frontend/src/pages/admin/PortalUsersTable.tsx, replacing the old
 * jQuery + DataTables imperative bridge that built rows as HTML strings.
 * Edit/Delete are per-row menu items rather than inline buttons so this
 * matches the admin console's row-action style, and each item is present
 * only when the portal permission matrix grants that action — mirrors
 * PortalUsersTable's onToggleStatus-style closures, just gated by `can`. */

export interface PortalEnvironmentsTableProps {
  environments: PortalEnvironmentFull[];
  loading: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  /** environment_access:read — shows the "API access scope" row action,
      matching the admin table's shield-icon button (see AdminDashboard.tsx). */
  canSeeAccess: boolean;
  /** api_tokens:read — shows the "View tokens" row action, the same one the
      admin console's Environments table offers: straight to the tokens issued
      for this environment, already filtered to it. */
  canViewTokens: boolean;
  /** environment_modules:read — shows the module ceiling in the Modules column
      and the row action that opens it. */
  canSeeModules: boolean;
  /** environment_modules:update — opens that grid as an editor rather than a
      read-only view. */
  canUpdateModules: boolean;
  /** activity_logs:read — shows the "Activity logs" row action, again matching
      the admin console. Offered only with the grant, because the log page and
      its API are behind it and a row action that 403s is a trap. */
  canSeeActivity: boolean;
  onEdit: (env: PortalEnvironmentFull) => void;
  onDelete: (env: PortalEnvironmentFull) => void;
  onManageAccess: (env: PortalEnvironmentFull) => void;
  onViewTokens: (env: PortalEnvironmentFull) => void;
  onViewActivityLogs: (env: PortalEnvironmentFull) => void;
  /** Opens this environment's module ceiling. */
  onModulePermissions: (env: PortalEnvironmentFull) => void;
  onAdd: () => void;
}

function maskSecret(value: string | null | undefined): string {
  if (!value) return EMPTY;
  return value.slice(0, Math.min(6, value.length)) + "••••••";
}

export function PortalEnvironmentsTable({
  environments,
  loading,
  canUpdate,
  canDelete,
  canSeeAccess,
  canViewTokens,
  canSeeModules,
  canUpdateModules,
  canSeeActivity,
  onEdit,
  onDelete,
  onManageAccess,
  onViewTokens,
  onViewActivityLogs,
  onModulePermissions,
  onAdd,
}: PortalEnvironmentsTableProps) {
  const columns = useMemo<ColumnDef<PortalEnvironmentFull>[]>(() => {
    const cols: ColumnDef<PortalEnvironmentFull>[] = [
      {
        id: "environment_name",
        header: "Environment",
        accessor: (env) => env.environment_name,
        cell: (env) => <strong>{env.environment_name}</strong>,
      },
      {
        id: "id",
        header: "Env ID",
        accessor: (env) => env.id,
        cell: (env) => <code style={{ fontSize: 11, color: "var(--text-muted)" }}>{env.id}</code>,
      },
      {
        id: "client_id",
        header: "Client ID",
        accessor: (env) => env.client_id,
        cell: (env) => <span className="mval">{maskSecret(env.client_id)}</span>,
        searchable: false,
      },
      {
        id: "created_at",
        header: "Created",
        accessor: (env) => dateSortValue(env.created_at),
        cell: (env) => <span className="pu-muted-cell">{formatDateTime(env.created_at)}</span>,
        searchable: false,
      },
      {
        id: "updated_at",
        header: "Last Updated",
        accessor: (env) => dateSortValue(env.updated_at),
        cell: (env) => <span className="pu-muted-cell">{formatDateTime(env.updated_at)}</span>,
        searchable: false,
      },
      {
        id: "module_permissions",
        header: "Modules",
        width: "132px",
        // Sorts on what the badge says: how much of the ceiling is granted.
        accessor: (env) => env.module_permissions?.granted ?? 0,
        cell: (env) => {
          const permissions = env.module_permissions ?? {
            configured: false,
            granted: 0,
            total: 0,
          };
          const state = accessStateOf(permissions);
          const { tone, icon } = ACCESS_BADGE[state];
          const detail = permissions.configured
            ? `Every token in ${env.environment_name} is held to this ceiling.`
            : "No ceiling: every module is allowed here, and each token's own matrix decides what it may do.";

          return (
            <span title={detail}>
              <Badge tone={tone} icon={icon}>
                {accessLabel(state, permissions.granted, permissions.total)}
              </Badge>
            </span>
          );
        },
      },
      {
        id: "is_visible",
        header: "Visibility",
        accessor: (env) => env.is_visible,
        cell: (env) =>
          env.is_visible ? (
            <Badge tone="success" dot>
              Visible
            </Badge>
          ) : (
            <Badge tone="warning" dot>
              Hidden
            </Badge>
          ),
      },
      {
        id: "is_active",
        header: "Status",
        accessor: (env) => env.is_active,
        cell: (env) => <ActiveBadge active={env.is_active} />,
      },
    ];

    // Actions column only exists at all if there's at least one action this
    // user can take — an empty RowMenu with zero items would just be a
    // trigger that opens nothing.
    if (
      canUpdate ||
      canDelete ||
      canSeeAccess ||
      canViewTokens ||
      canSeeModules ||
      canSeeActivity
    ) {
      cols.push({
        id: "actions",
        header: "Actions",
        width: "64px",
        align: "center",
        className: "pu-actions-col",
        headerClassName: "pu-actions-col",
        cell: (env) => (
          <RowMenu
            label={`Actions for ${env.environment_name}`}
            items={[
              ...(canSeeAccess
                ? [
                    {
                      label: "API Access Scope",
                      icon: "fa-solid fa-shield-halved",
                      onSelect: () => onManageAccess(env),
                    },
                  ]
                : []),
              ...(canViewTokens
                ? [
                    {
                      // The question "what is using this environment?" asked
                      // from the environment's own row, exactly as the admin
                      // console's Environments table asks it.
                      label: "View sessions",
                      icon: "fa-solid fa-key",
                      onSelect: () => onViewTokens(env),
                    },
                  ]
                : []),
              ...(canSeeModules
                ? [
                    {
                      // The layer above those tokens: what anything in this
                      // environment may reach at all. Same wording as the admin
                      // console's row action for it.
                      label: "Module permissions",
                      icon: "fa-solid fa-layer-group",
                      onSelect: () => onModulePermissions(env),
                    },
                  ]
                : []),
              ...(canSeeActivity
                ? [
                    {
                      // The same question about the past: what has been called
                      // on this environment, with its filter pre-applied.
                      label: "Activity logs",
                      icon: "fa-solid fa-clock-rotate-left",
                      onSelect: () => onViewActivityLogs(env),
                    },
                  ]
                : []),
              ...(canUpdate
                ? [
                    {
                      label: "Edit",
                      icon: "fa-solid fa-pen-to-square",
                      onSelect: () => onEdit(env),
                    },
                  ]
                : []),
              ...(canDelete
                ? [
                    {
                      label: "Delete",
                      icon: "fa-solid fa-trash",
                      danger: true,
                      onSelect: () => onDelete(env),
                    },
                  ]
                : []),
            ]}
          />
        ),
      });
    }

    return cols;
  }, [
    canUpdate,
    canDelete,
    canSeeAccess,
    canViewTokens,
    canSeeModules,
    canUpdateModules,
    canSeeActivity,
    onEdit,
    onDelete,
    onManageAccess,
    onViewTokens,
    onViewActivityLogs,
  ]);

  const table = useTable({
    data: environments,
    columns,
    getRowId: (env) => env.id,
    initialSort: { columnId: "environment_name", direction: "asc" },
    initialPageSize: 10,
  });

  return (
    <DataTable
      table={table}
      caption="My environments"
      loading={loading}
      searchPlaceholder="Search environments…"
      empty={
        <div className="dt2-empty">
          <div className="dt2-empty-icon">
            <i className="fa-regular fa-folder-open" aria-hidden="true" />
          </div>
          <h3>No environments yet</h3>
          {canUpdate || canDelete ? (
            <>
              <p>Click Add Environment to create your first one.</p>
              <button type="button" className="btn btn-primary" onClick={onAdd}>
                <i className="fa-solid fa-plus" aria-hidden="true" /> Add Environment
              </button>
            </>
          ) : (
            <p>No environments have been shared with you yet.</p>
          )}
        </div>
      }
    />
  );
}

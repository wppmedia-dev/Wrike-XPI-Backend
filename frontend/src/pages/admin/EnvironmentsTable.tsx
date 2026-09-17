import { useEffect, useMemo, useRef } from "react";
import type { AdminEnvironment } from "../../lib/adminApi";
import { DataTable } from "../../components/ui/DataTable";
import { useTable, type ColumnDef } from "../../components/ui/useTable";
import { RowMenu } from "../../components/ui/RowMenu";
import { CopyButton } from "../../components/ui/CopyButton";
import { Toggle } from "../../components/ui/Toggle";
import { EMPTY, dateSortValue, formatDateTime } from "../../lib/format";

/* The Environments table.
 *
 * Everything here used to be produced by envRowHtml(), a 45-line string
 * concatenation fed to DataTables, with the row's buttons wired through
 * delegated jQuery handlers that read the environment id back out of a
 * data-attribute. The columns below render the same table declaratively, so
 * each button closes over the actual row object. */

export interface EnvironmentsTableProps {
  environments: AdminEnvironment[];
  loading: boolean;
  /**
   * The search box, answered by the server. The table keeps the term being
   * typed (that is its own input state) and hands the settled term up; the
   * rows it renders are already the server's answer, so it does not filter
   * them itself. Omit it and the table filters what it was given, which is
   * what every other caller wants.
   */
  onSearch?: (term: string) => void;
  onEdit: (env: AdminEnvironment) => void;
  onDuplicate: (env: AdminEnvironment) => void;
  onDelete: (env: AdminEnvironment) => void;
  onOpenAccess: (env: AdminEnvironment) => void;
  /** Opens the API Tokens page scoped to this environment. */
  onViewTokens: (env: AdminEnvironment) => void;
  /** Opens the Activity Log scoped to this environment. */
  onActivityLogs: (env: AdminEnvironment) => void;
  onToggle: (
    env: AdminEnvironment,
    field: "is_active" | "is_visible",
    next: boolean,
  ) => Promise<void>;
  onAdd: () => void;
}

/* Long enough that typing an environment id is one request rather than
   eighteen. Same value as the Tokens table, for the same reason. */
const SEARCH_DEBOUNCE_MS = 350;

export function EnvironmentsTable({
  environments,
  loading,
  onSearch,
  onEdit,
  onDuplicate,
  onDelete,
  onOpenAccess,
  onViewTokens,
  onActivityLogs,
  onToggle,
  onAdd,
}: EnvironmentsTableProps) {
  const columns = useMemo<ColumnDef<AdminEnvironment>[]>(
    () => [
      {
        id: "environment_name",
        header: "Environment",
        accessor: (env) => env.environment_name,
        cell: (env) => (
          <div className="env-name-cell">
            <strong>{env.environment_name}</strong>
            <div className="action-cell env-id-row">
              <code className="env-id-code">{env.id}</code>
              <CopyButton value={env.id} title="Copy ID" />
            </div>
          </div>
        ),
      },
      {
        id: "client_id",
        header: "Client ID",
        accessor: (env) => env.client_id,
      },
      {
        id: "account_id",
        header: "Account ID",
        accessor: (env) => env.account_id,
        cell: (env) =>
          env.account_id ? (
            env.account_id
          ) : (
            <span className="text-muted">{EMPTY}</span>
          ),
      },
      {
        id: "updated_at",
        header: "Last Updated",
        // Sorts on the timestamp, displays the formatted date: sorting the
        // rendered string would order "Apr" before "Jan".
        accessor: (env) => dateSortValue(env.updated_at),
        cell: (env) => formatDateTime(env.updated_at),
        searchable: false,
      },
      {
        id: "is_visible",
        header: "Visibility",
        width: "92px",
        sortable: false,
        cell: (env) => (
          <Toggle
            size="sm"
            checked={env.is_visible}
            title={env.is_visible ? "Visible in the portal" : "Hidden from the portal"}
            ariaLabel={`Visibility for ${env.environment_name}`}
            onToggle={(next) => onToggle(env, "is_visible", next)}
          />
        ),
      },
      {
        id: "is_active",
        header: "Status",
        width: "92px",
        sortable: false,
        cell: (env) => (
          <Toggle
            size="sm"
            checked={env.is_active}
            title={env.is_active ? "Environment enabled" : "Environment disabled"}
            ariaLabel={`Status for ${env.environment_name}`}
            onToggle={(next) => onToggle(env, "is_active", next)}
          />
        ),
      },
      {
        id: "actions",
        header: "Actions",
        width: "64px",
        align: "center",
        className: "env-actions-col",
        headerClassName: "env-actions-col",
        cell: (env) => (
          <RowMenu
            label={`Actions for ${env.environment_name}`}
            items={[
              {
                label: "API access scope",
                icon: "fa-solid fa-shield-halved",
                onSelect: () => onOpenAccess(env),
              },
              {
                // Straight to the tokens issued for this environment, already
                // filtered to it. That is the question "what is using this
                // environment?" asked from the environment's own row.
                label: "View tokens",
                icon: "fa-solid fa-key",
                onSelect: () => onViewTokens(env),
              },
              {
                // The same question about the past: what has been called on
                // this environment, with its filter already applied.
                label: "Activity logs",
                icon: "fa-solid fa-clock-rotate-left",
                onSelect: () => onActivityLogs(env),
              },
              {
                label: "Edit",
                icon: "fa-solid fa-pen-to-square",
                onSelect: () => onEdit(env),
              },
              {
                label: "Duplicate",
                icon: "fa-regular fa-clone",
                onSelect: () => onDuplicate(env),
              },
              {
                label: "Delete",
                icon: "fa-solid fa-trash",
                danger: true,
                onSelect: () => onDelete(env),
              },
            ]}
          />
        ),
      },
    ],
    [onEdit, onDuplicate, onDelete, onOpenAccess, onViewTokens, onActivityLogs, onToggle],
  );

  const table = useTable({
    data: environments,
    columns,
    getRowId: (env) => env.id,
    initialPageSize: 10,
    // The rows are already what the server decided, so searching them again
    // here would filter the answer by a term the answer was not asked for.
    clientSearch: !onSearch,
  });

  const { search } = table;

  /* The term the parent is already showing, so a settled change is sent once
     and mount does not re-ask for the list the parent has just loaded. */
  const sentTermRef = useRef(search.trim());

  useEffect(() => {
    if (!onSearch) return;
    const term = search.trim();
    if (term === sentTermRef.current) return;

    const timer = window.setTimeout(() => {
      sentTermRef.current = term;
      onSearch(term);
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [search, onSearch]);

  // Read from the input rather than from props: while a search is in flight
  // the box shows the question that was asked, which is what the empty state
  // has to explain.
  const activeTerm = search.trim();

  return (
    <DataTable
      table={table}
      caption="Environments"
      loading={loading}
      className="env-table"
      searchPlaceholder="Search by name or environment id…"
      empty={
        activeTerm ? (
          // A search that matched nothing used to render the "no environments
          // yet" panel below, which tells an admin their environments are gone
          // when in fact they are all still there behind the term.
          <div className="dt2-empty">
            <div className="dt2-empty-icon">
              <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
            </div>
            <h3>No environments match that search</h3>
            <p>
              Nothing matches “{activeTerm}”. Search by name, or paste an
              environment id in full.
            </p>
          </div>
        ) : (
          <div className="dt2-empty">
            <div className="dt2-empty-icon">
              <i className="fa-regular fa-folder-open" aria-hidden="true" />
            </div>
            <h3>No environments yet</h3>
            <p>Add the first environment to start issuing tokens.</p>
            <button type="button" className="btn btn-primary" onClick={onAdd}>
              <i className="fa-solid fa-plus" aria-hidden="true" /> Add Environment
            </button>
          </div>
        )
      }
    />
  );
}

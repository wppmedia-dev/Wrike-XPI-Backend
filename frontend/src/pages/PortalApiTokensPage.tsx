import { useCallback, useEffect, useRef, useState } from "react";
import {
  EMPTY_FILTERS,
  TokensTable,
  toTokenListQuery,
  type TokenFilters,
} from "../components/TokensTable";
import { confirmDanger, toast } from "../lib/notify";
import { getPortalToken } from "../lib/portalAuthApi";
import {
  getPortalTokenCatalog,
  getPortalTokenPermissions,
  listPortalApiTokens,
  savePortalTokenPermissions,
  setPortalTokenStatus,
  type PortalApiToken,
} from "../lib/portalApiTokensApi";
import type { AdminToken, TokenListQuery } from "../lib/tokenPermissionsApi";
import { PageInfo } from "../components/ui/PageInfo";
import { PORTAL_HELP } from "../lib/pageHelp";
import TokenPermissions, { type TokenPermissionsApi } from "./TokenPermissions";

/* The portal's API Tokens page.
 *
 * It is the admin console's API Tokens page, with one column of difference:
 * the same shared table (frontend/src/components/TokensTable.tsx), the same
 * permissions popup (./TokenPermissions), the same Access and Validity badges
 * (../lib/tokenDisplay), the same advanced filters and the same "Activity
 * logs" row action. Reusing them is the point: a table with two
 * implementations drifts, and the drift stays invisible until someone puts a
 * screenshot from each console side by side.
 *
 * What differs is what has to:
 *   - Scope. The server filters by the environments this user can see
 *     (src/utils/portalScope.js, the same rule the Environments page uses), so
 *     this page has no environment scope chip and no "all environments" view.
 *   - Grants. The api_tokens matrix decides which controls exist: read shows the
 *     page and the permissions popup, update the popup's editor and the Status
 *     switch. There is no third grant: availability is a narrowing decision like
 *     the matrix itself, so update carries both, and delete had nothing left of
 *     its own to authorise. requirePortalPermission in
 *     src/routes/portal/apiTokens enforces the same grants again, so a hidden
 *     control is never the only thing standing in a request's way.
 *   - Create. There is none, here or in the admin console. A token is minted by
 *     the token service's root login page or by an MCP client's OAuth flow, and
 *     both of those exchange a Wrike authorization code that only a person
 *     signing in can produce. A console can start that sign-in but can never
 *     finish it, so a Create button would only ever be a redirect.
 */

/**
 * The permissions editor, pointed at the portal's own endpoints.
 *
 * Module scope so its identity is stable: the editor's load effect
 * deliberately does not depend on it, and an object rebuilt on every render
 * would either refetch constantly or read a stale session. `getPortalToken()`
 * is called at request time for the same reason, so a re-login is picked up.
 */
const PORTAL_PERMISSIONS_API: TokenPermissionsApi = {
  loadCatalog: async () => getPortalTokenCatalog(getPortalToken() || ""),
  load: async (tokenId) =>
    getPortalTokenPermissions(getPortalToken() || "", tokenId),
  save: async (tokenId, permissions) =>
    savePortalTokenPermissions(getPortalToken() || "", tokenId, permissions),
};

interface Props {
  /** The api_tokens grants from the portal permission matrix. Update is the one
      write grant this page has: it opens the permissions editor and it draws
      the Status switch. */
  canUpdate: boolean;
  /** Called by the "Activity logs" row action: the shell switches to the
      Activity Log page with this token's rows filtered in. */
  onViewActivityLogs?: (token: PortalApiToken) => void;
  /**
   * An environment the user arrived here asking about, set by the Environments
   * table's "View tokens" action. Applied to the table's environment filter;
   * a fresh object per click is what makes clicking the same environment twice
   * work after the filter was cleared in between.
   */
  envScope?: { id: string; name: string } | null;
  /** Tells the shell its scope is no longer applied. */
  onClearEnvScope?: () => void;
}

export default function PortalApiTokensPage({
  canUpdate,
  onViewActivityLogs,
  envScope = null,
  onClearEnvScope,
}: Props) {
  const token = getPortalToken();

  const [tokens, setTokens] = useState<PortalApiToken[]>([]);
  const [loading, setLoading] = useState(false);

  /** The query the server was last asked for. Same shape and the same
      reasoning as the admin console: the server filters, this page renders
      what came back. */
  const [filters, setFilters] = useState<TokenFilters>(EMPTY_FILTERS);
  const [search, setSearch] = useState("");
  const [environments, setEnvironments] = useState<{ id: string; name: string }[]>([]);
  const [hasUnassigned, setHasUnassigned] = useState(false);
  const [total, setTotal] = useState(0);

  const [permsTokenId, setPermsTokenId] = useState<string | null>(null);
  const [permsLabel, setPermsLabel] = useState<string | null>(null);

  /* Read by the reloads a write triggers (a status flip), so those reuse the
     query that is currently applied instead of resetting to everything. */
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const searchRef = useRef(search);
  searchRef.current = search;

  const load = useCallback(
    async (
      query: TokenListQuery = toTokenListQuery(
        filtersRef.current,
        searchRef.current,
      ),
    ) => {
      if (!token) return;
      setLoading(true);
      try {
        const data = await listPortalApiTokens(token, query);
        setTokens(data.tokens);
        setEnvironments(data.environments);
        setHasUnassigned(!!data.has_unassigned);
        setTotal(data.total);
      } catch (err: any) {
        toast(err?.message || "Could not load tokens", "error");
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    load();
  }, [load]);

  /** A committed change: store the query and fetch it in one go. */
  const fetchFor = useCallback(
    (next: TokenFilters, term: string) => {
      setFilters(next);
      setSearch(term);
      load(toTokenListQuery(next, term));
    },
    [load],
  );

  const applyFilters = useCallback(
    (next: TokenFilters) => fetchFor(next, searchRef.current),
    [fetchFor],
  );

  const searchTokens = useCallback(
    (term: string) => {
      if (term === searchRef.current) return;
      fetchFor(filtersRef.current, term);
    },
    [fetchFor],
  );

  /** Identifies a token in the permissions popup's header without ever showing
      its credential: the environment it acts for and its account. */
  const tokenLabel = (row: AdminToken) =>
    [row.environment_name, row.account_id].filter(Boolean).join(" · ") || row.id;

  const openPermissions = (row: AdminToken) => {
    setPermsTokenId(row.id);
    setPermsLabel(tokenLabel(row));
  };

  /**
   * The Status switch, in both directions, which is the update grant's write.
   *
   * One handler rather than one per direction: switching a token off and
   * switching it back on are the same lever, they are authorised by the same
   * grant, and they reach the same route (PUT /api/v1/portal/api-tokens/:id/
   * status). The OFF direction asks first, because it takes effect on the next
   * request: whatever integration holds the token starts getting 401s
   * immediately, and this console cannot tell that integration anything.
   *
   * Not offered at all without the grant: the page hands the table no writer, so
   * the column is a badge and there is no control to explain away. The server
   * refuses the same write again.
   */
  const handleStatus = async (row: AdminToken, next: boolean) => {
    if (!token) return;

    if (!next) {
      const confirmed = await confirmDanger({
        title: "Deactivate this token?",
        html: `This keeps the token's record and switches it off, so <strong>${
          row.username || row.id
        }</strong> stops working. It is not deleted: the record is what explains the 401.`,
        confirmText: "Deactivate",
      });
      if (!confirmed) return;
    }

    try {
      await setPortalTokenStatus(token, row.id, next);
      // Patched locally rather than refetched: one boolean changed, and a
      // reload here would make the switch feel like it bounced.
      setTokens((prev) =>
        prev.map((item) =>
          item.id === row.id ? { ...item, is_active: next } : item,
        ),
      );
      toast(next ? "Token reactivated" : "Token deactivated", "success");
    } catch (err: any) {
      toast(
        err?.message ||
          (next
            ? "Could not reactivate the token"
            : "Could not deactivate the token"),
        "error",
      );
    }
  };

  return (
    <>
      <div className="section-header">
        <div>
          <div className="section-title">
            Sessions <PageInfo help={PORTAL_HELP.apiTokens} />
          </div>
          <div className="section-subtitle">
            Tokens issued for your environments
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          <TokensTable
            tokens={tokens}
            loading={loading}
            filters={filters}
            onApplyFilters={applyFilters}
            environmentOptions={environments}
            hasUnassigned={hasUnassigned}
            total={total}
            onSearch={searchTokens}
            onPermissions={openPermissions}
            // Undefined without the update grant, which is what turns the
            // Status column into a badge: the table draws the switch it is
            // given a writer for, and nothing else. There is no onDelete here
            // either, so both positions of the switch reach the status write.
            onToggleStatus={canUpdate ? handleStatus : undefined}
            onActivityLogs={onViewActivityLogs}
            envScope={envScope}
            onClearEnvScope={onClearEnvScope}
          />
        </div>
      </div>

      {/* ════════════ TOKEN: MODULE PERMISSIONS ════════════ */}
      <TokenPermissions
        tokenId={permsTokenId}
        tokenLabel={permsLabel}
        open={!!permsTokenId}
        onClose={() => setPermsTokenId(null)}
        onSaved={load}
        api={PORTAL_PERMISSIONS_API}
        // Viewing a matrix is part of reading a token; changing it is the
        // update grant. Without that grant the popup still opens, and the
        // server refuses the save if it is attempted anyway.
        readOnly={!canUpdate}
      />
    </>
  );
}

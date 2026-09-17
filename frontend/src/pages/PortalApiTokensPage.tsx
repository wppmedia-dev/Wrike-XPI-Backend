import { useCallback, useEffect, useState } from "react";
import { TokensTable } from "../components/TokensTable";
import { confirmDanger, toast } from "../lib/notify";
import { getPortalToken } from "../lib/portalAuthApi";
import {
  deactivatePortalApiToken,
  getPortalTokenCatalog,
  getPortalTokenPermissions,
  listPortalApiTokens,
  savePortalTokenPermissions,
  setPortalTokenStatus,
  type PortalApiToken,
} from "../lib/portalApiTokensApi";
import type { AdminToken } from "../lib/tokenPermissionsApi";
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
 *   - Grants. The api_tokens matrix decides which controls exist: read shows
 *     the page, update the Permissions popup's editor, delete the Status switch
 *     and the Activate/Deactivate row action. requirePortalPermission in
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
  /** The api_tokens grants from the portal permission matrix. */
  canUpdate: boolean;
  canDelete: boolean;
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
  canDelete,
  onViewActivityLogs,
  envScope = null,
  onClearEnvScope,
}: Props) {
  const token = getPortalToken();

  const [tokens, setTokens] = useState<PortalApiToken[]>([]);
  const [loading, setLoading] = useState(false);

  const [permsTokenId, setPermsTokenId] = useState<string | null>(null);
  const [permsLabel, setPermsLabel] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      setTokens(await listPortalApiTokens(token));
    } catch (err: any) {
      toast(err?.message || "Could not load API tokens", "error");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  /** Identifies a token in the permissions popup's header without ever showing
      its credential: the environment it acts for and its account. */
  const tokenLabel = (row: AdminToken) =>
    [row.environment_name, row.account_id].filter(Boolean).join(" · ") || row.id;

  const openPermissions = (row: AdminToken) => {
    setPermsTokenId(row.id);
    setPermsLabel(tokenLabel(row));
  };

  /**
   * Switching a token back ON, which the table labels "Reactivate".
   *
   * Only that direction, because that is the only one this page can reach:
   * taking a token out of service is the delete action and goes through
   * handleDeactivate below, which is where the table sends the switch's OFF
   * position when it is given an onDelete (this page gives it one). Asking for
   * a confirmation here would never be seen.
   */
  const handleActivate = async (row: AdminToken) => {
    if (!token) return;

    try {
      await setPortalTokenStatus(token, row.id, true);
      // Patched locally rather than refetched: one boolean changed, and a
      // reload here would make the switch feel like it bounced.
      setTokens((prev) =>
        prev.map((item) =>
          item.id === row.id ? { ...item, is_active: true } : item,
        ),
      );
      toast("Token reactivated", "success");
    } catch (err: any) {
      toast(err?.message || "Could not reactivate the token", "error");
    }
  };

  /**
   * Switching a token off, and the delete action: the same write, two doors.
   *
   * A switch-off, not a row removal. The row holds the only copy of the
   * encrypted Wrike credential, so deleting it would break whoever is still
   * calling with that token with no record of why. The admin console has no
   * hard delete either. It goes through DELETE /:id so the server checks the
   * delete grant, which is the grant that decides whether this caller may take
   * a token out of service at all.
   */
  const handleDeactivate = async (row: AdminToken) => {
    if (!token) return;

    const confirmed = await confirmDanger({
      title: "Deactivate this token?",
      html: `This keeps the token's record and switches it off, so <strong>${
        row.username || row.id
      }</strong> stops working. It is not deleted: the record is what explains the 401.`,
      confirmText: "Deactivate",
    });
    if (!confirmed) return;

    try {
      await deactivatePortalApiToken(token, row.id);
      setTokens((prev) =>
        prev.map((item) =>
          item.id === row.id ? { ...item, is_active: false } : item,
        ),
      );
      toast("Token deactivated", "success");
    } catch (err: any) {
      toast(err?.message || "Could not deactivate the token", "error");
    }
  };

  return (
    <>
      <div className="section-header">
        <div>
          <div className="section-title">API Tokens</div>
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
            onPermissions={openPermissions}
            onToggleStatus={handleActivate}
            onActivityLogs={onViewActivityLogs}
            envScope={envScope}
            onClearEnvScope={onClearEnvScope}
            // Delete has an endpoint of its own here (DELETE /api/v1/portal/
            // api-tokens/:id, a switch-off that keeps the record), so both
            // directions of the switch go through it: the delete grant is what
            // decides whether this caller may take an integration out of
            // service, and it is the same lever that brings it back.
            onDelete={handleDeactivate}
            canDelete={canDelete}
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

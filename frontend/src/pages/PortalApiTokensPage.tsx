import { useCallback, useEffect, useState } from "react";
import { TokenConnectModal } from "../components/TokenConnectModal";
import { TokensTable } from "../components/TokensTable";
import { confirmDanger, toast } from "../lib/notify";
import { getPortalToken } from "../lib/portalAuthApi";
import {
  connectPortalApiToken,
  deactivatePortalApiToken,
  getPortalTokenCatalog,
  getPortalTokenPermissions,
  listPortalApiTokens,
  listPortalTokenEnvironments,
  savePortalTokenPermissions,
  setPortalTokenStatus,
  type PortalApiToken,
  type PortalTokenEnvironment,
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
 *     the page, create the Create button, update Permissions and the Status
 *     switch, delete the Activate/Deactivate row action. requirePortalPermission
 *     in src/routes/portal/apiTokens enforces the same four again, so a hidden
 *     control is never the only thing standing in a request's way.
 *   - Create. The admin console mints tokens through the sign-in flows it
 *     already runs; here it is an explicit action, because issuing a token is
 *     what a user comes to this page for.
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
  canCreate: boolean;
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
  canCreate,
  canUpdate,
  canDelete,
  onViewActivityLogs,
  envScope = null,
  onClearEnvScope,
}: Props) {
  const token = getPortalToken();

  const [tokens, setTokens] = useState<PortalApiToken[]>([]);
  const [loading, setLoading] = useState(false);

  const [connectOpen, setConnectOpen] = useState(false);
  const [environments, setEnvironments] = useState<PortalTokenEnvironment[]>([]);
  const [loadingEnvironments, setLoadingEnvironments] = useState(false);

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
   * Opens the create flow, and loads the environment picker the first time.
   *
   * Fetched lazily from this module's own endpoints rather than taken from the
   * Environments page: a user granted api_tokens without environments:read
   * would otherwise get a 403 from an unrelated module, and the portal signs a
   * user out on a 403.
   */
  const openConnect = async () => {
    setConnectOpen(true);
    if (!token || environments.length) return;

    setLoadingEnvironments(true);
    try {
      setEnvironments(await listPortalTokenEnvironments(token));
    } catch (err: any) {
      toast(err?.message || "Could not load your environments", "error");
    } finally {
      setLoadingEnvironments(false);
    }
  };

  /** Starts the Wrike sign-in for one environment and hands the modal the URL
      to send the browser to. Module scope would do, but this needs the session
      token, so it is built once per render and the modal reads it at call
      time (it only keeps the environments list in its own state). */
  const connectToken = async (envId: string) => {
    if (!token) throw new Error("Your session has expired");
    return connectPortalApiToken(token, envId);
  };

  /**
   * The write the table hands back to this page: the Status switch, and the
   * matching Activate/Deactivate row action.
   *
   * Switching a token off is confirmed first, because whoever is calling with
   * it starts getting 401s on their next request and there is nothing on this
   * side to warn them. Switching one back on asks nothing.
   */
  const handleToggleStatus = async (row: AdminToken, next: boolean) => {
    if (!token) return;

    if (!next) {
      const confirmed = await confirmDanger({
        title: "Switch this token off?",
        html: `Callers using <strong>${row.username || row.id}</strong> on <strong>${
          row.environment_name || "this environment"
        }</strong> will start getting 401s on their next request.`,
        confirmText: "Switch off",
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
      toast(next ? "Token activated" : "Token deactivated", "success");
    } catch (err: any) {
      toast(err?.message || "Could not change the token status", "error");
    }
  };

  /**
   * The delete action. A switch-off, not a row removal: the row holds the only
   * copy of the encrypted Wrike credential, so deleting it would break whoever
   * is still calling with that token with no record of why. The admin console
   * has no hard delete either.
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
            {canCreate
              ? "Tokens issued for your environments"
              : "The tokens issued for your environments"}
          </div>
        </div>
        {canCreate && (
          <button className="btn btn-primary" onClick={openConnect}>
            <i className="fa-solid fa-plus" /> Create token
          </button>
        )}
      </div>

      <div className="card">
        <div className="card-body">
          <TokensTable
            tokens={tokens}
            loading={loading}
            onPermissions={openPermissions}
            onToggleStatus={handleToggleStatus}
            onActivityLogs={onViewActivityLogs}
            envScope={envScope}
            onClearEnvScope={onClearEnvScope}
            // Delete has an endpoint of its own here (DELETE /api/v1/portal/
            // api-tokens/:id, a switch-off that keeps the record), so the row
            // menu's Deactivate uses it rather than the status write: a user
            // granted delete but not update can then switch a token off and
            // not back on, which is what their matrix says.
            onDelete={handleDeactivate}
            canUpdate={canUpdate}
            canDelete={canDelete}
          />
        </div>
      </div>

      {/* ════════════ CREATE TOKEN ════════════
          The same modal the admin console opens, so "Create token" means one
          thing in both places: it loads this console's environments (already
          scoped to the caller) and hands the modal the consent URL to send the
          browser to. */}
      <TokenConnectModal
        open={connectOpen}
        onClose={() => setConnectOpen(false)}
        environments={environments}
        loadingEnvironments={loadingEnvironments}
        connect={connectToken}
      />

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

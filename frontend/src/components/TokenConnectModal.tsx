import { useEffect, useState } from "react";
import { toast } from "../lib/notify";
import "./TokenConnectModal.css";

/**
 * Create an API token: pick an environment, then sign in to Wrike for it.
 *
 * Shared by both consoles, because issuing a token is the same act on each and
 * the difference is only who may start it (api_tokens:create in the portal,
 * unconditional in the admin console) and which environments are on offer
 * (the caller's own in the portal, all of them in the admin console).
 *
 * Nothing is minted here. A token exists only once a Wrike authorization code
 * has been exchanged, and only a person signing in can produce that code, so
 * this modal's whole job is to send the browser to the consent page for the
 * chosen environment. The mint happens on the way back, in the token service's
 * existing callback, and the credentials are shown once on the page that
 * returns there. The caller's `connect` is what builds that URL.
 *
 * The environment list is a prop rather than something this component fetches:
 * each console already knows how to load its own environments, within its own
 * scope, and a shared fetch would have to pick one of those rules.
 */

export interface TokenConnectEnvironment {
  id: string;
  environment_name: string;
  /** Offered, but flagged: an inactive environment cannot complete a sign-in. */
  is_active?: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  environments: TokenConnectEnvironment[];
  /** True while the environment list is still being fetched. */
  loadingEnvironments?: boolean;
  /** Starts the Wrike sign-in for one environment and returns the URL to
      send the browser to. */
  connect: (envId: string) => Promise<{ url: string }>;
}

export function TokenConnectModal({
  open,
  onClose,
  environments,
  loadingEnvironments = false,
  connect,
}: Props) {
  const [envId, setEnvId] = useState("");
  const [connecting, setConnecting] = useState(false);

  // Pre-select as soon as the list arrives, preferring an environment that can
  // actually complete a sign-in, so the common case is one click.
  useEffect(() => {
    if (!open) return;
    if (envId && environments.some((env) => env.id === envId)) return;

    const first = environments.find((env) => env.is_active !== false) || environments[0];
    setEnvId(first?.id || "");
  }, [open, environments, envId]);

  // A redirect that failed leaves the modal open with the same button, so the
  // busy flag has to be cleared or it can never be pressed again.
  useEffect(() => {
    if (!open) setConnecting(false);
  }, [open]);

  const start = async () => {
    if (!envId) return;
    setConnecting(true);
    try {
      const { url } = await connect(envId);
      window.location.href = url;
    } catch (err: any) {
      toast(err?.message || "Could not start the Wrike sign-in", "error");
      setConnecting(false);
    }
  };

  const canStart = !!envId && !connecting && !loadingEnvironments;

  return (
    <div
      className={`modal-backdrop${open ? " open" : ""}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" style={{ maxWidth: 460 }}>
        <div className="modal-header">
          <div className="modal-title">
            <i className="fa-solid fa-key" /> Create API Token
          </div>
          <button
            type="button"
            className="modal-close"
            aria-label="Close"
            onClick={onClose}
          >
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        <div className="modal-body">
          <p className="tcm-note">
            Choose the environment this token is for. You will be sent to Wrike to
            sign in, and the credentials are shown once, right after that, on the
            page you land on. Nothing is issued until you sign in.
          </p>

          <label className="tcm-field">
            <span className="tcm-field-label">Environment</span>
            <select
              value={envId}
              onChange={(e) => setEnvId(e.target.value)}
              disabled={loadingEnvironments || environments.length === 0}
            >
              {environments.length === 0 && (
                <option value="">
                  {loadingEnvironments ? "Loading environments…" : "No environments available"}
                </option>
              )}
              {environments.map((env) => (
                <option key={env.id} value={env.id}>
                  {env.environment_name}
                  {env.is_active === false ? " (inactive)" : ""}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canStart}
            onClick={start}
          >
            {connecting ? (
              <>
                <i className="fa-solid fa-spinner fa-spin" /> Redirecting…
              </>
            ) : (
              <>
                <i className="fa-solid fa-arrow-up-right-from-square" /> Continue to Wrike
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

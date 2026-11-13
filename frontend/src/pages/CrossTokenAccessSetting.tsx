import { useEffect, useState } from "react";
import { getCrossTokenAccess, saveCrossTokenAccess } from "../lib/mcpTokenSettingsApi";
import { toast } from "../lib/notify";
import "./MfaSettings.css";

/**
 * On: an MCP access token works on the REST API and the Xtend API token works
 * on /mcp. Off (default): each token only opens its own door.
 */
export default function CrossTokenAccessSetting() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getCrossTokenAccess()
      .then(setEnabled)
      .catch((err: any) => toast(err?.message || "Failed to load setting", "error"));
  }, []);

  if (enabled === null) return <div className="mfa-card">Loading…</div>;

  const toggle = () => {
    setBusy(true);
    saveCrossTokenAccess(!enabled)
      .then((next) => {
        setEnabled(next);
        toast(`Cross-token access ${next ? "allowed" : "not allowed"}`, "success");
      })
      .catch((err: any) => toast(err?.message || "Failed to save", "error"))
      .finally(() => setBusy(false));
  };

  return (
    <div className="mfa-card">
      <div className="mfa-switch-info">
        <div className="mfa-switch-title">
          <i className="fa-solid fa-right-left" /> Cross-token access
        </div>
        <p className="mfa-switch-desc">
          When allowed, an MCP token can call the REST API and the Xtend API token can be used on
          MCP. When not allowed, each token only works where it was issued. Applies within about
          30 seconds.
        </p>
      </div>
      <div className="mfa-action-row">
        <button className="btn btn-primary" disabled={busy} onClick={toggle}>
          {busy ? "Saving…" : enabled ? "Turn off (don't allow)" : "Turn on (allow)"}
        </button>
        <span className="mfa-switch-desc">Currently: {enabled ? "Allowed" : "Not allowed"}</span>
      </div>
    </div>
  );
}

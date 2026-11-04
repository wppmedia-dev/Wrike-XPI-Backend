import { useEffect, useState } from "react";
import {
  getMcpTokenSettings,
  saveMcpTokenSettings,
  type McpTokenSettings as Settings,
} from "../lib/mcpTokenSettingsApi";
import { toast } from "../lib/notify";
import "./MfaSettings.css";

type Unit = "minutes" | "hours" | "days";

const UNIT_SECONDS: Record<Unit, number> = {
  minutes: 60,
  hours: 3600,
  days: 86400,
};

interface Field {
  amount: string;
  unit: Unit;
}

/** The largest unit that divides the value evenly, so 604800 shows as 7 days. */
const toField = (seconds: number): Field => {
  if (seconds % UNIT_SECONDS.days === 0) {
    return { amount: String(seconds / UNIT_SECONDS.days), unit: "days" };
  }
  if (seconds % UNIT_SECONDS.hours === 0) {
    return { amount: String(seconds / UNIT_SECONDS.hours), unit: "hours" };
  }
  return { amount: String(Math.round(seconds / UNIT_SECONDS.minutes)), unit: "minutes" };
};

const toSeconds = ({ amount, unit }: Field): number => {
  const n = Number(amount);
  return Number.isInteger(n) && n > 0 ? n * UNIT_SECONDS[unit] : NaN;
};

const describe = (seconds: number): string => {
  const { amount, unit } = toField(seconds);
  return `${amount} ${Number(amount) === 1 ? unit.slice(0, -1) : unit}`;
};

function DurationInput({
  label,
  help,
  value,
  onChange,
}: {
  label: string;
  help: string;
  value: Field;
  onChange: (next: Field) => void;
}) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          className="form-control"
          type="number"
          min={1}
          style={{ maxWidth: 120 }}
          value={value.amount}
          onChange={(e) => onChange({ ...value, amount: e.target.value })}
        />
        <select
          className="form-control"
          style={{ maxWidth: 140 }}
          value={value.unit}
          onChange={(e) => onChange({ ...value, unit: e.target.value as Unit })}
        >
          <option value="minutes">minutes</option>
          <option value="hours">hours</option>
          <option value="days">days</option>
        </select>
      </div>
      <p className="mfa-switch-desc">{help}</p>
    </div>
  );
}

/**
 * Lifetimes of the tokens the MCP OAuth flow issues. The Xtend REST API's
 * 180-day token is not affected. Changes apply to tokens issued from now on.
 */
export default function McpTokenSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [access, setAccess] = useState<Field>({ amount: "", unit: "hours" });
  const [refresh, setRefresh] = useState<Field>({ amount: "", unit: "days" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = (next: Settings) => {
    setSettings(next);
    setAccess(toField(next.accessTtlSeconds));
    setRefresh(toField(next.refreshTtlSeconds));
  };

  useEffect(() => {
    getMcpTokenSettings()
      .then(apply)
      .catch((err: any) =>
        toast(err?.message || "Failed to load MCP token settings", "error"),
      );
  }, []);

  if (!settings) return <div className="mfa-card">Loading…</div>;

  const accessSeconds = toSeconds(access);
  const refreshSeconds = toSeconds(refresh);
  const { bounds } = settings;

  const problem = (() => {
    if (Number.isNaN(accessSeconds) || Number.isNaN(refreshSeconds)) {
      return "Enter a whole number greater than zero.";
    }
    if (
      accessSeconds < bounds.accessTtlSeconds.min ||
      accessSeconds > bounds.accessTtlSeconds.max
    ) {
      return `Access token lifetime must be between ${describe(bounds.accessTtlSeconds.min)} and ${describe(bounds.accessTtlSeconds.max)}.`;
    }
    if (
      refreshSeconds < bounds.refreshTtlSeconds.min ||
      refreshSeconds > bounds.refreshTtlSeconds.max
    ) {
      return `Refresh token lifetime must be between ${describe(bounds.refreshTtlSeconds.min)} and ${describe(bounds.refreshTtlSeconds.max)}.`;
    }
    if (refreshSeconds <= accessSeconds) {
      return "Refresh token lifetime must be longer than the access token's.";
    }
    return null;
  })();

  const unchanged =
    accessSeconds === settings.accessTtlSeconds &&
    refreshSeconds === settings.refreshTtlSeconds;

  const save = () => {
    if (problem) return;
    setError(null);
    setBusy(true);
    saveMcpTokenSettings({
      accessTtlSeconds: accessSeconds,
      refreshTtlSeconds: refreshSeconds,
    })
      .then((next) => {
        apply(next);
        toast("MCP token lifetimes saved", "success");
      })
      .catch((err: any) => setError(err?.message || "Failed to save"))
      .finally(() => setBusy(false));
  };

  const resetToDefaults = () => {
    setAccess(toField(settings.defaults.accessTtlSeconds));
    setRefresh(toField(settings.defaults.refreshTtlSeconds));
  };

  return (
    <div className="mfa-card">
      <div className="mfa-switch-info">
        <div className="mfa-switch-title">
          <i className="fa-solid fa-key" /> MCP token lifetimes
        </div>
        <p className="mfa-switch-desc">
          MCP connections use a short-lived access token and a refresh token that rotates every
          time it is used. Changes apply to tokens issued from now on; connections already
          signed in keep the lifetime they were given. The Xtend API token is not affected.
        </p>
      </div>

      <div style={{ marginTop: 16, maxWidth: 420 }}>
        <DurationInput
          label="Access token lifetime"
          help="How long a request can be made before the client has to refresh."
          value={access}
          onChange={setAccess}
        />
        <DurationInput
          label="Refresh token lifetime"
          help="How long a connection can sit idle before the user has to sign in again. Each refresh starts a new period."
          value={refresh}
          onChange={setRefresh}
        />
      </div>

      {(problem || error) && <div className="mfa-error">{error || problem}</div>}

      <div className="mfa-action-row">
        <button className="btn btn-primary" disabled={busy || !!problem || unchanged} onClick={save}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button className="btn btn-ghost" disabled={busy} onClick={resetToDefaults}>
          Reset to defaults ({describe(settings.defaults.accessTtlSeconds)} /{" "}
          {describe(settings.defaults.refreshTtlSeconds)})
        </button>
      </div>
    </div>
  );
}

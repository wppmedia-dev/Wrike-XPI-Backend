/**
 * The two per-environment MCP token lifetime overrides. A blank amount means
 * "use the global value" (admin console > MCP token lifetimes); the server
 * enforces the bounds and the refresh-longer-than-access rule, so this only
 * shapes the input and converts to and from seconds.
 */

export type LifetimeUnit = "minutes" | "hours" | "days";

export interface LifetimeField {
  amount: string;
  unit: LifetimeUnit;
}

const UNIT_SECONDS: Record<LifetimeUnit, number> = {
  minutes: 60,
  hours: 3600,
  days: 86400,
};

export const emptyLifetime = (unit: LifetimeUnit): LifetimeField => ({
  amount: "",
  unit,
});

/** null/undefined -> blank (inherit); otherwise the largest unit that divides evenly. */
export const lifetimeFromSeconds = (
  seconds: number | null | undefined,
  fallbackUnit: LifetimeUnit,
): LifetimeField => {
  if (seconds === null || seconds === undefined) return emptyLifetime(fallbackUnit);
  if (seconds % UNIT_SECONDS.days === 0) {
    return { amount: String(seconds / UNIT_SECONDS.days), unit: "days" };
  }
  if (seconds % UNIT_SECONDS.hours === 0) {
    return { amount: String(seconds / UNIT_SECONDS.hours), unit: "hours" };
  }
  return { amount: String(Math.round(seconds / UNIT_SECONDS.minutes)), unit: "minutes" };
};

/** Blank -> null (inherit). Throws on anything that is not a positive whole number. */
export const lifetimeToSeconds = (field: LifetimeField, label: string): number | null => {
  const raw = field.amount.trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`${label} must be a whole number greater than zero, or blank to use the global value`);
  }
  return n * UNIT_SECONDS[field.unit];
};

function Row({
  id,
  label,
  value,
  readOnly,
  onChange,
}: {
  id: string;
  label: string;
  value: LifetimeField;
  readOnly: boolean;
  onChange: (next: LifetimeField) => void;
}) {
  return (
    <div className="form-group">
      <label className="form-label" htmlFor={id}>
        {label}
      </label>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          className="form-control"
          type="number"
          min={1}
          id={id}
          placeholder="Global"
          style={{ maxWidth: 120 }}
          disabled={readOnly}
          value={value.amount}
          onChange={(e) => onChange({ ...value, amount: e.target.value })}
        />
        <select
          className="form-control"
          style={{ maxWidth: 140 }}
          aria-label={`${label} unit`}
          disabled={readOnly}
          value={value.unit}
          onChange={(e) => onChange({ ...value, unit: e.target.value as LifetimeUnit })}
        >
          <option value="minutes">minutes</option>
          <option value="hours">hours</option>
          <option value="days">days</option>
        </select>
      </div>
    </div>
  );
}

export default function McpLifetimeFields({
  idPrefix,
  access,
  refresh,
  readOnly = false,
  onAccessChange,
  onRefreshChange,
}: {
  idPrefix: string;
  access: LifetimeField;
  refresh: LifetimeField;
  /** Shown but not editable (the user may see the values, not change them). */
  readOnly?: boolean;
  onAccessChange: (next: LifetimeField) => void;
  onRefreshChange: (next: LifetimeField) => void;
}) {
  return (
    <>
      <div className="form-section-label">MCP token lifetimes</div>
      <Row
        id={`${idPrefix}McpAccessTtl`}
        label="Access token lifetime"
        value={access}
        readOnly={readOnly}
        onChange={onAccessChange}
      />
      <Row
        id={`${idPrefix}McpRefreshTtl`}
        label="Refresh token lifetime"
        value={refresh}
        readOnly={readOnly}
        onChange={onRefreshChange}
      />
      <p style={{ marginTop: -4, fontSize: 12, color: "var(--text-muted, #6b7280)" }}>
        Leave a field blank to use the global value. Applies to MCP sign-ins issued or refreshed
        from now on; the Xtend API token is not affected.
      </p>
    </>
  );
}

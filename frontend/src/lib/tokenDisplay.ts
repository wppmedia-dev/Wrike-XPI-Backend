import type { BadgeTone } from "../components/ui/Badge";
import { formatDateTime } from "./format";

/**
 * How a token row is described on screen: what its Access badge says and how
 * close it is to expiring.
 *
 * Lives here rather than inside the admin table because the portal now shows
 * the same two things about the same tokens (frontend/src/pages/PortalApiTokensPage.tsx).
 * Two copies of "which state is this token in" would eventually disagree, and
 * the disagreement would read as a permissions bug on one of the two screens.
 */

/* ── Access ───────────────────────────────────────────────────────────── */

/**
 * The three states an Access badge can be in.
 *
 * Full access is one state, not two. A token nobody has ever restricted and a
 * token an administrator has granted all of have the same access, and showing
 * them as "Unrestricted" and "22 of 22" next to each other made two identical
 * rows look different. Which of the two a token is, is provenance rather than
 * access, so it belongs in a tooltip, not in the badge.
 */
export type AccessState = "unrestricted" | "restricted" | "none";

export interface PermissionSummary {
  /** false = nobody has restricted this token, so it is unrestricted. */
  configured: boolean;
  granted: number;
  total: number;
}

export const accessStateOf = (permissions: PermissionSummary): AccessState => {
  const { granted, total } = permissions;
  if (granted === total) return "unrestricted";
  if (granted === 0) return "none";
  return "restricted";
};

/** What an Access badge is claiming, spelled out, for its tooltip. */
export const accessDetail = (permissions: PermissionSummary) => {
  const { configured, granted, total } = permissions;

  switch (accessStateOf(permissions)) {
    case "unrestricted":
      return configured
        ? `All ${total} permissions, granted explicitly. Open Permissions to narrow them.`
        : `All ${total} permissions. Nobody has restricted this token, so it can call every module.`;
    case "none":
      return `No permissions. All ${total} are switched off for this token.`;
    default:
      return `${granted} of ${total} permissions. The rest are switched off for this token.`;
  }
};

/** The colour and icon an Access badge uses for each state. One per state, on
    a scale that reads down a column without reading the words: green for every
    permission, amber for a narrowed set, red for none. */
export const ACCESS_BADGE: Record<
  AccessState,
  { tone: BadgeTone; icon: string }
> = {
  unrestricted: { tone: "success", icon: "fa-solid fa-unlock" },
  restricted: { tone: "warning", icon: "fa-solid fa-key" },
  none: { tone: "danger", icon: "fa-solid fa-ban" },
};

/** The words an Access badge shows. */
export const accessLabel = (
  state: AccessState,
  granted: number,
  total: number,
) => {
  if (state === "unrestricted") return "Unrestricted";
  if (state === "none") return "No access";
  return `${granted} of ${total}`;
};

/* ── Validity ─────────────────────────────────────────────────────────── */

/** Days before expiry at which a token is worth flagging: enough notice to
    re-authenticate before whatever is using it starts failing. */
export const EXPIRY_WARNING_DAYS = 14;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface Validity {
  tone: BadgeTone;
  label: string;
  detail: string;
}

/**
 * How long the token a caller holds will keep working.
 *
 * Two different things can stop a token: someone switching it off (the Status
 * column) and its own expiry. This is only the second one, and it is a fact
 * about the credential rather than a setting, which is why it does not read as
 * a warning unless it is close.
 */
export const validityOf = (expiresAt: string | null): Validity => {
  if (!expiresAt) {
    return {
      tone: "neutral",
      label: "Unknown",
      detail:
        "No expiry was recorded for this token. It is checked when a caller uses it.",
    };
  }

  const ms = new Date(expiresAt).getTime();
  const days = Math.floor((ms - Date.now()) / MS_PER_DAY);
  const when = formatDateTime(expiresAt);

  if (days < 0) {
    return {
      tone: "danger",
      label: "Expired",
      detail: `Expired ${when}. Callers are refused until they sign in again.`,
    };
  }

  if (days <= EXPIRY_WARNING_DAYS) {
    return {
      tone: "warning",
      label:
        days === 0 ? "Expires today" : `${days} day${days === 1 ? "" : "s"} left`,
      detail: `Expires ${when}.`,
    };
  }

  return {
    tone: "neutral",
    label: `${days} days left`,
    detail: `Expires ${when}.`,
  };
};

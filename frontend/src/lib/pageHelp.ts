import type { PageHelp } from "../components/ui/PageInfo";

/**
 * What each console page is for: the text behind the ⓘ beside its title.
 *
 * Kept short and in one place. Short because nobody opens a help panel to read
 * three sentences about something they can see, and in one place so two pages
 * can't end up describing the same thing differently.
 *
 * When behaviour changes, change it here too: the server is the authority, and
 * this text is only as good as how closely it follows.
 */

/* ── Admin console ─────────────────────────────────────────────────────── */

export type AdminHelpKey =
  | "overview"
  | "environments"
  | "users"
  | "tokens"
  | "settings"
  | "cache"
  | "activity";

export const ADMIN_HELP: Record<AdminHelpKey, PageHelp> = {
  overview: {
    summary:
      "A count of what this service is running: environments, portal users and live tokens.",
    points: [
      "Click a card to jump to the page behind it.",
      "The counts cover everything, not whatever you filtered last time.",
      "Handy for spotting an environment with no tokens, or a token with no environment.",
    ],
    note: "Read once when the page opens. The refresh button re-reads it.",
  },

  environments: {
    summary:
      "One row per Wrike account this service calls, with the credentials it uses.",
    points: [
      "Add, edit, duplicate or delete an account. Duplicate copies the Datahub wiring too.",
      "Visibility: hidden keeps it off the portal and the login page.",
      "Status: switches the account off for everybody.",
      "Row menu: who may call it (API access scope), what they may reach (Module permissions), plus its tokens and activity.",
    ],
    note: "Those are two different questions, which is why they are two controls.",
  },

  users: {
    summary: "Portal accounts: who can sign in, and which environments they look after.",
    points: [
      "Add a user. The password shows once and has to be changed at first sign-in.",
      "Permissions decides which pages that person can see and change.",
      "Map environments to control what their console shows.",
      "Reset a password or switch an account off without losing its history.",
    ],
    note: "Users only see environments mapped to them. The admin role sees all.",
  },

  tokens: {
    summary: "Every token this service has issued, and what each one may call.",
    points: [
      "Filters run on the server, so they cover the whole list, not just this page.",
      "Access: Unrestricted until somebody narrows it, then how much is left.",
      "Validity: when it expires. Calendar Sync tokens have no expiry, so they last until they are switched off.",
      "Status: deactivate blocks the token, reactivate lets it back in. Nothing is deleted.",
      "Row menu: permissions, copy the id or username, jump to its activity.",
    ],
    note: "No Create button: a token comes from somebody signing in on the login page, or through MCP.",
  },

  settings: {
    summary: "Settings for the admin account you are signed in with.",
    points: [
      "Turn on two-factor authentication, or re-enrol if you have lost the device.",
      "Shows whether a second factor is already active on this account.",
    ],
    note: "This is your admin account, not a portal user's. Reset those from the Users page.",
  },

  cache: {
    summary: "The Redis keys this service caches, for when an answer looks stale.",
    points: [
      "Search by key pattern, then open an entry to see the whole value.",
      "Delete one key, or select several, to force a fresh read.",
    ],
    note: "Nothing is lost. Every entry is rebuilt on the next request, just more slowly.",
  },

  activity: {
    summary:
      "Every call into this service, allowed or refused, across REST, MCP and the sign-in flows.",
    points: [
      "Search by the caller's email, or paste in the reference from an error message.",
      "Filter by environment, token, outcome or surface.",
      "Open a row to read the request and the response in full.",
      "A refusal names the gate that said no: the access rules, the environment's modules, or the token's own permissions.",
    ],
    note: "Old rows are deleted automatically, so export anything you need to keep.",
  },
};

/* ── Portal console ────────────────────────────────────────────────────── */

export type PortalHelpKey =
  | "overview"
  | "environments"
  | "apiTokens"
  | "activity"
  | "cache";

export const PORTAL_HELP: Record<PortalHelpKey, PageHelp> = {
  overview: {
    summary:
      "What your account can reach: your environments, their tokens and their recent calls.",
    points: [
      "The counts cover your environments only.",
      "Click a card to jump to the page behind it.",
    ],
    note: "If a page is missing from the sidebar, your account has not been given it.",
  },

  environments: {
    summary: "The Wrike environments you look after.",
    points: [
      "Add or edit an environment, if your account is allowed to.",
      "Modules shows the limit every token in that environment is held to.",
      "Module permissions opens that limit. Read-only unless you can edit it.",
      "API access scope is the other half: who is allowed to call it.",
      "Row menu: its tokens and its activity log.",
    ],
    note: "A limit can only narrow what a token does, never widen it. Empty means nothing is restricted.",
  },

  apiTokens: {
    summary: "The tokens issued for your environments, and what each one may call.",
    points: [
      "Filter the list to find one integration among many.",
      "Access: how much that token is allowed to do.",
      "Token Permissions opens the grid. Editable if your account has the update grant.",
      "Status: block a token, or let it through again. Nothing is deleted.",
    ],
    note: "You cannot create tokens here. They come from signing in on the login page, or through MCP.",
  },

  activity: {
    summary: "Every call made against your environments, allowed or refused.",
    points: [
      "Search by the caller's email, or paste in the reference from an error message.",
      "Filter by environment, token, outcome or surface.",
      "Open a row for the request, the response and which gate decided it.",
      "A refusal names the reason, so you know where to look next.",
    ],
    note: "Old rows are deleted automatically, so copy anything you need to keep.",
  },

  cache: {
    summary:
      "Cached answers for your environments, for when a change does not seem to have taken effect.",
    points: [
      "Search by key pattern and read what an entry holds.",
      "Delete one key, or several, to force a fresh read.",
    ],
    note: "Clearing a key loses nothing. The next request is just slower.",
  },
};

/* ── Portal console, admin role ────────────────────────────────────────── */

export type PortalAdminHelpKey = "overview" | "environments";

export const PORTAL_ADMIN_HELP: Record<PortalAdminHelpKey, PageHelp> = {
  overview: {
    summary:
      "Your portal account has the admin role, so these numbers cover the whole service.",
    points: [
      "Everything here is service-wide: environments, tokens and calls.",
      "Click a card to jump to the page behind it.",
    ],
    note: "Regular portal users see only their own environments. You see all of them.",
  },

  environments: {
    summary: "Every environment this service holds, with the credentials it calls Wrike with.",
    points: [
      "Add or edit an environment and its Wrike credentials.",
      "Modules is the limit its tokens are held to. Module permissions opens it.",
      "API access scope decides who may call it.",
    ],
    note: "With the admin role you can see and manage every environment, same as the admin console.",
  },
};

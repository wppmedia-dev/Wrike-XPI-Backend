/**
 * Turns a call's stored User-Agent header into a friendly client label —
 * "Claude", "ChatGPT", "VS Code", "GitHub Copilot", and so on — for the
 * Activity Log's Client column and filter.
 *
 * There is no MCP client-info handshake captured anywhere in this codebase
 * (no server here reads the `initialize` request's `clientInfo`), so the
 * User-Agent header src/utils/capture.js already stores on every row
 * (`request_payload.headers['user-agent']`) is the only signal available.
 * That means this is best-effort: an agent that sends a generic or spoofed
 * UA, or none at all, falls through to "Other" / "Unknown" rather than a
 * wrong guess.
 *
 * Patterns are ordered most-specific first, since several of these overlap
 * (VS Code's own UA also shows up inside a Copilot Chat request).
 */

/**
 * One entry per recognised client. `terms` are plain substrings (used for
 * the server-side filter, a SQL ILIKE per term — see agentFilterClause
 * below) rather than the `re` regex, because a regex alternation doesn't
 * translate to a single ILIKE pattern; `re` (built from the same terms,
 * plus the odd extra case a substring can't express, like Claude Code's
 * "not Claude" carve-out) is what the display label actually matches on,
 * so keeping both in one entry is what keeps them from drifting apart.
 */
const PATTERNS = [
  // MCP/agent clients — the ones the console actually gets asked about.
  { key: "claude_code", label: "Claude Code", terms: ["claude-code"], re: /claude-code/i },
  {
    key: "claude",
    label: "Claude",
    terms: ["claude", "anthropic"],
    re: /claude(?!.?code)|anthropic-claude/i,
  },
  { key: "chatgpt", label: "ChatGPT", terms: ["chatgpt", "openai"], re: /chatgpt|openai/i },
  { key: "copilot", label: "GitHub Copilot", terms: ["copilot"], re: /copilot/i },
  { key: "cursor", label: "Cursor", terms: ["cursor"], re: /cursor/i },
  { key: "windsurf", label: "Windsurf", terms: ["windsurf"], re: /windsurf/i },
  {
    key: "vscode",
    label: "VS Code",
    terms: ["vscode", "visual studio code"],
    re: /vscode|visual studio code/i,
  },
  {
    key: "jetbrains",
    label: "JetBrains",
    terms: ["jetbrains", "intellij", "webstorm", "pycharm"],
    re: /jetbrains|intellij|webstorm|pycharm/i,
  },
  { key: "cline", label: "Cline", terms: ["cline"], re: /\bcline\b/i },

  // Browsers — a human using the admin/portal console itself, or testing a
  // token by hand in a browser tab.
  { key: "chrome", label: "Chrome", terms: ["chrome/"], re: /chrome\//i },
  { key: "edge", label: "Edge", terms: ["edg/"], re: /edg\//i },
  { key: "firefox", label: "Firefox", terms: ["firefox/"], re: /firefox\//i },
  { key: "safari", label: "Safari", terms: ["safari/"], re: /safari\//i },

  // Scripts and tooling — the other common source of real traffic.
  { key: "postman", label: "Postman", terms: ["postman"], re: /postman/i },
  { key: "curl", label: "curl", terms: ["curl/"], re: /^curl\//i },
  {
    key: "python",
    label: "Python",
    terms: ["python-requests", "python-urllib"],
    re: /python-requests|python-urllib/i,
  },
  {
    key: "node",
    label: "Node.js",
    terms: ["node-fetch", "axios", "node.js"],
    re: /node-fetch|axios|node\.js/i,
  },
];

/**
 * `row` is one activity-log row as List/ExportRows already return it
 * (request_payload included). Returns a stable key (for filtering/grouping)
 * and a display label. `unknown` means no User-Agent was captured at all;
 * `other` means one was captured but matched none of the known clients.
 */
export const agentIdentityOf = (row) => {
  const ua = row?.request_payload?.headers?.["user-agent"];
  if (!ua || typeof ua !== "string") return { key: "unknown", label: "Unknown" };

  const hit = PATTERNS.find((p) => p.re.test(ua));
  return hit ? { key: hit.key, label: hit.label } : { key: "other", label: "Other" };
};

/** The vocabulary the filter/column offer, in the order they should list —
    recognised clients first, then the two catch-alls. */
export const AGENT_OPTIONS = [
  ...PATTERNS.map((p) => ({ value: p.key, label: p.label })),
  { value: "other", label: "Other" },
  { value: "unknown", label: "Unknown" },
];

const KNOWN_KEYS = new Set(PATTERNS.map((p) => p.key));

/**
 * Builds the Sequelize `where` fragment for `agentKey` — one ILIKE per term
 * for a recognised client (OR'd together, since any of its terms counts as
 * a match), or the special "no header at all" / "header present but
 * unrecognised" cases for unknown/other.
 *
 * Postgres-specific (JSON path + ILIKE), matching how List/ExportRows
 * already filter this same column (Op.iLike is already in use there) — this
 * app's models/api_activity_logs.js is Postgres-only (JSON column type,
 * existing Op.iLike usage), so no other dialect needs covering here.
 *
 * Returns `null` for an unrecognised key (falls through to "no filter")
 * rather than throwing — the route validates the key against AGENT_OPTIONS
 * before this is ever called, so null here is a defensive fallback, not the
 * expected path.
 */
export const agentFilterClause = (agentKey, { Op }) => {
  // Sequelize/Postgres nested-JSON-path syntax: a dot-joined STRING key,
  // not an array — `{ [["a","b"]]: ... }` silently stringifies to the
  // literal column name "a,b" instead of a JSON path (confirmed against
  // this project's actual Sequelize version before relying on it), while
  // `"a.b"` compiles to `"col"#>>'{a,b}'`, the real Postgres JSON extraction
  // operator.
  const uaPath = "request_payload.headers.user-agent";

  if (agentKey === "unknown") {
    // No header captured at all: either the key path is null, or the
    // request_payload itself is null (a row from before headers were
    // captured, or a call that failed before any payload was recorded).
    return {
      [Op.or]: [{ request_payload: null }, { [uaPath]: null }],
    };
  }

  if (agentKey === "other") {
    // A header was captured, but it matched none of the known clients: NOT
    // any of their terms, and not null.
    const terms = PATTERNS.flatMap((p) => p.terms);
    return {
      [Op.and]: [
        { [uaPath]: { [Op.ne]: null } },
        { [Op.not]: { [Op.or]: terms.map((t) => ({ [uaPath]: { [Op.iLike]: `%${t}%` } })) } },
      ],
    };
  }

  if (!KNOWN_KEYS.has(agentKey)) return null;

  const entry = PATTERNS.find((p) => p.key === agentKey);
  return {
    [Op.or]: entry.terms.map((t) => ({ [uaPath]: { [Op.iLike]: `%${t}%` } })),
  };
};
